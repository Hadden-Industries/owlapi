import { describe, expect, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createVerificationReceipt,
  createMainQualification,
  selectVerificationProof,
  verifyIntegrationProof,
  selectBaseQualification,
  verifyBaseQualification,
} from "./ci-verification.mjs";
import {
  createRepositoryReader,
  readDownloadedReceipt,
  readGitSnapshot,
} from "./ci-verification-command.mjs";
import { REQUIRED_JOB_IDS, requireCiJobs } from "./require-job-success.mjs";
import {
  summarizeJavaExecution,
  summarizeWebvowlExecution,
} from "./ci-check-coverage.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";

const hash = (letter) => letter.repeat(40);
const jsonClone = (value) => JSON.parse(JSON.stringify(value));
const now = Date.parse("2026-09-29T18:00:00Z");
const repository = {
  id: 42,
  full_name: "Hadden-Industries/owlapi",
  default_branch: "main",
};
const successfulNeeds = (
  identity = { runId: 100, runAttempt: 2, commit: hash("c") },
) => {
  const report = JSON.parse(
    readFileSync(
      new URL("./fixtures/ci-java-jest-live.json", import.meta.url),
      "utf8",
    ),
  );
  for (const suite of report.testResults) suite.name = resolve(suite.name);
  const java = summarizeJavaExecution(report, identity);
  const webvowl = summarizeWebvowlExecution(
    {
      schemaVersion: 1,
      result: "PASS",
      qualification: "PRE_INTEGRATION",
      candidate: { tarballSha256: "e".repeat(64) },
      maintainedWebVowlCheckoutModified: false,
      cleanInstall: { npmLs: "PASS", installedPackageIdentity: "PASS" },
      gates: {
        baselineNpmCi: "PASS",
        baselineJest: "PASS",
        baselineDevelopmentBuild: "PASS",
        baselineProductionBuild: "PASS",
        consumerBoundary: "PASS",
        candidateJest: "PASS",
        installedImportClosure: "PASS",
        phase21TargetErrorSemantics: "PASS",
        representativeCorpus: "PASS",
        candidateDevelopmentBuild: "PASS",
        candidateProductionBuild: "PASS",
        candidateWebVowlViteConsumerBuild: "PASS",
        candidateChromiumIntegration: "PASS",
      },
    },
    identity,
  );
  return Object.fromEntries(
    REQUIRED_JOB_IDS.ci.map((job) => [
      job,
      {
        result: "success",
        outputs:
          job === "candidate"
            ? { artifact_id: "702", artifact_digest: "f".repeat(64) }
            : job === "source_node_24"
              ? { coverage: JSON.stringify(java) }
              : job === "webvowl"
                ? { coverage: JSON.stringify(webvowl) }
                : {},
      },
    ]),
  );
};

