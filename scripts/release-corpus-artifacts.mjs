/** Read verified shadow artifacts from the exact native production attempt. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createRepositoryReader,
  readAcknowledgedInventory,
} from "./github-evidence-reader.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import {
  readQualifiedZip,
  readRetainedCorpusConsumerLock,
  requireSameUpload,
} from "./release-ci-package.mjs";
import { CI_JOB_NAMES, QUALIFICATION_POLICY } from "./ci-qualification.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import {
  artifactProducingAttempt,
  matchesLogicalArtifact,
} from "../tooling/artifact-transport/identity.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { javaToolchainSelection } from "./java-toolchain.mjs";
import { PACKAGE_FILE_STEM, PACKAGE_VERSION } from "./package-identity.mjs";
import {
  comparisonIdentity,
  sha256,
} from "../util/owlapi-reference/comparison-evidence.mjs";
import {
  corpusQualificationRoster,
  corpusQualificationShards,
  reconcileCorpusReceipts,
  retainedDependencyGraphIdentity,
} from "../util/owlapi-reference/comparison-release-evidence.mjs";
import { comparisonCases } from "../util/owlapi-reference/comparison-cases.mjs";

const positive = (value) => Number.isSafeInteger(value) && value > 0;
const digest = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const revision = (value) =>
  typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
const producerFiles = ["verification.json", "report.json"];
export const corpusShadowJava = javaToolchainSelection("25.0.5+1.2");
export const corpusShardUploadStep = "Upload the verified corpus shard";
export const corpusShardJobName = (shardId) => `Corpus shadow / ${shardId}`;
export const corpusShardArtifactName = (runId, attempt, shardId) =>
  `corpus-${runId}-${attempt}-${shardId}`;
export const corpusShardRunner = (platform) =>
  platform === "linux" ? UBUNTU.label : "windows-2025-vs2026";
const decode = (bytes) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

export function readCorpusShardArchive(download, artifact) {
  return readQualifiedZip(download, artifact, 8 * 1024 * 1024, producerFiles);
}

function requireShadowJava(jdk) {
  assert.ok(
    jdk?.vendor === corpusShadowJava.vendor &&
      jdk.version === corpusShadowJava.version &&
      jdk.runtime === corpusShadowJava.runtime &&
      jdk.setupJavaVersion === corpusShadowJava.setupJavaVersion &&
      [jdk.executableSha256, jdk.compilerSha256, jdk.releaseSha256].every(
        digest,
      ),
    "Corpus shard did not verify the selected Java build",
  );
}

/** Read the exact descriptor archive. Its enclosed result artifacts still need independent verification. */
export async function readCorpusQualificationInput(
  locator,
  { read, download, now = Date.now() },
) {
  assert.ok(positive(locator.id) && digest(locator.sha256));
  const artifact = await read(`/actions/artifacts/${locator.id}`, {
    retryArtifact404: true,
  });
  assert.ok(
    artifact.id === locator.id &&
      artifact.digest === `sha256:${locator.sha256}` &&
      artifact.expired === false &&
      Date.parse(artifact.expires_at) > now &&
      artifact.workflow_run?.repository_id === REPOSITORY_ID &&
      artifact.workflow_run.head_repository_id === REPOSITORY_ID,
    "Corpus descriptor does not match the retained artifact",
  );
  const name = "corpus-qualification-input.json";
  const files = await readQualifiedZip(download, artifact, 256 * 1024, [name]);
  return decode(files.get(name));
}

