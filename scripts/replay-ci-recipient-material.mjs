/** Exceptional discovery, scoped Linux scanning, and original-lock macOS replay. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, jsonEquals, stableJson } from "./canonical-json.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { createRepositoryReader } from "./github-evidence-reader.mjs";
import { parseCorpusArtifactLocator } from "./corpus-qualification-manifest.mjs";
import {
  assertTimedUpload,
  checkedNativeJob,
  releaseJobs,
} from "./release-audit-job.mjs";
import { readQualifiedZip } from "./release-ci-package.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import {
  standalonePortabilityRuntimes,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  REPOSITORY,
  REPOSITORY_ID,
} from "./release-identity.mjs";
import { PACKAGE_VERSION } from "./package-identity.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import {
  pendingRecipientMaterialFilename,
  pendingRecipientUploadStep,
} from "./ci-recipient-material-pending.mjs";
import { artifactProducingAttempt } from "../tooling/artifact-transport/identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import {
  captureResolutionEvidence,
  prepareReplayedTarballConsumer,
  verifyResolutionEvidence,
} from "./release-consumer-evidence.mjs";
import { createCiRecipientScanner } from "./ci-recipient-scanner.mjs";
import {
  prepareRecipientMaterial,
  RECIPIENT_MATERIAL_NAME,
} from "../util/third-party-evidence/recipient-material.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { assertCiConsumerAttribution } from "./ci-recipient-attribution.mjs";
import { verifyCiConsumerEvidence } from "./ci-consumer-evidence-verification.mjs";
import {
  recipientMaterialCaseDirectory,
  retainRecipientMaterialCase,
} from "./recipient-material-case.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";
import { publicRegistryEnvironment } from "./public-registry-consumer.mjs";

const replayWorkflow = ".github/workflows/recipient-material-replay.yml";
const artifactLimit = 4 * 1024 * 1024;
const parse = (bytes) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
const hash = (value) => sha256Buffer(Buffer.from(stableJson(value)));
const qualifiedSha = /^[a-f0-9]{40}$/u;

function sameRepositoryRun(run, commit) {
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_sha, commit);
  for (const repository of [run.repository, run.head_repository]) {
    assert.equal(repository?.id, REPOSITORY_ID);
    assert.equal(repository.full_name, REPOSITORY);
  }
}

async function readOriginal(client, locator, names, limit = artifactLimit) {
  const artifact = await client.read(`/actions/artifacts/${locator.id}`, {
    retryArtifact404: true,
  });
  assert.equal(artifact.id, locator.id);
  assert.equal(artifact.digest, `sha256:${locator.sha256}`);
  assert.ok(
    artifact.expired === false && Date.parse(artifact.expires_at) > Date.now(),
    "The original recipient evidence expired",
  );
  const files = await readQualifiedZip(
    (meta, max) => downloadReleaseArtifact(client, meta, max),
    artifact,
    limit,
    names,
  );
  return { artifact, files };
}

/** Reopen the original pending job and the exact candidate transport before
 * selecting a scanner or creating a consumer workspace. */
