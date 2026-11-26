/** Read and replay public receipts without installing any package. */
import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { readRunArtifacts } from "./github-evidence-reader.mjs";
import { sameJobExecution } from "./github-job-execution.mjs";
import { originalBytes } from "./staged-release.mjs";
import {
  artifactProducingAttempt,
  matchesLogicalArtifact,
} from "../tooling/artifact-transport/identity.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";
import { assertConsistentArchives } from "./release-resolution-proof.mjs";
import { prepareRecipientMaterial } from "../util/third-party-evidence/recipient-material.mjs";
import { verifyQualifiedRecipientMaterial } from "./recipient-material-case-readmission.mjs";
import { unpackPublicMaterial } from "./public-material-packet.mjs";
import { assertPublicAdvisoryDescriptor } from "./public-recipient-plan.mjs";
import { verifyHostedAdvisoryReceipt } from "./release-audit-job.mjs";
import { advisoryDecisionExpiry } from "./release-audit-evaluator.mjs";
import {
  assertPublicMaterialDecision,
  PUBLIC_MATERIAL,
  PUBLIC_OBSERVATION,
  PUBLIC_TEST,
  publicPlatform,
  readPublicObservation,
} from "./public-recipient-observation.mjs";

const filename = ".github/workflows/release-registry.yml";
const parse = (value) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value));
const descriptor = (value) => ({
  id: value.id,
  name: value.name,
  bytes: value.size_in_bytes,
  digest: value.digest,
});
const positive = (v) => Number.isSafeInteger(v) && v > 0;
const hex = /^[a-f0-9]{64}$/u;
const sampleRunner = CI_RUNTIME.consumerPlatforms.find(
  ({ os }) => os === "linux",
).runner;
export const publicLaneKey = ({ runner, node }) => `${runner}-${node}`;
const origin = (source) => ({
  commit: source.commit,
  run: String(source.runId),
  attempt: String(source.attempt),
});
const requestedOrigin = (op) => ({
  commit: op.publicController,
  run: op.publicRun,
  attempt: op.publicAttempt,
});

function assertPublicRun(run, operation, complete, rightsPending = false) {
  assert.deepEqual(
    [
      String(run.id),
      String(run.run_attempt),
      run.path,
      run.repository?.full_name,
      run.repository?.id,
      run.head_repository?.full_name,
      run.head_repository?.id,
      run.head_branch,
      run.head_sha,
      run.event,
    ],
    [
      operation.publicRun,
      operation.publicAttempt,
      filename,
      REPOSITORY,
      REPOSITORY_ID,
      REPOSITORY,
      REPOSITORY_ID,
      "main",
      operation.publicController,
      "workflow_dispatch",
    ],
  );
  assert.ok(
    rightsPending
      ? run.status === "completed" && run.conclusion === "failure"
      : (run.status === "completed" && run.conclusion === "success") ||
          (!complete &&
            run.status === "in_progress" &&
            run.conclusion === null),
    "The expected public run has no admissible execution state",
  );
}

function jobInventory(response) {
  assert.equal(
    response.total_count,
    response.jobs.length,
    "Incomplete public job inventory",
  );
  assert.equal(
    new Set(response.jobs.map(({ name }) => name)).size,
    response.jobs.length,
  );
  return response.jobs;
}

