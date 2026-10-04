import { isDeepStrictEqual } from "node:util";
import { evidenceFingerprint } from "./ci-check-coverage.mjs";

/** Activation requires the exact rights disposition and measured operating
 * acceptance. Implementation approval alone cannot populate these fields. */
export const JAVA_REFERENCE_POLICY = Object.freeze({
  version: 1,
  enabled: false,
  rights: "OWNER_ACCEPTED_SOURCE_NOTICE_CLOSURE",
  rightsSha256:
    "c31f01628662182ec041c4c30d9fc253a892d672fe8b4d883ff672d31b42a5d4",
  catalogueSha256:
    "c613ca6bb368dd90ae5dc8389cafbd5df56cd39314bf3988e2d352239e2d4798",
  operator: null,
  operatingAcceptanceSha256: null,
  repository: "Hadden-Industries/owlapi",
  repositoryId: 1347610640,
  retentionDays: 90,
  runWindow: 8,
  inventoryLimit: 100,
  payloadLimit: 128 * 1024 * 1024,
  lookupBudgetMs: 60_000,
  transferBudgetMs: 60_000,
  totalServiceBudgetMs: 120_000,
});
export const JAVA_REFERENCE_POLICY_SHA256 = evidenceFingerprint(
  JAVA_REFERENCE_POLICY,
);
const closed = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const hash = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const integer = (value) => Number.isSafeInteger(value) && value > 0;
const fact = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** Exercise activation obligations without enabling the production policy. */
export function assertJavaReferencePolicy(policy) {
  fact(
    closed(policy, Object.keys(JAVA_REFERENCE_POLICY)) &&
      policy.version === 1 &&
      typeof policy.enabled === "boolean" &&
      policy.repository === "Hadden-Industries/owlapi" &&
      policy.repositoryId === 1347610640 &&
      policy.rights === "OWNER_ACCEPTED_SOURCE_NOTICE_CLOSURE" &&
      hash(policy.rightsSha256) &&
      hash(policy.catalogueSha256) &&
      [
        policy.retentionDays,
        policy.runWindow,
        policy.inventoryLimit,
        policy.payloadLimit,
        policy.lookupBudgetMs,
        policy.transferBudgetMs,
        policy.totalServiceBudgetMs,
      ].every(integer) &&
      policy.retentionDays <= 90 &&
      policy.runWindow <= 8 &&
      policy.inventoryLimit <= 100 &&
      policy.payloadLimit <= 128 * 1024 * 1024 &&
      policy.lookupBudgetMs <= 60_000 &&
      policy.transferBudgetMs <= 60_000 &&
      policy.totalServiceBudgetMs <= 120_000,
    "Java reference policy is unsupported or unbounded.",
  );
  fact(
    !policy.enabled ||
      (typeof policy.operator === "string" &&
        /^[A-Za-z0-9_.-]{1,100}$/u.test(policy.operator) &&
        hash(policy.operatingAcceptanceSha256)),
    "Java reference activation requires named operating acceptance.",
  );
  return policy;
}

/** This validates typed materialization state, never behavioral coverage or a
 * self-reported producer. Service authentication and independent payload binding
 * occur separately; downloaded manifests cannot supply this consumer state. */
function validateJavaReferenceState(
  state,
  { role, mode, runId, runAttempt, commit },
  policy,
  policySha256,
) {
  if (state === null) {
    fact(
      !policy.enabled,
      "Enabled Java reference requires materialization evidence.",
    );
    return state;
  }
  fact(policy.enabled, "Java reference activation has not been accepted.");
  fact(
    closed(state, [
      "schemaVersion",
      "policySha256",
      "materialization",
      "inputs",
      "execution",
      "producer",
      "seedRequested",
      "publication",
    ]) &&
      state.schemaVersion === 1 &&
      state.policySha256 === policySha256 &&
      ["FRESH", "REUSED"].includes(state.materialization) &&
      (state.inputs === null
        ? state.materialization === "FRESH"
        : closed(state.inputs, [
            "keySha256",
            "inputRecordSha256",
            "runtimeGraphSha256",
            "hostSha256",
          ]) && Object.values(state.inputs).every(hash)) &&
      closed(state.execution, ["runId", "runAttempt", "commit"]) &&
      integer(state.execution.runId) &&
      integer(state.execution.runAttempt) &&
      /^[a-f0-9]{40}$/u.test(state.execution.commit ?? "") &&
      typeof state.seedRequested === "boolean",
    "Java reference materialization state is malformed.",
  );
  if (mode === "FULL")
    fact(
      state.execution.runId === runId &&
        state.execution.runAttempt <= runAttempt &&
        state.execution.commit === commit,
      "Java materialization belongs to another source or run.",
    );
  fact(
    state.seedRequested ===
      (role === "PR" &&
        state.materialization === "FRESH" &&
        state.inputs !== null),
    "Java seed hint has invalid state.",
  );
  if (state.materialization === "FRESH") {
    fact(
      state.producer === null,
      "A fresh Java build cannot claim a reused producer.",
    );
  } else {
    const producer = state.producer;
    fact(
      closed(producer, [
        "role",
        "runId",
        "runAttempt",
        "commit",
        "artifactId",
        "artifactDigest",
        "qualificationId",
        "qualificationDigest",
      ]) &&
        producer.role === "MAIN" &&
        integer(producer.runId) &&
        integer(producer.runAttempt) &&
        integer(producer.artifactId) &&
        integer(producer.qualificationId) &&
        producer.artifactId !== producer.qualificationId &&
        /^[a-f0-9]{40}$/u.test(producer.commit ?? "") &&
        /^sha256:[a-f0-9]{64}$/u.test(producer.artifactDigest ?? "") &&
        /^sha256:[a-f0-9]{64}$/u.test(producer.qualificationDigest ?? "") &&
        producer.runId !== state.execution.runId,
      "Reused Java bytes require a direct independently admitted main producer.",
    );
  }
  if (state.publication !== null) {
    const publication = state.publication;
    fact(
      role === "MAIN" &&
        mode === "FULL" &&
        state.materialization === "FRESH" &&
        state.inputs !== null &&
        state.execution.runAttempt === runAttempt &&
        closed(publication, [
          "artifactId",
          "artifactDigest",
          "manifestSha256",
          "inventorySha256",
          "provenanceSha256",
          "rightsSha256",
          "createdAt",
        ]) &&
        integer(publication.artifactId) &&
        /^sha256:[a-f0-9]{64}$/u.test(publication.artifactDigest ?? "") &&
        [
          publication.manifestSha256,
          publication.inventorySha256,
          publication.provenanceSha256,
          publication.rightsSha256,
        ].every(hash) &&
        publication.rightsSha256 === policy.rightsSha256 &&
        typeof publication.createdAt === "string" &&
        publication.createdAt.length <= 32 &&
        Number.isFinite(Date.parse(publication.createdAt)),
      "Java publication requires this accepted FULL main producer.",
    );
  }
  return state;
}

export function createJavaReferenceStateValidator(policy) {
  assertJavaReferencePolicy(policy);
  const policySha256 = evidenceFingerprint(policy);
  return (state, identity) =>
    validateJavaReferenceState(state, identity, policy, policySha256);
}

export const assertJavaReferenceState = createJavaReferenceStateValidator(
  JAVA_REFERENCE_POLICY,
);

export function javaReferenceFromNeeds(needs, identity) {
  let state;
  try {
    state = JSON.parse(needs.source_node_24?.outputs?.reference ?? "null");
  } catch {
    throw new Error("Java materialization output is malformed.");
  }
  return assertJavaReferenceState(state, identity);
}
