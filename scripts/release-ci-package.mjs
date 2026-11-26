/** Read the closed producer proof for the authenticated original FULL candidate. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyResolutionEvidence } from "./release-consumer-evidence.mjs";
import * as zlib from "node:zlib";
import {
  artifactProducingAttempt,
  matchesLogicalArtifact,
} from "../tooling/artifact-transport/identity.mjs";
import { readJobInventory } from "./ci-verification.mjs";
import {
  CI_JOB_NAMES,
  QUALIFICATION_POLICY,
  QUALIFICATION_POLICY_SHA256,
} from "./ci-qualification.mjs";
import { sameJobExecution } from "./github-job-execution.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  PACKAGE_VERSION,
} from "./package-identity.mjs";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";
import {
  producerResolutionFilename,
  producerResolutionUploadStep,
  readProducerResolutions,
} from "./release-resolution-proof.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import {
  assertHealthyNpmGraph,
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
const currentProof = [manifest, producerResolutionFilename];
const producerPlatform = Object.freeze({
  os: "linux",
  cpu: "x64",
  node: CANONICAL_NODE,
  libc: "glibc",
});
const legacyProofUpload =
  "Retain the producer's native audit and consumer inventories";
const uploadStep = (version) =>
  version === 2 ? producerResolutionUploadStep : legacyProofUpload;

const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Bind all ZIP bytes to the exact native artifact digest and closed file set. */
export async function readQualifiedZip(
  download,
  artifact,
  maximumBytes,
  names = null,
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
  const constraints = {
    ...(names ? { expectedNames: new Set(names) } : {}),
    maximumUncompressedBytes: maximumBytes,
  };
  // Consumer replay can run at Node 22.0.0. Canonical, cold producer
  // admission uses native zlib and loads no installed dependencies.
  const entries =
    typeof zlib.crc32 === "function"
      ? readZipArchiveFilesWith(bytes, { ...constraints, crc32: zlib.crc32 })
      : (await import("./release-zip.mjs")).readZipArchiveFiles(
          bytes,
          constraints,
        );
  if (names)
    assert.deepEqual(
      entries.map(({ path }) => path).sort(),
      [...names].sort(),
      "Original ZIP inventory differs",
    );
  return new Map(entries.map(({ path, content }) => [path, content]));
}

const jsonMember = (files, name) => {
  const bytes = files.get(name);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
};

/** Replay only a closed graph proof from its trusted upload descriptor. Eligibility also needs
 * the separate archive, rights, advisory and behaviour checks for this same observation. */
export async function readConsumerResolutionProof({
  download,
  artifact,
  ...options
}) {
  const members = await readQualifiedZip(download, artifact, proofLimit, [
    "package.json",
    "package-lock.json",
    "resolution.json",
  ]);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  return verifyResolutionEvidence(
    {
      schemaVersion: 1,
      manifest: decoder.decode(members.get("package.json")),
      lock: decoder.decode(members.get("package-lock.json")),
      resolution: jsonMember(members, "resolution.json"),
    },
    options,
  );
}

export const requireSameUpload = (
  artifact,
  run,
  job,
  name,
  now,
  { archivedBytes } = {},
) => {
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
      ((archivedBytes &&
        artifact.digest === `sha256:${sha256(archivedBytes)}`) ||
        (artifact.expired === false &&
          Date.parse(artifact.expires_at) > now)) &&
      artifact.workflow_run?.id === run.id &&
      artifact.workflow_run.repository_id === run.repository.id &&
      artifact.workflow_run.head_repository_id === run.head_repository.id &&
      artifact.workflow_run.head_sha === run.head_sha,
    "Artifact does not belong to the original successful upload",
  );
};

function verifyGraphs(evidence, sbom, integrity, version = PACKAGE_VERSION) {
  const locked = jsonMember(evidence, lockedGraph);
  const subject = jsonMember(evidence, sbomGraph);
  const consumer = jsonMember(evidence, consumerGraph);
  for (const graph of [locked, subject, consumer]) assertHealthyNpmGraph(graph);
  const alias = consumer.dependencies?.owlapi;
  assert.ok(alias, "The original consumer did not record its npm alias");
  for (const graph of [locked, subject]) {
    assert.equal(graph.name, PACKAGE_NAME);
    assert.equal(graph.version, version);
  }
  assert.equal(alias.version, version);
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
  assert.equal(installed?.version, version);
  assert.equal(
    installed?.integrity,
    integrity,
    "Original consumer lock belongs to different tarball bytes",
  );
  return identities;
}