function assertPointer(pointer, expected, scope, prefix) {
  assert.deepEqual(
    descriptor(pointer),
    expected,
    "Public observation artifact changed",
  );
  assert.ok(
    positive(expected.id) &&
      positive(expected.bytes) &&
      expected.bytes <= 16 * 1024 * 1024,
  );
  assert.match(expected.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(pointer.workflow_run?.id, scope.runId);
  assert.equal(pointer.workflow_run?.head_sha, scope.commit);
  assert.equal(pointer.workflow_run?.repository_id, REPOSITORY_ID);
  assert.equal(pointer.workflow_run?.head_repository_id, REPOSITORY_ID);
  assert.ok(
    matchesLogicalArtifact(pointer.name, prefix + scope.attempt, {
      run: scope.runId,
      attempt: scope.attempt,
      legacy: false,
    }),
  );
}

async function readMembers(client, pointer, requested) {
  const bytes = await originalBytes(client, pointer);
  assert.equal(bytes.length, pointer.size_in_bytes);
  const content = readZipArchiveFilesWith(bytes, {
    crc32,
    expectedNames: new Set(requested),
    maximumUncompressedBytes: 16 * 1024 * 1024,
  });
  assert.deepEqual(
    content.map((file) => file.path).sort(),
    [...requested].sort(),
  );
  return new Map(content.map(({ path, content: file }) => [path, file]));
}

/** Select one upload from the successful native execution. The enclosing run can still be in progress. */
async function openPublicRun(
  client,
  checkpoint,
  operation,
  complete = false,
  rightsPending = false,
) {
  assert.match(operation.publicRun, /^[1-9]\d{0,15}$/u);
  assert.match(operation.publicAttempt, /^[1-9]\d{0,2}$/u);
  assert.match(operation.publicController, /^[a-f0-9]{40}$/u);
  const path = `/actions/runs/${operation.publicRun}`;
  const savedBytes = checkpoint?.files.get("public-run-origin.json");
  const saved = complete && savedBytes ? parse(savedBytes) : null;
  const read = async (get, retained) => {
    try {
      return await get();
    } catch (error) {
      if (retained && [404, 410].includes(error.httpStatus)) return retained;
      throw error;
    }
  };
  const readRun = () => read(() => client.read(path), saved?.run);
  const run = await readRun();
  assertPublicRun(run, operation, complete, rightsPending);
  const latest = jobInventory(
    await read(
      () => client.read(path + "/jobs?filter=latest&per_page=100"),
      saved?.latestJobs,
    ),
  );
  if (complete) {
    const advisory = latest.find(
      ({ name }) => name === "Release advisory / Evaluate",
    );
    assert.ok(
      advisory?.status === "completed" &&
        advisory.conclusion === "success" &&
        advisory.run_id === run.id &&
        advisory.head_sha === run.head_sha,
      "Missing completed public advisory job",
    );
  }
  const inventory = await read(
    () => readRunArtifacts((url) => client.read(url), operation.publicRun),
    saved?.artifacts,
  );
  const allArtifacts = new Map(inventory.map((item) => [item.id, item]));
  assert.equal(allArtifacts.size, inventory.length);
  for (const item of saved?.artifacts ?? []) {
    if (allArtifacts.has(item.id))
      assert.deepEqual(descriptor(allArtifacts.get(item.id)), descriptor(item));
    else allArtifacts.set(item.id, item);
  }
  const attempts = new Map();
  async function artifact({ job: name, runner, prefix, step, members }) {
    const final = latest.find((candidate) => candidate.name === name);
    assert.ok(
      final?.status === "completed" && final.conclusion === "success",
      "Missing a successful original public job",
    );
    assert.deepEqual(final.labels, [runner]);
    const matches = [];
    for (const item of allArtifacts.values()) {
      const attempt = artifactProducingAttempt(item.name, prefix, {
        run: run.id,
        attempt: run.run_attempt,
        legacy: false,
      });
      if (attempt === null) continue;
      if (!attempts.has(attempt))
        attempts.set(
          attempt,
          jobInventory(
            await read(
              () =>
                client.read(path + `/attempts/${attempt}/jobs?per_page=100`),
              saved?.attempts?.[attempt],
            ),
          ),
        );
      const job = attempts
        .get(attempt)
        .find(({ name: found }) => found === name);
      if (
        job?.run_attempt === attempt &&
        job.status === "completed" &&
        job.conclusion === "success" &&
        sameJobExecution(job, final)
      ) {
        matches.push({ item, job, attempt });
      }
    }
    assert.equal(
      matches.length,
      1,
      "Missing or duplicate original public upload",
    );
    const [{ item, job, attempt }] = matches;
    assert.equal(job.run_id, run.id);
    assert.equal(job.head_sha, run.head_sha);
    assert.ok(positive(job.id));
    assert.deepEqual(job.labels, [runner]);
    const uploads = job.steps.filter(({ name }) => name === step);
    assert.equal(uploads.length, 1);
    const [upload] = uploads;
    const uploaded = Date.parse(item.created_at);
    assert.ok(
      upload.status === "completed" &&
        upload.conclusion === "success" &&
        uploaded >= Date.parse(upload.started_at) &&
        uploaded <= Date.parse(upload.completed_at),
      "Public upload is outside its original step",
    );
    const pointer = await read(
      () => client.read("/actions/artifacts/" + item.id),
      saved && item,
    );
    const source = {
      repositoryId: REPOSITORY_ID,
      commit: run.head_sha,
      runId: run.id,
      attempt,
      jobId: job.id,
      artifactSha256: item.digest.slice(7),
    };
    assertPointer(pointer, descriptor(item), source, prefix);
    const archived =
      pointer.expired || !inventory.some(({ id }) => id === pointer.id);
    const archivedBytes =
      archived && checkpoint?.files.get(`artifact-${pointer.id}.zip`);
    if (archived)
      assert.ok(
        archivedBytes && complete,
        "Original public upload is unavailable in custody",
      );
    return {
      source,
      artifact: descriptor(item),
      execution: { startedAt: job.started_at, completedAt: job.completed_at },
      files: await readMembers(
        client,
        archived ? { ...pointer, archivedBytes } : pointer,
        members,
      ),
    };
  }
  return {
    artifact,
    confirm: async () =>
      assertPublicRun(await readRun(), operation, complete, rightsPending),
  };
}

const observationPrefix = (lane) =>
  `public-observation-${publicLaneKey(lane)}-`;
const observationJob = (lane) =>
  `Public observation (${lane.runner}, ${lane.node})`;
const testJob = (lane) => `Public recipient (${lane.runner}, ${lane.node})`;

async function readRegistryProof(reader, operation, input, pinnedReport) {
  const registry = await reader.artifact({
    job: "registry",
    runner: sampleRunner,
    prefix: `release-registry-${operation.publicRun}-`,
    step: "Retain original operation evidence",
    members: ["public.json", "recipient-input.json"],
  });
  const reportBytes = registry.files.get("public.json");
  if (pinnedReport)
    assert.ok(
      reportBytes.equals(pinnedReport),
      "Signed registry report differs from its native original",
    );
  assert.deepEqual(parse(registry.files.get("recipient-input.json")), input);
  const report = parse(reportBytes);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.result, "PASS");
  assert.equal(report.publication.stageId, input.stageId);
  assert.equal(
    report.provenance.workflow,
    ".github/workflows/stage-release.yml",
  );
  assert.equal(report.provenance.runId, input.stageRun);
  assert.equal(report.provenance.runAttempt, Number(input.stageAttempt));
  assert.equal(report.provenance.sourceCommit, input.stageController);
  assert.equal(report.tarballSha256, input.tarballSha256);
  assert.equal(report.integrity, input.integrity);
  assert.equal(
    report.coordinate,
    `${input.package.name}@${input.package.version}`,
  );
  return { registry, report, reportBytes };
}