const fixture = () => {
  const pr = {
    number: 31,
    state: "closed",
    merged_at: "2026-09-29T17:40:00Z",
    // Native PR payloads in API 2026-03-10 omit merge_commit_sha.
    base: { sha: hash("a"), ref: "main", repo: repository },
    head: { sha: hash("b"), repo: repository },
  };
  const snapshot = {
    commit: hash("c"),
    tree: hash("e"),
    workflow: hash("f"),
    parents: [hash("a"), hash("b")],
  };
  const common = {
    repository: repository.full_name,
    repositoryId: repository.id,
    runId: 100,
    runAttempt: 2,
    version: "0.1.0-rc.1",
    host: {
      os: "Linux",
      architecture: "X64",
      image: "ubuntu24",
      imageVersion: "20260920.314.1",
      node: "v24.21.0",
    },
  };
  const prContext = {
    ...common,
    eventName: "pull_request",
    ref: "refs/pull/31/merge",
    sha: snapshot.commit,
    event: { number: 31, pull_request: pr },
    snapshot,
  };
  const context = {
    ...common,
    eventName: "push",
    ref: "refs/heads/main",
    sha: hash("d"),
    snapshot: { ...snapshot, commit: hash("d") },
    event: {
      ref: "refs/heads/main",
      before: hash("a"),
      after: hash("d"),
      created: false,
      deleted: false,
      forced: false,
      repository,
    },
  };
  const run = {
    id: 100,
    run_attempt: 2,
    event: "pull_request",
    path: ".github/workflows/ci.yml",
    status: "completed",
    conclusion: "success",
    head_sha: hash("b"),
    repository,
    head_repository: repository,
    created_at: "2026-09-29T17:00:00Z",
    run_started_at: "2026-09-29T17:10:00Z",
  };
  const artifact = {
    id: 701,
    name: "ci-verification-100-2",
    expired: false,
    size_in_bytes: 2000,
    expires_at: "2026-12-28T17:00:00Z",
    digest: `sha256:${"a".repeat(64)}`,
    workflow_run: {
      id: run.id,
      repository_id: 42,
      head_repository_id: 42,
      head_sha: run.head_sha,
    },
  };
  const candidate = {
    ...artifact,
    id: 702,
    name: "hadden-industries-owlapi-0.1.0-rc.1-candidate-100-1",
    digest: `sha256:${"f".repeat(64)}`,
  };
  const receipt = jsonClone(
    createVerificationReceipt({
      context: prContext,
      needs: successfulNeeds(),
      now: now - 20 * 60_000,
    }),
  );
  const jobs = Object.values(CI_JOB_NAMES).map((name) => ({
    name,
    run_id: 100,
    run_attempt: 2,
    head_sha: hash("b"),
    status: "completed",
    conclusion: "success",
  }));
  const responses = {
    [`/commits/${context.sha}/pulls?per_page=100`]: [pr],
    [`/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`]:
      { total_count: 1, workflow_runs: [run] },
    "/actions/runs/100/artifacts?per_page=100": {
      total_count: 2,
      artifacts: [artifact, candidate],
    },
    "/actions/runs/100": run,
    "/actions/artifacts/701": artifact,
    "/actions/artifacts/702": candidate,
    [`/git/commits/${snapshot.commit}`]: {
      sha: snapshot.commit,
      tree: { sha: snapshot.tree },
      parents: snapshot.parents.map((sha) => ({ sha })),
    },
    "/actions/runs/100/jobs?filter=latest&per_page=100": {
      total_count: jobs.length,
      jobs,
    },
  };
  const read = async (path) => {
    if (!Object.hasOwn(responses, path))
      throw new Error(`Unexpected fixture read: ${path}`);
    return jsonClone(responses[path]);
  };
  return {
    context,
    prContext,
    pr,
    run,
    artifact,
    candidate,
    receipt,
    jobs,
    responses,
    read,
  };
};

const verify = async (f) => {
  const selection = await selectVerificationProof({
    context: f.context,
    read: f.read,
    now,
  });
  return verifyIntegrationProof({
    context: f.context,
    selection,
    receipt: f.receipt,
    read: f.read,
    now,
  });
};