const describeMembers = (files) =>
  Object.fromEntries(
    [...files].map(([path, bytes]) => [
      path,
      { bytes: bytes.length, sha256: sha256(bytes) },
    ]),
  );

/** Read the externally selected proof contract from the authenticated ZIP. The
 * caller independently owns candidate bytes, original job and artifact lineage. */
export async function readProducerPackageProof({
  download,
  artifact,
  tarball,
  sbom,
  candidate,
  expectedProofVersion,
  platform = producerPlatform,
  npmCli,
  npm = CI_RUNTIME.npm,
  materialOptions,
  expectedSourceLockSha256,
  prepareMaterial,
  rightsReader,
}) {
  assert.ok(
    [1, 2].includes(expectedProofVersion),
    "Producer proof requires independently selected version",
  );
  const files = await readQualifiedZip(
    download,
    artifact,
    proofLimit,
    expectedProofVersion === 2 ? currentProof : requiredProof,
  );
  const record = jsonMember(files, manifest);
  assert.equal(
    record.schemaVersion,
    expectedProofVersion,
    "Unknown producer manifest",
  );
  assert.ok(jsonEquals(record.package, candidate.package));
  assert.equal(record.nodeVersion, `v${platform.node}`);
  assert.equal(record.npmVersion, npm);
  assert.equal(record.checksumFile, "SHA256SUMS");
  assert.equal(sha256(tarball), candidate.tarball.sha256);
  assert.equal(tarball.length, candidate.tarball.bytes);
  if (Buffer.isBuffer(sbom)) {
    assert.equal(
      sha256(sbom),
      candidate.sbom.sha256,
      "Independent candidate SBOM bytes differ",
    );
    sbom = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sbom));
  }
  for (const key of ["tarball", "sbom"]) {
    for (const [field, value] of Object.entries(candidate[key])) {
      assert.equal(
        record[key]?.[field],
        value,
        "Producer manifest describes different candidate bytes",
      );
    }
  }
  const evidence = describeMembers(files);
  if (expectedProofVersion === 1) {
    assert.equal(record.lockedAndLocklessGraphsEquivalent, true);
    const integrity =
      "sha512-" + createHash("sha512").update(tarball).digest("base64");
    const identities = verifyGraphs(
      files,
      sbom,
      integrity,
      candidate.package.version,
    );
    return {
      manifest: record,
      evidence,
      legacy: { identities, consumerLockBytes: files.get(consumerLock) },
    };
  }
  assert.equal(
    record.lockedAndLocklessGraphsEquivalent,
    undefined,
    "Legacy equality cannot stand in for replayed recipient proof",
  );
  assert.ok(
    jsonEquals(record.installedConsumerScripts, INSTALLED_TEST_SCRIPTS),
    "Installed producer assertion inventory differs",
  );
  assert.ok(
    jsonEquals(record.resolutionProof, {
      fileName: producerResolutionFilename,
      sha256: evidence[producerResolutionFilename].sha256,
    }),
    "Producer resolution packet differs from its bound digest",
  );
  npmCli ??= selectNpmCliForVersion({
    expectedNpm: npm,
    candidates: findNpmCliCandidates(),
    observeVersion: observeNpmVersion,
  }).npmCli;
  const resolution = await readProducerResolutions(
    jsonMember(files, producerResolutionFilename),
    {
      tarball,
      sbom,
      npmCli,
      platform,
      npm,
      materialOptions,
      expectedSourceLockSha256,
      prepareMaterial,
      rightsReader: { ...rightsReader, sbomSha256: candidate.sbom.sha256 },
    },
  );
  const producer = resolution.subjects.producer;
  const full = record.fullGraphCheck;
  assert.ok(
    full &&
      typeof full.observedAt === "string" &&
      Number.isFinite(Date.parse(full.observedAt)) &&
      new Date(full.observedAt).toISOString() === full.observedAt,
    "Missing or invalid full producer graph preflight",
  );
  assert.ok(
    jsonEquals(full, {
      result: "PASS",
      observedAt: full.observedAt,
      subject: {
        ...producer.decision.subject,
        scope: "full",
        graphSha256: sha256(
          Buffer.from(stableJson(JSON.parse(producer.evidence.lock).packages)),
        ),
      },
    }),
    "Full producer graph preflight does not cover the original source",
  );
  return { manifest: record, evidence, ...resolution };
}