/** Authenticate the original candidate and its package lock without consulting a shard. */
export async function readCorpusCandidate({
  source,
  subject,
  read,
  download,
  now = Date.now(),
  packageVersion = PACKAGE_VERSION,
  expectedProofVersion = QUALIFICATION_POLICY.producerPackageProofVersion,
  materialOptions,
  npmCli,
}) {
  assert.match(packageVersion, /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u);
  const packageStem = `${PACKAGE_FILE_STEM}-${packageVersion}`;
  const candidateFiles = [
    "SHA256SUMS",
    `${packageStem}.cdx.json`,
    `${packageStem}.tgz`,
  ];
  assert.ok(
    ["fresh", "promoted"].includes(source?.route) &&
      positive(source.runId) &&
      positive(source.attempt) &&
      source.repositoryId === REPOSITORY_ID &&
      revision(source.commit) &&
      revision(source.candidateCommit) &&
      positive(source.candidateRunId) &&
      positive(source.candidateAttempt) &&
      positive(source.candidateJobId) &&
      digest(subject?.artifactSha256) &&
      /^[1-9]\d*$/u.test(subject.artifactId) &&
      positive(Number(subject.artifactId)),
    "Incomplete hosted corpus shadow authority",
  );
  if (source.route === "fresh")
    assert.deepEqual(
      [source.candidateRunId, source.candidateAttempt, source.candidateCommit],
      [source.runId, source.attempt, source.commit],
    );
  const readRun = async (
    id,
    attempt,
    commit,
    paths,
    allowPriorAttempt = false,
  ) => {
    const run = await read(`/actions/runs/${id}`);
    assert.ok(
      run.id === id &&
        (allowPriorAttempt
          ? run.run_attempt >= attempt
          : run.run_attempt === attempt) &&
        run.head_sha === commit &&
        paths.includes(run.path) &&
        run.repository?.id === source.repositoryId &&
        run.repository.full_name === REPOSITORY &&
        run.head_repository?.id === source.repositoryId &&
        run.head_repository.full_name === REPOSITORY,
      "Corpus workflow does not match the authorized repository, commit and attempt",
    );
    return run;
  };
  const releaseWorkflow = ".github/workflows/release.yml";
  const ciWorkflow = ".github/workflows/ci.yml";
  const run = await readRun(
    source.runId,
    source.attempt,
    source.commit,
    source.route === "fresh"
      ? [releaseWorkflow]
      : [releaseWorkflow, ciWorkflow],
  );
  const origin =
    source.route === "fresh"
      ? run
      : await readRun(
          source.candidateRunId,
          source.candidateAttempt,
          source.candidateCommit,
          [ciWorkflow],
          true,
        );
  const candidate = await read(`/actions/artifacts/${subject.artifactId}`, {
    retryArtifact404: true,
  });
  assert.ok(
    candidate.id === Number(subject.artifactId) &&
      candidate.digest === `sha256:${subject.artifactSha256}` &&
      artifactProducingAttempt(
        candidate.name,
        `${packageStem}-candidate-${origin.id}-`,
        {
          run: origin.id,
          attempt: origin.run_attempt,
        },
      ) === source.candidateAttempt &&
      candidate.expired === false &&
      Date.parse(candidate.expires_at) > now &&
      candidate.workflow_run?.id === origin.id &&
      candidate.workflow_run.head_sha === origin.head_sha &&
      candidate.workflow_run.repository_id === source.repositoryId &&
      candidate.workflow_run.head_repository_id === source.repositoryId,
    "Corpus candidate differs from the admitted original artifact",
  );
  const candidateJob = await read(`/actions/jobs/${source.candidateJobId}`);
  const candidateJobName =
    origin.path === ciWorkflow
      ? CI_JOB_NAMES.candidate
      : "Release / retained candidate";
  assert.ok(
    candidateJob.id === source.candidateJobId &&
      candidateJob.name === candidateJobName + " / Produce" &&
      candidateJob.run_id === origin.id &&
      candidateJob.run_attempt === source.candidateAttempt &&
      candidateJob.head_sha === origin.head_sha &&
      candidateJob.status === "completed" &&
      candidateJob.conclusion === "success" &&
      candidateJob.labels?.includes(UBUNTU.label),
    "Corpus candidate job disagrees with the original producing attempt",
  );
  requireSameUpload(
    candidate,
    origin,
    candidateJob,
    "Upload the exact same-run candidate",
    now,
  );
  const retained = await readQualifiedZip(
    download,
    candidate,
    64 * 1024 * 1024,
    candidateFiles,
  );
  const tarball = retained.get(`${packageStem}.tgz`);
  const tarballSha256 = sha256(tarball);
  const integrity =
    "sha512-" + createHash("sha512").update(tarball).digest("base64");
  if (subject.tarballSha256 !== undefined)
    assert.equal(
      tarballSha256,
      subject.tarballSha256,
      "Original corpus candidate has different tarball bytes",
    );
  if (subject.integrity !== undefined)
    assert.equal(
      integrity,
      subject.integrity,
      "Original corpus candidate has different npm integrity",
    );
  let consumerLock, rawConsumerLockSha256;
  if (
    source.candidateProofId !== undefined ||
    source.candidateProofSha256 !== undefined
  ) {
    assert.ok(
      positive(source.candidateProofId) && digest(source.candidateProofSha256),
      "Missing original package proof identity",
    );
    const sbomBytes = retained.get(`${packageStem}.cdx.json`);
    const proofCandidate =
      expectedProofVersion === 2
        ? verifyDownloadedCandidateBundle({
            fileNames: [...retained.keys()],
            checksumText: retained.get("SHA256SUMS"),
            sbomText: sbomBytes,
            tarball,
          })
        : {
            fileName: `${packageStem}.tgz`,
            sha256: tarballSha256,
            bytes: tarball.length,
          };
    const { lock, rawSha256 } = await readRetainedCorpusConsumerLock({
      read,
      download,
      now,
      run: origin,
      job: candidateJob,
      artifactId: source.candidateProofId,
      artifactSha256: source.candidateProofSha256,
      candidate: proofCandidate,
      sbom: expectedProofVersion === 2 ? sbomBytes : decode(sbomBytes),
      tarball,
      integrity,
      version: packageVersion,
      expectedProofVersion,
      materialOptions,
      npmCli,
    });
    consumerLock = lock;
    rawConsumerLockSha256 = rawSha256;
  }
  return {
    run,
    retained,
    consumerLock,
    tarballSha256,
    integrity,
    ...(consumerLock
      ? {
          rawConsumerLockSha256,
          dependencyGraphSha256: retainedDependencyGraphIdentity(consumerLock, {
            tarballSha256,
            integrity,
          }),
        }
      : {}),
  };
}

