import { jest } from "@jest/globals";
import { crc32 } from "node:zlib";
import {
  approvalFromHistory,
  captureApprovalObservation,
  decodeApprovalArchive,
  resolveRetainedApprovals,
  validateApprovalObservation,
} from "./release-approvals.mjs";
import { sha256Buffer } from "./release-artifacts.mjs";

// A real stored ZIP models the external artifact format, including CRC and headers.
const zip = (path, value) => {
  const name = Buffer.from(path),
    body = Buffer.from(JSON.stringify(value)),
    checksum = crc32(body);
  const local = Buffer.alloc(30),
    central = Buffer.alloc(46),
    end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + body.length, 16);
  return Buffer.concat([local, name, body, central, name, end]);
};
const commit = "a".repeat(40),
  runId = "123",
  observedAt = "2026-10-10T00:00:00Z";
const history = (environment, state = "approved", login = "Owner") => [
  { state, user: { login }, environments: [{ name: environment }] },
];
const fixture = (environment = "release-manual") => {
  const name =
    environment === "release-manual"
      ? "Release / tag accepted"
      : "Release / npm trusted publisher";
  const observation = {
    schemaVersion: 1,
    repository: "Hadden-Industries/owlapi",
    commit,
    runId,
    runAttempt: 1,
    environment,
    observedAt,
    jobId: environment === "release-manual" ? 10 : 20,
    history: history(environment),
  };
  const jobs = [
    {
      name,
      id: observation.jobId,
      run_id: 123,
      run_attempt: 1,
      head_sha: commit,
      conclusion: "success",
    },
  ];
  const archive = zip(`approval-${environment}.json`, observation);
  const artifact = {
    id: observation.jobId + 100,
    name: `release-approval-${environment}-123-1`,
    digest: `sha256:${sha256Buffer(archive)}`,
    expired: false,
    workflow_run: { id: 123, head_sha: commit },
  };
  return {
    observation,
    jobs,
    archive,
    artifact,
    identity: { environment, commit, runId, runAttempt: 2, jobs },
  };
};

test("uses the original observation time and reviewer from a validated artifact", () => {
  const f = fixture();
  expect(
    decodeApprovalArchive(f.archive, f.artifact, f.identity).approval,
  ).toEqual({
    environment: "release-manual",
    reviewer: "Owner",
    state: "approved",
    observedAt,
  });
});

test.each(
  [
    [],
    history("release-manual", "rejected"),
    [...history("release-manual"), ...history("release-manual")],
    history("release-manual", "approved", ""),
  ].map((reviews) => [reviews]),
)(
  "does not invent approval from missing or ambiguous history: %j",
  (reviews) => {
    expect(() =>
      approvalFromHistory(reviews, "release-manual", observedAt),
    ).toThrow();
  },
);

test.each([
  ["source", { commit: "b".repeat(40) }],
  ["repository", { repository: "other/repo" }],
  ["run", { runId: "124" }],
  ["future attempt", { runAttempt: 3 }],
  ["environment", { environment: "npm-release" }],
  ["job", { jobId: 99 }],
  ["time", { observedAt: "yesterday" }],
])("rejects a changed observation %s", (_label, change) => {
  const f = fixture();
  expect(() =>
    validateApprovalObservation({ ...f.observation, ...change }, f.identity),
  ).toThrow();
});

test("requires the latest protected gate to succeed; preserves failed earlier job history", () => {
  const f = fixture();
  f.jobs[0].conclusion = "failure";
  expect(() =>
    validateApprovalObservation(f.observation, f.identity),
  ).toThrow();
  f.jobs.push({ ...f.jobs[0], id: 11, run_attempt: 2, conclusion: "success" });
  expect(validateApprovalObservation(f.observation, f.identity).reviewer).toBe(
    "Owner",
  );
  expect(f.jobs[0].conclusion).toBe("failure");
});

