import { expect, jest, test } from "@jest/globals";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { createRepositoryReader } from "./github-evidence-reader.mjs";
import {
  retireSupersededCandidates,
  reportReleaseRetention,
} from "./release-retention.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import {
  REPOSITORY,
  REPOSITORY_ID,
  PACKAGE_FILE_STEM,
} from "./release-identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";

const commit = "a".repeat(40),
  oldCommit = "b".repeat(40),
  objectId = "c".repeat(40),
  digest = "sha256:" + "d".repeat(64);
const now = Date.parse("2026-11-26T12:00:00Z");
const repo = {
  id: REPOSITORY_ID,
  full_name: REPOSITORY,
  default_branch: "main",
};
const ciPath = ".github/workflows/ci.yml",
  completePath = ".github/workflows/release-completion.yml";
const historyTag = "owlapi-release-history/retention-" + commit;
function run(id, event, head, extra = {}) {
  return {
    id,
    event,
    run_attempt: 1,
    head_sha: head,
    head_branch: event === "pull_request" ? "feature" : "main",
    path: ciPath,
    status: "completed",
    conclusion: "success",
    repository: repo,
    head_repository: repo,
    pull_requests:
      event === "pull_request"
        ? [
            {
              number: 7,
              base: { repo: { id: REPOSITORY_ID } },
              head: { sha: head, repo: { id: REPOSITORY_ID } },
            },
          ]
        : [],
    ...extra,
  };
}
function artifact(id, source, kind, daysAgo) {
  const logical =
    (kind === "proof"
      ? "package-proof"
      : PACKAGE_FILE_STEM + "-0.1.0-candidate") +
    "-" +
    source.id +
    "-1";
  return {
    id,
    name: physicalName({
      logical,
      run: source.id,
      attempt: 1,
      producer: "e".repeat(16),
      invocation: "f".repeat(32),
      ordinal: 0,
    }),
    size_in_bytes: 175,
    expired: false,
    digest,
    created_at: new Date(now - daysAgo * 86400000).toISOString(),
    expires_at: new Date(now + 86400000).toISOString(),
    workflow_run: {
      id: source.id,
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
      head_branch: source.head_branch,
      head_sha: source.head_sha,
    },
  };
}
function fixture() {
  const main = run(30, "push", commit),
    producer = run(20, "pull_request", "8".repeat(40)),
    older = run(10, "pull_request", oldCommit);
  const rehearsal = run(12, "workflow_dispatch", oldCommit, {
    path: completePath,
  });
  const runs = [main, producer, older, rehearsal],
    pulls = [],
    refs = [];
  const old = artifact(101, older, "candidate", 3),
    oldProof = artifact(102, older, "proof", 3),
    candidate = artifact(301, producer, "candidate", 1),
    proof = artifact(302, producer, "proof", 1);
  const receipt = (id, source, logical) => ({
    ...artifact(id, source, "proof", 1),
    name: physicalName({
      logical,
      run: source.id,
      attempt: 1,
      producer: "e".repeat(16),
      invocation: "f".repeat(32),
      ordinal: 0,
    }),
  });
  const mainReceipt = receipt(303, main, "ci-main-qualification-30-1"),
    sourceReceipt = receipt(304, producer, "ci-verification-20-1");
  const inventory = [
    old,
    oldProof,
    candidate,
    proof,
    mainReceipt,
    sourceReceipt,
  ];
  const completed = Buffer.from(
    JSON.stringify({
      state: "IMMUTABLE_VERIFIED",
      checkpoint: "6".repeat(40),
      releaseEvidenceSchema: 8,
      source: oldCommit,
      tagObject: commit,
      releaseId: 11,
    }),
  );
  const archive = zipArchive([{ path: "complete.json", content: completed }]);
  const replayArtifact = {
    ...artifact(911, rehearsal, "proof", 2),
    name: physicalName({
      logical: "release-completion-12-1",
      run: 12,
      attempt: 1,
      producer: "e".repeat(16),
      invocation: "0".repeat(32),
      ordinal: 0,
    }),
    size_in_bytes: archive.length,
    digest: "sha256:" + sha256Buffer(archive),
    expired: true,
  };
  const at = replayArtifact.created_at;
  const retained = new Map([["artifact-911.zip", archive]]);
  const decisions = {
    schemaVersion: 2,
    purpose: "RETIRE_SUPERSEDED_CI_CANDIDATES",
    successor: commit,
    protectedIds: [],
    settledRuns: [],
    hostedReplay: {
      runId: 12,
      attempt: 1,
      jobId: 812,
      controller: oldCommit,
      artifactId: 911,
      artifactDigest: replayArtifact.digest,
      releaseId: 11,
      sealCheckpoint: "6".repeat(40),
    },
    replayed: [old, oldProof].map((a) => ({
      id: a.id,
      runId: older.id,
      digest: a.digest,
      manifestSha256: "a".repeat(64),
      result: "STAGE_SEAL_AND_RECOVERY_VERIFIED",
      actionsCopiesUnavailable: true,
      verifiedBackup: true,
    })),
  };
  const job = {
    name: "complete",
    id: 812,
    run_id: 12,
    run_attempt: 1,
    head_sha: oldCommit,
    runner_id: 9,
    runner_group_name: "GitHub Actions",
    labels: [UBUNTU.label],
    status: "completed",
    conclusion: "success",
    steps: [
      {
        name: "Verify immutable release completion (complete)",
        status: "completed",
        conclusion: "success",
      },
      {
        name: "Retain original operation evidence",
        status: "completed",
        conclusion: "success",
        started_at: at,
        completed_at: at,
      },
    ],
  };
  const checkpoint = () => ({
    objectId,
    tag: historyTag,
    files: new Map([
      ...retained,
      ["retention.json", Buffer.from(JSON.stringify(decisions))],
    ]),
    index: { dispositions: {} },
  });
  const github = { protected: true, name: "main", commit: { sha: commit } };
  const reads = [],
    deletes = [],
    logs = [];
  const read = jest.fn(async (path) => {
    reads.push(path);
    if (path === "/branches/main") return github;
    if (path.startsWith("/git/matching-refs/")) return refs;
    if (path === "/git/ref/tags/" + historyTag)
      return {
        ref: "refs/tags/" + historyTag,
        object: { type: "tag", sha: objectId },
      };
    if (path === "/actions/runs/12/attempts/1") return rehearsal;
    if (path === "/actions/jobs/812") return job;
    if (path === "/pulls/7")
      return {
        number: 7,
        state: "closed",
        merged: true,
        merge_commit_sha: "f".repeat(40),
        base: { repo: { id: REPOSITORY_ID } },
      };
    if (path === "/actions/artifacts/911") return replayArtifact;
    if (path === "/actions/artifacts?per_page=100&page=1")
      return {
        total_count: inventory.length,
        artifacts: structuredClone(inventory),
      };
    const artifactRun =
      /^\/actions\/runs\/(\d+)\/artifacts\?per_page=100&page=1$/u.exec(path);
    if (artifactRun) {
      const owned = inventory.filter(
        (a) => a.workflow_run.id === Number(artifactRun[1]),
      );
      return { total_count: owned.length, artifacts: structuredClone(owned) };
    }
    if (path === "/actions/runs?per_page=100&page=1")
      return { total_count: runs.length, workflow_runs: structuredClone(runs) };
    if (path === "/pulls?state=open&per_page=100&page=1")
      return structuredClone(pulls);
    const id = Number(path.split("/").at(-1));
    if (path.startsWith("/actions/artifacts/"))
      return structuredClone(inventory.find((a) => a.id === id));
    if (path.startsWith("/actions/runs/"))
      return structuredClone(runs.find((r) => r.id === id));
    throw Error("Unexpected read " + path);
  });
  const write = jest.fn(async (path, opts) => {
    expect(opts).toEqual({ method: "DELETE", expectedStatus: 204 });
    deletes.push(path);
    inventory.splice(
      inventory.findIndex((a) => a.id === Number(path.split("/").at(-1))),
      1,
    );
    return { state: "CONFIRMED", value: null };
  });
  const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_run",
    GITHUB_JOB: "retire",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_SHA: commit,
    GITHUB_WORKFLOW_SHA: commit,
    GITHUB_WORKFLOW_REF:
      REPOSITORY + "/.github/workflows/candidate-retention.yml@refs/heads/main",
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REPOSITORY_ID: String(REPOSITORY_ID),
    RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_RUN_ID: "90",
    GITHUB_RUN_ATTEMPT: "1",
  };
  const event = {
    action: "completed",
    repository: repo,
    workflow_run: structuredClone(main),
  };
  const args = {
    env,
    event,
    client: { read, write },
    openCheckpoint: async () => checkpoint(),
    qualifySuccessor: async () => ({
      landed: { commit },
      main: {
        run: structuredClone(main),
        artifact: structuredClone(mainReceipt),
      },
      source: {
        run: structuredClone(producer),
        artifact: structuredClone(sourceReceipt),
      },
      qualifiedPackage: {
        candidate: structuredClone(candidate),
        proof: structuredClone(proof),
      },
    }),
    now: () => now,
    log: (s) => logs.push(s),
  };
  return {
    args,
    main,
    older,
    rehearsal,
    runs,
    pulls,
    refs,
    old,
    oldProof,
    candidate,
    proof,
    mainReceipt,
    sourceReceipt,
    inventory,
    decisions,
    job,
    github,
    reads,
    deletes,
    logs,
    read,
    write,
    retained,
    replayArtifact,
  };
}
test("the production read transport admits only the required PR lookups during retirement", async () => {
  const f = fixture();
  const http = jest.fn(async (address, options) => {
    expect(options.method ?? "GET").toBe("GET");
    const root = "https://api.github.com/repos/" + REPOSITORY;
    expect(address.startsWith(root + "/")).toBe(true);
    return new Response(
      JSON.stringify(await f.read(address.slice(root.length))),
      { status: 200 },
    );
  });
  const reader = createRepositoryReader({
    repository: REPOSITORY,
    token: "fixture",
    fetchImpl: http,
    requestLimit: 256,
  });
  const client = new GitHubReleaseClient({
    repository: REPOSITORY,
    token: "fixture",
    reader,
  });
  f.args.client = { read: (...args) => client.read(...args), write: f.write };
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([101, 102]);
  const count = http.mock.calls.length;
  for (const path of [
    "/pulls?state=all&per_page=100&page=1",
    "/pulls/7/merge",
    "/pulls/0",
    "/pulls?state=open&per_page=100&page=0",
  ]) {
    await expect(client.read(path)).rejects.toThrow(
      "Unexpected GitHub evidence path",
    );
  }
  expect(http).toHaveBeenCalledTimes(count);
});
test("retires only authorized earlier CI originals and reopens the ID immediately before one delete", async () => {
  const f = fixture();
  await retireSupersededCandidates(f.args);
  expect(f.deletes).toEqual([
    "/actions/artifacts/101",
    "/actions/artifacts/102",
  ]);
  expect(f.logs.join("\n")).toMatch(/101/);
  expect(
    f.reads.filter((p) => p === "/actions/artifacts/101").length,
  ).toBeGreaterThan(0);
  expect(
    f.reads.filter((p) => p.startsWith("/pulls?")).length,
  ).toBeGreaterThanOrEqual(3);
});
test.each([
  "no checkpoint",
  "dry-run checkpoint",
  "failed rehearsal",
  "foreign rehearsal",
  "unverified backup",
  "active replay",
  "open PR",
  "PR head changed",
  "ambiguous PR",
  "foreign PR source",
  "release artifact",
  "newer run",
  "signed protected",
  "unsettled writer",
  "unrelated trigger",
  "moved head",
])("holds on %s", async (variant) => {
  const f = fixture();
  switch (variant) {
    case "no checkpoint": {
      const read = f.args.client.read;
      f.args.client.read = async (path, opts) =>
        path.startsWith("/git/ref/tags/") ? null : read(path, opts);
      break;
    }
    case "dry-run checkpoint":
      f.decisions.schemaVersion = 1;
      break;
    case "failed rehearsal":
      f.job.conclusion = "failure";
      break;
    case "foreign rehearsal":
      f.rehearsal.head_repository = { id: 84 };
      break;
    case "unverified backup":
      f.decisions.replayed.forEach((c) => (c.verifiedBackup = false));
      break;
    case "active replay":
      f.runs.push(
        run(44, "workflow_dispatch", commit, {
          path: ".github/workflows/recipient-material-replay.yml",
          status: "in_progress",
          conclusion: null,
        }),
      );
      break;
    case "open PR":
      f.pulls.push({
        number: 7,
        state: "open",
        base: { sha: commit, repo: { id: REPOSITORY_ID } },
        head: { sha: oldCommit },
        merge_commit_sha: null,
      });
      break;
    case "PR head changed":
      f.pulls.push({
        number: 7,
        state: "open",
        base: { sha: commit, repo: { id: REPOSITORY_ID } },
        head: { sha: "7".repeat(40) },
        merge_commit_sha: null,
      });
      break;
    case "foreign PR source":
      f.older.pull_requests[0].head.repo.id = 18;
      break;
    case "ambiguous PR":
      f.older.pull_requests = [];
      break;
    case "release artifact":
      f.older.path = ".github/workflows/release.yml";
      break;
    case "newer run":
      for (const a of [f.old, f.oldProof])
        a.created_at = new Date(now).toISOString();
      break;
    case "signed protected":
      f.decisions.protectedIds = [101, 102];
      break;
    case "unsettled writer":
      f.runs.push(
        run(42, "workflow_dispatch", commit, {
          path: ".github/workflows/stage-release.yml",
        }),
      );
      break;
    case "unrelated trigger":
      f.args.event.workflow_run.event = "pull_request";
      break;
    case "moved head":
      f.github.commit.sha = "c".repeat(40);
      break;
  }
  const refusals = {
    "dry-run checkpoint": /signed retirement authorization/i,
    "failed rehearsal": /replay job/i,
    "foreign rehearsal": /foreign hosted/i,
    "unrelated trigger": /upstream/i,
    "moved head": /main moved/i,
  };
  const action = retireSupersededCandidates(f.args);
  if (refusals[variant])
    await expect(action).rejects.toThrow(refusals[variant]);
  else await expect(action).resolves.toEqual([]);
  expect(f.write).not.toHaveBeenCalled();
});
test.each(["mainReceipt", "sourceReceipt"])(
  "loss of the successor's %s between two effects stops further retirement",
  async (key) => {
    const f = fixture(),
      write = f.write;
    f.args.client.write = async (...args) => {
      const result = await write(...args);
      f[key].expired = true;
      return result;
    };
    await expect(retireSupersededCandidates(f.args)).resolves.toEqual([101]);
    expect(f.deletes).toEqual(["/actions/artifacts/101"]);
  },
);
test("automatic authorization also requires the signed tag's own successor-specific name", async () => {
  const f = fixture(),
    open = f.args.openCheckpoint,
    read = f.read,
    other = "owlapi-release-history/manual-retirement";
  f.args.openCheckpoint = async (...args) => ({
    ...(await open(...args)),
    tag: other,
  });
  f.args.client.read = async (path, options) =>
    path === "/git/ref/tags/" + other
      ? { ref: "refs/tags/" + other, object: { type: "tag", sha: objectId } }
      : read(path, options);
  await expect(retireSupersededCandidates(f.args)).rejects.toThrow(/tag name/);
  expect(f.write).not.toHaveBeenCalled();
  f.args.env = {
    ...f.args.env,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR: "maksymshostak",
    GITHUB_TRIGGERING_ACTOR: "maksymshostak",
    RETENTION_HISTORY_OBJECT: objectId,
  };
  f.args.event = {
    repository: repo,
    inputs: { retention_history_object: objectId },
  };
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([101, 102]);
});
test.each(["releaseId", "sealCheckpoint"])(
  "binds the representative hosted rehearsal's %s independently of the individual backup attestations",
  async (field) => {
    const f = fixture();
    f.decisions.hostedReplay[field] =
      field === "releaseId" ? 12 : "7".repeat(40);
    await expect(retireSupersededCandidates(f.args)).rejects.toThrow(
      /immutable staged release/,
    );
    expect(f.write).not.toHaveBeenCalled();
  },
);
test("a new replay claim after the first retirement keeps the remaining original", async () => {
  const f = fixture(),
    remove = f.write;
  f.args.client.write = async (...args) => {
    const a = await remove(...args);
    f.runs.push(
      run(46, "workflow_dispatch", commit, {
        path: ".github/workflows/recipient-material-replay.yml",
        status: "queued",
        conclusion: null,
      }),
    );
    return a;
  };
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([101]);
  expect(f.deletes).toEqual(["/actions/artifacts/101"]);
});
test("an outstanding material observation in the candidate's original CI run protects its recovery inputs", async () => {
  const f = fixture();
  f.inventory.push({
    ...f.old,
    id: 109,
    name: physicalName({
      logical: "pending-recipient-material-macos-26.0.0-attempt-1",
      run: 10,
      attempt: 1,
      producer: "e".repeat(16),
      invocation: "0".repeat(32),
      ordinal: 0,
    }),
  });
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([]);
  expect(f.write).not.toHaveBeenCalled();
});
test("a generic completed job cannot replace the authenticated original custody replay receipt", async () => {
  for (const variant of [
    "missing",
    "different",
    "wrong step",
    "self-hosted",
    "different native output",
  ]) {
    const f = fixture();
    if (variant === "missing") f.retained.delete("artifact-911.zip");
    if (variant === "self-hosted") f.job.runner_group_name = "Default";
    if (variant === "different")
      f.retained.set("artifact-911.zip", Buffer.from("changed"));
    if (variant === "wrong step")
      f.job.steps[1].started_at = new Date(now).toISOString();
    if (variant === "different native output") {
      const archive = zipArchive([
        { path: "complete.json", content: Buffer.from('{"state":"SEALED"}') },
      ]);
      f.retained.set("artifact-911.zip", archive);
      f.replayArtifact.size_in_bytes = archive.length;
      f.replayArtifact.digest = "sha256:" + sha256Buffer(archive);
      f.decisions.hostedReplay.artifactDigest = f.replayArtifact.digest;
    }
    await expect(retireSupersededCandidates(f.args)).rejects.toThrow();
    expect(f.write).not.toHaveBeenCalled();
  }
});
test("a merged producer PR remains protected when its landed commit is an open PR's base", async () => {
  const f = fixture();
  f.pulls.push({
    number: 81,
    state: "open",
    base: { repo: { id: REPOSITORY_ID }, sha: "f".repeat(40) },
    head: { sha: "e".repeat(40) },
    merge_commit_sha: null,
  });
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([]);
  expect(f.write).not.toHaveBeenCalled();
});
test("the initial report excludes already claimed PRs and retires unrelated eligible IDs in the same batch", async () => {
  const f = fixture();
  f.pulls.push({
    number: 81,
    state: "open",
    base: { repo: { id: REPOSITORY_ID }, sha: "f".repeat(40) },
    head: { sha: "e".repeat(40) },
    merge_commit_sha: null,
  });
  const separate = run(13, "pull_request", "4".repeat(40));
  separate.pull_requests[0].number = 17;
  const another = artifact(105, separate, "proof", 3);
  f.runs.push(separate);
  f.inventory.push(another);
  f.decisions.replayed.push({ ...f.decisions.replayed[0], id: 105, runId: 13 });
  const native = f.read;
  f.args.client.read = async (p, options) =>
    p === "/pulls/17"
      ? {
          number: 17,
          state: "closed",
          merged: false,
          merge_commit_sha: null,
          base: { repo: { id: REPOSITORY_ID } },
        }
      : native(p, options);
  const result = await reportReleaseRetention(
    {
      ...f.args.env,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      RETENTION_HISTORY_OBJECT: objectId,
    },
    {
      client: f.args.client,
      openCheckpoint: f.args.openCheckpoint,
      qualifySuccessor: f.args.qualifySuccessor,
      now: f.args.now,
      summary: f.args.log,
    },
  );
  expect(result.eligibleIds).toEqual([105]);
  expect(f.reads.filter((path) => path === "/pulls/7")).toHaveLength(1);
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([105]);
  expect(f.deletes).toEqual(["/actions/artifacts/105"]);
});
test("a source PR reopening after the open-list snapshot protects its original", async () => {
  const f = fixture(),
    native = f.read;
  f.args.client.read = async (path, options) =>
    path === "/pulls/7"
      ? { number: 7, state: "open", base: { repo: { id: REPOSITORY_ID } } }
      : native(path, options);
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([]);
  expect(f.write).not.toHaveBeenCalled();
});
test("a signed cleared completion receipt remains usable after the original hosted records expire", async () => {
  const f = fixture();
  f.retained.set(
    "origin-12-1-release-completion-12-1.json",
    Buffer.from(
      JSON.stringify({
        run: f.rehearsal,
        producer: f.job,
        artifact: f.replayArtifact,
      }),
    ),
  );
  const lookup = f.args.client.read;
  f.args.client.read = async (path, options) =>
    [
      "/actions/runs/12/attempts/1",
      "/actions/jobs/812",
      "/actions/artifacts/911",
    ].includes(path)
      ? null
      : lookup(path, options);
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([101, 102]);
});
test("a closed-PR decision is cached only within one inspection, never across deletion checks", async () => {
  const f = fixture(),
    read = f.args.client.read;
  let details = 0;
  f.args.client.read = async (path, opts) => {
    if (path === "/pulls/7" && ++details > 1)
      return {
        number: 7,
        state: "open",
        base: { repo: { id: REPOSITORY_ID } },
      };
    return read(path, opts);
  };
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([]);
  expect(details).toBe(2);
  expect(f.write).not.toHaveBeenCalled();
});
test("a changed direct artifact read or an incomplete run inventory prevents retirement", async () => {
  for (const failure of ["digest", "size", "run", "expiry", "incomplete"]) {
    const f = fixture(),
      read = f.read;
    f.args.client.read = async (path, opts) => {
      const actual = await read(path, opts);
      if (
        path === "/actions/runs?per_page=100&page=1" &&
        failure === "incomplete"
      )
        return { ...actual, total_count: actual.total_count + 1 };
      if (path !== "/actions/artifacts/101") return actual;
      if (failure === "digest")
        return { ...actual, digest: "sha256:" + "5".repeat(64) };
      if (failure === "size") return { ...actual, size_in_bytes: 10 };
      if (failure === "run")
        return { ...actual, workflow_run: { ...actual.workflow_run, id: 111 } };
      if (failure === "expiry") return { ...actual, expired: true };
      return actual;
    };
    await expect(retireSupersededCandidates(f.args)).rejects.toThrow();
    expect(f.write).not.toHaveBeenCalled();
  }
});
test("owner dispatch requires the owner on a rerun and the exact submitted history object", async () => {
  const f = fixture();
  f.args.env = {
    ...f.args.env,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR: "maksymshostak",
    GITHUB_TRIGGERING_ACTOR: "retrying-user",
    RETENTION_HISTORY_OBJECT: objectId,
  };
  f.args.event = {
    repository: repo,
    inputs: { retention_history_object: objectId },
  };
  await expect(retireSupersededCandidates(f.args)).rejects.toThrow(/owner/);
  f.args.env.GITHUB_TRIGGERING_ACTOR = "maksymshostak";
  f.args.event.inputs.retention_history_object = "9".repeat(40);
  await expect(retireSupersededCandidates(f.args)).rejects.toThrow(
    /checkpoint/i,
  );
  expect(f.write).not.toHaveBeenCalled();
  f.args.event.inputs.retention_history_object = objectId;
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([101, 102]);
});
test("an unknown retirement can be reconciled from a new inventory without requesting removal of a missing ID again", async () => {
  const f = fixture(),
    confirmed = f.write;
  f.args.client.write = async (...args) => {
    await confirmed(...args);
    return { state: "AMBIGUOUS" };
  };
  await expect(retireSupersededCandidates(f.args)).rejects.toThrow(
    /ambiguous/i,
  );
  f.args.client.write = confirmed;
  await expect(retireSupersededCandidates(f.args)).resolves.toEqual([102]);
  expect(f.deletes).toEqual([
    "/actions/artifacts/101",
    "/actions/artifacts/102",
  ]);
});
test("a native retirement needs the exact documented 204 to acknowledge its effects", async () => {
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("null", { status: 202 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  try {
    const client = new GitHubReleaseClient({
      repository: REPOSITORY,
      token: "fixture",
    });
    const target = "/actions/artifacts/101",
      operation = { method: "DELETE", expectedStatus: 204 };
    await expect(client.write(target, operation)).resolves.toMatchObject({
      state: "AMBIGUOUS",
      status: 202,
    });
    await expect(client.write(target, operation)).resolves.toEqual({
      state: "CONFIRMED",
      value: null,
    });
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    request.mockRestore();
  }
});
test("the maintenance observer reports the same eligible IDs without applying a write authorization", async () => {
  const f = fixture();
  const result = await reportReleaseRetention(
    {
      ...f.args.env,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      RETENTION_HISTORY_OBJECT: objectId,
    },
    {
      client: f.args.client,
      openCheckpoint: f.args.openCheckpoint,
      qualifySuccessor: f.args.qualifySuccessor,
      now: f.args.now,
      summary: f.args.log,
    },
  );
  expect(result.eligibleIds).toEqual([101, 102]);
  expect(f.write).not.toHaveBeenCalled();
  expect(f.logs.join("\n")).toMatch(/Dry-run/u);
});
test("an ambiguous GitHub write stops the batch without retrying the request", async () => {
  const f = fixture();
  f.args.client.write = jest.fn(async () => ({
    state: "AMBIGUOUS",
    status: 503,
  }));
  await expect(retireSupersededCandidates(f.args)).rejects.toThrow(
    /ambiguous/i,
  );
  expect(f.args.client.write).toHaveBeenCalledTimes(1);
  expect(f.logs.join("\n")).toMatch(/101/);
});