const mainFixture = async (reused, partialOrigin = false) => {
  const f = fixture();
  if (partialOrigin) {
    f.receipt = createVerificationReceipt({
      context: f.prContext,
      needs: successfulNeeds({ runId: 100, runAttempt: 1, commit: hash("c") }),
      now: now - 20 * 60_000,
    });
    for (const job of f.jobs)
      if (
        [CI_JOB_NAMES.source_node_24, CI_JOB_NAMES.webvowl].includes(job.name)
      )
        job.run_attempt = 1;
  }
  const mainContext = { ...f.context, runId: 200, runAttempt: 1 };
  const needs = successfulNeeds({
    runId: 200,
    runAttempt: 1,
    commit: hash("d"),
  });
  if (reused) {
    const outputs = await verify(f);
    for (const job of Object.values(needs)) job.result = "skipped";
    needs.verification = { result: "success", outputs };
  }
  const record = createMainQualification({ context: mainContext, needs, now });
  const mainRun = {
    ...f.run,
    id: 200,
    run_attempt: 1,
    event: "push",
    head_branch: "main",
    head_sha: hash("d"),
    created_at: "2026-09-29T17:40:00Z",
    run_started_at: "2026-09-29T17:41:00Z",
  };
  const mainArtifact = {
    ...f.artifact,
    id: 800,
    name: "ci-main-qualification-200-1",
    digest: `sha256:${"d".repeat(64)}`,
    workflow_run: { ...f.artifact.workflow_run, id: 200, head_sha: hash("d") },
  };
  const context = {
    ...f.prContext,
    sha: hash("2"),
    runId: 300,
    runAttempt: 1,
    ref: "refs/pull/32/merge",
    snapshot: {
      ...f.prContext.snapshot,
      commit: hash("2"),
      tree: hash("3"),
      parents: [hash("d"), hash("1")],
    },
    event: {
      number: 32,
      pull_request: {
        ...f.pr,
        number: 32,
        base: { ...f.pr.base, sha: hash("d") },
        head: { ...f.pr.head, sha: hash("1") },
      },
    },
  };
  Object.assign(f.responses, {
    [`/actions/workflows/ci.yml/runs?event=push&head_sha=${hash("d")}&per_page=100`]:
      { total_count: 1, workflow_runs: [mainRun] },
    "/actions/runs/200": mainRun,
    "/actions/runs/200/artifacts?per_page=100": {
      total_count: 1,
      artifacts: [mainArtifact],
    },
    "/actions/artifacts/800": mainArtifact,
    [`/git/commits/${hash("d")}`]: {
      sha: hash("d"),
      tree: { sha: hash("e") },
      parents: [{ sha: hash("a") }, { sha: hash("b") }],
    },
    [`/git/trees/${hash("e")}`]: {
      sha: hash("e"),
      truncated: false,
      tree: [{ path: ".github", type: "tree", sha: hash("4") }],
    },
    [`/git/trees/${hash("4")}`]: {
      sha: hash("4"),
      truncated: false,
      tree: [{ path: "workflows", type: "tree", sha: hash("5") }],
    },
    [`/git/trees/${hash("5")}`]: {
      sha: hash("5"),
      truncated: false,
      tree: [{ path: "ci.yml", type: "blob", sha: hash("f") }],
    },
    "/actions/runs/200/jobs?filter=latest&per_page=100": {
      total_count: 16,
      jobs: Object.values(CI_JOB_NAMES).map((name) => ({
        name,
        run_id: 200,
        run_attempt: 1,
        head_sha: hash("d"),
        status: "completed",
        conclusion:
          reused &&
          ![CI_JOB_NAMES.verification, CI_JOB_NAMES.required].includes(name)
            ? "skipped"
            : "success",
      })),
    },
  });
  if (!reused)
    f.responses["/actions/artifacts/702"] = {
      ...f.candidate,
      name: "hadden-industries-owlapi-0.1.0-rc.1-candidate-200-1",
      workflow_run: {
        ...f.candidate.workflow_run,
        id: 200,
        head_sha: hash("d"),
      },
    };
  const downloadOriginal = async () => jsonClone(f.receipt);
  return { ...f, context, record, mainRun, mainArtifact, downloadOriginal };
};
const validateBase = async (f) => {
  const selection = await selectBaseQualification({
    context: f.context,
    read: f.read,
    now,
  });
  return verifyBaseQualification({
    context: f.context,
    selection,
    record: f.record,
    read: f.read,
    downloadOriginal: f.downloadOriginal,
    now,
  });
};