test("rejects changed archive bytes and wrong member inventory", () => {
  const f = fixture();
  expect(() =>
    decodeApprovalArchive(Buffer.from("changed"), f.artifact, f.identity),
  ).toThrow("digest");
  const archive = zip("wrong.json", f.observation);
  expect(() =>
    decodeApprovalArchive(
      archive,
      { ...f.artifact, digest: `sha256:${sha256Buffer(archive)}` },
      f.identity,
    ),
  ).toThrow("inventory");
});

const resolution = (liveHistory = []) => {
  const manual = fixture(),
    npm = fixture("npm-release");
  const fixtures = [manual, npm];
  const jobs = fixtures.flatMap((f) => f.jobs);
  const client = {
    read: jest.fn(async (path) =>
      path.includes("/artifacts?")
        ? { artifacts: fixtures.map((f) => f.artifact) }
        : fixtures.find((f) => path.endsWith(`/${f.artifact.id}`))?.artifact,
    ),
  };
  const download = jest.fn(
    async (_client, artifact) =>
      fixtures.find((f) => f.artifact.id === artifact.id).archive,
  );
  return {
    client,
    download,
    fixtures,
    run: () =>
      resolveRetainedApprovals({
        client,
        download,
        commit,
        runId,
        runAttempt: 2,
        jobs,
        liveHistory,
      }),
  };
};

test("recovers both original approvals when fresh authenticated history is empty", async () => {
  const h = resolution();
  const result = await h.run();
  expect(result.approvals).toHaveLength(2);
  expect(result.approvals.every((item) => item.observedAt === observedAt)).toBe(
    true,
  );
  expect(result.inputs).toEqual(
    h.fixtures.map((f) => ({
      name: f.artifact.name,
      sha256: f.artifact.digest.slice(7),
    })),
  );
  expect(
    h.client.read.mock.calls.every(([path]) => path.startsWith("/actions/")),
  ).toBe(true);
});

test.each([
  history("release-manual", "rejected"),
  history("release-manual", "approved", "DifferentOwner"),
  [...history("release-manual"), ...history("release-manual", "rejected")],
  [
    ...history("release-manual"),
    ...history("release-manual", "approved", "DifferentOwner"),
  ],
])("rejects contradictory live approval history", async (live) => {
  await expect(resolution(live).run()).rejects.toThrow();
});

test("accepts repeated live approvals by the original reviewer without replacing the historical observation", async () => {
  const result = await resolution([
    ...history("release-manual"),
    ...history("release-manual"),
    ...history("npm-release"),
    ...history("npm-release"),
  ]).run();
  expect(
    result.approvals.every((approval) => approval.observedAt === observedAt),
  ).toBe(true);
  expect(
    result.approvals.every((approval) => approval.reviewer === "Owner"),
  ).toBe(true);
});

test.each([
  [
    "expired",
    (artifact) => {
      artifact.expired = true;
    },
  ],
  [
    "another workflow run",
    (artifact) => {
      artifact.workflow_run.id = 124;
    },
  ],
  [
    "another source",
    (artifact) => {
      artifact.workflow_run.head_sha = "b".repeat(40);
    },
  ],
  [
    "wrong digest",
    (artifact) => {
      artifact.digest = `sha256:${"b".repeat(64)}`;
    },
  ],
  [
    "wrong attempt name",
    (artifact) => {
      artifact.name = artifact.name.replace(/-1$/u, "-2");
    },
  ],
])("rejects retained artifact %s", async (_label, mutate) => {
  const h = resolution();
  mutate(h.fixtures[0].artifact);
  await expect(h.run()).rejects.toThrow();
});

test("rejects a missing artifact instead of falling back to an invented job approval", async () => {
  const h = resolution();
  h.fixtures.splice(0, 1);
  await expect(h.run()).rejects.toThrow("Missing or ambiguous");
});

afterEach(() => jest.restoreAllMocks());

