import { jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertPublicRegistryFacts,
  qualifyPublicRegistry,
  readPublicationAttempt,
} from "./qualify-public-registry.mjs";

const version = "0.1.0-rc.2";
const retainedSha256 = "a".repeat(64);

describe("fresh public-registry qualification", () => {
  test("accepts the exact prerelease under both next and latest", () => {
    expect(
      assertPublicRegistryFacts({
        expectedVersion: version,
        retainedSha256,
        metadata: {
          name: "@hadden-industries/owlapi",
          version,
          dist: {
            integrity: "sha512-example",
            tarball: `https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-${version}.tgz`,
          },
        },
        distTags: { next: version, latest: version },
        registryTarballSha256: retainedSha256,
      }),
    ).toEqual({
      coordinate: `@hadden-industries/owlapi@${version}`,
      channel: "next",
      next: version,
      latest: version,
      integrity: "sha512-example",
      tarballSha256: retainedSha256,
    });
  });

  test.each([
    ["a stale next tag", { distTags: { next: "0.1.0-alpha.1" } }],
    [
      "a stale latest tag",
      { distTags: { next: version, latest: "0.1.0-rc.1" } },
    ],
    ["different registry bytes", { registryTarballSha256: "b".repeat(64) }],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      assertPublicRegistryFacts({
        expectedVersion: version,
        retainedSha256,
        metadata: {
          name: "@hadden-industries/owlapi",
          version,
          dist: {
            integrity: "sha512-example",
            tarball: "https://registry.npmjs.org/tarball",
          },
        },
        distTags: { next: version },
        registryTarballSha256: retainedSha256,
        ...override,
      }),
    ).toThrow();
  });
});

const publicationFixture = () => {
  const env = {
    GITHUB_REPOSITORY: "Hadden-Industries/owlapi",
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ID: "123",
    GITHUB_SHA: "a".repeat(40),
  };
  const write = {
    name: "Perform the authorized publication and exact-version channel writes",
    status: "completed",
    conclusion: "success",
    completed_at: "2026-10-10T00:00:00Z",
  };
  const job = {
    id: 12,
    name: "Release / npm trusted publisher",
    run_id: 123,
    head_sha: env.GITHUB_SHA,
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
    steps: [write],
  };
  const run = {
    head_sha: env.GITHUB_SHA,
    path: ".github/workflows/release.yml",
  };
  const client = {
    read: jest.fn(async (path) =>
      path.includes("/jobs?") ? { jobs: [job] } : run,
    ),
  };
  return {
    env,
    job,
    write,
    run,
    client,
    read: () => readPublicationAttempt({ env, client }),
  };
};

test("reads the original write timestamp even when verification is resumed", async () => {
  const f = publicationFixture();
  expect(await f.read()).toMatchObject({
    state: "PUBLICATION_ACCEPTED",
    runAttempt: 1,
    jobId: 12,
    acceptedAt: f.write.completed_at,
  });
  expect(f.client.read).toHaveBeenCalledWith(
    "/actions/runs/123/attempts/1/jobs?per_page=100",
  );
  f.write.conclusion = "failure";
  f.job.conclusion = "failure";
  expect(await f.read()).toMatchObject({
    state: "PUBLICATION_ATTEMPTED",
    acceptedAt: null,
  });
});

test.each(["skipped", "missing", "source", "attempt", "workflow"])(
  "refuses unavailable or unbound original publication: %s",
  async (change) => {
    const f = publicationFixture();
    if (change === "skipped") f.write.conclusion = "skipped";
    if (change === "missing") f.job.steps = [];
    if (change === "source") f.job.head_sha = "b".repeat(40);
    if (change === "attempt") f.job.run_attempt = 2;
    if (change === "workflow") f.run.path = ".github/workflows/other.yml";
    await expect(f.read()).rejects.toThrow();
  },
);

const reportFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-registry-report-test-"));
  const outputPath = join(directory, "report.json");
  const tarball = Buffer.from("approved test artifact");
  const metadata = {
    name: "@hadden-industries/owlapi",
    version,
    dist: {
      tarball: `https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-${version}.tgz`,
      integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    },
  };
  const options = {
    candidate: {
      package: { version },
      tarball: { sha256: createHash("sha256").update(tarball).digest("hex") },
    },
    outputPath,
    publication: async () => ({
      state: "PUBLICATION_ACCEPTED",
      acceptedAt: "2026-10-10T00:00:00Z",
    }),
    wait: jest.fn(async ({ observe }) => {
      observe({ state: "REGISTRY_AVAILABLE", elapsedMs: 1000 });
      return {
        metadata,
        tarball,
        distTags: { next: version, latest: version },
      };
    }),
    verifyConsumers: jest.fn(async () => ({ consumer: {}, provenance: {} })),
    now: () => "2026-10-10T00:10:00Z",
    log: () => {},
  };
  return {
    options,
    read: () => JSON.parse(readFileSync(outputPath, "utf8")),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
};

test("retains pending observations before verification, and measures acceptance across setup delay", async () => {
  const f = reportFixture();
  try {
    f.options.verifyConsumers = jest.fn(async () => {
      expect(f.read()).toMatchObject({
        result: "REGISTRY_AVAILABLE",
        acceptedToAvailableMs: 600000,
        observations: [{ state: "REGISTRY_AVAILABLE" }],
      });
      return { consumer: {}, provenance: {} };
    });
    await qualifyPublicRegistry(f.options);
    expect(f.read()).toMatchObject({
      result: "PASS",
      availability: {
        acceptedToAvailableMs: 600000,
        observations: [
          { state: "REGISTRY_AVAILABLE" },
          { state: "VERIFICATION_PASSED" },
        ],
      },
    });
  } finally {
    f.cleanup();
  }
});

test.each(["AVAILABILITY_INCOMPLETE", "INTEGRITY_CONFLICT"])(
  "retains observations and failure details for %s",
  async (code) => {
    const f = reportFixture();
    try {
      f.options.wait = async ({ observe }) => {
        expect(f.read().result).toBe("AVAILABILITY_PENDING");
        observe({
          state: "AVAILABILITY_PENDING",
          stage: "metadata",
          attempt: 1,
        });
        throw Object.assign(new Error("test failure"), { code });
      };
      await expect(qualifyPublicRegistry(f.options)).rejects.toThrow(
        "test failure",
      );
      expect(f.read()).toMatchObject({
        result: code === "AVAILABILITY_INCOMPLETE" ? code : "FAIL",
        error: "test failure",
        finishedAt: "2026-10-10T00:10:00Z",
        observations: [{ stage: "metadata", attempt: 1 }],
      });
      expect(f.options.verifyConsumers).not.toHaveBeenCalled();
    } finally {
      f.cleanup();
    }
  },
);

test("does not wait or blame registry availability when original publication was not attempted", async () => {
  const f = reportFixture();
  try {
    f.options.publication = async () => {
      throw new Error("No completed publication attempt");
    };
    await expect(qualifyPublicRegistry(f.options)).rejects.toThrow(
      "No completed publication attempt",
    );
    expect(f.options.wait).not.toHaveBeenCalled();
    expect(f.read()).toMatchObject({
      result: "FAIL",
      observations: [],
      error: "No completed publication attempt",
    });
  } finally {
    f.cleanup();
  }
});