describe("exact landed-main qualification and direct original execution", () => {
  test("reused main keeps direct check-producing attempts from a partial PR rerun", async () => {
    const f = await mainFixture(true, true);
    expect(f.record.source.runAttempt).toBe(2);
    expect(f.record.checks.java.original.runAttempt).toBe(1);
    expect(await validateBase(f)).toMatchObject({
      originals: {
        webvowl: { original: { role: "PR", runId: 100, runAttempt: 1 } },
      },
    });
  });
  test("retains earlier successful check attempts in fresh main partial reruns", async () => {
    const f = await mainFixture(false);
    f.mainRun.run_attempt = 2;
    f.record = createMainQualification({
      context: {
        ...f.context,
        eventName: "push",
        ref: "refs/heads/main",
        sha: hash("d"),
        snapshot: f.record.snapshot,
        event: {
          ...f.context.event,
          ref: "refs/heads/main",
          after: hash("d"),
          deleted: false,
          forced: false,
          repository,
        },
        runId: 200,
        runAttempt: 2,
      },
      needs: successfulNeeds({ runId: 200, runAttempt: 1, commit: hash("d") }),
      now,
    });
    f.mainArtifact.name = "ci-main-qualification-200-2";
    f.responses["/actions/runs/200/jobs?filter=latest&per_page=100"].jobs.at(
      -1,
    ).run_attempt = 2;
    expect(await validateBase(f)).toMatchObject({
      originals: { java: { original: { runAttempt: 1 } } },
    });
  });
  test.each([false, true])(
    "authenticates exact-base %s reuse without enabling omissions",
    async (reused) => {
      const f = await mainFixture(reused);
      let transfers = 0;
      f.downloadOriginal = async () => {
        transfers++;
        return jsonClone(f.receipt);
      };
      expect(await validateBase(f)).toMatchObject({
        qualifiedBase: hash("d"),
        mode: reused ? "REUSED" : "FULL",
        selectiveExecution: false,
        originals: {
          java: {
            original: {
              role: reused ? "PR" : "MAIN",
              runId: reused ? 100 : 200,
            },
          },
        },
      });
      expect(transfers).toBe(reused ? 1 : 0);
    },
  );
  test.each([
    "schema v1",
    "selective mode",
    "indirect origin",
    "missing coverage",
    "expired main artifact",
    "expired original",
    "expired candidate",
    "failed main job",
    "skipped selected main job",
    "workflow mismatch",
    "wrong base",
    "incomplete inventory",
  ])(
    "rejects %s instead of accepting a convenient historical claim",
    async (fault) => {
      const f = await mainFixture(true);
      if (fault === "schema v1") f.record.schemaVersion = 1;
      if (fault === "selective mode") f.record.mode = "SELECTIVE";
      if (fault === "indirect origin")
        f.record.checks.java.original.role = "MAIN";
      if (fault === "missing coverage") delete f.record.checks.java;
      if (fault === "expired main artifact") f.mainArtifact.expired = true;
      if (fault === "expired original") f.artifact.expired = true;
      if (fault === "expired candidate") f.candidate.expired = true;
      if (fault === "failed main job")
        f.responses[
          "/actions/runs/200/jobs?filter=latest&per_page=100"
        ].jobs[0].conclusion = "failure";
      if (fault === "skipped selected main job")
        f.responses[
          "/actions/runs/200/jobs?filter=latest&per_page=100"
        ].jobs.at(-1).conclusion = "skipped";
      if (fault === "workflow mismatch")
        f.responses[`/git/trees/${hash("5")}`].tree[0].sha = hash("a");
      if (fault === "wrong base") f.record.snapshot.commit = hash("a");
      if (fault === "incomplete inventory")
        f.responses["/actions/runs/200/artifacts?per_page=100"].total_count =
          101;
      await expect(validateBase(f)).rejects.toThrow();
    },
  );
  test("does not look past a newer failed exact-base run", async () => {
    const f = await mainFixture(true);
    f.responses[
      `/actions/workflows/ci.yml/runs?event=push&head_sha=${hash("d")}&per_page=100`
    ] = {
      total_count: 2,
      workflow_runs: [
        f.mainRun,
        { ...f.mainRun, id: 201, conclusion: "failure" },
      ],
    };
    await expect(validateBase(f)).rejects.toThrow(/unsuccessful/u);
  });
  test.each(["main rerun", "original rerun", "main deletion"])(
    "rechecks mutable proof after transfers: %s",
    async (fault) => {
      const f = await mainFixture(true);
      f.downloadOriginal = async () => {
        if (fault === "main rerun") f.mainRun.run_attempt++;
        if (fault === "original rerun") f.run.run_attempt++;
        if (fault === "main deletion") f.mainArtifact.expired = true;
        return jsonClone(f.receipt);
      };
      await expect(validateBase(f)).rejects.toThrow();
    },
  );
  test("a missing exact-base receipt cannot fall back to an arbitrary older commit", async () => {
    const f = await mainFixture(true);
    f.context.event.pull_request.base.sha = hash("a");
    await expect(validateBase(f)).rejects.toThrow(/captured/u);
  });
  test("FULL receipts require current explicit coverage; job SUCCESS cannot hide unset Java", () => {
    const f = fixture();
    const needs = successfulNeeds();
    delete needs.source_node_24.outputs.coverage;
    expect(() =>
      createVerificationReceipt({ context: f.prContext, needs, now }),
    ).toThrow(/coverage/u);
    expect(() =>
      requireCiJobs(needs, {
        eventName: "pull_request",
        ref: f.prContext.ref,
        runId: 100,
        runAttempt: 2,
        sha: hash("c"),
      }),
    ).toThrow(/coverage/u);
  });
});

