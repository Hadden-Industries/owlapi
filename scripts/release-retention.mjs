/** Observe retained bytes and identify redundant CI candidates under signed custody. */
import {
  REPOSITORY as repository,
  REPOSITORY_ID,
} from "./release-identity.mjs";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createRepositoryReader,
  readArtifactInventory,
  readRunArtifacts,
  readWorkflowRuns,
} from "./github-evidence-reader.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import {
  readCheckpoint,
  unresolvedReservations,
} from "./release-history-checkpoint.mjs";
import { readRetentionCiEvidence } from "./release-ci-qualification.mjs";
import {
  assertRetirementWriter,
  readOpenPullClaims,
  retireSelectedCandidates,
  retirementTag,
  sameArtifact,
  supersededCiOrigin,
  verifyRetirementRehearsal,
} from "./candidate-retirement.mjs";
import { parseArtifactName } from "../tooling/artifact-transport/identity.mjs";

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
  "recipient-material-replay.yml",
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
  if (!closed) return true;
  return runs.some(({ status, conclusion, id, run_attempt }) => {
    if (status !== "completed" || !validId(id) || !validId(run_attempt))
      return true;
    // A skipped latest attempt cannot settle any earlier attempt of the run.
    const possibleWrites = run_attempt - (conclusion === "skipped" ? 1 : 0);
    for (let attempt = 1; attempt <= possibleWrites; attempt++)
      if (!closed.has(runKey(id, attempt))) return true;
    return false;
  });
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

function retentionClient(env, apply = false) {
  const read = createRepositoryReader({
    repository,
    token: env.GH_TOKEN,
    requestLimit: apply ? 256 : 128,
    budgetMs: apply ? 600_000 : 120_000,
  });
  return new GitHubReleaseClient({
    repository,
    token: env.GH_TOKEN,
    reader: read,
  });
}

function custodyDecisions(checkpoint, head) {
  const decisions = JSON.parse(checkpoint.files.get("retention.json"));
  assert.ok(
    [1, 2].includes(decisions.schemaVersion) && decisions.successor === head,
    "Signed retention record names another successor or policy",
  );
  assert.ok(
    validIdList(decisions.protectedIds) &&
      settledRunKeys(decisions.settledRuns) &&
      Array.isArray(decisions.replayed) &&
      validIdList(decisions.replayed.map((row) => row?.id)),
    "Invalid signed retention inventory",
  );
  return decisions;
}

const workflowFile = (run) => run.path.split("@", 1)[0].split("/").at(-1);
const sameExecution = (original, live) =>
  live &&
  [
    "id",
    "run_attempt",
    "event",
    "path",
    "head_sha",
    "status",
    "conclusion",
  ].every((key) => original[key] === live[key]) &&
  live.status === "completed" &&
  live.conclusion === "success" &&
  live.repository?.id === REPOSITORY_ID &&
  live.head_repository?.id === REPOSITORY_ID;

/** Both the observer and the writer use the same successor, signed custody claims, open PRs, and active consumers. */
async function readRetirementSnapshot({
  client,
  head,
  checkpoint,
  decisions,
  proof,
  now,
  inventory: collected,
  target,
}) {
  const read = (path) => client.read(path);
  const [listed, runs, pulls, reserved, ref] = await Promise.all([
    collected ??
      (target
        ? readRunArtifacts(read, target.workflow_run.id)
        : readArtifactInventory(read)),
    readWorkflowRuns(read),
    readOpenPullClaims(read),
    unresolvedReservations(client, checkpoint),
    read("/git/ref/tags/" + checkpoint.tag),
  ]);
  assert.ok(
    ref.object?.type === "tag" && ref.object.sha === checkpoint.objectId,
    "Signed retention ref moved",
  );
  assert.ok(
    runs.every(
      (run) => validId(run.id) && typeof run.path === "string" && run.path,
    ),
    "Incomplete native workflow run identity",
  );
  const byId = new Map(runs.map((run) => [run.id, run]));
  const activeConsumer = runs.some(
    (run) =>
      consumers.includes(workflowFile(run)) && run.status !== "completed",
  );
  const openWriter =
    reserved ||
    outstandingWriterRuns(
      runs.filter((run) => writers.includes(workflowFile(run))),
      decisions.settledRuns,
    );
  const { candidate, proof: packageProof } = proof.qualifiedPackage;
  const successor = {
    commit: proof.landed.commit,
    run: proof.source.run,
    repositoryId: REPOSITORY_ID,
    candidate,
    packageProof,
  };
  const originals = await Promise.all(
    [candidate, packageProof].map((item) =>
      read("/actions/artifacts/" + item.id),
    ),
  );
  const main = await read("/branches/main");
  const when = now();
  const inventory = target
    ? [
        ...listed,
        ...originals.filter(
          (item) => !listed.some((row) => row.id === item.id),
        ),
      ]
    : listed;
  const pendingSources = new Set(
    listed
      .filter(
        (item) =>
          !item.expired &&
          Date.parse(item.expires_at) > when &&
          /^(?:pending-recipient-material|recipient-material-case)-/u.test(
            item.name,
          ),
      )
      .map((item) => item.workflow_run?.id),
  );
  assert.ok(
    [...pendingSources].every(validId),
    "Unattributed live material case",
  );
  const complete =
    main.name === "main" &&
    main.protected === true &&
    main.commit?.sha === head &&
    [proof.main.run, proof.source.run].every((original) =>
      sameExecution(original, byId.get(original.id)),
    ) &&
    originals.every((observed, i) =>
      sameArtifact([candidate, packageProof][i], observed, when),
    );
  const selected = selectRedundantArtifacts({
    inventory,
    successor,
    currentHead: main.commit?.sha,
    decisions,
    activeConsumer,
    openWriter,
    complete,
    now: when,
  });
  const approved = new Set(selected.eligibleIds);
  const eligibleIds = inventory
    .filter(
      (a) =>
        approved.has(a.id) &&
        !pendingSources.has(a.workflow_run.id) &&
        supersededCiOrigin(a, byId.get(a.workflow_run.id), successor, pulls),
    )
    .map((a) => a.id)
    .sort((a, b) => a - b);
  if (target && eligibleIds.includes(target.id)) {
    const origin = byId.get(target.workflow_run.id);
    if (origin.event === "pull_request") {
      const [{ number }] = origin.pull_requests;
      const pr = await read("/pulls/" + number);
      assert.ok(
        pr?.number === number && pr.base?.repo?.id === REPOSITORY_ID,
        "Source pull request identity changed",
      );
      if (pr.state !== "closed")
        return { ...hold("The source pull request remains open."), inventory };
    }
  }
  const reason =
    approved.size && !eligibleIds.length
      ? "No authorized original belongs to an unused earlier CI candidate."
      : selected.reason;
  return { inventory, eligibleIds, reason };
}

