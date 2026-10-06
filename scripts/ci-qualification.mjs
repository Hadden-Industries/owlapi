/** Versioned CI qualification and direct execution lineage. No selective state is admitted. */
import { isDeepStrictEqual } from "node:util";
import {
  assertJavaReferenceState,
  JAVA_REFERENCE_POLICY,
  JAVA_REFERENCE_POLICY_SHA256,
} from "./java-reference-state.mjs";
import {
  assertCheckCoverage,
  evidenceFingerprint,
  JAVA_LIVE_INVENTORY,
} from "./ci-check-coverage.mjs";
import { OWL_CONTRACT_INVENTORY_SHA256 } from "./owl-contract-evidence.mjs";

export const CI_JOB_NAMES = Object.freeze({
  verification: "CI / verification strategy",
  metadata: "CI / metadata",
  source_node_22: "CI / Ubuntu / Node 22.23.3",
  source_node_24: "CI / Ubuntu / Node 24.21.0",
  quality_windows: "CI / Windows / quality tools",
  dependency_review: "CI / dependency review",
  candidate: "CI / retained candidate",
  portability_windows_node_22: "CI / Windows / Node 22.23.3",
  portability_windows_node_24: "CI / Windows / Node 24.21.0",
  portability_macos_node_22: "CI / macOS / Node 22.23.3",
  portability_macos_node_24: "CI / macOS / Node 24.21.0",
  browser_chromium: "CI / browser / Chromium",
  browser_firefox: "CI / browser / Firefox",
  browser_webkit: "CI / browser / WebKit",
  owl_contract: "CI / installed OWL contract",
  required: "CI / required",
});
export const CHECK_JOBS = Object.freeze({
  java: "source_node_24",
  owl_contract: "owl_contract",
});
/** All tracked bytes and exact hosted identity bind FULL coverage. External input
 * equivalence and independent selection authority are deliberately unproved;
 * this policy cannot authorize an omitted integration.
 */
export const QUALIFICATION_POLICY = Object.freeze({
  version: 4,
  mode: "FULL_ONLY",
  selectiveExecution: false,
  javaReferenceReuse: JAVA_REFERENCE_POLICY.enabled,
  javaReferencePolicySha256: JAVA_REFERENCE_POLICY_SHA256,
  externalInputEquivalence: "UNPROVEN",
  inventorySha256: evidenceFingerprint({
    java: JAVA_LIVE_INVENTORY,
    owl_contract: OWL_CONTRACT_INVENTORY_SHA256,
  }),
});
export const QUALIFICATION_POLICY_SHA256 =
  evidenceFingerprint(QUALIFICATION_POLICY);
const id = (value) => Number.isSafeInteger(value) && value > 0;
const sha = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
const digest = (value) =>
  typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
const fact = (condition, message) => {
  if (!condition) throw new Error(message);
};
const closed = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());

/** Reconstruct expected typed states and identities rather than trust SUCCESS alone. */
export const createQualificationChecks = ({
  context,
  evidence,
  role,
  original = null,
}) => {
  const result = {};
  for (const [check, job] of Object.entries(CHECK_JOBS)) {
    const execution = original ?? {
      role,
      runId: context.runId,
      runAttempt: context.runAttempt,
      commit: context.snapshot.commit,
    };
    const producingAttempt = evidence[check]?.runAttempt;
    fact(
      id(producingAttempt) && producingAttempt <= execution.runAttempt,
      "Check producing attempt is outside its qualified workflow run.",
    );
    const origin = { ...execution, runAttempt: producingAttempt };
    const observed = assertCheckCoverage(evidence[check], check, origin);
    result[check] = {
      applicability: original ? "UNCHANGED_INPUTS" : "REQUIRED",
      execution: original ? "NOT_RUN" : "SUCCESS",
      proof: original ? "ORIGINAL_EXECUTION_VERIFIED" : "CURRENT_EXECUTION",
      reason: original ? "MERGE_EQUIVALENT" : "FULL_REQUIRED",
      policySha256: QUALIFICATION_POLICY_SHA256,
      inputs: {
        trackedTree: context.snapshot.tree,
        hostSha256: evidenceFingerprint(context.host),
        externalEquivalence: "UNPROVEN",
      },
      evidence: observed,
      original: {
        role: origin.role,
        runId: origin.runId,
        runAttempt: origin.runAttempt,
        commit: origin.commit,
        job,
      },
    };
  }
  return result;
};

