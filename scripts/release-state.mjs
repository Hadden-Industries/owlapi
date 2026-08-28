const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const assertSha256 = (value, label) => {
  if (!SHA256_PATTERN.test(value ?? "")) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
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
}) => {
  assertSha256(retainedSha256, "Retained tarball");

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
