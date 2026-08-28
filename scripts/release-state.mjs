const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const assertSha256 = (value, label) => {
  if (!SHA256_PATTERN.test(value ?? "")) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
};

const assertExactArtifactReconciliation = (reconciliation, retainedSha256) => {
  if (reconciliation.enabled !== true) {
    throw new Error("Exact-artifact reconciliation is not enabled.");
  }
  if (
    !/^[0-9a-f]{40}$/u.test(reconciliation.sourceCommit ?? "") ||
    reconciliation.tagTargetCommit !== reconciliation.sourceCommit
  ) {
    throw new Error(
      "Exact-artifact reconciliation does not bind the tag target to its source commit.",
    );
  }
  if (reconciliation.qualificationResult !== "PASS") {
    throw new Error(
      "Exact-artifact reconciliation lacks successful qualification.",
    );
  }
  if (reconciliation.publicationPreflightResult !== "PASS") {
    throw new Error(
      "Exact-artifact reconciliation lacks successful publication preflight.",
    );
  }
  if (reconciliation.candidateArtifactVerified !== true) {
    throw new Error(
      "Exact-artifact reconciliation lacks a verified retained artifact.",
    );
  }
  if (reconciliation.githubReleaseAbsent !== true) {
    throw new Error(
      "Exact-artifact reconciliation requires the GitHub release to remain absent.",
    );
  }
  assertSha256(reconciliation.reproducedSha256, "Reproduced tarball");
  if (reconciliation.reproducedSha256 !== retainedSha256) {
    throw new Error(
      "Exact-artifact reconciliation reproduced package bytes that differ from the retained candidate.",
    );
  }
};

/**
 * Classify remote state before any publication attempt. Keeping this policy
 * pure is intentional: a workflow may observe external state, but it must not
 * silently turn an ambiguous response into a second registry mutation.
 */
export const classifyReleaseState = ({
  canonicalTagExists,
  registryVersion,
  retainedSha256,
  reconciliation,
}) => {
  assertSha256(retainedSha256, "Retained tarball");
  if (reconciliation && !canonicalTagExists) {
    throw new Error(
      "Exact-artifact reconciliation requires an existing canonical tag.",
    );
  }

  if (registryVersion) {
    assertSha256(registryVersion.tarballSha256, "Registry tarball");
    if (registryVersion.tarballSha256 !== retainedSha256) {
      throw new Error(
        "The registry bytes do not match the retained release candidate.",
      );
    }
    return { action: "VERIFY_EXISTING_PUBLICATION" };
  }

  if (canonicalTagExists) {
    if (reconciliation) {
      assertExactArtifactReconciliation(reconciliation, retainedSha256);
      return { action: "RECONCILE_QUALIFIED_CANDIDATE" };
    }
    return { action: "ABANDON_TAGGED_VERSION" };
  }
  return { action: "DIRECT_BOOTSTRAP_READY" };
};

export const badReleaseActions = ({ channel, production }) => {
  if (channel !== "next" || production) {
    throw new Error("The alpha containment policy requires the next channel.");
  }
  return [
    "REMOVE_NEXT",
    "DEPRECATE_EXACT_VERSION",
    "PRESERVE_IMMUTABLE_EVIDENCE",
    "PREPARE_NEW_VERSION",
  ];
};

export const requiredManualHandoffs = (mode) => {
  if (mode === "DIRECT_BOOTSTRAP") {
    return ["TAG_ACCEPTED"];
  }
  if (mode === "OIDC_STAGED") {
    return ["TAG_ACCEPTED", "PUBLICATION_CONFIRMED"];
  }
  throw new Error(`Unsupported publication mode ${mode}.`);
};