async function readObservationBatch(
  client,
  checkpoint,
  operation,
  matrix,
  input,
  { tarball, npmCli, pinnedReport, complete = false, pendingLane },
) {
  assert.equal(input.schemaVersion, 2);
  const reader = await openPublicRun(
    client,
    checkpoint,
    operation,
    complete,
    pendingLane !== undefined,
  );
  const { registry, report, reportBytes } = await readRegistryProof(
    reader,
    operation,
    input,
    pinnedReport,
  );
  const selected = {};
  const lanes =
    pendingLane === undefined
      ? matrix.include
      : matrix.include.filter((lane) => publicLaneKey(lane) === pendingLane);
  assert.ok(
    lanes.length,
    "Original public observation is outside the approved matrix",
  );
  for (const lane of lanes) {
    const observation = await reader.artifact({
      job: observationJob(lane),
      runner: lane.runner,
      prefix: observationPrefix(lane),
      step: "Retain original public observation",
      members: [PUBLIC_OBSERVATION],
    });
    const packet = parse(observation.files.get(PUBLIC_OBSERVATION));
    const consumers = await readPublicObservation(packet, {
      lane,
      input,
      tarball,
      npmCli,
      registryTarball: report.tarballUrl,
      origin: origin(observation.source),
    });
    selected[publicLaneKey(lane)] = {
      source: observation.source,
      artifact: observation.artifact,
      packet,
      consumers,
    };
  }
  assertConsistentArchives(
    Object.values(selected).flatMap((item) =>
      Object.values(item.consumers).map(({ evidence }) => evidence.resolution),
    ),
  );
  await reader.confirm();
  return {
    selected,
    report,
    reportBytes,
    reader,
    registry: { source: registry.source, artifact: registry.artifact },
  };
}

