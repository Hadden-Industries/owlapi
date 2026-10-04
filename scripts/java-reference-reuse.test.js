import { describe, expect, test } from "@jest/globals";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";
import {
  discoverReferenceArtifact,
  needsFullMainSeed,
  referenceArtifactName,
  rereadReferenceArtifact,
  selectReferenceArtifact,
  selectReferenceIndex,
  referenceProducerHint,
} from "./java-reference-reuse.mjs";

const now = Date.parse("2026-10-04T00:00:00Z");
const key = "1".repeat(64);
const repository = { id: 1347610640, full_name: "Hadden-Industries/owlapi" };
function fixture() {
  const run = {
    id: 100,
    run_attempt: 2,
    workflow_id: 80,
    head_sha: "a".repeat(40),
    event: "push",
    head_branch: "main",
    path: ".github/workflows/ci.yml",
    repository,
    head_repository: repository,
    status: "completed",
    conclusion: "success",
    created_at: "2026-10-03T00:00:00Z",
  };
  const artifact = {
    id: 400,
    name: referenceArtifactName(key, 100, 2),
    expired: false,
    digest: `sha256:${"2".repeat(64)}`,
    size_in_bytes: 34_000_000,
    created_at: "2026-10-03T00:10:00Z",
    expires_at: "2027-01-01T00:10:00Z",
    workflow_run: {
      id: 100,
      repository_id: repository.id,
      head_repository_id: repository.id,
      head_sha: run.head_sha,
      head_branch: "main",
    },
  };
  const qualification = {
    ...artifact,
    id: 401,
    name: "ci-main-qualification-100-2",
    size_in_bytes: 4000,
  };
  const jobs = [CI_JOB_NAMES.source_node_24, CI_JOB_NAMES.required].map(
    (name, index) => ({
      id: 1000 + index,
      name,
      run_id: 100,
      run_attempt: 2,
      status: "completed",
      conclusion: "success",
    }),
  );
  const values = {
    runs: { total_count: 1, workflow_runs: [run] },
    run,
    artifacts: { total_count: 2, artifacts: [artifact, qualification] },
    jobs: { total_count: 2, jobs },
  };
  const requests = [];
  const read = async (path) => {
    requests.push(path);
    if (path.startsWith("/actions/workflows/ci.yml/runs?"))
      return structuredClone(values.runs);
    if (path === "/actions/runs/100") return structuredClone(values.run);
    if (path === "/actions/runs/100/artifacts?per_page=100")
      return structuredClone(values.artifacts);
    if (path === "/actions/runs/100/attempts/2/jobs?per_page=100")
      return structuredClone(values.jobs);
    throw new Error("Unexpected fixture request");
  };
  return { values, requests, read, artifact };
}