/** Strict v4 FULL/reused envelope. Unsupported versions/modes require fresh CI. */
export const assertQualificationRecord = (record) => {
  fact(
    closed(record, [
      "schemaVersion",
      "role",
      "mode",
      "sourceMode",
      "repository",
      "repositoryId",
      "runId",
      "runAttempt",
      "pullRequest",
      "recordedAt",
      "snapshot",
      "host",
      "jobs",
      "candidate",
      "policySha256",
      "checks",
      "source",
      "javaReference",
    ]),
    "Qualification record has an invalid closed schema.",
  );
  fact(
    record.schemaVersion === 4 &&
      ["PR", "MAIN"].includes(record.role) &&
      ["FULL", "REUSED"].includes(record.mode) &&
      record.sourceMode === "FULL" &&
      (record.mode !== "REUSED" || record.role === "MAIN") &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(record.repository ?? "") &&
      id(record.repositoryId) &&
      id(record.runId) &&
      id(record.runAttempt) &&
      (record.role === "PR"
        ? id(record.pullRequest)
        : record.pullRequest === null) &&
      Number.isFinite(Date.parse(record.recordedAt)) &&
      record.policySha256 === QUALIFICATION_POLICY_SHA256 &&
      isDeepStrictEqual(record.jobs, CI_JOB_NAMES) &&
      closed(record.snapshot, ["commit", "tree", "workflow", "parents"]) &&
      [
        record.snapshot.commit,
        record.snapshot.tree,
        record.snapshot.workflow,
      ].every(sha) &&
      Array.isArray(record.snapshot.parents) &&
      record.snapshot.parents.length <= 2 &&
      record.snapshot.parents.every(sha) &&
      (record.role !== "PR" || record.snapshot.parents.length === 2) &&
      closed(record.host, [
        "os",
        "architecture",
        "image",
        "imageVersion",
        "node",
      ]) &&
      record.host.os === "Linux" &&
      record.host.architecture === "X64" &&
      record.host.image === "ubuntu24" &&
      /^\d{8}\.\d+(?:\.\d+)?$/u.test(record.host.imageVersion ?? "") &&
      record.host.node === "v24.21.0" &&
      closed(record.candidate, ["id", "digest"]) &&
      id(record.candidate.id) &&
      digest(record.candidate.digest),
    "Qualification record has unsupported state, inputs or execution identity.",
  );
  assertJavaReferenceState(record.javaReference, {
    role: record.role,
    mode: record.mode,
    runId: record.runId,
    runAttempt: record.runAttempt,
    commit: record.snapshot.commit,
  });
  let original = null;
  if (record.mode === "REUSED") {
    fact(
      closed(record.source, [
        "role",
        "runId",
        "runAttempt",
        "commit",
        "receipt",
      ]) &&
        record.source.role === "PR" &&
        id(record.source.runId) &&
        id(record.source.runAttempt) &&
        sha(record.source.commit) &&
        closed(record.source.receipt, ["id", "digest"]) &&
        id(record.source.receipt.id) &&
        digest(record.source.receipt.digest),
      "Main qualification has no direct original PR proof.",
    );
    original = record.source;
  } else
    fact(
      record.source === null,
      "Fresh FULL qualification cannot inherit a proof pointer.",
    );
  fact(
    closed(record.checks, Object.keys(CHECK_JOBS)),
    "Qualification check inventory is incomplete.",
  );
  const expected = createQualificationChecks({
    context: {
      runId: record.runId,
      runAttempt: record.runAttempt,
      snapshot: record.snapshot,
      host: record.host,
    },
    evidence: Object.fromEntries(
      Object.keys(CHECK_JOBS).map((check) => [
        check,
        record.checks[check]?.evidence,
      ]),
    ),
    role: record.role,
    original,
  });
  fact(
    isDeepStrictEqual(record.checks, expected),
    "Qualification coverage has an invalid state, input or direct original pointer.",
  );
  fact(
    isDeepStrictEqual(
      record.checks.owl_contract.evidence.candidateArtifact,
      record.candidate,
    ),
    "OWL contract proof qualified a different candidate artifact.",
  );
  fact(
    Buffer.byteLength(JSON.stringify(record)) <= 64 * 1024,
    "Qualification payload exceeded 64 KiB.",
  );
  return record;
};

/** Partial reruns retain successful outputs from a bounded earlier producing attempt. */
export const coverageFromNeeds = (needs, identity) =>
  Object.fromEntries(
    Object.entries(CHECK_JOBS).map(([check, job]) => {
      let record;
      try {
        record = JSON.parse(needs[job]?.outputs?.coverage ?? "null");
      } catch {
        throw new Error("Required check coverage output is malformed.");
      }
      fact(
        id(identity.runAttempt) &&
          id(record?.runAttempt) &&
          record.runAttempt <= identity.runAttempt,
        "Required coverage producing attempt is outside the current workflow run.",
      );
      return [
        check,
        assertCheckCoverage(record, check, {
          ...identity,
          runAttempt: record.runAttempt,
        }),
      ];
    }),
  );

/** Reused aggregate output binds one validated FULL PR receipt, never a lineage chain. */
export const qualifiedSourceFromOutputs = (source) => {
  let record;
  try {
    record = JSON.parse(source.qualification ?? "null");
  } catch {
    throw new Error("Verified source qualification is malformed.");
  }
  assertQualificationRecord(record);
  fact(
    record.role === "PR" &&
      record.mode === "FULL" &&
      record.runId === Number(source.source_run_id) &&
      record.runAttempt === Number(source.source_run_attempt) &&
      record.snapshot.commit === source.source_commit &&
      record.candidate.id === Number(source.candidate_artifact_id) &&
      record.candidate.digest === source.candidate_artifact_digest &&
      id(Number(source.source_receipt_id)) &&
      digest(source.source_receipt_digest),
    "Verified output does not bind its original FULL source and artifacts.",
  );
  return record;
};