/** Release admission has no failed-run selector. */
export function readPublicObservationBatch(
  client,
  checkpoint,
  operation,
  matrix,
  input,
  { tarball, npmCli, pinnedReport, complete },
) {
  return readObservationBatch(client, checkpoint, operation, matrix, input, {
    tarball,
    npmCli,
    pinnedReport,
    complete,
  });
}

/** Only the scoped rights replay can reopen an observation from its failed run. */
export async function readPendingPublicObservation(
  client,
  checkpoint,
  operation,
  matrix,
  input,
  { tarball, npmCli, lane },
) {
  assert.equal(typeof lane, "string");
  const { selected, report } = await readObservationBatch(
    client,
    checkpoint,
    operation,
    matrix,
    input,
    { tarball, npmCli, pendingLane: lane },
  );
  return { observation: selected[lane], registryTarball: report.tarballUrl };
}

export function readMaterialPacket(bytes, input, runOrigin) {
  const material = unpackPublicMaterial(parse(bytes));
  assert.deepEqual(Object.keys(material).sort(), [
    "input",
    "lanes",
    "origin",
    "originals",
    "schemaVersion",
  ]);
  assert.equal(material.schemaVersion, 2);
  assert.deepEqual(material.input, input);
  assert.equal(material.origin.run, runOrigin.run);
  assert.equal(material.origin.commit, runOrigin.commit);
  assert.match(material.origin.attempt, /^[1-9]\d{0,2}$/u);
  assert.ok(Number(material.origin.attempt) <= Number(runOrigin.attempt));
  return material;
}

export function readMaterialLane(
  material,
  lane,
  observation,
  tracked = new Set(),
) {
  const retained = material.lanes[publicLaneKey(lane)];
  assert.deepEqual(Object.keys(retained).sort(), [
    "artifact",
    "decisions",
    "source",
  ]);
  assert.deepEqual(retained.artifact, observation.artifact);
  assert.deepEqual(retained.source, observation.source);
  assert.deepEqual(Object.keys(retained.decisions).sort(), ["alias", "scoped"]);
  const open = (key) => {
    assert.match(key, hex);
    const value = material.originals[key];
    assert.equal(typeof value, "string");
    assert.equal(sha256Buffer(Buffer.from(value)), key);
    tracked.add(key);
    return value;
  };
  const records = {};
  for (const [mode, key] of Object.entries(retained.decisions)) {
    const decision = JSON.parse(open(key));
    const original = open(decision.materialSha256);
    assertPublicMaterialDecision(
      decision,
      original,
      observation.consumers[mode],
      mode,
    );
    records[mode] = { decision, material: original };
  }
  return { decisions: retained.decisions, records };
}