/** Use native logs for the receipt for each attempted mutation, and leave a compact job summary. */
const writeSummary = (env, message) =>
  appendFileSync(env.GITHUB_STEP_SUMMARY, message + "\n");

export async function reportReleaseRetention(
  env = process.env,
  {
    client = retentionClient(env),
    openCheckpoint = readCheckpoint,
    qualifySuccessor = readRetentionCiEvidence,
    now = Date.now,
    summary = (text) => writeSummary(env, text),
  } = {},
) {
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.ok(["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME));
  const main = await client.read("/branches/main");
  assert.ok(
    main.protected && main.commit?.sha === env.GITHUB_SHA,
    "Protected main moved",
  );
  const inventory = await readArtifactInventory((path) => client.read(path));
  const cache = await client.read("/actions/cache/usage").catch(() => ({}));
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
        (cache.active_caches_size_in_bytes ?? "unavailable") +
        ".",
    ].join("\n"),
  );
  let outcome = hold("No signed custody replay is available.");
  if (env.RETENTION_HISTORY_OBJECT) {
    const checkpoint = await openCheckpoint(
      client,
      env.RETENTION_HISTORY_OBJECT,
    );
    const decisions = custodyDecisions(checkpoint, env.GITHUB_SHA);
    if (decisions.schemaVersion === 2)
      await verifyRetirementRehearsal(client, checkpoint, decisions);
    const proof = await qualifySuccessor(env);
    outcome = await readRetirementSnapshot({
      client,
      head: env.GITHUB_SHA,
      checkpoint,
      decisions,
      proof,
      now,
      inventory,
    });
  }
  summary(
    "\nDry-run: " +
      outcome.reason +
      " Eligible artifact IDs: " +
      (outcome.eligibleIds.join(", ") || "none") +
      ".",
  );
  return { eligibleIds: outcome.eligibleIds, reason: outcome.reason };
}

/** Opt in with a protected, signed write-authorizing checkpoint. Old reporting records cannot issue a deletion. */
export async function retireSupersededCandidates({
  env = process.env,
  event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")),
  client = retentionClient(env, true),
  openCheckpoint = readCheckpoint,
  qualifySuccessor = readRetentionCiEvidence,
  now = Date.now,
  log = (message) => {
    process.stdout.write(message + "\n");
    writeSummary(env, message);
  },
} = {}) {
  const trigger = assertRetirementWriter(env, event);
  const head = env.GITHUB_SHA;
  const main = await client.read("/branches/main");
  assert.ok(
    main.name === "main" &&
      main.protected === true &&
      main.commit?.sha === head,
    "Protected main moved",
  );
  let objectId = env.RETENTION_HISTORY_OBJECT;
  if (!objectId) {
    const tag = retirementTag(head);
    const reference = await client.read("/git/ref/tags/" + tag, {
      accept404: true,
    });
    if (!reference) {
      log(
        "Retirement held: no signed authorization for this protected-main successor.",
      );
      return [];
    }
    assert.ok(
      reference.ref === "refs/tags/" + tag && reference.object?.type === "tag",
      "Unexpected retention authorization ref",
    );
    objectId = reference.object.sha;
  }
  assert.match(objectId, /^[a-f0-9]{40}$/u);
  const checkpoint = await openCheckpoint(client, objectId);
  assert.equal(checkpoint.objectId, objectId);
  const decisions = custodyDecisions(checkpoint, head);
  await verifyRetirementRehearsal(client, checkpoint, decisions);
  const proof = await qualifySuccessor(env);
  if (trigger)
    assert.ok(
      proof.main.run.id === trigger.id &&
        proof.main.run.run_attempt === trigger.run_attempt &&
        proof.main.run.head_sha === head,
      "Different qualified successor from the upstream trigger",
    );
  assert.equal(proof.landed.commit, head);
  assert.equal(proof.source.run.repository.id, REPOSITORY_ID);
  return retireSelectedCandidates({
    inspect: (target) =>
      readRetirementSnapshot({
        client,
        head,
        checkpoint,
        decisions,
        proof,
        now,
        target,
      }),
    client,
    head,
    now,
    log,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  assert.ok(
    args.length === 0 || (args.length === 1 && args[0] === "--apply"),
    "Use the read-only observer or --apply",
  );
  if (args.length) await retireSupersededCandidates();
  else {
    try {
      await reportReleaseRetention();
    } catch (error) {
      writeSummary(
        process.env,
        "\nDry-run: verified inventory or custody proof is unavailable. Retain all artifacts.",
      );
      throw error;
    }
  }
}
