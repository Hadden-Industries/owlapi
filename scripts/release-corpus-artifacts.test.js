import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { reconcileHostedCorpus } from "./release-corpus-artifacts.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { PACKAGE_FILE_STEM, PACKAGE_VERSION } from "./package-identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";
import { comparisonCases } from "../util/owlapi-reference/compare-java-js.mjs";
import {
  comparisonIdentity,
  sha256,
} from "../util/owlapi-reference/comparison-evidence.mjs";
import {
  oracleVersion,
  oracleLockPath,
} from "../util/owlapi-reference/comparison-oracle.mjs";
import {
  corpusQualificationRoster,
  corpusQualificationShards,
} from "../util/owlapi-reference/comparison-release-evidence.mjs";

const now = Date.parse("2026-11-23T04:00:04Z");
const hex = (character) => character.repeat(64);
const roster = corpusQualificationRoster(comparisonCases);
const shard = corpusQualificationShards(comparisonCases, roster)
  .filter(
    ({ platform, selection }) =>
      platform === "win32" && selection.suite === "public-api-behavior",
  )
  .at(-1);

function fixture(route) {
  const repo = { id: REPOSITORY_ID, full_name: REPOSITORY };
  const run = {
    id: 84,
    run_attempt: 2,
    head_sha: "a".repeat(40),
    repository: repo,
    head_repository: repo,
    path: ".github/workflows/release.yml",
  };
  const origin =
    route === "fresh"
      ? run
      : {
          ...run,
          id: 82,
          run_attempt: 3,
          head_sha: "b".repeat(40),
          path: ".github/workflows/ci.yml",
        };
  const metadata = (producer) => ({
    expired: false,
    expires_at: "2027-02-01T00:00:00Z",
    workflow_run: {
      id: producer.id,
      head_sha: producer.head_sha,
      repository_id: repo.id,
      head_repository_id: repo.id,
    },
  });
  const stem = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}`;
  const candidateAttempt = route === "fresh" ? run.run_attempt : 1;
  const tarball = Buffer.from("exact retained candidate bytes");
  const original = zipArchive([
    { path: "SHA256SUMS", content: "fixture inventory" },
    { path: `${stem}.cdx.json`, content: "{}" },
    { path: `${stem}.tgz`, content: tarball },
  ]);
  const candidate = {
    ...metadata(origin),
    id: 14,
    digest: "sha256:" + sha256(original),
    size_in_bytes: original.length,
    name: `${stem}-candidate-${origin.id}-${candidateAttempt}`,
    created_at: "2026-11-23T04:00:01Z",
  };
  const candidateJob = {
    id: 18,
    run_id: origin.id,
    run_attempt: candidateAttempt,
    head_sha: origin.head_sha,
    name:
      (route === "fresh"
        ? "Release / retained candidate"
        : CI_JOB_NAMES.candidate) + " / Produce",
    status: "completed",
    conclusion: "success",
    labels: [UBUNTU.label],
    steps: [
      {
        name: "Upload the exact same-run candidate",
        status: "completed",
        conclusion: "success",
        started_at: "2026-11-23T04:00:00Z",
        completed_at: "2026-11-23T04:00:03Z",
      },
    ],
  };
  const subject = {
    artifactId: "14",
    artifactSha256: sha256(original),
    tarballSha256: sha256(tarball),
    dependencyGraphSha256: hex("3"),
    importMapSha256: hex("4"),
    integrity:
      "sha512-" + createHash("sha512").update(tarball).digest("base64"),
    contentSha256: hex("7"),
  };
  const oracle = {
    version: oracleVersion,
    lockSha256: sha256(readFileSync(oracleLockPath)),
  };
  const cases = shard.caseIds.map((caseId) => ({
    caseId,
    input: roster.cells.find((cell) => cell.caseId === caseId).input,
    measures: { behavior: "observed" },
    status: "passed",
    receipt: { sha256: hex("6") },
  }));
  const report = {
    schemaVersion: 2,
    action: "run",
    executionId: hex("5"),
    cases,
  };
  const reportBytes = Buffer.from(JSON.stringify(report));
  const proof = {
    ...report,
    action: "verify",
    shard,
    rosterSha256: comparisonIdentity(roster),
    reportSha256: sha256(reportBytes),
    candidate: {
      mode: "INSTALLED_CANDIDATE",
      contentSha256: hex("7"),
      ...subject,
    },
    oracle,
    cases: [...cases],
  };
  const job = {
    id: 19,
    name: `Corpus shadow / ${shard.shardId}`,
    run_id: 84,
    run_attempt: 2,
    head_sha: run.head_sha,
    status: "completed",
    conclusion: "success",
    labels: ["windows-2025-vs2026"],
    steps: [
      {
        name: "Upload the verified corpus shard",
        status: "completed",
        conclusion: "success",
        started_at: "2026-11-23T04:00:00Z",
        completed_at: "2026-11-23T04:00:03Z",
      },
    ],
  };
  const artifact = {
    ...metadata(run),
    id: 20,
    name: `corpus-84-2-${shard.shardId}`,
    created_at: "2026-11-23T04:00:02Z",
  };
  const verify = () => {
    const archive = zipArchive([
      { path: "verification.json", content: JSON.stringify(proof) },
      { path: "report.json", content: reportBytes },
    ]);
    artifact.size_in_bytes = archive.length;
    artifact.digest = "sha256:" + sha256(archive);
    const input = {
      schemaVersion: 1,
      subject,
      oracle,
      source: {
        route,
        repositoryId: repo.id,
        runId: run.id,
        attempt: run.run_attempt,
        commit: run.head_sha,
        candidateRunId: origin.id,
        candidateAttempt,
        candidateJobId: candidateJob.id,
        candidateCommit: origin.head_sha,
      },
      artifacts: [
        {
          id: artifact.id,
          sha256: sha256(archive),
          shardId: shard.shardId,
          jobId: job.id,
        },
      ],
    };
    const responses = {
      "/actions/runs/84": run,
      "/actions/runs/82": origin,
      "/actions/artifacts/14": candidate,
      "/actions/jobs/19": job,
      "/actions/jobs/18": candidateJob,
      "/actions/runs/84/artifacts?per_page=100&page=1": {
        total_count: 1,
        artifacts: [artifact],
      },
    };
    return reconcileHostedCorpus({
      input,
      comparisonCases,
      now,
      read: async (path) => responses[path],
      download: async ({ id }) => (id === candidate.id ? original : archive),
    });
  };
  return { proof, job, subject, candidateJob, verify };
}

test.each(["fresh", "promoted"])(
  "authenticates %s shards and holds missing cells",
  async (route) => {
    const result = await fixture(route).verify();
    expect(result.status).toBe("incomplete");
    expect(result.route).toBe(route);
    expect(result.rejected).toEqual([]);
    expect(result.requiredCount - result.missing.length).toBe(
      shard.caseIds.length,
    );
  },
);

test.each([
  "mode",
  "tarballSha256",
  "dependencyGraphSha256",
  "importMapSha256",
  "contentSha256",
])("rejects changed %s", async (field) => {
  const model = fixture("promoted");
  model.proof.candidate[field] = hex("8");
  await expect(model.verify()).rejects.toThrow("different candidate");
});

test("compares the subject with the tarball member of the original artifact", async () => {
  const model = fixture("fresh");
  model.subject.tarballSha256 = hex("8");
  model.proof.candidate.tarballSha256 = hex("8");
  await expect(model.verify()).rejects.toThrow("different tarball bytes");
});

test("rejects a substituted case and a producer from a prior attempt", async () => {
  const replaced = fixture("fresh");
  replaced.proof.cases[0] = replaced.proof.cases[1];
  await expect(replaced.verify()).rejects.toThrow("substituted case");
  const stale = fixture("fresh");
  stale.job.run_attempt--;
  await expect(stale.verify()).rejects.toThrow(
    "outside the successful original attempt",
  );
});

test("requires the candidate uploaded by its exact original producing job", async () => {
  const model = fixture("promoted");
  model.candidateJob.run_attempt = 3;
  await expect(model.verify()).rejects.toThrow("original producing attempt");
});
