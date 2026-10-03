import { describe, expect, test } from "@jest/globals";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readGitSnapshot } from "./ci-verification-command.mjs";
import {
  APPLICABILITY_POLICY,
  observeCheckApplicability,
} from "./ci-check-applicability.mjs";

const narrative =
  "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-24T1130].md";

/** Real merge objects supply independent base/head/parent and filename fixtures. */
const withPullRequest = (change, inspect) => {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-applicability-"));
  try {
    const git = (...args) => {
      const result = spawnSync("git", args, {
        cwd: directory,
        encoding: "utf8",
        timeout: 10000,
      });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    const put = (path, text = "baseline\n") => {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), text);
    };
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.test");
    git("config", "commit.gpgsign", "false");
    put(narrative);
    put("index.js");
    put(".github/workflows/ci.yml");
    put("scripts/ci-check-applicability.mjs");
    git("add", ".");
    git("commit", "-m", "base");
    const base = git("rev-parse", "HEAD");
    git("switch", "-c", "candidate");
    change({ directory, put, git });
    git("add", ".");
    git("commit", "--allow-empty", "-m", "candidate");
    const head = git("rev-parse", "HEAD");
    git("switch", "main");
    git("merge", "--no-ff", "candidate", "-m", "test merge");
    const tested = git("rev-parse", "HEAD");
    const repository = { id: 1, full_name: "Hadden-Industries/owlapi" };
    const event = {
      number: 7,
      pull_request: {
        base: { sha: base, ref: "main", repo: repository },
        head: { sha: head, repo: repository },
      },
    };
    const options = {
      directory,
      event,
      eventName: "pull_request",
      sha: tested,
      ref: "refs/pull/7/merge",
      repository: repository.full_name,
      repositoryId: 1,
    };
    inspect({ options, git, put });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("CI integration applicability observation", () => {
  test("native npm packaging excludes every reviewed narrative without blanket Markdown exclusions", () => {
    const packed = spawnSync(
      process.execPath,
      [
        process.env.npm_execpath,
        "pack",
        "--dry-run",
        "--json",
        "--ignore-scripts",
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 },
    );
    expect(packed.status).toBe(0);
    const packRecords = JSON.parse(packed.stdout);
    const packResult = Array.isArray(packRecords)
      ? packRecords[0]
      : Object.values(packRecords)[0];
    expect(packResult).toBeDefined();
    const paths = packResult.files.map(({ path }) => path);
    for (const exclusion of APPLICABILITY_POLICY.exclusions)
      expect(paths).not.toContain(exclusion);
    expect(paths).toContain("README.md");
    expect(paths).toContain("docs/compatibility/capabilities.json");
  });

  test("a reviewed narrative change is only preliminary eligibility; missing proof requires both executions", () => {
    withPullRequest(
      ({ put }) => put(narrative, "changed historical review\n"),
      ({ options }) => {
        const report = observeCheckApplicability(options);
        expect(report.mode).toBe("OBSERVATION");
        for (const check of Object.values(report.checks)) {
          expect(check).toMatchObject({
            preliminary: "UNCHANGED_INPUTS",
            final: "REQUIRED",
            reason: "BASE_PROOF_MISSING",
          });
          expect(check.baseInputFingerprint).toBe(
            check.candidateInputFingerprint,
          );
        }
      },
    );
  });

  test.each([
    "index.js",
    "README.md",
    "docs/plans/new-requirement.md",
    process.platform === "win32"
      ? "strange ' Ω name with spaces.md"
      : "strange\nname\twith spaces.md",
    "renamed-review.md",
  ])("an added relevant or unknown input %s widens execution", (path) => {
    withPullRequest(
      ({ put }) => {
        put(narrative, "changed\n");
        put(path, "new input\n");
      },
      ({ options }) => {
        for (const check of Object.values(
          observeCheckApplicability(options).checks,
        )) {
          expect(check.preliminary).toBe("REQUIRED");
          expect(check.final).toBe("REQUIRED");
          expect(check.baseInputFingerprint).not.toBe(
            check.candidateInputFingerprint,
          );
        }
      },
    );
  });

  test("a renamed exclusion includes both endpoints and cannot exempt its new name", () => {
    withPullRequest(
      ({ git }) => git("mv", narrative, "renamed-review.md"),
      ({ options }) => {
        const report = observeCheckApplicability(options);
        expect(report.changedPaths).toEqual(
          expect.arrayContaining([narrative, "renamed-review.md"]),
        );
        expect(report.checks.java.preliminary).toBe("REQUIRED");
      },
    );
  });

  test("candidate control changes force both checks even when narrative inputs are also changed", () => {
    withPullRequest(
      ({ put }) => {
        put(narrative, "changed\n");
        put("scripts/ci-check-applicability.mjs", "self exemption\n");
      },
      ({ options }) => {
        expect(observeCheckApplicability(options).checks.java.reason).toBe(
          "CONTROL_CHANGED",
        );
      },
    );
  });

  test("forks, unsupported events, mismatched parents and dirty checkouts require execution", () => {
    withPullRequest(
      ({ put }) => put(narrative, "changed\n"),
      ({ options, put }) => {
        const cases = [
          { ...options, eventName: "push" },
          { ...options, sha: "f".repeat(40) },
          {
            ...options,
            event: {
              ...options.event,
              pull_request: {
                ...options.event.pull_request,
                head: {
                  ...options.event.pull_request.head,
                  sha: "e".repeat(40),
                },
              },
            },
          },
          {
            ...options,
            event: {
              ...options.event,
              pull_request: {
                ...options.event.pull_request,
                head: {
                  ...options.event.pull_request.head,
                  repo: { id: 2, full_name: "fork/owlapi" },
                },
              },
            },
          },
        ];
        const reasons = [
          "UNSUPPORTED_CONTEXT",
          "CHECKOUT_MISMATCH",
          "CHECKOUT_MISMATCH",
          "UNSUPPORTED_CONTEXT",
        ];
        for (const [index, invalid] of cases.entries()) {
          const report = observeCheckApplicability(invalid);
          expect(report.checks.java.final).toBe("REQUIRED");
          expect(report.checks.java.preliminary).toBe("UNKNOWN");
          expect(report.checks.java.reason).toBe(reasons[index]);
        }
        put("index.js", "uncommitted executable\n");
        expect(observeCheckApplicability(options).checks.java.preliminary).toBe(
          "UNKNOWN",
        );
        expect(observeCheckApplicability(options).checks.java.reason).toBe(
          "CHECKOUT_MISMATCH",
        );
      },
    );
  });

  test("an exhausted Git budget reports its stable reason and retains execution", () => {
    withPullRequest(
      ({ put }) => put(narrative, "changed\n"),
      ({ options }) => {
        const deadline = Date.now() - 1;
        expect(() => readGitSnapshot(options.directory, { deadline })).toThrow(
          expect.objectContaining({ code: "LOOKUP_LIMIT_EXCEEDED" }),
        );
        const report = observeCheckApplicability({ ...options, deadline });
        for (const check of Object.values(report.checks)) {
          expect(check.reason).toBe("LOOKUP_LIMIT_EXCEEDED");
          expect(check.final).toBe("REQUIRED");
        }
      },
    );
  });

  test("a shallow checkout with missing base objects reports unknown input and retains execution", () => {
    withPullRequest(
      ({ put }) => put(narrative, "changed\n"),
      ({ options }) => {
        const shallow = mkdtempSync(join(tmpdir(), "owlapi-shallow-"));
        try {
          const clone = spawnSync(
            "git",
            ["clone", "--depth", "1", "--no-local", options.directory, shallow],
            { encoding: "utf8", timeout: 10000 },
          );
          expect(clone.status).toBe(0);
          const missing = spawnSync(
            "git",
            ["cat-file", "-e", options.event.pull_request.base.sha],
            { cwd: shallow, encoding: "utf8", timeout: 10000 },
          );
          expect(missing.status).not.toBe(0);
          const report = observeCheckApplicability({
            ...options,
            directory: shallow,
          });
          for (const check of Object.values(report.checks)) {
            expect(check.reason).toBe("UNKNOWN_INPUT");
            expect(check.final).toBe("REQUIRED");
          }
        } finally {
          rmSync(shallow, { recursive: true, force: true });
        }
      },
    );
  });
});