describe("reuse of complete PR integration", () => {
  test("qualifies a partial rerun while preserving native producing attempts", async () => {
    const f = fixture();
    f.receipt = createVerificationReceipt({
      context: f.prContext,
      needs: successfulNeeds({ runId: 100, runAttempt: 1, commit: hash("c") }),
      now: now - 20 * 60_000,
    });
    for (const job of f.jobs)
      if (
        [
          CI_JOB_NAMES.source_node_24,
          CI_JOB_NAMES.webvowl,
          CI_JOB_NAMES.metadata,
        ].includes(job.name)
      )
        job.run_attempt = 1;
    expect(f.receipt.checks.java.original.runAttempt).toBe(1);
    expect(f.receipt.runAttempt).toBe(2);
    expect((await verify(f)).reuse).toBe("true");
    f.jobs.find((job) => job.name === CI_JOB_NAMES.webvowl).run_attempt = 2;
    await expect(verify(f)).rejects.toThrow(/producing attempt/u);
  });

  test.each(["later attempt", "another run", "another commit"])(
    "rejects coverage from %s during a partial rerun",
    (fault) => {
      const f = fixture();
      const identity = { runId: 100, runAttempt: 1, commit: hash("c") };
      if (fault === "later attempt") identity.runAttempt = 3;
      if (fault === "another run") identity.runId = 101;
      if (fault === "another commit") identity.commit = hash("a");
      expect(() =>
        createVerificationReceipt({
          context: f.prContext,
          needs: successfulNeeds(identity),
          now,
        }),
      ).toThrow();
      expect(() =>
        requireCiJobs(successfulNeeds(identity), {
          eventName: "pull_request",
          ref: "refs/pull/31/merge",
          runId: 100,
          runAttempt: 2,
          sha: hash("c"),
        }),
      ).toThrow();
    },
  );

  test("required aggregation accepts earlier successful producing attempts", () => {
    const accepted = requireCiJobs(
      successfulNeeds({ runId: 100, runAttempt: 1, commit: hash("c") }),
      {
        eventName: "pull_request",
        ref: "refs/pull/31/merge",
        runId: 100,
        runAttempt: 2,
        sha: hash("c"),
      },
    );
    expect(accepted.mode).toBe("FULL");
  });
  test("records typed FULL coverage rather than inferring live tests from job success", () => {
    const f = fixture();
    expect(f.receipt).toMatchObject({
      schemaVersion: 3,
      role: "PR",
      mode: "FULL",
      checks: {
        java: {
          applicability: "REQUIRED",
          execution: "SUCCESS",
          proof: "CURRENT_EXECUTION",
        },
        webvowl: {
          applicability: "REQUIRED",
          execution: "SUCCESS",
          proof: "CURRENT_EXECUTION",
        },
      },
    });
  });
  test("seeds a landed-main record with direct original PR coverage after verified reuse", async () => {
    const f = fixture();
    const outputs = await verify(f);
    const needs = successfulNeeds();
    for (const job of Object.values(needs)) job.result = "skipped";
    needs.verification = { result: "success", outputs };
    const record = createMainQualification({
      context: { ...f.context, runId: 200, runAttempt: 1 },
      needs,
      now,
    });
    expect(record).toMatchObject({
      schemaVersion: 3,
      role: "MAIN",
      mode: "REUSED",
      sourceMode: "FULL",
      snapshot: f.context.snapshot,
      checks: {
        java: {
          execution: "NOT_RUN",
          original: {
            role: "PR",
            runId: 100,
            runAttempt: 2,
            commit: hash("c"),
          },
        },
      },
    });
  });
  test("reuses a current-API PR with identical parents and files, retaining the original candidate after a partial rerun", async () => {
    const f = fixture();
    expect(await verify(f)).toEqual({
      reuse: "true",
      source_run_id: "100",
      source_run_attempt: "2",
      source_commit: hash("c"),
      candidate_artifact_id: "702",
      candidate_artifact_digest: `sha256:${"f".repeat(64)}`,
      source_receipt_id: "701",
      source_receipt_digest: `sha256:${"a".repeat(64)}`,
      qualification: JSON.stringify(f.receipt),
    });
  });

  test.each([24 * 60 * 60_000 + 1, 7 * 24 * 60 * 60_000])(
    "reuses equivalent retained evidence %i ms old",
    async (age) => {
      const f = fixture();
      f.run.created_at = new Date(now - age - 10 * 60_000).toISOString();
      f.run.run_started_at = new Date(now - age - 5 * 60_000).toISOString();
      f.receipt.recordedAt = new Date(now - age).toISOString();
      await expect(verify(f)).resolves.toMatchObject({ reuse: "true" });
    },
  );

  test("reuses a recent successful attempt of an older workflow", async () => {
    const f = fixture();
    f.run.created_at = "2026-09-22T17:00:00Z";
    await expect(verify(f)).resolves.toMatchObject({ reuse: "true" });
  });

  test.each([
    [
      "a PR event",
      (f) => {
        f.context.eventName = "pull_request";
      },
    ],
    [
      "a squash merge",
      (f) => {
        f.context.snapshot.parents.pop();
      },
    ],
    [
      "multiple landed merges",
      (f) => {
        f.context.event.before = hash("e");
      },
    ],
    [
      "a forced update",
      (f) => {
        f.context.event.forced = true;
      },
    ],
    [
      "a moved checkout",
      (f) => {
        f.context.snapshot.commit = hash("a");
      },
    ],
    [
      "an unknown image",
      (f) => {
        delete f.context.host.imageVersion;
      },
    ],
    [
      "a different runner image",
      (f) => {
        f.receipt.host.imageVersion = "20260919.300.1";
      },
    ],
    [
      "a different workflow blob",
      (f) => {
        f.receipt.snapshot.workflow = hash("a");
      },
    ],
    [
      "a receipt predating Windows source quality",
      (f) => {
        f.receipt.jobs = { ...f.receipt.jobs };
        delete f.receipt.jobs.quality_windows;
      },
    ],
    [
      "a different tested tree",
      (f) => {
        f.receipt.snapshot.tree = hash("a");
      },
    ],
    [
      "a different tested base",
      (f) => {
        f.receipt.snapshot.parents[0] = hash("e");
      },
    ],
    [
      "an associated PR with a different base commit",
      (f) => {
        f.pr.base.sha = hash("e");
      },
    ],
    [
      "an ambiguous merged PR association",
      (f) => {
        f.responses[`/commits/${f.context.sha}/pulls?per_page=100`].push({
          ...f.pr,
          number: 32,
        });
      },
    ],
    [
      "a receipt recorded before the current attempt",
      (f) => {
        f.receipt.recordedAt = "2026-09-29T17:09:00Z";
      },
    ],
    [
      "a future receipt",
      (f) => {
        f.receipt.recordedAt = "2026-09-30T18:00:00Z";
      },
    ],
    [
      "an invalid receipt timestamp",
      (f) => {
        f.receipt.recordedAt = "invalid";
      },
    ],
    [
      "a forged mode",
      (f) => {
        f.receipt.mode = "REUSED";
      },
    ],
    [
      "a future workflow",
      (f) => {
        f.run.created_at = "2026-09-30T18:00:00Z";
      },
    ],
    [
      "an invalid workflow timestamp",
      (f) => {
        f.run.created_at = "invalid";
      },
    ],
    [
      "a failed workflow",
      (f) => {
        f.run.conclusion = "failure";
      },
    ],
    [
      "a push workflow",
      (f) => {
        f.run.event = "push";
      },
    ],
    [
      "a different workflow",
      (f) => {
        f.run.path = ".github/workflows/release.yml";
      },
    ],
    [
      "a missing receipt",
      (f) => {
        f.responses["/actions/runs/100/artifacts?per_page=100"] = {
          total_count: 1,
          artifacts: [f.candidate],
        };
      },
    ],
    [
      "an expired receipt",
      (f) => {
        f.artifact.expired = true;
      },
    ],
    [
      "an expired candidate",
      (f) => {
        f.candidate.expired = true;
      },
    ],
    [
      "a receipt artifact past its retention deadline",
      (f) => {
        f.artifact.expires_at = "2026-09-28T18:00:00Z";
      },
    ],
    [
      "a candidate artifact past its retention deadline",
      (f) => {
        f.candidate.expires_at = "2026-09-28T18:00:00Z";
      },
    ],
    [
      "a foreign candidate",
      (f) => {
        f.candidate.workflow_run = {
          ...f.candidate.workflow_run,
          repository_id: 43,
        };
      },
    ],
    [
      "a changed candidate digest",
      (f) => {
        f.candidate.digest = `sha256:${"b".repeat(64)}`;
      },
    ],
    [
      "missing full checks",
      (f) => {
        f.jobs.pop();
      },
    ],
    [
      "a skipped full check",
      (f) => {
        f.jobs.find(
          (j) => j.name === "CI / isolated WebVOWL consumer",
        ).conclusion = "skipped";
      },
    ],
    [
      "a failed full check",
      (f) => {
        f.jobs[0].conclusion = "failure";
      },
    ],
    [
      "an ambiguous job name",
      (f) => {
        f.jobs[1].name = f.jobs[0].name;
      },
    ],
    [
      "a source job from another head",
      (f) => {
        f.jobs[1].head_sha = hash("a");
      },
    ],
    [
      "a source job from a later attempt",
      (f) => {
        f.jobs[1].run_attempt = 3;
      },
    ],
    [
      "an incomplete API page",
      (f) => {
        f.responses[
          "/actions/runs/100/jobs?filter=latest&per_page=100"
        ].total_count = 101;
      },
    ],
    [
      "an API outage",
      (f) => {
        f.read = async () => {
          throw new Error("HTTP 503");
        };
      },
    ],
  ])("cannot reuse %s", async (_label, mutate) => {
    const f = fixture();
    mutate(f);
    await expect(verify(f)).rejects.toThrow();
  });

  test("rechecks a source run restarted after receipt selection", async () => {
    const f = fixture();
    const selection = await selectVerificationProof({
      context: f.context,
      read: f.read,
      now,
    });
    f.run.run_attempt++;
    await expect(
      verifyIntegrationProof({
        context: f.context,
        selection,
        receipt: f.receipt,
        read: f.read,
        now,
      }),
    ).rejects.toThrow(/rerun/u);
  });

  test.each(["failure", null])(
    "does not look past a newer unsuccessful run (%s)",
    async (conclusion) => {
      const f = fixture();
      f.responses[
        `/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${f.pr.head.sha}&per_page=100`
      ] = {
        total_count: 2,
        workflow_runs: [
          f.run,
          {
            ...f.run,
            id: 101,
            conclusion,
            status: conclusion ? "completed" : "in_progress",
          },
        ],
      };
      await expect(verify(f)).rejects.toThrow(/unsuccessful/u);
    },
  );

  test("rechecks the attempt after validating jobs and artifacts", async () => {
    const f = fixture();
    const read = f.read;
    let runReads = 0;
    f.read = async (path) => {
      if (path === "/actions/runs/100" && ++runReads === 2) {
        f.run.run_attempt++;
      }
      return read(path);
    };
    await expect(verify(f)).rejects.toThrow(/rerun/u);
  });

  test("does not trust the receipt's claim about the tested Git tree", async () => {
    const f = fixture();
    f.responses[`/git/commits/${hash("c")}`].tree.sha = hash("a");
    await expect(verify(f)).rejects.toThrow(/GitHub's tested commit/u);
  });

  test("does not issue a full receipt for skipped application tests", () => {
    const f = fixture();
    const needs = successfulNeeds();
    needs.webvowl.result = "skipped";
    expect(() =>
      createVerificationReceipt({ context: f.prContext, needs, now }),
    ).toThrow(/webvowl=skipped/u);
  });

  test("the aggregate accepts skipped jobs only with verified reuse on main push", async () => {
    const f = fixture();
    const outputs = await verify(f);
    const needs = successfulNeeds();
    for (const job of Object.values(needs)) job.result = "skipped";
    needs.verification = { result: "success", outputs };
    expect(
      requireCiJobs(needs, { eventName: "push", ref: "refs/heads/main" }).mode,
    ).toBe("REUSED");
    expect(() =>
      requireCiJobs(needs, {
        eventName: "pull_request",
        ref: "refs/pull/31/merge",
      }),
    ).toThrow();
    needs.webvowl.result = "failure";
    expect(() =>
      requireCiJobs(needs, { eventName: "push", ref: "refs/heads/main" }),
    ).toThrow();
    needs.verification.outputs.reuse = "false";
    expect(() =>
      requireCiJobs(needs, { eventName: "push", ref: "refs/heads/main" }),
    ).toThrow();
  });
});

describe("native evidence boundaries", () => {
  test("bounds total API requests and deadline without issuing an expired read", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response('{"id":1}');
    };
    const expired = createRepositoryReader({
      repository: repository.full_name,
      token: "test-token",
      fetchImpl,
      deadline: Date.now() - 1,
    });
    await expect(expired("/actions/runs/1")).rejects.toMatchObject({
      code: "LOOKUP_LIMIT_EXCEEDED",
    });
    expect(calls).toBe(0);
    const read = createRepositoryReader({
      repository: repository.full_name,
      token: "test-token",
      fetchImpl,
    });
    for (let index = 0; index < 32; index++) await read("/actions/runs/1");
    await expect(read("/actions/runs/1")).rejects.toMatchObject({
      code: "LOOKUP_LIMIT_EXCEEDED",
    });
    expect(calls).toBe(32);
  });
  test("bounds the native streamed JSON body before parsing it", async () => {
    const read = createRepositoryReader({
      repository: repository.full_name,
      token: "test-token",
      fetchImpl: async () =>
        new Response(JSON.stringify({ body: "x".repeat(2 * 1024 * 1024) })),
    });
    await expect(read("/actions/runs/1")).rejects.toMatchObject({
      code: "LOOKUP_LIMIT_EXCEEDED",
    });
  });
  test.each(["failure", "skipped", "success"])(
    "the native command falls back with %s download and no retained selection",
    (outcome) => {
      const root = mkdtempSync(join(tmpdir(), "owlapi-ci-fallback-"));
      try {
        const output = join(root, "outputs");
        const result = execFileSync(
          process.execPath,
          [resolve("scripts/ci-verification-command.mjs"), "verify"],
          {
            cwd: root,
            encoding: "utf8",
            windowsHide: true,
            env: {
              ...process.env,
              PROOF_DOWNLOAD_OUTCOME: outcome,
              GITHUB_OUTPUT: output,
              GITHUB_STEP_SUMMARY: join(root, "summary"),
            },
          },
        );
        expect(JSON.parse(result)).toEqual({
          reuse: "false",
          summary: expect.stringContaining(
            "No successfully downloaded PR receipt",
          ),
        });
        expect(readFileSync(output, "utf8")).toBe("reuse=false\n");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  test("uses bounded read-only same-repository HTTP without following redirects", async () => {
    const calls = [];
    const read = createRepositoryReader({
      repository: repository.full_name,
      token: "test-token",
      fetchImpl: async (...args) => {
        calls.push(args);
        return new Response(JSON.stringify({ id: 1 }));
      },
    });
    expect(await read("/actions/runs/1")).toEqual({ id: 1 });
    expect(calls[0][0]).toBe(
      "https://api.github.com/repos/Hadden-Industries/owlapi/actions/runs/1",
    );
    expect(calls[0][1].redirect).toBe("error");
    expect(calls[0][1].signal).toBeInstanceOf(AbortSignal);
    await expect(read("https://elsewhere.invalid")).rejects.toThrow();
    await expect(read("/actions/../elsewhere")).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  test("reads native parents even from a shallow checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "owlapi-ci-proof-"));
    const git = (...args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Test",
          GIT_AUTHOR_EMAIL: "test@example.invalid",
          GIT_COMMITTER_NAME: "Test",
          GIT_COMMITTER_EMAIL: "test@example.invalid",
        },
      }).trim();
    try {
      git("init", "--quiet");
      mkdirSync(join(root, ".github/workflows"), { recursive: true });
      writeFileSync(join(root, ".github/workflows/ci.yml"), "name: Fixture\n");
      git("add", ".github/workflows/ci.yml");
      const tree = git("write-tree");
      const base = git(
        "-c",
        "commit.gpgsign=false",
        "commit-tree",
        tree,
        "-m",
        "base",
      );
      const head = git(
        "-c",
        "commit.gpgsign=false",
        "commit-tree",
        tree,
        "-p",
        base,
        "-m",
        "head",
      );
      const merge = git(
        "-c",
        "commit.gpgsign=false",
        "commit-tree",
        tree,
        "-p",
        base,
        "-p",
        head,
        "-m",
        "merge",
      );
      git("update-ref", "HEAD", merge);
      writeFileSync(join(root, ".git/shallow"), `${merge}\n`);
      expect(git("show", "-s", "--format=%P", "HEAD")).toBe("");
      expect(readGitSnapshot(root)).toEqual({
        commit: merge,
        tree,
        parents: [base, head],
        workflow: git("rev-parse", "HEAD:.github/workflows/ci.yml"),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("accepts only a closed receipt archive inventory", () => {
    const root = mkdtempSync(join(tmpdir(), "owlapi-ci-receipt-"));
    try {
      writeFileSync(join(root, "verification.json"), '{"schemaVersion":1}\n');
      expect(readDownloadedReceipt(root, "ci-verification-100-2")).toEqual({
        schemaVersion: 1,
      });
      writeFileSync(
        join(root, "unexpected.js"),
        "throw new Error('must not run');",
      );
      expect(() =>
        readDownloadedReceipt(root, "ci-verification-100-2"),
      ).toThrow(/inventory/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