test("downloads the authenticated artifact without forwarding credentials to storage", async () => {
  const h = resolution();
  h.client.apiRoot = "https://api.github.com/repos/Hadden-Industries/owlapi";
  h.client.headers = () => ({ Authorization: "Bearer test-only" });
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) => {
      if (String(url).startsWith(h.client.apiRoot))
        return new Response(null, {
          status: 302,
          headers: {
            location: `https://results.blob.core.windows.net/${String(url).split("/").at(-2)}`,
          },
        });
      const id = Number(new URL(url).pathname.slice(1));
      return new Response(h.fixtures.find((f) => f.artifact.id === id).archive);
    });
  await expect(
    resolveRetainedApprovals({
      client: h.client,
      commit,
      runId,
      runAttempt: 2,
      jobs: h.fixtures.flatMap((f) => f.jobs),
      liveHistory: [],
    }),
  ).resolves.toHaveProperty("approvals");
  for (let i = 0; i < request.mock.calls.length; i += 2) {
    expect(request.mock.calls[i][1]).toMatchObject({
      redirect: "manual",
      headers: { Authorization: "Bearer test-only" },
    });
    expect(request.mock.calls[i + 1][1]).toEqual({
      redirect: "error",
      signal: request.mock.calls[i][1].signal,
    });
  }
});

test.each([
  "https://attacker.example/zip",
  "http://results.blob.core.windows.net/zip",
  "https://user:secret@results.blob.core.windows.net/zip",
])(
  "rejects an unapproved artifact redirect %s before storage access",
  async (location) => {
    const h = resolution();
    h.client.apiRoot = "https://api.github.com/repos/Hadden-Industries/owlapi";
    h.client.headers = () => ({});
    const request = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location } }),
      );
    await expect(
      resolveRetainedApprovals({
        client: h.client,
        commit,
        runId,
        runAttempt: 2,
        jobs: h.fixtures.flatMap((f) => f.jobs),
        liveHistory: [],
      }),
    ).rejects.toThrow("storage origin");
    expect(request).toHaveBeenCalledTimes(1);
  },
);

const capture = () => {
  const f = fixture();
  const env = {
    GITHUB_SHA: commit,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_REPOSITORY: "Hadden-Industries/owlapi",
    GITHUB_REF: "refs/heads/main",
    GITHUB_JOB: "tag_accepted",
  };
  const run = {
    head_sha: commit,
    run_attempt: 1,
    path: ".github/workflows/release.yml",
  };
  f.jobs[0].status = "in_progress";
  const client = {
    read: jest.fn(async (path) =>
      path.endsWith("/approvals")
        ? f.observation.history
        : path.includes("/jobs?")
          ? { jobs: f.jobs }
          : run,
    ),
  };
  return {
    f,
    env,
    run,
    client,
    capture: () =>
      captureApprovalObservation({
        environment: "release-manual",
        env,
        client,
      }),
  };
};

test("captures authenticated approval in the exact running gate before later evidence reuse", async () => {
  const h = capture();
  const observation = await h.capture();
  expect(observation).toMatchObject({
    repository: "Hadden-Industries/owlapi",
    commit,
    runId,
    runAttempt: 1,
    environment: "release-manual",
    jobId: 10,
    history: h.f.observation.history,
  });
  expect(Number.isFinite(Date.parse(observation.observedAt))).toBe(true);
  expect(h.client.read.mock.calls).toHaveLength(3);
});

test.each(["source", "workflow", "gate", "approval", "ref"])(
  "refuses approval capture with the wrong %s",
  async (change) => {
    const h = capture();
    if (change === "source") h.run.head_sha = "b".repeat(40);
    if (change === "workflow") h.run.path = ".github/workflows/other.yml";
    if (change === "gate") h.f.jobs[0].status = "completed";
    if (change === "approval") h.f.observation.history = [];
    if (change === "ref") h.env.GITHUB_REF = "refs/heads/other";
    await expect(h.capture()).rejects.toThrow();
  },
);