export async function readPendingMacRecipientCase(client, env) {
  const { artifact, files } = await readOriginal(
    client,
    parseCorpusArtifactLocator(env.RECIPIENT_OBSERVATION),
    [pendingRecipientMaterialFilename],
  );
  const capsuleBytes = files.get(pendingRecipientMaterialFilename);
  const pending = parse(capsuleBytes);
  assert.deepEqual(Object.keys(pending).sort(), [
    "candidate",
    "evidence",
    "lane",
    "matrix",
    "missing",
    "resolutionSha256",
    "role",
    "schemaVersion",
    "source",
    "status",
  ]);
  assert.ok([1, 2].includes(pending.schemaVersion));
  assert.equal(pending.status, "NEEDS_ARCHIVE_MEASUREMENTS");
  const { source, lane, matrix, evidence, role, candidate } = pending;
  assert.equal(source.commit, env.GITHUB_SHA);
  const run = await client.read(`/actions/runs/${source.runId}`);
  sameRepositoryRun(run, source.commit);
  assert.equal(run.id, source.runId);
  assert.ok(["CI", "Release"].includes(source.workflow));
  assert.equal(
    run.path,
    `.github/workflows/${source.workflow.toLowerCase()}.yml`,
  );
  assert.ok(
    (source.workflow === "Release"
      ? ["workflow_dispatch"]
      : ["push", "workflow_dispatch"]
    ).includes(run.event),
  );
  assert.ok(
    Number.isSafeInteger(source.attempt) &&
      source.attempt > 0 &&
      source.attempt <= run.run_attempt,
  );
  // A later partial rerun may succeed. Custody and failure belong to the
  // original observation attempt, whose run coordinates are checked separately.
  const originalAttempt = await client.read(
    `/actions/runs/${run.id}/attempts/${source.attempt}`,
  );
  sameRepositoryRun(originalAttempt, source.commit);
  assert.equal(originalAttempt.id, run.id);
  assert.equal(originalAttempt.run_attempt, source.attempt);
  assert.equal(originalAttempt.path, run.path);
  assert.equal(originalAttempt.event, run.event);
  assert.equal(originalAttempt.status, "completed");
  assert.equal(
    originalAttempt.conclusion,
    "failure",
    "The original recipient attempt must have failed",
  );
  const standalone =
    pending.schemaVersion === 2
      ? standalonePortabilityRuntimes[source.job]
      : undefined;
  if (pending.schemaVersion === 2)
    assert.ok(standalone?.platform.os === "darwin");
  else
    assert.equal(
      source.job,
      undefined,
      "Legacy pending discovery must belong to the consumer matrix",
    );
  if (!standalone || standalone.npm === CI_RUNTIME.consumerNpm)
    validateFrozenMatrix(matrix);
  else if (matrix) validateFrozenMatrix(matrix);
  assert.ok(
    lane.os === "darwin" &&
      lane.runner === "macos-15" &&
      (standalone
        ? jsonEquals(lane, {
            runner: standalone.runner,
            shell: "bash",
            os: standalone.platform.os,
            arch: standalone.platform.cpu,
            node: standalone.platform.node,
          })
        : matrix.include.some((row) => jsonEquals(lane, row))),
  );
  assert.ok(["portability-alias", "portability-scoped"].includes(role));
  assert.equal(
    evidence.resolution.dependencyName,
    role === "portability-alias" ? "owlapi" : PACKAGE_NAME,
  );
  assert.equal(
    evidence.resolution.npm,
    standalone?.npm ?? CI_RUNTIME.consumerNpm,
  );
  assert.ok(
    jsonEquals(evidence.resolution.platform, {
      os: lane.os,
      cpu: lane.arch,
      node: lane.node,
    }),
  );
  assert.equal(pending.resolutionSha256, hash(evidence.resolution));
  assert.equal(candidate.tarballSha256, evidence.resolution.tarballSha256);
  const jobs = await releaseJobs(client, run.id, source.attempt);
  const jobName = standalone
    ? CI_JOB_NAMES[source.job].replace(/^CI /u, `${source.workflow} `)
    : `${source.workflow} / complete consumer qualification / Consumer / ${lane.runner} / Node ${lane.node}`;
  const matches = jobs.filter((job) => job.name === jobName);
  assert.equal(matches.length, 1);
  const [job] = matches;
  assert.ok(
    job.run_id === run.id &&
      job.run_attempt === source.attempt &&
      job.head_sha === run.head_sha &&
      job.status === "completed" &&
      job.conclusion === "failure" &&
      jsonEquals(job.labels, [lane.runner]),
    "Pending observation belongs to another native job",
  );
  assertTimedUpload(
    artifact,
    run,
    job,
    standalone
      ? `pending-recipient-material-${source.job}-${run.id}-${source.attempt}`
      : `pending-recipient-material-${lane.runner}-${lane.node}-attempt-${source.attempt}`,
    pendingRecipientUploadStep,
  );
  const stem = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}`;
  const names = [`${stem}.tgz`, `${stem}.cdx.json`, "SHA256SUMS"];
  const { artifact: bundleArtifact, files: bundle } = await readOriginal(
    client,
    { id: candidate.id, sha256: candidate.digest.slice(7) },
    names,
    64 * 1024 * 1024,
  );
  const prefix = `${stem}-candidate-${run.id}-`;
  const producingAttempt = artifactProducingAttempt(
    bundleArtifact.name,
    prefix,
    { run: run.id, attempt: source.attempt, legacy: false },
  );
  assert.ok(producingAttempt, "Missing original candidate producer");
  const producer = checkedNativeJob(
    producingAttempt === source.attempt
      ? jobs
      : await releaseJobs(client, run.id, producingAttempt),
    `${source.workflow} / retained candidate / Produce`,
    run,
  );
  assert.equal(producer.run_attempt, producingAttempt);
  assert.ok(jsonEquals(producer.labels, [UBUNTU.label]));
  assertTimedUpload(
    bundleArtifact,
    run,
    producer,
    prefix + producingAttempt,
    "Upload the exact same-run candidate",
  );
  const tarball = bundle.get(names[0]);
  const verified = verifyDownloadedCandidateBundle({
    fileNames: [...bundle.keys()],
    tarball,
    checksumText: bundle.get("SHA256SUMS"),
    sbomText: bundle.get(names[1]),
  });
  assert.equal(verified.tarball.sha256, candidate.tarballSha256);
  return { pending, tarball, originalSha256: sha256Buffer(capsuleBytes) };
}

const emit = (env, record) =>
  appendFileSync(
    env.GITHUB_OUTPUT,
    Object.entries(record)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
  );

async function scanCase(input, env, npmCli) {
  const { pending, tarball, originalSha256 } = input;
  const { evidence, role } = pending;
  const resolution = await verifyResolutionEvidence(evidence, {
    tarball,
    npmCli,
    dependencyName: evidence.resolution.dependencyName,
    platform: evidence.resolution.platform,
    observedNpm: evidence.resolution.npm,
  });
  const root = resolve(".release/recipient-material-scan");
  mkdirSync(root, { recursive: true });
  const collector = await prepareRecipientMaterial({
    npmCli,
    evidenceDirectory: join(root, "archives"),
    scanArtifact: createCiRecipientScanner({ root, environment: env }),
  });
  const lockfileBytes = Buffer.from(evidence.lock);
  const missing = collector.missingArchiveMeasurements({
    resolution,
    lockfileBytes,
  });
  assert.ok(
    missing.length > 0 && jsonEquals(missing, pending.missing),
    "Scanner does not cover the original missing SRI roster",
  );
  const output = join(root, "working");
  const result = await collector.collect({
    directory: output,
    resolution,
    lockfileBytes,
  });
  const materialBytes = readFileSync(join(output, RECIPIENT_MATERIAL_NAME));
  if (result.status === "REQUIRES_HUMAN_REVIEW") {
    const { caseSha256 } = await retainRecipientMaterialCase({
      directory: join(root, recipientMaterialCaseDirectory),
      evidence,
      role,
      materialBytes,
      context: {
        kind: "MAC_SCANNER",
        originalObservation: env.RECIPIENT_OBSERVATION,
        originalSha256,
      },
    });
    throw new Error(
      `Recipient material needs a rights-owner disposition. Case ${caseSha256}.`,
    );
  }
  assert.equal(
    result.status,
    "PASSED",
    "Recipient material needs a rights-owner disposition",
  );
  mkdirSync(join(root, "proof"));
  writeFileSync(
    join(root, "proof", RECIPIENT_MATERIAL_NAME),
    stableJson({
      schemaVersion: 1,
      role,
      originalSha256,
      resolutionSha256: pending.resolutionSha256,
      origin: {
        runId: Number(env.GITHUB_RUN_ID),
        attempt: Number(env.GITHUB_RUN_ATTEMPT),
        commit: env.GITHUB_SHA,
      },
      materialSha256: sha256Buffer(materialBytes),
      material: materialBytes.toString("utf8"),
    }),
    { flag: "wx" },
  );
}

/** Apply only measurements bound to this original graph, install role and job. */
export function readScopedScannerMaterial(
  proof,
  { originalSha256, resolutionSha256, role, origin },
) {
  assert.deepEqual(Object.keys(proof).sort(), [
    "material",
    "materialSha256",
    "origin",
    "originalSha256",
    "resolutionSha256",
    "role",
    "schemaVersion",
  ]);
  assert.equal(proof.schemaVersion, 1);
  assert.ok(
    jsonEquals(proof.origin, origin),
    "Scanner result belongs to another native job",
  );
  assert.equal(proof.role, role, "Scanner result covers another install role");
  assert.equal(
    proof.originalSha256,
    originalSha256,
    "Scanner result covers another original observation",
  );
  assert.equal(
    proof.resolutionSha256,
    resolutionSha256,
    "Scanner result covers another native graph",
  );
  assert.equal(typeof proof.material, "string");
  const bytes = Buffer.from(proof.material);
  assert.equal(
    sha256Buffer(bytes),
    proof.materialSha256,
    "Scanner result bytes changed",
  );
  return bytes;
}

/** Reopen the exact scoped Linux measurement for an authenticated Mac original. */
export async function readRetainedMacMeasurements(
  client,
  input,
  locator,
  npmCli,
  activeRun,
) {
  const { pending, tarball, originalSha256 } = input;
  const { evidence, role } = pending;
  const { artifact, files } = await readOriginal(client, locator, [
    RECIPIENT_MATERIAL_NAME,
  ]);
  const proof = parse(files.get(RECIPIENT_MATERIAL_NAME));
  const { runId, attempt, commit } = proof.origin;
  assert.ok(
    [runId, attempt].every((value) => Number.isSafeInteger(value) && value > 0),
  );
  assert.equal(commit, pending.source.commit);
  const run = await client.read(`/actions/runs/${runId}`);
  sameRepositoryRun(run, commit);
  assert.equal(run.path, replayWorkflow);
  assert.equal(run.id, runId);
  assert.ok(run.event === "workflow_dispatch" && attempt <= run.run_attempt);
  if (activeRun) {
    assert.ok(jsonEquals(proof.origin, activeRun));
    assert.ok(
      run.status === "in_progress" &&
        run.conclusion === null &&
        attempt === run.run_attempt,
    );
  } else
    assert.equal(
      run.status,
      "completed",
      "The protected scanner run is still active",
    );
  const scanner = checkedNativeJob(
    await releaseJobs(client, run.id, attempt),
    "Recipient material / Scan",
    run,
  );
  assert.equal(scanner.run_attempt, attempt);
  assert.ok(jsonEquals(scanner.labels, [UBUNTU.label]));
  assertTimedUpload(
    artifact,
    run,
    scanner,
    `recipient-material-scan-${run.id}-${attempt}`,
    "Retain the scoped recipient scanner result",
  );
  const materialBytes = readScopedScannerMaterial(proof, {
    role,
    originalSha256,
    resolutionSha256: pending.resolutionSha256,
    origin: { runId: run.id, attempt, commit: run.head_sha },
  });
  await verifyResolutionEvidence(evidence, {
    tarball,
    npmCli,
    dependencyName: evidence.resolution.dependencyName,
    platform: evidence.resolution.platform,
    observedNpm: evidence.resolution.npm,
  });
  const records = await prepareRecipientMaterial({ npmCli });
  const { record } = await records.verifyRetained({
    recordBytes: materialBytes,
    recordSha256: proof.materialSha256,
    resolution: evidence.resolution,
    lockfileBytes: Buffer.from(evidence.lock),
  });
  assert.equal(record.status, "PASSED");
  const novel = record.artifacts.filter(
    (row) => row.source === "RECIPIENT_ARCHIVE",
  );
  assert.ok(
    jsonEquals(
      novel.map(({ artifactId }) => artifactId).sort(),
      pending.missing.map(({ artifactId }) => artifactId).sort(),
    ),
    "Scanner measured a different archive SRI roster",
  );
  const trustedArchiveMeasurements = novel.map((record) => ({
    record,
    origin: {
      ...proof.origin,
      jobId: scanner.id,
      artifactSha256: artifact.digest.slice(7),
      materialSha256: proof.materialSha256,
    },
  }));
  return {
    trustedArchiveMeasurements,
    scannerArtifactSha256: artifact.digest.slice(7),
  };
}

async function replayCase(client, input, env, npmCli) {
  const { pending, tarball, originalSha256 } = input;
  const { evidence, role } = pending;
  const { trustedArchiveMeasurements, scannerArtifactSha256 } =
    await readRetainedMacMeasurements(
      client,
      input,
      parseCorpusArtifactLocator(env.RECIPIENT_SCAN),
      npmCli,
      {
        runId: Number(env.GITHUB_RUN_ID),
        attempt: Number(env.GITHUB_RUN_ATTEMPT),
        commit: env.GITHUB_SHA,
      },
    );
  assert.equal(process.platform, pending.lane.os);
  assert.equal(process.arch, pending.lane.arch);
  assert.equal(process.versions.node, pending.lane.node);
  const directory = mkdtempSync(
    join(resolve(tmpdir()), "owlapi-mac-material-replay-"),
  );
  assert.ok(isStrictDescendantPath(tmpdir(), directory));
  try {
    prepareReplayedTarballConsumer(directory, tarball, evidence);
    const configured = publicRegistryEnvironment(directory);
    const runNative = (args) =>
      execFileSync(process.execPath, args, {
        cwd: directory,
        env: configured,
        stdio: "inherit",
        timeout: 20 * 60 * 1000,
        windowsHide: true,
      });
    runNative([
      npmCli,
      "ci",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--engine-strict",
      "--cache",
      join(directory, "npm-cache"),
    ]);
    const actual = await captureResolutionEvidence(directory, {
      tarball,
      npmCli,
      dependencyName: evidence.resolution.dependencyName,
    });
    assert.equal(
      canonicalJson(actual),
      canonicalJson(evidence),
      "Native replay exercised a different original lock or installed graph",
    );
    const output = resolve(".release/recipient-material-replay");
    const decisionDirectory = join(output, "eligibility");
    const decision = await verifyCiConsumerEvidence({
      directory,
      evidence: actual,
      role,
      npmCli,
      decisionDirectory,
      trustedArchiveMeasurements,
    });
    const attribution = assertCiConsumerAttribution(
      { schemaVersion: 1, evidence: actual, decision },
      {
        role,
        tarballSha256: pending.candidate.tarballSha256,
        decisionDirectory,
      },
    );
    writeInstalledConsumerFixtures(directory, actual.resolution.dependencyName);
    for (const script of INSTALLED_TEST_SCRIPTS) runNative([script]);
    writeFileSync(
      join(output, "replay.json"),
      stableJson({
        schemaVersion: 1,
        result: "PASS",
        source: pending.source,
        role,
        candidate: pending.candidate,
        observationSha256: originalSha256,
        scannerArtifactSha256,
        attribution,
        installedTests: INSTALLED_TEST_SCRIPTS,
      }),
      { flag: "wx" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main(env) {
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.match(env.GITHUB_SHA, qualifiedSha);
  const client = new GitHubReleaseClient({
    repository: REPOSITORY,
    token: env.GH_TOKEN,
    reader: createRepositoryReader({
      repository: REPOSITORY,
      token: env.GH_TOKEN,
      requestLimit: 48,
    }),
  });
  const branch = await client.read("/branches/main");
  assert.ok(
    branch.protected === true && branch.commit?.sha === env.GITHUB_SHA,
    "Recovery requires the current protected main controller",
  );
  const mode = process.argv[2];
  assert.ok(["prepare", "scan", "replay"].includes(mode));
  const input = await readPendingMacRecipientCase(client, env);
  const npm = input.pending.evidence.resolution.npm;
  const consumer = npm === CI_RUNTIME.consumerNpm;
  if (mode === "prepare") {
    emit(env, {
      node: input.pending.lane.node,
      matrix: JSON.stringify(input.pending.matrix),
      consumer: String(consumer),
    });
    return;
  }
  const npmCli = consumer
    ? env.OWLAPI_CONSUMER_NPM
    : selectNpmCliForVersion({
        expectedNpm: npm,
        candidates: findNpmCliCandidates(),
        observeVersion: observeNpmVersion,
      }).npmCli;
  assert.equal(
    createRequire(npmCli)("../package.json").version,
    npm,
    "Replay uses a different native npm version",
  );
  if (mode === "scan") await scanCase(input, env, npmCli);
  if (mode === "replay") await replayCase(client, input, env, npmCli);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    await main(process.env);
  } catch (error) {
    process.stderr.write(
      `Recipient material recovery did not complete: ${error.message.replace(/[\r\n]+/gu, " ").slice(0, 240)}\n`,
    );
    process.exitCode = 1;
  }
}
