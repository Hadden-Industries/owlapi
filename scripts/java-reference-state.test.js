import { expect, test } from "@jest/globals";
import { evidenceFingerprint } from "./ci-check-coverage.mjs";
import {
  assertJavaReferencePolicy,
  assertJavaReferenceState,
  createJavaReferenceStateValidator,
  JAVA_REFERENCE_POLICY,
} from "./java-reference-state.mjs";

// Synthetic activation evidence exercises the complete state protocol. It does
// not enable the actual policy or represent a real owner/operating decision.
const policy = {
  ...JAVA_REFERENCE_POLICY,
  enabled: true,
  operator: "fixture-operator",
  operatingAcceptanceSha256: "f".repeat(64),
};
const validate = createJavaReferenceStateValidator(policy);
const identity = {
  role: "PR",
  mode: "FULL",
  runId: 100,
  runAttempt: 2,
  commit: "a".repeat(40),
};
const fixture = () => ({
  schemaVersion: 1,
  policySha256: evidenceFingerprint(policy),
  materialization: "FRESH",
  inputs: {
    keySha256: "1".repeat(64),
    inputRecordSha256: "2".repeat(64),
    runtimeGraphSha256: "3".repeat(64),
    hostSha256: "4".repeat(64),
  },
  execution: { runId: 100, runAttempt: 2, commit: identity.commit },
  producer: null,
  seedRequested: true,
  publication: null,
});
const producer = () => ({
  role: "MAIN",
  runId: 90,
  runAttempt: 1,
  commit: "b".repeat(40),
  artifactId: 40,
  artifactDigest: `sha256:${"c".repeat(64)}`,
  qualificationId: 41,
  qualificationDigest: `sha256:${"d".repeat(64)}`,
});

test("keeps current activation disabled despite the specific recorded rights disposition", () => {
  expect(JAVA_REFERENCE_POLICY.enabled).toBe(false);
  expect(JAVA_REFERENCE_POLICY.rights).toBe(
    "OWNER_ACCEPTED_SOURCE_NOTICE_CLOSURE",
  );
  expect(assertJavaReferenceState(null, identity)).toBeNull();
  expect(() => assertJavaReferenceState(fixture(), identity)).toThrow(
    /activation/u,
  );
});
test.each([
  "operator",
  "operatingAcceptanceSha256",
  "rightsSha256",
  "catalogueSha256",
])("activation requires actual %s", (field) => {
  expect(() =>
    assertJavaReferencePolicy({ ...policy, [field]: null }),
  ).toThrow();
});
test("records fresh materialization independently of fresh behavior and requests a reevaluated seed", () => {
  expect(validate(fixture(), identity)).toEqual(fixture());
  expect(() => validate(null, identity)).toThrow(/evidence/u);
});
test("an unverifiable key still records fresh materialization without claiming a seed or upload", () => {
  const state = { ...fixture(), inputs: null, seedRequested: false };
  expect(validate(state, identity)).toEqual(state);
  expect(() =>
    validate(
      { ...state, materialization: "REUSED", producer: producer() },
      identity,
    ),
  ).toThrow();
});
test("records direct admitted main product identity for reused bytes and preserves it across normal merge", () => {
  const state = {
    ...fixture(),
    materialization: "REUSED",
    producer: producer(),
    seedRequested: false,
  };
  expect(validate(state, identity)).toEqual(state);
  expect(
    validate(state, {
      ...identity,
      role: "MAIN",
      mode: "REUSED",
      runId: 101,
      commit: "e".repeat(40),
    }),
  ).toEqual(state);
});
test.each([
  (state) => {
    state.policySha256 = "e".repeat(64);
  },
  (state) => {
    state.execution.runId++;
  },
  (state) => {
    state.execution.runAttempt = 3;
  },
  (state) => {
    state.execution.commit = "b".repeat(40);
  },
  (state) => {
    state.producer = producer();
  },
  (state) => {
    state.seedRequested = false;
  },
  (state) => {
    state.inputs.extra = "e".repeat(64);
  },
])(
  "rejects malformed, foreign or unaccepted fresh materialization",
  (mutate) => {
    const state = fixture();
    mutate(state);
    expect(() => validate(state, identity)).toThrow();
  },
);
test.each([
  (state) => {
    state.producer = null;
  },
  (state) => {
    state.producer.role = "PR";
  },
  (state) => {
    state.producer.runId = 100;
  },
  (state) => {
    state.producer.artifactId = 41;
  },
  (state) => {
    state.producer.artifactDigest = "claimed";
  },
  (state) => {
    state.producer.extra = true;
  },
])("reused Java bytes cannot lose their direct producer binding", (mutate) => {
  const state = {
    ...fixture(),
    materialization: "REUSED",
    producer: producer(),
    seedRequested: false,
  };
  mutate(state);
  expect(() => validate(state, identity)).toThrow();
});
test("only the current FULL fresh main attempt can bind an upload", () => {
  const state = {
    ...fixture(),
    seedRequested: false,
    publication: {
      artifactId: 40,
      artifactDigest: `sha256:${"c".repeat(64)}`,
      manifestSha256: "5".repeat(64),
      inventorySha256: "6".repeat(64),
      provenanceSha256: "7".repeat(64),
      rightsSha256: policy.rightsSha256,
      createdAt: "2026-10-04T00:00:00Z",
    },
  };
  expect(validate(state, { ...identity, role: "MAIN" })).toEqual(state);
  expect(() => validate(state, identity)).toThrow();
  expect(() =>
    validate(state, { ...identity, role: "MAIN", mode: "REUSED" }),
  ).toThrow();
  expect(() =>
    validate(state, { ...identity, role: "MAIN", runAttempt: 3 }),
  ).toThrow();
  state.publication.rightsSha256 = "e".repeat(64);
  expect(() => validate(state, { ...identity, role: "MAIN" })).toThrow();
});
