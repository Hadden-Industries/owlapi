import { expect, test } from "@jest/globals";
import {
  corpusProducerMatrix,
  corpusProducerOrigin,
  selectCorpusShardArtifacts,
} from "./release-corpus-producer.mjs";
import {
  corpusShardArtifactName,
  corpusShardJobName,
  corpusShardUploadStep,
} from "./release-corpus-artifacts.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { sha256 } from "../util/owlapi-reference/comparison-evidence.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  PACKAGE_VERSION,
} from "./package-identity.mjs";
import {
  qualificationMatrix,
  runtimeDigest,
} from "./consumer-runtime-matrix.mjs";

const env = {
  GITHUB_REPOSITORY: REPOSITORY,
  GITHUB_REPOSITORY_ID: String(REPOSITORY_ID),
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_SHA: "1".repeat(40),
  GITHUB_RUN_ID: "100",
  GITHUB_RUN_ATTEMPT: "2",
};
const hex = (character) => character.repeat(64);
const job = {
  name: "Release / retained candidate / Produce",
  id: 80,
  conclusion: "success",
  run_id: 100,
  run_attempt: 2,
  head_sha: env.GITHUB_SHA,
};
const freshNeeds = () => ({
  release_dispatch: { outputs: { corpus_shadow: "true" } },
  release_admission: { result: "success", outputs: { mode: "fresh" } },
  candidate: {
    result: "success",
    outputs: {
      artifact_id: "90",
      artifact_digest: hex("a"),
      proof_id: "91",
      proof_digest: hex("b"),
    },
  },
});

test("fresh planning binds the same-attempt candidate and its producer lock", () => {
  const result = corpusProducerOrigin(env, freshNeeds(), [job]);
  expect(result.source).toMatchObject({
    route: "fresh",
    runId: 100,
    attempt: 2,
    candidateRunId: 100,
    candidateAttempt: 2,
    candidateJobId: 80,
    candidateProofId: 91,
    candidateProofSha256: hex("b"),
  });
  expect(result.subject).toEqual({
    artifactId: "90",
    artifactSha256: hex("a"),
  });
  expect(() =>
    corpusProducerOrigin(env, freshNeeds(), [{ ...job, run_attempt: 1 }]),
  ).toThrow("same-run candidate job");
});

