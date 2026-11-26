import { loadQualificationAuditBatch } from "./qualification-audit-batch.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";

const env = {
  QUALIFICATION_RUN: "100",
  QUALIFICATION_ATTEMPT: "2",
  QUALIFIED_COMMIT: "a".repeat(40),
};

test("stage readback requires the independently selected manifest digest", async () => {
  const client = {
    read: async () => {
      throw new Error("Unexpected unbound request");
    },
  };
  await expect(
    loadQualificationAuditBatch(client, env, "fixture-cli", { issuing: false }),
  ).rejects.toThrow(/stage requires the exact qualification manifest digest/iu);
});

function fixture({
  mode = "fresh",
  issuing = true,
  uploadTime,
  protectedHead = env.QUALIFIED_COMMIT,
} = {}) {
  const start = "2026-11-26T10:00:00.000Z",
    end = "2026-11-26T10:00:04.000Z";
  const repo = {
    id: REPOSITORY_ID,
    full_name: REPOSITORY,
    default_branch: "main",
  };
  const workflow = ".github/workflows/release.yml";
  const run = {
    id: 100,
    run_attempt: 2,
    repository: repo,
    head_repository: repo,
    path: workflow,
    head_sha: env.QUALIFIED_COMMIT,
    head_branch: "main",
    event: "workflow_dispatch",
    status: issuing ? "in_progress" : "completed",
    conclusion: issuing ? null : "success",
  };
  const base = {
    run_id: 100,
    run_attempt: 1,
    head_sha: run.head_sha,
    status: "completed",
    conclusion: "success",
    labels: [UBUNTU.label],
    runner_id: 701,
    started_at: start,
    completed_at: end,
  };
  const completedStep = (name) => ({
    name,
    status: "completed",
    conclusion: "success",
    started_at: start,
    completed_at: end,
  });
  const dispatch = {
    ...base,
    id: 110,
    name: "Release / validate dispatch",
    steps: [completedStep("Validate the native release inputs")],
  };
  const aggregate = {
    ...base,
    id: 111,
    name: "Release / qualified",
    steps: [completedStep("Retain release qualification manifest")],
  };
  const latest = [
    { ...dispatch, id: 210, run_attempt: 2 },
    { ...aggregate, id: 211, run_attempt: 2 },
  ];
  const manifest = {
    schemaVersion: 1,
    repository: REPOSITORY,
    workflow,
    commit: run.head_sha,
    runId: "100",
    attempt: "1",
    qualification: {
      release_dispatch: { outputs: { mode } },
      release_admission: { outputs: { mode } },
    },
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const zip = zipArchive([{ path: "manifest.json", content: manifestBytes }]);
  const artifact = {
    id: 910,
    name: physicalName({
      logical: "release-qualification-100-1",
      run: 100,
      attempt: 1,
      producer: "e".repeat(16),
      invocation: "f".repeat(32),
      ordinal: 0,
    }),
    digest: `sha256:${sha256Buffer(zip)}`,
    size_in_bytes: zip.length,
    created_at: uploadTime ?? end,
    expires_at: "2027-02-26T10:00:00.000Z",
    expired: false,
    workflow_run: {
      id: 100,
      head_sha: run.head_sha,
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
    },
  };
  let downloads = 0;
  const client = {
    read: async (path) => {
      if (path === "/actions/runs/100") return run;
      if (path === "/branches/main")
        return {
          name: "main",
          protected: true,
          commit: { sha: protectedHead },
        };
      if (path.includes("jobs?filter=latest"))
        return { total_count: latest.length, jobs: latest };
      if (path.includes("attempts/1/jobs"))
        return { total_count: 2, jobs: [dispatch, aggregate] };
      if (path.includes("artifacts?per_page="))
        return { total_count: 1, artifacts: [artifact] };
      if (path === "/actions/artifacts/910") return artifact;
      throw new Error(`Unexpected fixture request ${path}`);
    },
  };
  return {
    client,
    manifestBytes,
    get downloads() {
      return downloads;
    },
    options: {
      issuing,
      now: Date.parse(end),
      downloadArtifact: async () => {
        downloads++;
        return zip;
      },
    },
  };
}

test("opens the timed prior-attempt qualification and refuses a legacy dispatch", async () => {
  const f = fixture({ mode: "legacy" });
  await expect(
    loadQualificationAuditBatch(f.client, env, "fixture-cli", f.options),
  ).rejects.toThrow(/fresh or reused qualification-only dispatch/iu);
  expect(f.downloads).toBe(1);
});

test("stage binds exact manifest bytes even when a different ZIP is from the same native job", async () => {
  const f = fixture({ issuing: false });
  const expectedManifestSha256 = sha256Buffer(
    Buffer.concat([f.manifestBytes, Buffer.from("\n")]),
  );
  await expect(
    loadQualificationAuditBatch(f.client, env, "fixture-cli", {
      ...f.options,
      expectedManifestSha256,
    }),
  ).rejects.toThrow(/manifest bytes differ/iu);
  expect(f.downloads).toBe(1);
});

test.each([
  [
    "upload after original job",
    { uploadTime: "2026-11-26T10:10:00.000Z" },
    /outside its original upload/iu,
  ],
  [
    "protected main changed",
    { protectedHead: "b".repeat(40) },
    /protected main moved/iu,
  ],
])(
  "rejects %s before downloading evidence",
  async (_description, overrides, expected) => {
    const f = fixture(overrides);
    await expect(
      loadQualificationAuditBatch(f.client, env, "fixture-cli", f.options),
    ).rejects.toThrow(expected);
    expect(f.downloads).toBe(0);
  },
);
