import {
  badReleaseActions,
  classifyReleaseState,
  requiredManualHandoffs,
} from "./release-state.mjs";

const eligibleReconciliation = {
  enabled: true,
  sourceCommit: "a".repeat(40),
  tagTargetCommit: "a".repeat(40),
  qualificationResult: "PASS",
  publicationPreflightResult: "PASS",
  candidateArtifactVerified: true,
  githubReleaseAbsent: true,
  reproducedSha256: "b".repeat(64),
};

describe("release state classification", () => {
  test("permits the direct bootstrap only while both coordinate and tag are absent", () => {
    expect(
      classifyReleaseState({
        canonicalTagExists: false,
        registryVersion: null,
        retainedSha256: "a".repeat(64),
      }),
    ).toEqual({ action: "DIRECT_BOOTSTRAP_READY" });
  });

  test("reconciles an ambiguous write when the registry bytes match", () => {
    expect(
      classifyReleaseState({
        canonicalTagExists: true,
        registryVersion: {
          version: "0.1.0-alpha.0",
          tarballSha256: "a".repeat(64),
        },
        retainedSha256: "a".repeat(64),
      }),
    ).toEqual({ action: "VERIFY_EXISTING_PUBLICATION" });
  });

  test("blocks when an existing registry version has different bytes", () => {
    expect(() =>
      classifyReleaseState({
        canonicalTagExists: true,
        registryVersion: {
          version: "0.1.0-alpha.0",
          tarballSha256: "b".repeat(64),
        },
        retainedSha256: "a".repeat(64),
      }),
    ).toThrow(/registry bytes do not match/u);
  });

  test("abandons rather than moves a tag when publication is still absent", () => {
    expect(
      classifyReleaseState({
        canonicalTagExists: true,
        registryVersion: null,
        retainedSha256: "a".repeat(64),
      }),
    ).toEqual({ action: "ABANDON_TAGGED_VERSION" });
  });

  test("continues an unpublished tag only for a fully proved exact-artifact reconciliation", () => {
    expect(
      classifyReleaseState({
        canonicalTagExists: true,
        registryVersion: null,
        retainedSha256: "b".repeat(64),
        reconciliation: eligibleReconciliation,
      }),
    ).toEqual({ action: "RECONCILE_QUALIFIED_CANDIDATE" });
  });

  test("rejects reconciliation when the reproduced package bytes differ", () => {
    expect(() =>
      classifyReleaseState({
        canonicalTagExists: true,
        registryVersion: null,
        retainedSha256: "b".repeat(64),
        reconciliation: {
          ...eligibleReconciliation,
          reproducedSha256: "c".repeat(64),
        },
      }),
    ).toThrow(/reproduced package bytes/u);
  });

  test("rejects reconciliation metadata when no immutable tag exists", () => {
    expect(() =>
      classifyReleaseState({
        canonicalTagExists: false,
        registryVersion: null,
        retainedSha256: "b".repeat(64),
        reconciliation: eligibleReconciliation,
      }),
    ).toThrow(/requires an existing canonical tag/u);
  });
});

describe("bad release containment", () => {
  test("contains a defective alpha without unpublishing it", () => {
    expect(badReleaseActions({ channel: "next", production: false })).toEqual([
      "REMOVE_NEXT",
      "DEPRECATE_EXACT_VERSION",
      "PRESERVE_IMMUTABLE_EVIDENCE",
      "PREPARE_NEW_VERSION",
    ]);
  });
});

describe("manual release handoffs", () => {
  test("requires one continuation for direct bootstrap", () => {
    expect(requiredManualHandoffs("DIRECT_BOOTSTRAP")).toEqual([
      "TAG_ACCEPTED",
    ]);
  });

  test("requires publication confirmation after staged promotion", () => {
    expect(requiredManualHandoffs("OIDC_STAGED")).toEqual([
      "TAG_ACCEPTED",
      "PUBLICATION_CONFIRMED",
    ]);
  });
});
