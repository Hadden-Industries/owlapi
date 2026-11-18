/** Read the closed producer proof for the authenticated original FULL candidate. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  artifactProducingAttempt,
  matchesLogicalArtifact,
} from "../tooling/artifact-transport/identity.mjs";
import { readJobInventory } from "./ci-verification.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";
import { sameJobExecution } from "./github-job-execution.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { readZipArchiveFiles } from "./release-zip.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  PACKAGE_VERSION,
} from "./package-identity.mjs";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import {
  assertNpmSbomInventory,
  flattenNpmGraph,
} from "./npm-production-graph.mjs";

const candidateLimit = 64 * 1024 * 1024;
const proofLimit = 16 * 1024 * 1024;
const manifest = "candidate-manifest.json";
const lockedGraph = "locked-production-graph.json";
const sbomGraph = "sbom-subject-production-graph.json";
const consumerGraph = "lockless-consumer-production-graph.json";
const consumerLock = "lockless-consumer-package-lock.json";
const requiredProof = [
  manifest,
  lockedGraph,
  sbomGraph,
  consumerGraph,
  consumerLock,
  "transport-audit.json",
  "npm-audit-full.json",
  "npm-audit-production.json",
  "normal-consumer-npm-audit-production.json",
  "inspection-consumer-production-graph.json",
];

const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Bind all ZIP bytes to the exact native artifact digest and closed file set. */
export async function readQualifiedZip(
  download,
  artifact,
  maximumBytes,
  names,
) {
  assert.ok(
    positiveId(artifact.id) &&
      Number.isSafeInteger(artifact.size_in_bytes) &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <= maximumBytes &&
      /^sha256:[0-9a-f]{64}$/u.test(artifact.digest),
    "Original artifact is outside the qualification bounds",
  );
  const bytes = await download(artifact, artifact.size_in_bytes);
  assert.equal(
    bytes.length,
    artifact.size_in_bytes,
    "Original ZIP size differs",
  );
  assert.equal(
    "sha256:" + sha256(bytes),
    artifact.digest,
    "Original ZIP digest differs",
  );
  const entries = readZipArchiveFiles(bytes, {
    expectedNames: new Set(names),
    maximumUncompressedBytes: maximumBytes,
  });
  assert.deepEqual(
    entries.map(({ path }) => path).sort(),
    [...names].sort(),
    "Original ZIP inventory differs",
  );
  return new Map(entries.map(({ path, content }) => [path, content]));
}

const requireSameUpload = (artifact, run, job, name, now) => {
  const steps = (job.steps ?? []).filter((step) => step.name === name);
  const created = Date.parse(artifact.created_at);
  assert.equal(
    steps.length,
    1,
    "The original upload step is missing or ambiguous",
  );
  const [step] = steps;
  assert.ok(
    step.status === "completed" &&
      step.conclusion === "success" &&
      created >= Date.parse(step.started_at) &&
      created <= Date.parse(step.completed_at) &&
      artifact.expired === false &&
      Date.parse(artifact.expires_at) > now &&
      artifact.workflow_run?.id === run.id &&
      artifact.workflow_run.repository_id === run.repository.id &&
      artifact.workflow_run.head_repository_id === run.head_repository.id &&
      artifact.workflow_run.head_sha === run.head_sha,
    "Artifact does not belong to the original successful upload",
  );
};

const jsonMember = (files, name) => {
  const bytes = files.get(name);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
};

function verifyGraphs(evidence, sbom, integrity) {
  const locked = jsonMember(evidence, lockedGraph);
  const subject = jsonMember(evidence, sbomGraph);
  const alias = jsonMember(evidence, consumerGraph).dependencies?.owlapi;
  assert.ok(alias, "The original consumer did not record its npm alias");
  for (const graph of [locked, subject]) {
    assert.equal(graph.name, PACKAGE_NAME);
    assert.equal(graph.version, PACKAGE_VERSION);
  }
  assert.equal(alias.version, PACKAGE_VERSION);
  const identities = flattenNpmGraph(locked);
  assert.deepEqual(
    flattenNpmGraph(subject),
    identities,
    "SBOM subject graph differs from the locked graph",
  );
  assert.deepEqual(
    flattenNpmGraph(alias, PACKAGE_NAME),
    identities,
    "Lockless consumer graph differs from the locked graph",
  );
  assertNpmSbomInventory(sbom, identities);
  const lock = jsonMember(evidence, consumerLock);
  const installed = lock.packages?.["node_modules/owlapi"];
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(installed?.version, PACKAGE_VERSION);
  assert.equal(
    installed?.integrity,
    integrity,
    "Original consumer lock belongs to different tarball bytes",
  );
  return identities;
}