export function assertPublicTestRecord(
  record,
  {
    lane,
    input,
    testSource,
    observation: selected,
    materialSha256,
    decisions,
    advisory,
  },
) {
  assertPublicAdvisoryDescriptor(advisory);
  assert.deepEqual(record, {
    schemaVersion: 2,
    lane,
    input,
    origin: origin(testSource),
    observation: selected.artifact,
    materialSha256,
    advisory,
    consumers: Object.fromEntries(
      Object.entries(selected.consumers).map(([mode, observation]) => [
        mode,
        {
          resolutionSha256: observation.resolutionSha256,
          decisionSha256: decisions[mode],
          installedTests: INSTALLED_TEST_SCRIPTS,
        },
      ]),
    ),
  });
}

/** The product job reopens the exact captured lock selected by the successful scanner job. */
export async function readPublicTestInputs(
  client,
  materialBytes,
  { lane, input, origin: runOrigin, tarball, npmCli, registryTarball },
) {
  const material = readMaterialPacket(materialBytes, input, runOrigin);
  const selected = material.lanes[publicLaneKey(lane)];
  assert.equal(selected.source.commit, runOrigin.commit);
  assert.equal(String(selected.source.runId), runOrigin.run);
  assert.ok(
    positive(selected.source.attempt) &&
      selected.source.attempt <= Number(runOrigin.attempt),
  );
  assert.ok(positive(selected.artifact.id));
  const pointer = await client.read(
    "/actions/artifacts/" + selected.artifact.id,
  );
  assertPointer(
    pointer,
    selected.artifact,
    selected.source,
    observationPrefix(lane),
  );
  assert.equal(pointer.expired, false);
  const members = await readMembers(client, pointer, [PUBLIC_OBSERVATION]);
  const consumers = await readPublicObservation(
    parse(members.get(PUBLIC_OBSERVATION)),
    {
      lane,
      input,
      tarball,
      npmCli,
      registryTarball,
      origin: origin(selected.source),
    },
  );
  const { decisions, records } = readMaterialLane(material, lane, {
    ...selected,
    consumers,
  });
  let materialReader;
  for (const [mode, record] of Object.entries(records)) {
    if (!record.decision.rights) continue;
    materialReader ??= await prepareRecipientMaterial({ npmCli });
    await verifyPublicMaterialRecord(materialReader, record, consumers[mode], {
      client,
      npmCli,
      input,
      lane,
      mode,
      sourceCommit: runOrigin.commit,
    });
  }
  return {
    consumers,
    decisions,
    observation: selected.artifact,
    materialSha256: sha256Buffer(materialBytes),
  };
}

const readOriginalMaterial = (reader, operation) =>
  reader.artifact({
    job: "material",
    runner: sampleRunner,
    prefix: `public-material-${operation.publicRun}-`,
    step: "Retain public material decisions",
    members: [PUBLIC_MATERIAL],
  });

function materialAuditEntries(material, input, matrix, operation) {
  assert.deepEqual(
    Object.keys(material.lanes).sort(),
    matrix.include.map(publicLaneKey).sort(),
  );
  const entries = new Map();
  for (const lane of matrix.include) {
    const { source, decisions } = material.lanes[publicLaneKey(lane)];
    assert.equal(source.commit, operation.publicController);
    assert.equal(String(source.runId), operation.publicRun);
    assert.equal(source.repositoryId, REPOSITORY_ID);
    assert.ok(
      positive(source.attempt) &&
        source.attempt <= Number(operation.publicAttempt),
    );
    assert.deepEqual(Object.keys(decisions).sort(), ["alias", "scoped"]);
    for (const [mode, key] of Object.entries(decisions)) {
      assert.match(key, hex);
      const bytes = material.originals[key];
      assert.equal(typeof bytes, "string");
      assert.equal(sha256Buffer(Buffer.from(bytes)), key);
      const decision = JSON.parse(bytes);
      assert.equal(decision.role, `public-${mode}`);
      assert.equal(decision.result, "PASS");
      const { subject } = decision;
      assert.equal(subject.tarballSha256, input.tarballSha256);
      assert.equal(subject.role, "recipient");
      assert.equal(subject.scope, "production");
      assert.deepEqual(subject.platform, {
        ...publicPlatform(lane),
        npm: CI_RUNTIME.consumerNpm,
      });
      const entry = { source, subject };
      entries.set(canonicalJson(entry), entry);
    }
  }
  return [...entries.values()];
}

