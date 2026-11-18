/** Observe retained bytes and identify redundant CI candidates under signed custody. */
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createRepositoryReader,
  readArtifactInventory,
  readWorkflowRuns,
} from "./github-evidence-reader.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import {
  readCheckpoint,
  unresolvedReservations,
} from "./release-history-checkpoint.mjs";
import { readReleaseCiEvidence } from "./release-ci-qualification.mjs";
import { parseArtifactName } from "../tooling/artifact-transport/identity.mjs";

const repository = "Hadden-Industries/owlapi";
const day = 86_400_000;
const writers = [
  "release.yml",
  "stage-release.yml",
  "github-release.yml",
  "release-labels.yml",
  "release-classification.yml",
  "release-reconciliation.yml",
];
const consumers = [
  "ci.yml",
  "installed-diagnostic.yml",
  "release-registry.yml",
  "release-completion.yml",
];

export function artifactStorage(inventory, now = Date.now()) {
  const groups = {};
  for (const file of inventory) {
    if (file.expired || Date.parse(file.expires_at) <= now) continue;
    const days =
      (Date.parse(file.expires_at) - Date.parse(file.created_at)) / day;
    assert.ok(
      Number.isSafeInteger(file.size_in_bytes) &&
        file.size_in_bytes >= 0 &&
        days > 0 &&
        Number.isFinite(days),
    );
    const purpose =
      [
        [/^java-reference-/, "Java reference"],
        [/^july-ontology-/, "July ontology"],
        [
          /^(?:consumer-runtime-|runtime-qualification-|public-recipient-)/,
          "Consumer reports",
        ],
        [
          /^(?:runtime-candidate-|maintenance-reporter-)/,
          "Maintenance handoffs",
        ],
        [
          /^(?:hadden-industries-owlapi-.*-candidate-|package-proof-)/,
          "Qualified packages",
        ],
      ].find(([pattern]) => pattern.test(file.name))?.[1] ??
      "Other Actions artifacts";
    const group = (groups[purpose] ??= {
      artifacts: 0,
      bytes: 0,
      projectedByteDays: 0,
    });
    group.artifacts++;
    group.bytes += file.size_in_bytes;
    group.projectedByteDays += Math.round(file.size_in_bytes * days);
  }
  return groups;
}

const hold = (reason) => ({ eligibleIds: [], reason });
const validIdList = (ids) =>
  Array.isArray(ids) &&
  new Set(ids).size === ids.length &&
  ids.every((id) => Number.isSafeInteger(id) && id > 0);
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const runKey = (runId, attempt) => runId + ":" + attempt;
function settledRunKeys(settlements) {
  if (
    !Array.isArray(settlements) ||
    !settlements.every((row) => validId(row?.runId) && validId(row?.attempt))
  )
    return null;
  const keys = new Set(
    settlements.map(({ runId, attempt }) => runKey(runId, attempt)),
  );
  return keys.size === settlements.length ? keys : null;
}

export function outstandingWriterRuns(runs, settlements) {
  const closed = settledRunKeys(settlements);
  return (
    !closed ||
    runs.some(
      ({ status, conclusion, id, run_attempt }) =>
        status !== "completed" ||
        (conclusion !== "skipped" && !closed.has(runKey(id, run_attempt))),
    )
  );
}
export function selectRedundantArtifacts({
  inventory,
  successor,
  currentHead,
  decisions,
  activeConsumer,
  openWriter,
  complete,
  now = Date.now(),
}) {
  if (!complete) return hold("Provider inventory is incomplete.");
  if (!successor || successor.commit !== currentHead)
    return hold("No verified successor on current protected main.");
  if (!decisions) return hold("No signed custody replay is available.");
  if (
    !validIdList(decisions.protectedIds) ||
    !settledRunKeys(decisions.settledRuns) ||
    !Array.isArray(decisions.replayed)
  )
    return hold("The signed custody inventory is malformed.");
  if (activeConsumer || openWriter)
    return hold(
      "A consumer or release operation still has an outstanding claim.",
    );
  const live = new Map(
    inventory
      .filter((a) => !a.expired && Date.parse(a.expires_at) > now)
      .map((a) => [a.id, a]),
  );
  const current = [successor.candidate, successor.packageProof];
  if (
    !current.every(
      (expected) => live.get(expected.id)?.digest === expected.digest,
    )
  )
    return hold("The verified successor is no longer available.");
  const protectedIds = new Set([
    ...current.map((record) => record.id),
    ...decisions.protectedIds,
  ]);
  const eligible = [];
  for (const custody of decisions.replayed) {
    const artifact = live.get(custody.id);
    if (!artifact || protectedIds.has(custody.id)) continue;
    const logical = parseArtifactName(artifact.name)?.logical ?? "";
    if (
      !/^(?:package-proof-\d+-\d+|hadden-industries-owlapi-[\d.]+(?:-rc\.\d+)?-candidate-\d+-\d+)$/u.test(
        logical,
      )
    )
      continue;
    if (
      artifact.digest !== custody.digest ||
      artifact.workflow_run?.id !== custody.runId ||
      artifact.workflow_run?.repository_id !== successor.repositoryId ||
      artifact.workflow_run?.head_repository_id !== successor.repositoryId ||
      !/^[a-f0-9]{64}$/u.test(custody.manifestSha256) ||
      custody.actionsCopiesUnavailable !== true ||
      custody.verifiedBackup !== true ||
      custody.result !== "STAGE_SEAL_AND_RECOVERY_VERIFIED"
    )
      continue;
    eligible.push(custody.id);
  }
  return {
    eligibleIds: [...new Set(eligible)].sort((a, b) => a - b),
    reason:
      "Exact redundant IDs with signed offline replay and a verified successor.",
  };
}

