import { createHash, createPublicKey } from "node:crypto";
import { createRequire } from "node:module";
import pacote from "pacote";
import { readPublicRegistry } from "./public-registry-read.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PACKAGE_PURL,
  NPM_REGISTRY,
  assertPackageIdentity,
} from "./package-identity.mjs";

const repository = "https://github.com/Hadden-Industries/owlapi";
const workflow = ".github/workflows/release.yml";
const sourceRef = "refs/heads/main";
const predicateType = "https://slsa.dev/provenance/v1";
// Use the verifier shipped with our pinned pacote dependency, without adding a runtime dependency.
const require = createRequire(import.meta.url);
const { verify } = createRequire(require.resolve("pacote"))("sigstore");

/** Bind authenticated provenance to this run; a later verification attempt preserves the original publisher. */
export const assertReleaseProvenance = ({
  statement,
  tarball,
  commit,
  runId,
  runAttempt,
}) => {
  const definition = statement?.predicate?.buildDefinition;
  const external = definition?.externalParameters?.workflow;
  const dependencies = definition?.resolvedDependencies;
  const details = statement?.predicate?.runDetails;
  const invocation =
    /^https:\/\/github\.com\/Hadden-Industries\/owlapi\/actions\/runs\/(?<runId>[1-9][0-9]*)\/attempts\/(?<runAttempt>[1-9][0-9]*)$/u.exec(
      details?.metadata?.invocationId ?? "",
    );
  const publicationAttempt = Number(invocation?.groups?.runAttempt);
  if (
    !/^[0-9a-f]{40}$/u.test(commit ?? "") ||
    !/^[1-9][0-9]*$/u.test(String(runId ?? "")) ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1 ||
    statement?._type !== "https://in-toto.io/Statement/v1" ||
    statement.predicateType !== predicateType ||
    statement.subject?.length !== 1 ||
    statement.subject[0].name !== PACKAGE_PURL ||
    statement.subject[0].digest?.sha512 !==
      createHash("sha512").update(tarball).digest("hex") ||
    definition?.buildType !==
      "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1" ||
    external?.repository !== repository ||
    external.path !== workflow ||
    external.ref !== sourceRef ||
    dependencies?.length !== 1 ||
    dependencies[0].uri !== `git+${repository}@${sourceRef}` ||
    dependencies[0].digest?.gitCommit !== commit ||
    details?.builder?.id !==
      "https://github.com/actions/runner/github-hosted" ||
    invocation?.groups?.runId !== String(runId) ||
    !Number.isSafeInteger(publicationAttempt) ||
    publicationAttempt > runAttempt
  ) {
    throw new Error(
      "Registry provenance does not bind the scoped RC to this release source, run and tarball.",
    );
  }
  return {
    sourceCommit: dependencies[0].digest.gitCommit,
    sourceRef: external.ref,
    workflow: external.path,
    subjectSha256: createHash("sha256").update(tarball).digest("hex"),
    runId: invocation.groups.runId,
    runAttempt: publicationAttempt,
  };
};

/** Verify signatures and the signing identity before accepting any provenance fields. */
export const verifyRegistryProvenance = async ({
  metadata,
  tarball,
  cache,
  commit,
  runId,
  runAttempt,
}) => {
  assertPackageIdentity(metadata);
  const bytes = await readPublicRegistry(
    new URL("-/npm/v1/keys", NPM_REGISTRY),
  );
  const { keys } = JSON.parse(bytes.toString("utf8"));
  const verified = await pacote.manifest(`${PACKAGE_NAME}@${PACKAGE_VERSION}`, {
    registry: NPM_REGISTRY,
    cache,
    fullMetadata: true,
    preferOnline: true,
    resolved: metadata.dist.tarball,
    integrity: metadata.dist.integrity,
    verifySignatures: true,
    verifyAttestations: true,
    "//registry.npmjs.org/:_keys": keys.map((key) => ({
      ...key,
      pemkey: createPublicKey({
        key: Buffer.from(key.key, "base64"),
        format: "der",
        type: "spki",
      }).export({ format: "pem", type: "spki" }),
    })),
  });
  assertPackageIdentity(verified);
  if (
    verified._resolved !== metadata.dist.tarball ||
    verified._integrity !== metadata.dist.integrity ||
    !verified._signatures?.length
  ) {
    throw new Error(
      "Authenticated registry metadata differs from the verified tarball.",
    );
  }
  const bundles = (verified._attestationBundles ?? []).filter(
    (item) => item.predicateType === predicateType,
  );
  if (bundles.length !== 1)
    throw new Error("Expected exactly one verified npm provenance statement.");
  const { bundle } = bundles[0];
  await verify(bundle, {
    certificateIssuer: "https://token.actions.githubusercontent.com",
    certificateIdentityURI:
      "^https://github\\.com/Hadden-Industries/owlapi/\\.github/workflows/release\\.yml@refs/heads/main$",
  });
  const statement = JSON.parse(
    Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"),
  );
  return assertReleaseProvenance({
    statement,
    tarball,
    commit,
    runId,
    runAttempt,
  });
};
