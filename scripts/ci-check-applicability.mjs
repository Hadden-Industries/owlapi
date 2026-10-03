import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readGitSnapshot } from "./ci-verification-command.mjs";

/** These two retained reviews are narrative evidence, excluded from the native npm package.
 * Source-quality tooling references only their names for ignore-policy checks; Java and
 * WebVOWL readers consume neither their bytes nor their recommendations as authority.
 * This inventory affects observation only. Any future omission needs independent approval.
 */
export const APPLICABILITY_POLICY = Object.freeze({
  schemaVersion: 1,
  mode: "OBSERVATION",
  javaReuse: false,
  exclusions: Object.freeze([
    "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-24T1130].md",
    "docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan [2026-08-25T0020].md",
  ]),
});

const sha = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const policyFingerprint = fingerprint(APPLICABILITY_POLICY);
const checks = ["java", "webvowl"];
const maximumGitBytes = 4 * 1024 * 1024;

/** Read a complete bounded native Git record. External diff/text conversion never runs. */
const readGit = (directory, args, deadline) => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("LOOKUP_LIMIT_EXCEEDED");
  const result = spawnSync("git", args, {
    cwd: directory,
    maxBuffer: maximumGitBytes,
    timeout: Math.min(10000, remaining),
    windowsHide: true,
  });
  if (
    result.status !== 0 ||
    result.error ||
    !result.stdout ||
    result.stdout.length >= maximumGitBytes
  )
    throw new Error(
      result.error?.code === "ETIMEDOUT" || result.error?.code === "ENOBUFS"
        ? "LOOKUP_LIMIT_EXCEEDED"
        : "UNKNOWN_INPUT",
    );
  return new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
};

const nulRecords = (value) => {
  if (value && !value.endsWith("\0")) throw new Error("UNKNOWN_INPUT");
  return value ? value.slice(0, -1).split("\0") : [];
};
const inputProjection = (directory, commit, deadline) => {
  const records = nulRecords(
    readGit(
      directory,
      ["ls-tree", "-r", "-z", "--full-tree", commit],
      deadline,
    ),
  );
  return records.filter((record) => {
    const boundary = record.indexOf("\t");
    if (boundary < 0) throw new Error("UNKNOWN_INPUT");
    const header = record.slice(0, boundary);
    // A symlink, gitlink or executable replacement of a narrative is a new input.
    return !(
      /^100644 blob [a-f0-9]{40}$/u.test(header) &&
      APPLICABILITY_POLICY.exclusions.includes(record.slice(boundary + 1))
    );
  });
};

/** Compare the captured base with the actual merge tree, never a truncated PR file API.
 * This diagnostic has no workflow outputs and cannot provide qualification evidence.
 * Final applicability is always REQUIRED until independently enforced v2 proof exists.
 */
export const observeCheckApplicability = ({
  directory = process.cwd(),
  event,
  eventName,
  sha: tested,
  ref,
  repository,
  repositoryId,
  now = Date.now(),
  deadline: requestedDeadline,
} = {}) => {
  const started = Date.now();
  const deadline = Math.min(
    requestedDeadline ?? started + 30000,
    started + 30000,
  );
  const result = {
    schemaVersion: 1,
    mode: "OBSERVATION",
    policyFingerprint,
    testedCommit: tested ?? null,
    changedPaths: [],
    checks: {},
  };
  try {
    const pr = event?.pull_request;
    const sameRepository = (value) =>
      value?.id === repositoryId && value?.full_name === repository;
    if (
      eventName !== "pull_request" ||
      repository !== "Hadden-Industries/owlapi" ||
      !Number.isSafeInteger(repositoryId) ||
      repositoryId <= 0 ||
      !Number.isSafeInteger(event?.number) ||
      event.number <= 0 ||
      ref !== `refs/pull/${event.number}/merge` ||
      pr?.base?.ref !== "main" ||
      !sameRepository(pr.base.repo) ||
      !sameRepository(pr.head.repo) ||
      ![tested, pr.base.sha, pr.head.sha].every(sha)
    )
      throw new Error("UNSUPPORTED_CONTEXT");
    const snapshot = readGitSnapshot(directory, { deadline });
    if (
      snapshot.commit !== tested ||
      snapshot.parents.length !== 2 ||
      snapshot.parents[0] !== pr.base.sha ||
      snapshot.parents[1] !== pr.head.sha
    )
      throw new Error("CHECKOUT_MISMATCH");
    if (
      readGit(
        directory,
        ["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
        deadline,
      )
    )
      throw new Error("CHECKOUT_MISMATCH");
    const changedPaths = nulRecords(
      readGit(
        directory,
        [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-renames",
          "--name-only",
          "-z",
          pr.base.sha,
          tested,
          "--",
        ],
        deadline,
      ),
    );
    const base = inputProjection(directory, pr.base.sha, deadline);
    const candidate = inputProjection(directory, tested, deadline);
    result.baseCommit = pr.base.sha;
    result.headCommit = pr.head.sha;
    result.testedTree = snapshot.tree;
    result.changedPaths = changedPaths;
    // The conservative model includes every tracked input except the exact narrative inventory.
    // Control changes get a distinct diagnostic; they are never self-approved exclusions.
    const controlChanged = changedPaths.some(
      (path) =>
        path.startsWith(".github/") ||
        path.startsWith("scripts/") ||
        [
          "package.json",
          "package-lock.json",
          "AGENTS.md",
          "CLAUDE.md",
        ].includes(path),
    );
    for (const check of checks) {
      const baseInputFingerprint = fingerprint({
        check,
        policyFingerprint,
        projection: base,
      });
      const candidateInputFingerprint = fingerprint({
        check,
        policyFingerprint,
        projection: candidate,
      });
      const unchanged =
        baseInputFingerprint === candidateInputFingerprint && !controlChanged;
      result.checks[check] = {
        preliminary: unchanged ? "UNCHANGED_INPUTS" : "REQUIRED",
        final: "REQUIRED",
        reason: controlChanged
          ? "CONTROL_CHANGED"
          : unchanged
            ? "BASE_PROOF_MISSING"
            : "INPUT_CHANGED",
        baseInputFingerprint,
        candidateInputFingerprint,
        proof: "UNAVAILABLE",
        execution: "PENDING",
      };
    }
  } catch (error) {
    const failureCode = error.code ?? error.message;
    const reason = [
      "UNSUPPORTED_CONTEXT",
      "CHECKOUT_MISMATCH",
      "LOOKUP_LIMIT_EXCEEDED",
    ].includes(failureCode)
      ? failureCode
      : "UNKNOWN_INPUT";
    for (const check of checks)
      result.checks[check] = {
        preliminary: "UNKNOWN",
        final: "REQUIRED",
        reason,
        proof: "UNAVAILABLE",
        execution: "PENDING",
      };
  }
  result.recordedAt = new Date(now).toISOString();
  result.elapsedMilliseconds = Date.now() - started;
  return result;
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  let event;
  try {
    event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  } catch {
    /* Invalid context remains full. */
  }
  const report = observeCheckApplicability({
    event,
    eventName: process.env.GITHUB_EVENT_NAME,
    sha: process.env.GITHUB_SHA,
    ref: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY,
    repositoryId: Number(process.env.GITHUB_REPOSITORY_ID),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `CI applicability observation: Java ${report.checks.java.preliminary} (${report.checks.java.reason}); WebVOWL ${report.checks.webvowl.preliminary} (${report.checks.webvowl.reason}). Both integrations remain REQUIRED. Elapsed ${report.elapsedMilliseconds} ms. Policy ${policyFingerprint}.\n`,
    );
}