/** Reuse the original candidate producer's locked graph for hosted consumers. */
export async function readRetainedCorpusConsumerLock({
  read,
  download,
  run,
  job,
  artifactId,
  artifactSha256,
  now,
  candidate,
  sbom,
  integrity,
  version,
  expectedProofVersion = QUALIFICATION_POLICY.producerPackageProofVersion,
  tarball,
  materialOptions,
  npmCli,
}) {
  const proof = await read(`/actions/artifacts/${artifactId}`, {
    retryArtifact404: true,
  });
  assert.ok(
    proof.id === artifactId &&
      proof.digest === `sha256:${artifactSha256}` &&
      matchesLogicalArtifact(
        proof.name,
        `package-proof-${run.id}-${job.run_attempt}`,
        {
          run: run.id,
          attempt: job.run_attempt,
          legacy: true,
        },
      ),
    "Corpus consumer lock is not the original package proof",
  );
  requireSameUpload(proof, run, job, uploadStep(expectedProofVersion), now);
  if (expectedProofVersion === 2) {
    const packageProof = await readProducerPackageProof({
      download,
      artifact: proof,
      tarball,
      sbom,
      candidate,
      expectedProofVersion,
      materialOptions,
      npmCli,
    });
    const bytes = Buffer.from(packageProof.subjects.normal.evidence.lock);
    return { lock: JSON.parse(bytes), rawSha256: sha256(bytes) };
  }
  assert.equal(expectedProofVersion, 1);
  const files = await readQualifiedZip(
    download,
    proof,
    proofLimit,
    requiredProof,
  );
  const producerManifest = jsonMember(files, manifest);
  assert.equal(producerManifest.schemaVersion, 1);
  assert.deepEqual(producerManifest.package, { name: PACKAGE_NAME, version });
  assert.equal(producerManifest.tarball?.fileName, candidate.fileName);
  assert.equal(producerManifest.tarball?.sha256, candidate.sha256);
  assert.equal(producerManifest.tarball?.bytes, candidate.bytes);
  verifyGraphs(files, sbom, integrity, version);
  return {
    lock: jsonMember(files, consumerLock),
    rawSha256: sha256(files.get(consumerLock)),
  };
}

/** Authenticate the split candidate and proof from the same native producer job.
 * Returns only descriptions for handoff. The graph and lock bytes stay at the
 * original artifact for the fresh assurance reader.
 */
export async function verifyReleaseCiPackage({
  source,
  client,
  read,
  download,
  audit,
  now = Date.now(),
  expectedProofVersion = QUALIFICATION_POLICY.producerPackageProofVersion,
  npmCli,
  platform,
  materialOptions,
  expectedSourceLockSha256,
  prepareMaterial,
}) {
  const { run, candidate, receipt, observed } = source;
  if (expectedProofVersion === QUALIFICATION_POLICY.producerPackageProofVersion)
    assert.equal(
      receipt.policySha256,
      QUALIFICATION_POLICY_SHA256,
      "CI receipt does not select the current producer proof policy",
    );
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
  requireSameUpload(proof, run, job, uploadStep(expectedProofVersion), now);

  const tarName = versionStem + ".tgz";
  const sbomName = versionStem + ".cdx.json";
  const candidateFiles = await readQualifiedZip(
    download,
    candidate,
    candidateLimit,
    ["SHA256SUMS", sbomName, tarName],
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
  const packageProof = await readProducerPackageProof({
    download,
    artifact: proof,
    tarball,
    sbom: candidateFiles.get(sbomName),
    candidate: verified,
    expectedProofVersion,
    npmCli,
    platform,
    materialOptions,
    expectedSourceLockSha256,
    prepareMaterial,
    rightsReader: { client, commit: run.head_sha },
  });
  const { legacy, subjects, differences, evidence } = packageProof;
  return {
    attempt,
    producerJob: job.id,
    candidate,
    proof,
    package: verified.package,
    packedConfig: verified.packageManifest.publishConfig,
    assets: verified.assets,
    integrity,
    packageProofVersion: expectedProofVersion,
    ...(legacy
      ? {
          advisoryObservations: await audit?.(
            legacy.consumerLockBytes,
            legacy.identities,
          ),
        }
      : {
          subjects,
          differences,
          advisorySubjects: {
            root: subjects.producer.decision.subject,
            recipient: subjects.normal.decision.subject,
            inspection: subjects.inspection.decision.subject,
            scoped: subjects.scoped.decision.subject,
          },
        }),
    evidence,
  };
}