/** Authenticate the split candidate and proof from the same native producer job.
 * Returns only descriptions for handoff. The graph and lock bytes stay at the
 * original artifact for the fresh assurance reader.
 */
export async function verifyReleaseCiPackage({
  source,
  read,
  download,
  audit,
  now = Date.now(),
}) {
  const { run, candidate, receipt, observed } = source;
  const versionStem = PACKAGE_FILE_STEM + "-" + PACKAGE_VERSION;
  const attempt = artifactProducingAttempt(
    candidate.name,
    `${versionStem}-candidate-${run.id}-`,
    {
      run: run.id,
      attempt: run.run_attempt,
      legacy: true,
    },
  );
  assert.ok(positiveId(attempt), "No exact candidate-producing attempt");
  const name = CI_JOB_NAMES.candidate + " / Produce";
  const latest = observed.jobs.find((job) => job.name === name);
  const jobs =
    attempt === run.run_attempt
      ? observed
      : await readJobInventory({ read, run, attempt, required: [name] });
  const job = jobs.jobs.find((entry) => entry.name === name);
  assert.ok(
    job?.run_attempt === attempt &&
      job.conclusion === "success" &&
      job.labels?.length === 1 &&
      job.labels[0] === UBUNTU.label &&
      sameJobExecution(job, latest),
    "Candidate producing attempt or runner differs from the qualified job",
  );
  assert.ok(
    positiveId(receipt?.packageProof?.id),
    "Original CI receipt has no producer package proof acknowledgement",
  );
  const proof = await read(`/actions/artifacts/${receipt.packageProof.id}`, {
    retryArtifact404: true,
  });
  assert.ok(
    proof.id === receipt.packageProof.id &&
      proof.digest === receipt.packageProof.digest &&
      matchesLogicalArtifact(proof.name, `package-proof-${run.id}-${attempt}`, {
        run: run.id,
        attempt,
        legacy: true,
      }),
    "Original package proof differs from its acknowledged ID, digest or producing attempt",
  );
  requireSameUpload(
    candidate,
    run,
    job,
    "Upload the exact same-run candidate",
    now,
  );
  requireSameUpload(
    proof,
    run,
    job,
    "Retain the producer's native audit and consumer inventories",
    now,
  );

  const tarName = versionStem + ".tgz";
  const sbomName = versionStem + ".cdx.json";
  const candidateFiles = await readQualifiedZip(
    download,
    candidate,
    candidateLimit,
    ["SHA256SUMS", sbomName, tarName],
  );
  const evidence = await readQualifiedZip(
    download,
    proof,
    proofLimit,
    requiredProof,
  );
  const tarball = candidateFiles.get(tarName);
  const integrity =
    "sha512-" + createHash("sha512").update(tarball).digest("base64");
  const verified = verifyDownloadedCandidateBundle({
    fileNames: [...candidateFiles.keys()],
    checksumText: candidateFiles.get("SHA256SUMS"),
    sbomText: candidateFiles.get(sbomName),
    tarball,
  });
  const record = jsonMember(evidence, manifest);
  assert.equal(record.schemaVersion, 1, "Unknown producer manifest");
  assert.deepEqual(record.package, verified.package);
  assert.equal(record.nodeVersion, `v${CANONICAL_NODE}`);
  assert.equal(record.npmVersion, CI_RUNTIME.npm);
  assert.equal(record.checksumFile, "SHA256SUMS");
  assert.equal(record.lockedAndLocklessGraphsEquivalent, true);
  for (const [key, identity] of Object.entries({
    tarball: verified.tarball,
    sbom: verified.sbom,
  })) {
    for (const [field, value] of Object.entries(identity))
      assert.equal(
        record[key]?.[field],
        value,
        "Producer manifest describes different candidate bytes",
      );
  }
  const identities = verifyGraphs(
    evidence,
    jsonMember(candidateFiles, sbomName),
    integrity,
  );
  const advisoryObservations = await audit?.(
    evidence.get(consumerLock),
    identities,
  );
  return {
    attempt,
    producerJob: job.id,
    candidate,
    proof,
    package: verified.package,
    packedConfig: verified.packageManifest.publishConfig,
    assets: verified.assets,
    integrity,
    advisoryObservations,
    evidence: Object.fromEntries(
      [...evidence].map(([path, content]) => [
        path,
        { bytes: content.length, sha256: sha256(content) },
      ]),
    ),
  };
}
