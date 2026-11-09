import { jest } from "@jest/globals";
import {
  admitPublication,
  readPublicationHistory,
  PUBLICATION_WRITE_STEP,
} from "./release-publication-history.mjs";
import { readPublicationAttempt } from "./qualify-public-registry.mjs";

function fixture(attempt = 2, jobId = "npm_release") {
  const env = {
    GITHUB_REPOSITORY: "Hadden-Industries/owlapi",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: String(attempt),
    GITHUB_JOB: jobId,
  };
  const run = {
    id: 123,
    head_sha: env.GITHUB_SHA,
    head_branch: "main",
    head_repository: { full_name: env.GITHUB_REPOSITORY },
    path: ".github/workflows/release.yml",
    event: "workflow_dispatch",
    run_attempt: attempt,
    status: "in_progress",
  };
  const job = (n, conclusion = "success") => ({
    id: n * 100,
    name:
      jobId === "npm_release"
        ? "Release / npm trusted publisher"
        : "Release recovery / npm trusted publisher",
    run_id: 123,
    head_sha: env.GITHUB_SHA,
    run_attempt: n,
    runner_id: n * 1000,
    started_at: `2026-11-01T00:0${n}:00Z`,
    completed_at: `2026-11-01T00:0${n}:30Z`,
    status: "completed",
    conclusion,
    steps: [
      {
        name: PUBLICATION_WRITE_STEP,
        status: "completed",
        conclusion,
        completed_at: `2026-11-01T00:0${n}:20Z`,
      },
    ],
  });
  const current = {
    ...job(attempt),
    status: "in_progress",
    conclusion: null,
    completed_at: null,
    steps: [],
  };
  const inventories = Array.from({ length: attempt }, (_, n) => ({
    total_count: n + 1 === attempt ? 1 : 0,
    jobs: n + 1 === attempt ? [current] : [],
  }));
  const runs = Array.from({ length: attempt }, (_, n) => ({
    ...run,
    run_attempt: n + 1,
    status: "completed",
  }));
  const client = {
    read: jest.fn(async (path) => {
      const match = /\/attempts\/(\d+)(\/jobs\?per_page=100)?$/u.exec(path);
      return match
        ? match[2]
          ? inventories[Number(match[1]) - 1]
          : runs[Number(match[1]) - 1]
        : run;
    }),
  };
  const fetchImpl = jest.fn(async () => new Response(null, { status: 404 }));
  const set = (n, jobs) => {
    inventories[n - 1] = { jobs, total_count: jobs.length };
  };
  return {
    env,
    run,
    runs,
    job,
    current,
    inventories,
    client,
    fetchImpl,
    set,
    admit: () => admitPublication({ client, env, fetchImpl }),
  };
}

test.each(["npm_release", "recovery_publish"])(
  "%s may first publish after upstream or pre-write failure on a later attempt",
  async (name) => {
    const f = fixture(3, name);
    f.set(1, [{ ...f.job(1, "skipped"), steps: [] }]);
    f.set(2, [
      {
        ...f.job(2, "failure"),
        steps: [
          {
            name: PUBLICATION_WRITE_STEP,
            status: "completed",
            conclusion: "skipped",
          },
        ],
      },
    ]);
    expect(await f.admit()).toEqual({ publish: true, publication: null });
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  },
);

test("first attempt uses the same authenticated admission", async () => {
  expect(await fixture(1).admit()).toEqual({
    publish: true,
    publication: null,
  });
});

test.each(["success", "failure"])(
  "a prior %s write permits verification only, even if the registry would return 404",
  async (conclusion) => {
    const f = fixture();
    f.set(1, [f.job(1, conclusion)]);
    expect(await f.admit()).toMatchObject({
      publish: false,
      publication: { runAttempt: 1 },
    });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  },
);

test("relabeled retained jobs preserve the original write attempt", async () => {
  const f = fixture(3);
  const original = f.job(1);
  f.set(1, [original]);
  f.set(2, [{ ...original, id: 999, run_attempt: 2 }]);
  expect(await f.admit()).toMatchObject({
    publish: false,
    publication: { runAttempt: 1, jobId: 100 },
  });
  f.set(3, [
    {
      ...f.job(3),
      steps: [
        {
          name: PUBLICATION_WRITE_STEP,
          status: "completed",
          conclusion: "skipped",
        },
      ],
    },
  ]);
  expect(await readPublicationAttempt(f)).toMatchObject({
    runAttempt: 1,
    jobId: 100,
  });
});

test("registry verification retains a later actual write origin", async () => {
  const f = fixture(3);
  f.set(2, [f.job(2)]);
  f.set(3, [
    {
      ...f.job(3),
      steps: [
        {
          name: PUBLICATION_WRITE_STEP,
          status: "completed",
          conclusion: "skipped",
        },
      ],
    },
  ]);
  expect(await readPublicationAttempt(f)).toMatchObject({
    state: "PUBLICATION_ACCEPTED",
    runAttempt: 2,
    jobId: 200,
  });
});

test.each([
  "missing steps",
  "cancelled write",
  "running write",
  "incomplete inventory",
  "ambiguous publisher",
  "wrong source",
  "unclosed attempt",
  "missing current",
  "wrong running job",
  "unobservable origin",
  "wrong repository",
  "wrong workflow",
  "changed attempt",
])("rejects uncertain publication history: %s", async (fault) => {
  const f = fixture();
  const prior = f.job(1, "failure");
  f.set(1, [prior]);
  if (fault === "missing steps") prior.steps = [];
  if (fault === "cancelled write") prior.steps[0].conclusion = "cancelled";
  if (fault === "running write") prior.steps[0].status = "in_progress";
  if (fault === "incomplete inventory") f.inventories[0].total_count++;
  if (fault === "ambiguous publisher") f.set(1, [prior, { ...prior, id: 101 }]);
  if (fault === "wrong source") prior.head_sha = "b".repeat(40);
  if (fault === "unclosed attempt") f.runs[0].status = "in_progress";
  if (fault === "missing current") f.set(2, []);
  if (fault === "wrong running job") f.env.GITHUB_JOB = "other";
  if (fault === "unobservable origin") delete prior.runner_id;
  if (fault === "wrong repository")
    f.run.head_repository = { full_name: "other/repo" };
  if (fault === "wrong workflow") f.run.path = ".github/workflows/ci.yml";
  if (fault === "changed attempt") f.run.run_attempt++;
  await expect(f.admit()).rejects.toThrow();
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

test("two actual writes cannot be mistaken for retained copies", async () => {
  const f = fixture(3);
  f.set(1, [f.job(1)]);
  f.set(2, [f.job(2)]);
  await expect(f.admit()).rejects.toThrow(/Multiple publication/u);
});

test.each([200, 403, 429, 500])(
  "an unused coordinate must be established before the first write: HTTP %s",
  async (status) => {
    const f = fixture();
    f.fetchImpl.mockImplementation(async () => new Response(null, { status }));
    await expect(f.admit()).rejects.toThrow(/unused registry coordinate/u);
  },
);

test("a failed GitHub read cannot enable writing", async () => {
  const f = fixture();
  f.client.read.mockRejectedValue(new Error("unavailable"));
  await expect(f.admit()).rejects.toThrow("unavailable");
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

test("source verification may observe a not-yet-started publisher without granting publication", async () => {
  const f = fixture();
  f.current.status = "queued";
  expect(
    (await readPublicationHistory({ ...f, beforePublisher: true })).writes,
  ).toEqual([]);
  await expect(f.admit()).rejects.toThrow();
});