export const corpusImportMapSha256 = async () =>
  sha256(
    await readFile(
      new URL(
        "../test/consumers/browser/import-map/reference-import-map.json",
        import.meta.url,
      ),
    ),
  );

/** A release caller supplies the candidate identity admitted by its own package boundary. */
export async function reconcileHostedCorpus({
  input,
  read,
  download,
  now = Date.now(),
  packageVersion = PACKAGE_VERSION,
  expectedProofVersion = QUALIFICATION_POLICY.producerPackageProofVersion,
  materialOptions,
  npmCli,
  collectPlatformContents = false,
}) {
  const { source, oracle, artifacts } = input;
  const subject = structuredClone(input.subject);
  const locked = input.schemaVersion === 2;
  const contents = subject?.contentsByPlatform;
  assert.ok(
    [1, 2].includes(input.schemaVersion) &&
      digest(subject?.importMapSha256) &&
      digest(subject.tarballSha256) &&
      /^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(subject.integrity) &&
      Array.isArray(artifacts) &&
      artifacts.every((artifact) => positive(artifact?.id)) &&
      (locked
        ? positive(source?.candidateProofId) &&
          digest(source.candidateProofSha256) &&
          contents &&
          typeof contents === "object" &&
          !Array.isArray(contents) &&
          Object.entries(contents).every(
            ([platform, value]) =>
              ["linux", "win32"].includes(platform) && digest(value),
          )
        : digest(subject.contentSha256) && !collectPlatformContents),
    "Incomplete hosted corpus shadow authority",
  );
  const roster = corpusQualificationRoster(comparisonCases);
  const rosterSha256 = comparisonIdentity(roster);
  const planned = new Map(
    corpusQualificationShards(comparisonCases, roster).map((shard) => [
      shard.shardId,
      shard,
    ]),
  );
  assert.ok(
    artifacts.length <= planned.size,
    "Too many corpus producer artifact references",
  );
  const { run, dependencyGraphSha256 } = await readCorpusCandidate({
    source,
    subject,
    read,
    download,
    now,
    packageVersion,
    expectedProofVersion,
    materialOptions,
    npmCli,
  });
  if (locked) {
    assert.equal(
      subject.dependencyGraphSha256,
      dependencyGraphSha256,
      "Corpus graph differs from the retained package proof",
    );
    assert.equal(
      subject.importMapSha256,
      await corpusImportMapSha256(),
      "Corpus import map differs from the reviewed checkout",
    );
  }
  const receipts = [];
  const verifiedArtifacts = [];
  const usedShards = new Set();
  const usedArtifacts = new Set();
  const inventory = new Map(
    (artifacts.length
      ? await readAcknowledgedInventory(
          read,
          run.id,
          artifacts.map(({ id }) => String(id)),
        )
      : []
    ).map((artifact) => [artifact.id, artifact]),
  );
  for (const descriptor of artifacts) {
    const shard = planned.get(descriptor.shardId);
    assert.ok(
      shard &&
        !usedShards.has(shard.shardId) &&
        positive(descriptor.jobId) &&
        positive(descriptor.id) &&
        digest(descriptor.sha256) &&
        !usedArtifacts.has(descriptor.id),
      "Duplicate or unknown corpus shard artifact",
    );
    usedShards.add(shard.shardId);
    usedArtifacts.add(descriptor.id);
    const job = await read(`/actions/jobs/${descriptor.jobId}`);
    assert.ok(
      job.id === descriptor.jobId &&
        job.name === corpusShardJobName(shard.shardId) &&
        job.run_id === run.id &&
        job.run_attempt === source.attempt &&
        job.head_sha === source.commit &&
        job.status === "completed" &&
        job.conclusion === "success" &&
        job.labels?.includes(corpusShardRunner(shard.platform)),
      "Corpus shard producer job is outside the successful original attempt",
    );
    const artifact = inventory.get(descriptor.id);
    assert.ok(
      artifact?.id === descriptor.id &&
        artifact.digest === `sha256:${descriptor.sha256}` &&
        matchesLogicalArtifact(
          artifact.name,
          corpusShardArtifactName(run.id, source.attempt, shard.shardId),
          {
            run: run.id,
            attempt: source.attempt,
            legacy: true,
          },
        ),
      "Corpus shard archive differs from its acknowledged artifact",
    );
    requireSameUpload(artifact, run, job, corpusShardUploadStep, now);
    const files = await readCorpusShardArchive(download, artifact);
    const proof = decode(files.get("verification.json"));
    const originalBytes = files.get("report.json");
    const original = decode(originalBytes);
    assert.ok(
      proof.schemaVersion === 2 &&
        proof.action === "verify" &&
        original.schemaVersion === 2 &&
        original.action === "run" &&
        digest(original.executionId) &&
        proof.executionId === original.executionId &&
        proof.rosterSha256 === rosterSha256 &&
        proof.reportSha256 === sha256(originalBytes) &&
        comparisonIdentity(proof.shard) === comparisonIdentity(shard),
      "Corpus shard verification is detached from its original report or frozen roster",
    );
    if (locked) requireShadowJava(proof.jdk);
    const installed = proof.candidate;
    if (
      locked &&
      collectPlatformContents &&
      contents[shard.platform] === undefined
    )
      contents[shard.platform] = installed?.contentSha256;
    assert.ok(
      installed?.mode === "INSTALLED_CANDIDATE" &&
        installed.tarballSha256 === subject.tarballSha256 &&
        installed.integrity === subject.integrity &&
        installed.dependencyGraphSha256 === subject.dependencyGraphSha256 &&
        installed.importMapSha256 === subject.importMapSha256 &&
        digest(installed.contentSha256) &&
        installed.contentSha256 ===
          (locked ? contents[shard.platform] : subject.contentSha256),
      "Corpus shard used different candidate, installed dependencies or import map",
    );
    assert.ok(
      Array.isArray(proof.cases) &&
        Array.isArray(original.cases) &&
        proof.cases.length === shard.caseIds.length &&
        original.cases.length === shard.caseIds.length,
      "Corpus shard case coverage is incomplete",
    );
    const verifiedCases = new Map();
    for (const [index, caseId] of shard.caseIds.entries()) {
      const verified = proof.cases[index];
      const row = original.cases[index];
      assert.ok(
        verified.caseId === caseId &&
          row.caseId === caseId &&
          verified.input === row.input &&
          verified.status === "passed" &&
          row.status === "passed" &&
          comparisonIdentity(verified.measures) ===
            comparisonIdentity(row.measures),
        "Corpus shard has a missing, failed or substituted case verdict",
      );
      verifiedCases.set(caseId, { verified, row });
    }
    for (const cell of roster.cells) {
      if (cell.platform !== shard.platform || !verifiedCases.has(cell.caseId))
        continue;
      const { verified, row } = verifiedCases.get(cell.caseId);
      const historical = ["rdfxml-writer", "canonical-vowl-dl"].includes(
        shard.selection.suite,
      );
      const stageSha256 = historical
        ? comparisonIdentity(row)
        : row.receipt?.sha256;
      assert.ok(
        digest(stageSha256),
        "Corpus shard is missing its original case receipt",
      );
      assert.equal(verified.input, cell.input);
      const oracleEvidence = cell.oracle
        ? proof.oracle
        : {
            version: proof.oracle?.version,
            lockSha256: proof.oracle?.lockSha256,
          };
      receipts.push({
        ...cell,
        subject,
        oracle: oracleEvidence,
        provenance: installed.mode,
        verdict: verified.measures[cell.measurement],
        ...(cell.expectedDifferenceRules
          ? { reconciledRuleIds: verified.reconciledRuleIds }
          : {}),
        stageSha256,
        producerArtifactSha256: descriptor.sha256,
        producerRun: String(run.id),
        producerAttempt: String(source.attempt),
      });
    }
    verifiedArtifacts.push({
      shardId: shard.shardId,
      id: descriptor.id,
      sha256: descriptor.sha256,
      run: run.id,
      attempt: source.attempt,
    });
  }
  return {
    ...(await reconcileCorpusReceipts(
      { subject, oracle, receipts },
      comparisonCases,
    )),
    route: source.route,
    candidate: subject,
    artifacts: verifiedArtifacts,
  };
}

export function corpusArtifactTransport(env = process.env) {
  const budgetMs = 600_000;
  const deadline = performance.now() + budgetMs;
  const read = createRepositoryReader({
    repository: REPOSITORY,
    token: env.GH_TOKEN,
    now: () => performance.now(),
    budgetMs,
    deadline,
    requestLimit: 256,
  });
  const client = new GitHubReleaseClient({
    repository: REPOSITORY,
    token: env.GH_TOKEN,
    reader: read,
  });
  const download = (artifact, maxBytes) =>
    downloadReleaseArtifact(client, artifact, maxBytes, { deadline });
  return { read, download };
}

export function readHostedCorpus(
  input,
  env = process.env,
  packageVersion = PACKAGE_VERSION,
) {
  return reconcileHostedCorpus({
    input,
    ...corpusArtifactTransport(env),
    packageVersion,
  });
}
