import { expect, test } from "@jest/globals";
import { evidenceFingerprint } from "./ci-check-coverage.mjs";
import { JAVA_REFERENCE_POLICY } from "./java-reference-state.mjs";
import {
  referencePublicationProvenance,
  referencePublicationState,
} from "./java-reference-publication.mjs";

const policy = {
  ...JAVA_REFERENCE_POLICY,
  enabled: true,
  operator: "fixture-operator",
  operatingAcceptanceSha256: "f".repeat(64),
};
const fixture = () => {
  const commit = "a".repeat(40);
  return {
    policy,
    environment: {
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      GITHUB_SHA: commit,
      GITHUB_RUN_ID: "100",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_REPOSITORY: policy.repository,
      GITHUB_REPOSITORY_ID: String(policy.repositoryId),
    },
    event: {
      ref: "refs/heads/main",
      after: commit,
      deleted: false,
      repository: { id: policy.repositoryId, full_name: policy.repository },
    },
    snapshot: { commit, tree: "b".repeat(40), workflow: "c".repeat(40) },
    state: {
      schemaVersion: 1,
      policySha256: evidenceFingerprint(policy),
      materialization: "FRESH",
      inputs: {
        keySha256: "1".repeat(64),
        inputRecordSha256: "2".repeat(64),
        runtimeGraphSha256: "3".repeat(64),
        hostSha256: "4".repeat(64),
      },
      execution: { runId: 100, runAttempt: 2, commit },
      producer: null,
      seedRequested: false,
      publication: null,
    },
    now: "2026-10-04T00:00:00.000Z",
  };
};
test("rights approval alone cannot authorize a publication", () => {
  expect(() =>
    referencePublicationProvenance({
      ...fixture(),
      policy: JAVA_REFERENCE_POLICY,
    }),
  ).toThrow(/activation/u);
});
test.each(["PR", "fork", "branch", "rerun", "unkeyed", "reused", "source"])(
  "rejects an ineligible publication producer: %s",
  (mutation) => {
    const value = fixture();
    if (mutation === "PR") value.environment.GITHUB_EVENT_NAME = "pull_request";
    if (mutation === "fork") value.event.repository.id++;
    if (mutation === "branch") value.event.ref = "refs/heads/feature";
    if (mutation === "rerun") value.state.execution.runAttempt = 1;
    if (mutation === "unkeyed") value.state.inputs = null;
    if (mutation === "reused") value.state.materialization = "REUSED";
    if (mutation === "source") value.environment.GITHUB_SHA = "d".repeat(40);
    expect(() => referencePublicationProvenance(value)).toThrow();
  },
);
test("binds the service upload to exact executed inputs and unchanged coverage state", () => {
  const value = fixture();
  const provenance = referencePublicationProvenance(value);
  const product = {
    provenance,
    payloadBytes: 1024,
    expected: {
      inputKeySha256: value.state.inputs.keySha256,
      inputRecordSha256: value.state.inputs.inputRecordSha256,
      runtimeGraphSha256: value.state.inputs.runtimeGraphSha256,
      rightsSha256: policy.rightsSha256,
      manifestSha256: "5".repeat(64),
      inventorySha256: "6".repeat(64),
      provenanceSha256: evidenceFingerprint(provenance),
    },
  };
  const args = {
    policy,
    state: value.state,
    product,
    artifactId: 500,
    artifactDigest: `sha256:${"7".repeat(64)}`,
  };
  const result = referencePublicationState(args);
  expect({ ...result, publication: null }).toEqual(value.state);
  expect(result.publication.artifactId).toBe(500);
  for (const field of [
    "inputKeySha256",
    "inputRecordSha256",
    "runtimeGraphSha256",
    "rightsSha256",
    "provenanceSha256",
  ])
    expect(() =>
      referencePublicationState({
        ...args,
        product: {
          ...product,
          expected: { ...product.expected, [field]: "e".repeat(64) },
        },
      }),
    ).toThrow();
  expect(() =>
    referencePublicationState({ ...args, artifactDigest: "unverified" }),
  ).toThrow();
});
