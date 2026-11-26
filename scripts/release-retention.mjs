/** Observe retained bytes and retire superseded CI candidates after checking their release and recovery claims. */
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
  readRetentionGitCommits,
  readRetentionHistoryFiles,
  readRetentionVersionTags,
  unresolvedReservations,
} from "./release-history-checkpoint.mjs";
import {
  createClaimedPullHeadReader,
  createReleaseClaimReader,
  latestUnattributedStage,
} from "./retirement-release-claims.mjs";
import { readRetentionCiEvidence } from "./release-ci-qualification.mjs";
import {
  assertRetirementWriter,
  isClosedProducerPull,
  readOpenPullClaims,
  retireSelectedCandidates,
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
  releaseClaims,
  activeConsumer,
  openWriter,
  complete,
  now = Date.now(),
}) {
  if (!complete) return hold("Provider inventory is incomplete.");
  if (!successor || successor.commit !== currentHead)
    return hold("No verified successor on current protected main.");
  if (!decisions && !releaseClaims)
    return hold("Release references are unavailable.");
  if (
    decisions &&
    (!validIdList(decisions.protectedIds) ||
      !settledRunKeys(decisions.settledRuns) ||
      !Array.isArray(decisions.replayed))
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
  const current = [
    successor.candidate,
    successor.packageProof,
    ...(successor.verificationReceipts ?? []),
  ];
  if (
    !current.every(
      (expected) => live.get(expected.id)?.digest === expected.digest,
    )
  )
    return hold("The verified successor is no longer available.");
  const protectedIds = new Set([
    ...current.map((record) => record.id),
    ...(decisions ? decisions.protectedIds : releaseClaims.protectedIds),
  ]);
  const replayed =
    decisions && new Map(decisions.replayed.map((entry) => [entry.id, entry]));
  const eligible = [];
  for (const artifact of live.values()) {
    if (
      protectedIds.has(artifact.id) ||
      artifact.workflow_run?.repository_id !== successor.repositoryId ||
      artifact.workflow_run?.head_repository_id !== successor.repositoryId
    )
      continue;
    const logical = parseArtifactName(artifact.name)?.logical ?? "";
    if (
      !/^(?:package-proof-\d+-\d+|hadden-industries-owlapi-[\d.]+(?:-rc\.\d+)?-candidate-\d+-\d+)$/u.test(
        logical,
      )
    )
      continue;
    const custody = replayed?.get(artifact.id);
    if (
      decisions &&
      (!custody ||
        artifact.digest !== custody.digest ||
        artifact.workflow_run.id !== custody.runId ||
        !/^[a-f0-9]{64}$/u.test(custody.manifestSha256) ||
        custody.actionsCopiesUnavailable !== true ||
        custody.verifiedBackup !== true ||
        custody.result !== "STAGE_SEAL_AND_RECOVERY_VERIFIED")
    )
      continue;
    eligible.push(artifact.id);
  }
  return {
    eligibleIds: [...new Set(eligible)].sort((a, b) => a - b),
    reason: decisions
      ? "Exact redundant IDs with signed offline replay and a verified successor."
      : "Earlier CI candidates with a verified successor and no observed release or recovery claim.",
  };
}

/** Reserve the live-read budget for mutable claims and originals. Missing stage reservations use native attempt pages under the same overall deadline. */
export function createRetentionReader(options) {
  const now = options.now ?? Date.now;
  const budgetMs = options.budgetMs ?? 60_000;
  const bounded = {
    ...options,
    now,
    budgetMs,
    deadline: Math.min(options.deadline ?? Infinity, now() + budgetMs),
  };
  const live = createRepositoryReader(bounded);
  return (path, readOptions) => {
    const historyPage =
      /^\/actions\/runs\/[1-9]\d*\/attempts\/[1-9]\d*\/jobs\?per_page=100&page=[1-9]\d*$/u.test(
        path,
      );
    const read = historyPage
      ? createRepositoryReader({ ...bounded, requestLimit: 3 })
      : live;
    return read(path, readOptions);
  };
}

function retentionClient(env, apply = false) {
  const read = createRetentionReader({
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
    "check_suite_id",
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

async function hasOutstandingReservation(client, checkpoint) {
  const ref = await client.read("/git/ref/tags/" + checkpoint.tag);
  assert.ok(
    ref?.ref === "refs/tags/" + checkpoint.tag &&
      ref.object?.type === "tag" &&
      ref.object.sha === checkpoint.objectId,
    "Signed retention ref moved",
  );
  return unresolvedReservations(client, checkpoint);
}

/** The observer and writer inspect the same release references, open PRs and verified successor. */
async function readRetirementSnapshot({
  client,
  head,
  checkpoint,
  decisions,
  readClaims,
  readClaimedPullHeads,
  skippedStageAttempts,
  proof,
  now,
  inventory: collected,
  target,
}) {
  const read = (path) => client.read(path);
  const [listed, runs, pulls, reserved, releaseClaims] = await Promise.all([
    collected ??
      (target
        ? readRunArtifacts(read, target.workflow_run.id)
        : readArtifactInventory(read)),
    readWorkflowRuns(read),
    readOpenPullClaims(read),
    checkpoint ? hasOutstandingReservation(client, checkpoint) : false,
    checkpoint ? undefined : readClaims(),
  ]);
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
  const writerRuns = runs.filter((run) => writers.includes(workflowFile(run)));
  const openWriter = decisions
    ? reserved || outstandingWriterRuns(writerRuns, decisions.settledRuns)
    : writerRuns.some((run) => run.status !== "completed");
  if (releaseClaims) {
    // A release can promote only a direct FULL main producer or the PR which landed on its exact checkout.
    releaseClaims.commits.add(head);
    for (const run of writerRuns.filter(
      (r) => workflowFile(r) === "release.yml",
    )) {
      assert.match(
        run.head_sha,
        /^[a-f0-9]{40}$/u,
        "Unidentified release qualification source",
      );
      releaseClaims.commits.add(run.head_sha);
    }
  }
  const { candidate, proof: packageProof } = proof.qualifiedPackage;
  const successor = {
    commit: proof.landed.commit,
    run: proof.source.run,
    repositoryId: REPOSITORY_ID,
    candidate,
    packageProof,
    verificationReceipts: [proof.main.artifact, proof.source.artifact],
  };
  // A PR-derived successor has a distinct landed receipt and producer receipt.
  // A direct FULL main run shares one. Both paths must remain promotable at the write.
  const requiredOriginals = [
    candidate,
    packageProof,
    ...successor.verificationReceipts,
  ];
  const liveById = new Map(
    await Promise.all(
      [...new Set(requiredOriginals.map((item) => item.id))].map(async (id) => [
        id,
        await read("/actions/artifacts/" + id),
      ]),
    ),
  );
  const listedById = new Map(listed.map((item) => [item.id, item]));
  const main = await read("/branches/main");
  const when = now();
  const inventory = target
    ? [
        ...listed,
        ...[...liveById.values()].filter((item) => !listedById.has(item.id)),
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
    requiredOriginals.every(
      (item) =>
        sameArtifact(item, liveById.get(item.id), when) &&
        (target !== undefined ||
          sameArtifact(item, listedById.get(item.id), when)),
    );
  const selected = selectRedundantArtifacts({
    inventory,
    successor,
    currentHead: main.commit?.sha,
    decisions,
    releaseClaims,
    activeConsumer,
    openWriter,
    complete,
    now: when,
  });
  const approved = new Set(selected.eligibleIds);
  const claimedLandings = new Set([
    ...pulls.commits,
    ...(releaseClaims?.commits ?? []),
  ]);
  let claimedPullHeads;
  const eligible = [];
  for (const artifact of inventory) {
    if (
      !approved.has(artifact.id) ||
      (target && artifact.id !== target.id) ||
      pendingSources.has(artifact.workflow_run.id)
    )
      continue;
    const origin = byId.get(artifact.workflow_run.id);
    if (!supersededCiOrigin(artifact, origin, successor, pulls)) continue;
    if (releaseClaims?.commits.has(origin.head_sha)) continue;
    if (origin.event === "pull_request") {
      claimedPullHeads ??= await readClaimedPullHeads(claimedLandings);
      if (claimedPullHeads.has(origin.head_sha)) continue;
      if (
        target &&
        !(await isClosedProducerPull(read, origin.pull_requests[0].number))
      )
        continue;
    }
    eligible.push(artifact);
  }
  const lastStage =
    decisions || !eligible.length
      ? -Infinity
      : await latestUnattributedStage(
          client,
          writerRuns.filter((run) => workflowFile(run) === "stage-release.yml"),
          releaseClaims.stageReservations,
          skippedStageAttempts,
          eligible.reduce(
            (first, file) => Math.min(first, Date.parse(file.created_at)),
            Infinity,
          ),
        );
  const eligibleIds = eligible
    .filter((file) => Date.parse(file.created_at) > lastStage)
    .map((file) => file.id)
    .sort((a, b) => a - b);
  const reason =
    lastStage > -Infinity
      ? "An unattributed stage retains originals that existed while it could have submitted."
      : approved.size && !eligibleIds.length
        ? "The remaining originals are in use or lack an eligible earlier CI origin."
        : selected.reason;
  return { inventory, eligibleIds, reason };
}

/** Use native logs for the receipt for each attempted mutation, and leave a compact job summary. */
const writeSummary = (env, message) =>
  appendFileSync(env.GITHUB_STEP_SUMMARY, message + "\n");

/** The optional owner dispatch replays exact originals already in recovery custody. Routine cleanup reads existing claims. */
async function retentionAuthority(
  env,
  client,
  { openCheckpoint, readHistoryFiles, readCommits, readVersionTags },
  preview,
) {
  const read = (path) => client.read(path);
  const readClaimedPullHeads = createClaimedPullHeadReader(readCommits);
  const objectId = env.RETENTION_HISTORY_OBJECT;
  if (!objectId)
    return {
      readClaims: createReleaseClaimReader(
        read,
        readHistoryFiles,
        readVersionTags,
      ),
      readClaimedPullHeads,
      skippedStageAttempts: new Set(),
    };
  assert.match(objectId, /^[a-f0-9]{40}$/u);
  const checkpoint = await openCheckpoint(client, objectId);
  assert.equal(checkpoint.objectId, objectId);
  const decisions = custodyDecisions(checkpoint, env.GITHUB_SHA);
  if (!preview || decisions.schemaVersion === 2)
    await verifyRetirementRehearsal(client, checkpoint, decisions);
  return { checkpoint, decisions, readClaimedPullHeads };
}

export async function reportReleaseRetention(
  env = process.env,
  {
    client = retentionClient(env),
    openCheckpoint = readCheckpoint,
    readHistoryFiles = readRetentionHistoryFiles,
    readCommits = readRetentionGitCommits,
    readVersionTags = readRetentionVersionTags,
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
  const authority = await retentionAuthority(
    env,
    client,
    { openCheckpoint, readHistoryFiles, readCommits, readVersionTags },
    true,
  );
  const proof = await qualifySuccessor(env);
  const outcome = await readRetirementSnapshot({
    client,
    head: env.GITHUB_SHA,
    ...authority,
    proof,
    now,
    inventory,
  });
  summary(
    "\nDry-run: " +
      outcome.reason +
      " Eligible artifact IDs: " +
      (outcome.eligibleIds.join(", ") || "none") +
      ".",
  );
  return { eligibleIds: outcome.eligibleIds, reason: outcome.reason };
}

/** Retire unused CI originals automatically, or apply exact replay attestations on an explicit owner dispatch. */
export async function retireSupersededCandidates({
  env = process.env,
  event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")),
  client = retentionClient(env, true),
  openCheckpoint = readCheckpoint,
  readHistoryFiles = readRetentionHistoryFiles,
  readCommits = readRetentionGitCommits,
  readVersionTags = readRetentionVersionTags,
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
  const authority = await retentionAuthority(
    env,
    client,
    { openCheckpoint, readHistoryFiles, readCommits, readVersionTags },
    false,
  );
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
        ...authority,
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
        "\nDry-run: the successor, reference inventory or requested custody proof is unavailable. Retain all artifacts.",
      );
      throw error;
    }
  }
}
