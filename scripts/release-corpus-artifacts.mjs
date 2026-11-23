/** Read verified shadow artifacts from the exact native production attempt. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createRepositoryReader,
  readAcknowledgedInventory,
} from "./github-evidence-reader.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import { readQualifiedZip, requireSameUpload } from "./release-ci-package.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { PACKAGE_FILE_STEM, PACKAGE_VERSION } from "./package-identity.mjs";
import {
  comparisonIdentity,
  sha256,
} from "../util/owlapi-reference/comparison-evidence.mjs";
import {
  corpusQualificationRoster,
  corpusQualificationShards,
  reconcileCorpusReceipts,
} from "../util/owlapi-reference/comparison-release-evidence.mjs";

const positive = (value) => Number.isSafeInteger(value) && value > 0;
const digest = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const revision = (value) =>
  typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
const producerFiles = ["verification.json", "report.json"];
const packageStem = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}`;
const candidateFiles = [
  "SHA256SUMS",
  `${packageStem}.cdx.json`,
  `${packageStem}.tgz`,
];
const uploadStep = "Upload the verified corpus shard";
const producerName = (shardId) => `Corpus shadow / ${shardId}`;
const decode = (bytes) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

/** A release caller supplies the candidate identity admitted by its own package boundary. */
export async function reconcileHostedCorpus({
  input,
  comparisonCases,
  read,
  download,
  now = Date.now(),
}) {
  const { source, subject, oracle, artifacts } = input;
  assert.ok(
    input.schemaVersion === 1 &&
      ["fresh", "promoted"].includes(source?.route) &&
      positive(source.runId) &&
      positive(source.attempt) &&
      source.repositoryId === REPOSITORY_ID &&
      revision(source.commit) &&
      revision(source.candidateCommit) &&
      positive(source.candidateRunId) &&
      positive(source.candidateAttempt) &&
      digest(subject?.importMapSha256) &&
      digest(subject.contentSha256) &&
      digest(subject.artifactSha256) &&
      digest(subject.tarballSha256) &&
      /^[1-9]\d*$/u.test(subject.artifactId) &&
      positive(Number(subject.artifactId)) &&
      Array.isArray(artifacts) &&
      artifacts.every((artifact) => positive(artifact?.id)),
    "Incomplete hosted corpus shadow authority",
  );
  if (source.route === "fresh")
    assert.deepEqual(
      [source.candidateRunId, source.candidateAttempt, source.candidateCommit],
      [source.runId, source.attempt, source.commit],
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
  const readRun = async (id, attempt, commit, paths) => {
    const run = await read(`/actions/runs/${id}`);
    assert.ok(
      run.id === id &&
        run.run_attempt === attempt &&
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
        );
  const candidate = await read(`/actions/artifacts/${subject.artifactId}`, {
    retryArtifact404: true,
  });
  assert.ok(
    candidate.id === Number(subject.artifactId) &&
      candidate.digest === `sha256:${subject.artifactSha256}` &&
      candidate.expired === false &&
      Date.parse(candidate.expires_at) > now &&
      candidate.workflow_run?.id === origin.id &&
      candidate.workflow_run.head_sha === origin.head_sha &&
      candidate.workflow_run.repository_id === source.repositoryId &&
      candidate.workflow_run.head_repository_id === source.repositoryId,
    "Corpus candidate differs from the admitted original artifact",
  );
  const retained = await readQualifiedZip(
    download,
    candidate,
    64 * 1024 * 1024,
    candidateFiles,
  );
  const tarball = retained.get(`${packageStem}.tgz`);
  assert.equal(
    sha256(tarball),
    subject.tarballSha256,
    "Original corpus candidate has different tarball bytes",
  );
  assert.equal(
    "sha512-" + createHash("sha512").update(tarball).digest("base64"),
    subject.integrity,
    "Original corpus candidate has different npm integrity",
  );
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
        job.name === producerName(shard.shardId) &&
        job.run_id === run.id &&
        job.run_attempt === source.attempt &&
        job.head_sha === source.commit &&
        job.status === "completed" &&
        job.conclusion === "success" &&
        job.labels?.includes(
          shard.platform === "linux" ? UBUNTU.label : "windows-2025-vs2026",
        ),
      "Corpus shard producer job is outside the successful original attempt",
    );
    const artifact = inventory.get(descriptor.id);
    assert.ok(
      artifact?.id === descriptor.id &&
        artifact.digest === `sha256:${descriptor.sha256}` &&
        artifact.name === `corpus-${run.id}-${source.attempt}-${shard.shardId}`,
      "Corpus shard archive differs from its acknowledged artifact",
    );
    requireSameUpload(artifact, run, job, uploadStep, now);
    const files = await readQualifiedZip(
      download,
      artifact,
      8 * 1024 * 1024,
      producerFiles,
    );
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
    const installed = proof.candidate;
    assert.ok(
      installed?.mode === "INSTALLED_CANDIDATE" &&
        installed.tarballSha256 === subject.tarballSha256 &&
        installed.integrity === subject.integrity &&
        installed.dependencyGraphSha256 === subject.dependencyGraphSha256 &&
        installed.importMapSha256 === subject.importMapSha256 &&
        installed.contentSha256 === subject.contentSha256,
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

export function readHostedCorpus(input, comparisonCases, env = process.env) {
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
  return reconcileHostedCorpus({ input, comparisonCases, read, download });
}