/** Canonical same-job pretest readback. The floor process only consumes this exact plan. */
export async function admitPublicRecipientReplay(
  client,
  checkpoint,
  operation,
  matrix,
  input,
  { tarball, npmCli, consumerNpmCli, lane },
) {
  const reader = await openPublicRun(client, checkpoint, operation);
  const { report } = await readRegistryProof(reader, operation, input);
  const retained = await readOriginalMaterial(reader, operation);
  const materialBytes = retained.files.get(PUBLIC_MATERIAL);
  const runOrigin = requestedOrigin(operation);
  const material = readMaterialPacket(materialBytes, input, runOrigin);
  assert.deepEqual(material.origin, origin(retained.source));
  const entries = materialAuditEntries(material, input, matrix, operation);
  const matched = await readPublicTestInputs(client, materialBytes, {
    lane,
    input,
    origin: runOrigin,
    tarball,
    npmCli: consumerNpmCli,
    registryTarball: report.tarballUrl,
  });
  const verified = await verifyHostedAdvisoryReceipt({
    client,
    checkpoint,
    runId: operation.publicRun,
    attempt: operation.publicAttempt,
    controller: operation.publicController,
    workflow: filename,
    entries,
    npmCli,
    publicRecipientTest: true,
  });
  await reader.confirm();
  const expiresAt = advisoryDecisionExpiry(verified.decision);
  assert.ok(
    Date.now() < expiresAt,
    "The public advisory decision expired during replay admission",
  );
  return {
    schemaVersion: 1,
    lane,
    input,
    origin: runOrigin,
    registryTarball: report.tarballUrl,
    observation: matched.observation,
    materialSha256: matched.materialSha256,
    advisory: verified.descriptor,
    expiresAt,
    consumers: Object.fromEntries(
      Object.entries(matched.consumers).map(([mode, value]) => [
        mode,
        {
          manifest: value.evidence.manifest,
          lock: value.evidence.lock,
          resolutionSha256: value.resolutionSha256,
          decisionSha256: matched.decisions[mode],
        },
      ]),
    ),
  };
}

/** Independent rights readback uses the actual observed product lane and stage. */
export function verifyPublicMaterialRecord(
  reader,
  { decision, material },
  observed,
  { client, npmCli, input, lane, mode, sourceCommit, archived },
) {
  return verifyQualifiedRecipientMaterial(
    reader,
    {
      recordBytes: Buffer.from(material),
      recordSha256: decision.materialSha256,
      resolution: observed.evidence.resolution,
      lockfileBytes: observed.original.lockBytes,
    },
    {
      client,
      npmCli,
      rights: decision.rights,
      archived,
      scope: {
        evidence: observed.evidence,
        role: `public-${mode}`,
        sourceCommit,
        caseContext: {
          kind: "PUBLIC_OBSERVATION",
          stage: input,
          lane: publicLaneKey(lane),
        },
      },
    },
  );
}