test("promoted planning retains the producer of the admitted CI archive and lock", () => {
  const matrix = qualificationMatrix(
    [
      ...new Set([...CI_RUNTIME.minimums, ...Object.values(CI_RUNTIME.node)]),
    ].map((version) => ({ version: "v" + version })),
  );
  const stem = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}`;
  const landed = {
    commit: env.GITHUB_SHA,
    tree: "2".repeat(40),
    workflow: "3".repeat(40),
    parents: [],
  };
  const archived = (id) => ({
    id,
    bytes: 1,
    name: "retained",
    digest: "sha256:" + hex("d"),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  const observation = {
    high: 0,
    critical: 0,
    lockSha256: hex("f"),
    manifestSha256: hex("b"),
    reportSha256: hex("c"),
    observedAt: new Date().toISOString(),
  };
  const execution = {
    runId: 55,
    attempt: 3,
    providerHead: landed.commit,
    snapshot: landed,
    event: "push",
    receipt: archived(70),
  };
  const ci = {
    schemaVersion: 1,
    repositoryId: REPOSITORY_ID,
    landed,
    main: execution,
    build: { ...execution, producingAttempt: 1, producerJob: 72 },
    candidate: archived(74),
    packageProof: archived(75),
    package: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    assets: {
      tarball: { name: stem + ".tgz", bytes: 1, sha256: hex("a") },
      sbom: { name: stem + ".cdx.json", bytes: 1, sha256: hex("b") },
      checksums: { name: "SHA256SUMS", bytes: 1, sha256: hex("c") },
    },
    integrity: "sha512-" + "A".repeat(86) + "==",
    policySha256: hex("a"),
    matrixSha256: runtimeDigest(matrix),
    evidence: {
      "lockless-consumer-package-lock.json": { sha256: observation.lockSha256 },
    },
    advisoryObservations: {
      root: observation,
      transport: observation,
      recipient: observation,
    },
  };
  const needs = freshNeeds();
  needs.release_admission.outputs = {
    mode: "reuse",
    evidence: JSON.stringify(ci),
  };
  needs.candidate = { result: "skipped" };
  const result = corpusProducerOrigin(
    { ...env, OWLAPI_RUNTIME_MATRIX: JSON.stringify(matrix) },
    needs,
    [],
  );
  expect(result.source).toMatchObject({
    route: "promoted",
    runId: 100,
    candidateRunId: 55,
    candidateAttempt: 1,
    candidateJobId: 72,
    candidateProofId: 75,
  });
  expect(result.subject).toMatchObject({
    artifactId: "74",
    tarballSha256: hex("a"),
  });
});

test("the native matrix schedules every shard once on a pinned host", () => {
  const { include } = corpusProducerMatrix();
  expect(include.length).toBeGreaterThan(100);
  expect(include.length).toBeLessThanOrEqual(256);
  expect(new Set(include.map(({ id }) => id)).size).toBe(include.length);
  expect(new Set(include.map(({ shell }) => shell))).toEqual(
    new Set(["bash", "pwsh"]),
  );
  expect(
    include
      .filter(({ july }) => july)
      .every(({ sourceOracle }) => sourceOracle),
  ).toBe(true);
});

test("descriptor collection rejects ambiguous native products and ignores failed jobs", async () => {
  const shardId = hex("a");
  const source = { runId: 100, attempt: 2 };
  const shards = [{ shardId }];
  const jobs = [
    { name: corpusShardJobName(shardId), id: 4, conclusion: "success" },
  ];
  const artifact = {
    id: 5,
    name: corpusShardArtifactName(100, 2, shardId),
    digest: "sha256:" + hex("c"),
  };
  await expect(
    selectCorpusShardArtifacts(shards, jobs, [artifact], source),
  ).resolves.toEqual([{ shardId, id: 5, jobId: 4, sha256: hex("c") }]);
  await expect(
    selectCorpusShardArtifacts(
      shards,
      jobs,
      [artifact, { ...artifact, id: 6 }],
      source,
    ),
  ).rejects.toThrow("No matching current-run artifacts");
  await expect(
    selectCorpusShardArtifacts(
      shards,
      [{ ...jobs[0], conclusion: "failure" }],
      [artifact],
      source,
    ),
  ).resolves.toEqual([]);
});

test("late-visible copies from one native upload must contain the same receipts", async () => {
  const shardId = hex("a");
  const source = { runId: 100, attempt: 2 };
  const run = {
    id: 100,
    repository: { id: REPOSITORY_ID },
    head_repository: { id: REPOSITORY_ID },
    head_sha: env.GITHUB_SHA,
  };
  const jobs = [
    {
      name: corpusShardJobName(shardId),
      id: 4,
      conclusion: "success",
      steps: [
        {
          name: corpusShardUploadStep,
          status: "completed",
          conclusion: "success",
          started_at: "2026-11-23T04:00:00Z",
          completed_at: "2026-11-23T04:00:03Z",
        },
      ],
    },
  ];
  const members = [
    { path: "verification.json", content: "proof" },
    { path: "report.json", content: "report" },
  ];
  const archives = new Map([
    [5, zipArchive(members)],
    [6, zipArchive([...members].reverse())],
  ]);
  const artifact = (id, ordinal) => ({
    id,
    name: physicalName({
      logical: corpusShardArtifactName(100, 2, shardId),
      run: 100,
      attempt: 2,
      producer: "b".repeat(16),
      invocation: "c".repeat(32),
      ordinal,
    }),
    digest: "sha256:" + sha256(archives.get(id)),
    size_in_bytes: archives.get(id).length,
    created_at: "2026-11-23T04:00:01Z",
    expired: false,
    expires_at: new Date(Date.now() + 60000).toISOString(),
    workflow_run: {
      id: run.id,
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
      head_sha: run.head_sha,
    },
  });
  const transport = {
    read: async () => run,
    download: async ({ id }) => archives.get(id),
  };
  expect(sha256(archives.get(5))).not.toBe(sha256(archives.get(6)));
  const collect = () =>
    selectCorpusShardArtifacts(
      [{ shardId }],
      jobs,
      [artifact(6, 1), artifact(5, 0)],
      source,
      transport,
    );
  await expect(collect()).resolves.toEqual([
    {
      shardId,
      id: 5,
      jobId: 4,
      sha256: sha256(archives.get(5)),
    },
  ]);
  archives.set(
    6,
    zipArchive([members[0], { ...members[1], content: "substituted" }]),
  );
  await expect(collect()).rejects.toThrow("Conflicting corpus shard payloads");
});
