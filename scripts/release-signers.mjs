const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const assertDate = (value, label) => {
  if (!DATE_PATTERN.test(value ?? "")) {
    throw new Error(`${label} must be an ISO calendar date.`);
  }
};

export const selectAuthorizedSigner = (
  registry,
  { fingerprint, releaseDate },
) => {
  assertDate(releaseDate, "Release date");
  const matches = (registry?.signers ?? []).filter(
    (signer) => signer.fingerprint === fingerprint,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Release signer ${fingerprint} is not uniquely registered.`,
    );
  }
  const signer = matches[0];
  const admitted = signer.validFrom <= releaseDate;
  const stillValid =
    signer.status === "ACTIVE" &&
    !signer.revokedOn &&
    (!signer.validUntil || releaseDate <= signer.validUntil);
  if (!admitted || !stillValid) {
    throw new Error(
      `Release signer ${fingerprint} was not authorized on ${releaseDate}.`,
    );
  }
  return signer;
};

/**
 * Git's SSH verifier consumes one principal and key per line. Sorting by the
 * stable signer identifier makes the generated trust input reviewable and
 * independent of JSON array order.
 */
export const buildAllowedSigners = (registry) =>
  `${[...(registry?.signers ?? [])]
    .filter(({ status }) => status === "ACTIVE")
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
    .map(({ githubIdentity, publicKey }) => `${githubIdentity} ${publicKey}`)
    .join("\n")}\n`;

export const assertReleaseTag = ({
  actualTag,
  expectedTag,
  objectType,
  targetCommit,
  expectedCommit,
  fingerprint,
  githubVerification,
  registry,
  releaseDate,
}) => {
  if (actualTag !== expectedTag) {
    throw new Error(`Release tag ${actualTag} is not ${expectedTag}.`);
  }
  if (objectType !== "tag") {
    throw new Error(`${actualTag} is not an annotated tag.`);
  }
  if (targetCommit !== expectedCommit) {
    throw new Error(
      `${actualTag} targets ${targetCommit}, not captured commit ${expectedCommit}.`,
    );
  }
  if (
    githubVerification?.verified !== true ||
    githubVerification.reason !== "valid"
  ) {
    throw new Error(
      `GitHub did not verify ${actualTag}: ${githubVerification?.reason ?? "missing verification"}.`,
    );
  }
  const signer = selectAuthorizedSigner(registry, {
    fingerprint,
    releaseDate,
  });
  return {
    result: "PASS",
    signerId: signer.id,
    fingerprint: signer.fingerprint,
    verifiedAt: githubVerification.verified_at ?? null,
  };
};
