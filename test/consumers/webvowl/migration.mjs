import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Git validates and applies its own patch format; these are approval bindings. */
export const applyReviewedWebVowlMigration = ({
  reviewedAudit,
  sourceCommit,
  patchPath,
  runGit,
}) => {
  if (reviewedAudit.disposition === "NO_OBSOLETE_USAGE") {
    if (patchPath)
      throw new Error("A zero-use audit cannot apply a migration patch.");
    if (sourceCommit !== reviewedAudit.baselineCommit)
      throw new Error("The source must match the reviewed audit baseline.");
    return null;
  }
  if (reviewedAudit.disposition !== "MIGRATED" || !patchPath)
    throw new Error(
      "MIGRATED qualification requires the exact reviewed patch.",
    );
  if (
    sourceCommit !== reviewedAudit.baselineCommit &&
    sourceCommit !== reviewedAudit.migrationCommit
  ) {
    throw new Error(
      "The source is neither the reviewed baseline nor the authorized migration commit.",
    );
  }
  const patchSha256 = createHash("sha256")
    .update(readFileSync(patchPath))
    .digest("hex");
  if (patchSha256 !== reviewedAudit.reviewedPatchSha256)
    throw new Error("The reviewed migration patch digest does not match.");
  if (
    runGit(["rev-parse", "HEAD"]).trim() !== reviewedAudit.baselineCommit ||
    runGit(["status", "--porcelain=v1"]).trim()
  ) {
    throw new Error(
      "Apply the reviewed patch only in a clean disposable baseline checkout.",
    );
  }
  runGit(["apply", "--check", "--index", "--whitespace=error-all", patchPath]);
  runGit(["apply", "--index", "--whitespace=error-all", patchPath]);
  const changedPaths = runGit(["diff", "--cached", "--name-only", "-z"])
    .split("\0")
    .filter(Boolean)
    .sort();
  if (
    JSON.stringify(changedPaths) !==
      JSON.stringify([...(reviewedAudit.changedPaths ?? [])].sort()) ||
    changedPaths.length === 0
  ) {
    throw new Error(
      "Applied migration paths differ from the reviewed changed paths.",
    );
  }
  if (reviewedAudit.migrationCommit) {
    runGit([
      "merge-base",
      "--is-ancestor",
      reviewedAudit.baselineCommit,
      reviewedAudit.migrationCommit,
    ]);
    const appliedTree = runGit(["write-tree"]).trim();
    const authorizedTree = runGit([
      "rev-parse",
      `${reviewedAudit.migrationCommit}^{tree}`,
    ]).trim();
    if (appliedTree !== authorizedTree)
      throw new Error(
        "The authorized migration commit is not byte-identical to the reviewed patch result.",
      );
    runGit(["verify-commit", reviewedAudit.migrationCommit]);
  }
  return {
    changedPaths,
    reviewedPatchSha256: patchSha256,
    migrationCommit: reviewedAudit.migrationCommit ?? null,
  };
};