export async function reportReleaseRetention(env = process.env) {
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.ok(["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME));
  const read = createRepositoryReader({
    repository,
    token: env.GH_TOKEN,
    requestLimit: 128,
    budgetMs: 120_000,
  });
  const client = new GitHubReleaseClient({
    repository,
    token: env.GH_TOKEN,
    reader: read,
  });
  const summary = (text) =>
    appendFileSync(env.GITHUB_STEP_SUMMARY, text + "\n");
  const main = await read("/branches/main");
  assert.ok(
    main.protected && main.commit?.sha === env.GITHUB_SHA,
    "Protected main moved",
  );
  const inventory = await readArtifactInventory(read);
  let outcome = hold("No signed custody replay is available.");
  const cache = await read("/actions/cache/usage").catch(() => ({}));
  summary(
    [
      "### Actions artifact storage",
      "",
      "| Purpose | Artifacts | Stored bytes | Projected byte-days |",
      "| --- | ---: | ---: | ---: |",
      ...Object.entries(artifactStorage(inventory)).map(
        ([name, usage]) =>
          "| " +
          name +
          " | " +
          usage.artifacts +
          " | " +
          usage.bytes +
          " | " +
          usage.projectedByteDays +
          " |",
      ),
      "",
      "Cache bytes measured separately: " +
        (cache.active_caches_size_in_bytes ?? "unavailable"),
    ].join("\n"),
  );
  if (env.RETENTION_HISTORY_OBJECT) {
    const checkpoint = await readCheckpoint(
      client,
      env.RETENTION_HISTORY_OBJECT,
    );
    const decisions = JSON.parse(checkpoint.files.get("retention.json"));
    assert.equal(decisions.schemaVersion, 1);
    assert.equal(decisions.successor, main.commit.sha);
    assert.ok(
      validIdList(decisions.protectedIds) &&
        settledRunKeys(decisions.settledRuns),
    );
    const proof = await readReleaseCiEvidence(env);
    const runs = await Promise.all(
      [...consumers, ...writers].map(async (workflow) => ({
        workflow,
        runs: await readWorkflowRuns(read, workflow),
      })),
    );
    const activeConsumer = runs.some(
      ({ workflow, runs }) =>
        consumers.includes(workflow) &&
        runs.some(({ status }) => status !== "completed"),
    );
    const openWriter =
      (await unresolvedReservations(client, checkpoint)) ||
      runs.some(
        ({ workflow, runs }) =>
          writers.includes(workflow) &&
          outstandingWriterRuns(runs, decisions.settledRuns),
      );
    const after = await read("/branches/main");
    const current = [
      proof.qualifiedPackage.candidate,
      proof.qualifiedPackage.proof,
    ];
    const latest = await Promise.all(
      current.map(async (expected) => {
        const observed = await read("/actions/artifacts/" + expected.id);
        return (
          observed.id === expected.id &&
          observed.expired === false &&
          Date.parse(observed.expires_at) > Date.now() &&
          observed.digest === expected.digest
        );
      }),
    );
    outcome = selectRedundantArtifacts({
      inventory,
      currentHead: after.commit?.sha,
      activeConsumer,
      openWriter,
      complete: after.protected && latest.every(Boolean),
      successor: {
        commit: proof.landed.commit,
        candidate: proof.qualifiedPackage.candidate,
        packageProof: proof.qualifiedPackage.proof,
        repositoryId: proof.source.run.repository.id,
      },
      decisions,
    });
  }
  summary(
    "\nDry-run: " +
      outcome.reason +
      " Eligible artifact IDs: " +
      (outcome.eligibleIds.join(", ") || "none") +
      ".",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await reportReleaseRetention();
  } catch (error) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      "\nDry-run: verified inventory or custody proof is unavailable. Retain all artifacts.\n",
    );
    throw error;
  }
}