describe("trusted-main Java build product discovery", () => {
  test("finds a direct producer beyond the recent run window without following receipt history", async () => {
    const f = fixture();
    const index = await selectReferenceIndex({
      read: f.read,
      baseCommit: f.values.run.head_sha,
      now,
    });
    const pointer = {
      role: "MAIN",
      runId: 100,
      runAttempt: 2,
      commit: f.values.run.head_sha,
      artifactId: 400,
      artifactDigest: f.values.artifacts.artifacts[0].digest,
      qualificationId: 401,
      qualificationDigest: f.values.artifacts.artifacts[1].digest,
    };
    const record = {
      role: "MAIN",
      runId: 100,
      runAttempt: 2,
      repository: repository.full_name,
      repositoryId: repository.id,
      snapshot: { commit: f.values.run.head_sha },
      javaReference: {
        inputs: { keySha256: key },
        publication: null,
        producer: pointer,
      },
    };
    expect(referenceProducerHint({ index, record, keySha256: key })).toEqual(
      pointer,
    );
    f.values.runs = { total_count: 100, workflow_runs: [] }; // unusable window
    const before = f.requests.length;
    const product = await discoverReferenceArtifact({
      read: f.read,
      keySha256: key,
      now,
      producerHint: pointer,
    });
    expect(product.artifact.id).toBe(400);
    expect(f.requests.slice(before)).toHaveLength(3);
    expect(
      f.requests.slice(before).some((path) => path.includes("/workflows/")),
    ).toBe(false);
    expect(() =>
      referenceProducerHint({ index, record, keySha256: "9".repeat(64) }),
    ).toThrow();
    f.values.run.run_attempt = 3;
    expect(
      (
        await selectReferenceArtifact({
          read: f.read,
          keySha256: key,
          now,
          producerHint: pointer,
        })
      ).available,
    ).toBe(false);
  });
  test("uses a bounded main window and requires native full Java/aggregate execution", async () => {
    const f = fixture();
    const selected = await discoverReferenceArtifact({
      read: f.read,
      keySha256: key,
      now,
    });
    expect(selected.artifact.id).toBe(400);
    expect(selected.qualification.id).toBe(401);
    expect(f.requests).toHaveLength(4);
    expect(f.requests[0]).toContain("branch=main&event=push&created=%3E%3D");
    await expect(
      rereadReferenceArtifact({ read: f.read, selection: selected, now }),
    ).resolves.toEqual(selected);
  });

  test.each([
    (f) => {
      f.values.run.event = "pull_request";
    },
    (f) => {
      f.values.run.head_branch = "candidate";
    },
    (f) => {
      f.values.run.path = ".github/workflows/release.yml";
    },
    (f) => {
      f.values.run.head_repository = { ...repository, id: 99 };
    },
    (f) => {
      f.values.run.run_attempt = 3;
    },
    (f) => {
      f.values.jobs.jobs[0].conclusion = "skipped";
    },
    (f) => {
      f.values.jobs.jobs[0].run_attempt = 1;
    },
    (f) => {
      f.values.artifacts.artifacts[0].expired = true;
    },
    (f) => {
      f.values.artifacts.artifacts[0].digest = "self-reported";
    },
    (f) => {
      f.values.artifacts.artifacts[0].size_in_bytes = 129 * 1024 * 1024;
    },
    (f) => {
      f.values.artifacts.artifacts[0].workflow_run.head_sha = "b".repeat(40);
    },
    (f) => {
      f.values.artifacts.artifacts.push(f.artifact);
      f.values.artifacts.total_count++;
    },
    (f) => {
      f.values.runs.total_count = 101;
    },
    (f) => {
      f.values.artifacts.total_count = 3;
    },
    (f) => {
      f.values.artifacts.artifacts[1].expired = true;
    },
  ])(
    "candidate, stale, partial or ambiguous provenance selects fresh work",
    async (mutate) => {
      const f = fixture();
      mutate(f);
      expect(
        (await selectReferenceArtifact({ read: f.read, keySha256: key, now }))
          .available,
      ).toBe(false);
    },
  );

  test("never accepts a prefix-key or older attempt artifact by name", async () => {
    const f = fixture();
    f.values.artifacts.artifacts[0].name = `java-reference-${key}-100-1`;
    const miss = await selectReferenceArtifact({
      read: f.read,
      keySha256: key,
      now,
    });
    expect(miss).toMatchObject({
      available: false,
      reason: "NO_TRUSTED_REFERENCE_IN_WINDOW",
    });
  });

  test.each(["attempt", "digest", "expiry", "jobs"])(
    "rereads mutable %s after transfers",
    async (change) => {
      const f = fixture();
      const selected = await discoverReferenceArtifact({
        read: f.read,
        keySha256: key,
        now,
      });
      if (change === "attempt") f.values.run.run_attempt++;
      if (change === "digest")
        f.values.artifacts.artifacts[0].digest = `sha256:${"3".repeat(64)}`;
      if (change === "expiry") f.values.artifacts.artifacts[0].expired = true;
      if (change === "jobs") f.values.jobs.jobs[0].conclusion = "failure";
      await expect(
        rereadReferenceArtifact({ read: f.read, selection: selected, now }),
      ).rejects.toThrow();
    },
  );

  test("budget/service failures become diagnosed misses without weakening fresh qualification", async () => {
    const read = async () => {
      throw Object.assign(new Error("bounded failure"), {
        code: "LOOKUP_LIMIT_EXCEEDED",
      });
    };
    expect(
      await selectReferenceArtifact({ read, keySha256: key, now }),
    ).toMatchObject({
      available: false,
      reason: "LOOKUP_LIMIT_EXCEEDED",
    });
  });

  test("a concurrently seeded artifact clears the PR hint, while expiration/interruption reopens it", () => {
    expect(
      needsFullMainSeed({
        referenceEnabled: true,
        prBuiltFresh: true,
        availableNow: false,
      }),
    ).toBe(true);
    expect(
      needsFullMainSeed({
        referenceEnabled: true,
        prBuiltFresh: true,
        availableNow: true,
      }),
    ).toBe(false);
    expect(
      needsFullMainSeed({
        referenceEnabled: false,
        prBuiltFresh: true,
        availableNow: false,
      }),
    ).toBe(false);
  });
});