/** Reconstruct the independently measured advisory subjects from successful public jobs. */
export async function readPublicAuditSubjects(
  client,
  checkpoint,
  operation,
  matrix,
  input,
  options,
) {
  const batch = await readPublicObservationBatch(
    client,
    checkpoint,
    operation,
    matrix,
    input,
    options,
  );
  const retained = await readOriginalMaterial(batch.reader, operation);
  const retainedBytes = retained.files.get(PUBLIC_MATERIAL);
  const material = readMaterialPacket(
    retainedBytes,
    input,
    requestedOrigin(operation),
  );
  assert.deepEqual(material.origin, origin(retained.source));
  assert.deepEqual(
    Object.keys(material.lanes).sort(),
    Object.keys(batch.selected).sort(),
  );
  const materialReader = await prepareRecipientMaterial({
    npmCli: options.npmCli,
  });
  const used = new Set();
  const sources = new Map(),
    files = new Map(),
    native = {};
  const testAdvisories = [];
  for (const lane of matrix.include) {
    const key = publicLaneKey(lane);
    const selected = batch.selected[key];
    const { decisions, records } = readMaterialLane(
      material,
      lane,
      selected,
      used,
    );
    for (const [mode, { decision, material: bytes }] of Object.entries(
      records,
    )) {
      const observed = selected.consumers[mode];
      assert.ok(
        Date.parse(decision.observedAt) >=
          Date.parse(retained.execution.startedAt) &&
          Date.parse(decision.observedAt) <=
            Date.parse(retained.execution.completedAt),
        "Public material decision is outside its original execution",
      );
      await verifyPublicMaterialRecord(
        materialReader,
        { decision, material: bytes },
        observed,
        {
          client,
          npmCli: options.npmCli,
          input,
          lane,
          mode,
          sourceCommit: operation.publicController,
        },
      );
      const entry = { source: selected.source, subject: observed.subject };
      sources.set(canonicalJson(entry), {
        entry,
        original: { ...observed.original, source: selected.source },
      });
    }
    if (!options.complete) continue;
    const tested = await batch.reader.artifact({
      job: testJob(lane),
      runner: lane.runner,
      prefix: `public-recipient-${key}-`,
      step: "Retain public recipient proof",
      members: [PUBLIC_TEST],
    });
    const testedBytes = tested.files.get(PUBLIC_TEST);
    const record = parse(testedBytes);
    assertPublicAdvisoryDescriptor(record.advisory);
    testAdvisories.push({
      descriptor: record.advisory,
      startedAt: tested.execution.startedAt,
    });
    assert.ok(
      Date.parse(tested.execution.startedAt) >=
        Date.parse(retained.execution.completedAt),
      "Public replay preceded the retained material job",
    );
    assertPublicTestRecord(record, {
      lane,
      input,
      testSource: tested.source,
      observation: selected,
      materialSha256: sha256Buffer(retainedBytes),
      decisions,
      advisory: record.advisory,
    });
    files.set(`public-recipient-${key}.json`, testedBytes);
    native[key] = {
      packet: selected.packet.index,
      artifact: selected.artifact,
      source: selected.source,
      tests: { artifact: tested.artifact, source: tested.source },
    };
  }
  assert.deepEqual(
    [...used].sort(),
    Object.keys(material.originals).sort(),
    "Unrequested public material original",
  );
  await batch.reader.confirm();
  assert.deepEqual(
    [...sources.keys()].sort(),
    materialAuditEntries(material, input, matrix, operation)
      .map(canonicalJson)
      .sort(),
    "Material and observed advisory subjects differ",
  );
  if (options.complete) {
    const originals = Object.assign(
      {},
      ...Object.values(batch.selected).map(({ packet }) => packet.originals),
    );
    files.set(
      "public-native.json",
      Buffer.from(
        stableJson({
          schemaVersion: 2,
          registry: batch.registry,
          material: { artifact: retained.artifact, source: retained.source },
          lanes: native,
          originals,
        }),
      ),
    );
    files.set("public-material.json", retainedBytes);
    files.set(
      "recipient-input.json",
      Buffer.from(JSON.stringify(input) + "\n"),
    );
  }
  return {
    entries: [...sources.values()].map(({ entry }) => entry),
    authenticate(entry) {
      const selected = sources.get(canonicalJson(entry));
      assert.ok(selected, "Unknown public advisory subject");
      return selected.original;
    },
    files,
    report: batch.report,
    testAdvisories,
  };
}
