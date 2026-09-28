import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyReviewedWebVowlMigration } from "./migration.mjs";

describe("native Git validation of reviewed consumer migrations", () => {
  let directory, consumer, patchPath, baselineCommit, reviewedAudit;
  const git = (cwd, args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const run = (overrides = {}) =>
    applyReviewedWebVowlMigration({
      reviewedAudit,
      sourceCommit: baselineCommit,
      patchPath,
      runGit: (args) => git(consumer, args),
      ...overrides,
    });
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "owlapi-reviewed-migration-"));
    const fixture = join(directory, "fixture");
    consumer = join(directory, "consumer");
    patchPath = join(directory, "reviewed.patch");
    mkdirSync(join(fixture, "src"), { recursive: true });
    git(fixture, ["init", "--quiet"]);
    writeFileSync(join(fixture, "src/use.js"), "target.getText();\n");
    git(fixture, ["add", "src/use.js"]);
    // Synthetic test repository only: no user branch or signing policy changes.
    git(fixture, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture baseline",
    ]);
    baselineCommit = git(fixture, ["rev-parse", "HEAD"]).trim();
    writeFileSync(join(fixture, "src/use.js"), "target.toString();\n");
    git(fixture, ["diff", "--binary", "--full-index", `--output=${patchPath}`]);
    git(directory, ["clone", "--quiet", "--no-hardlinks", fixture, consumer]);
    reviewedAudit = {
      baselineCommit,
      disposition: "MIGRATED",
      changedPaths: ["src/use.js"],
      migrationCommit: null,
      reviewedPatchSha256: createHash("sha256")
        .update(readFileSync(patchPath))
        .digest("hex"),
    };
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  test("applies exactly the reviewed patch to its immutable baseline", () => {
    expect(run()).toEqual({
      changedPaths: ["src/use.js"],
      reviewedPatchSha256: reviewedAudit.reviewedPatchSha256,
      migrationCommit: null,
    });
    expect(readFileSync(join(consumer, "src/use.js"), "utf8")).toBe(
      "target.toString();\n",
    );
  });
  test("rejects a changed patch before mutating the consumer", () => {
    writeFileSync(patchPath, "not the approved patch");
    expect(() => run()).toThrow(/digest/u);
    expect(git(consumer, ["status", "--porcelain"])).toBe("");
  });
  test("rejects a missing patch, unrelated source commit and unreviewed changed path", () => {
    expect(() => run({ patchPath: undefined })).toThrow(/patch/u);
    expect(() => run({ sourceCommit: "b".repeat(40) })).toThrow(/source/u);
    expect(() =>
      run({
        reviewedAudit: { ...reviewedAudit, changedPaths: ["src/other.js"] },
      }),
    ).toThrow(/paths/u);
  });
  test("does not accept an unverified migration commit", () => {
    expect(() =>
      run({
        reviewedAudit: { ...reviewedAudit, migrationCommit: "b".repeat(40) },
      }),
    ).toThrow();
  });
  test("zero-use audits require the exact baseline and cannot carry a migration patch", () => {
    const zero = { baselineCommit, disposition: "NO_OBSOLETE_USAGE" };
    expect(run({ reviewedAudit: zero, patchPath: undefined })).toBeNull();
    expect(() => run({ reviewedAudit: zero })).toThrow(/patch/u);
    expect(() =>
      run({
        reviewedAudit: zero,
        sourceCommit: "b".repeat(40),
        patchPath: undefined,
      }),
    ).toThrow(/baseline/u);
  });
});
