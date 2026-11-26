/** Produce the public readback of a privately authenticated legacy producer ZIP. */
import assert from "node:assert/strict";
import { stableJson } from "./canonical-json.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { readProducerPackageProof } from "./release-ci-package.mjs";
import { originArtifact } from "./staged-release.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";

export const legacyProofProjectionName = (id) =>
  `artifact-${id}-legacy-proof.json`;

/** The original may be reopened only from its native live ID. The public
 * qualification manifest already binds that ID to its exact ZIP digest. */
export async function readLiveLegacyProducerProof(
  client,
  { original, locator, publicIndex, checkpoint },
  { download = downloadReleaseArtifact } = {},
) {
  const rawName = `artifact-${original.id}.zip`;
  const projectionName = legacyProofProjectionName(original.id);
  assert.ok(
    !publicIndex.files.includes(rawName) && !checkpoint.files.has(rawName),
    "Raw legacy producer proof cannot be provided or approved in public history",
  );
  assert.ok(
    !checkpoint.index?.files?.some(
      ({ sha256 }) => `sha256:${sha256}` === original.digest,
    ),
    "Raw legacy producer proof cannot be retained under another public history name",
  );
  assert.ok(
    publicIndex.files.includes(projectionName),
    "The cleared qualification projection requires explicit disclosure review",
  );
  try {
    const native = await originArtifact(client, {
      ...locator,
      artifactId: original.id,
      requireLiveOriginal: true,
    });
    assert.ok(
      native.expired === false && native.archivedBytes === undefined,
      "The original Actions artifact is unavailable or expired",
    );
    assert.deepEqual(
      [native.id, native.name, native.digest, native.size_in_bytes],
      [original.id, original.name, original.digest, original.bytes],
      "Legacy producer proof differs from its authenticated original ID, name, digest or size",
    );
    return await download(client, native, 16 * 1024 * 1024);
  } catch (error) {
    throw new Error(
      "Legacy seal remains pending while its original producer proof lacks a live native or authorized private retrieval",
      { cause: error },
    );
  }
}

/** The producer's original ZIP remains the authority for the reviewed equality
 * claim. The public archive carries its identity and native member digests. */
export async function projectLegacyProducerProof({
  original,
  bytes,
  manifest,
  manifestSha256,
  tarball,
  sbom,
  checksum,
  platform,
  npm,
}) {
  const candidate = verifyDownloadedCandidateBundle({
    fileNames: Object.values(manifest.assets).map(({ name }) => name),
    checksumText: checksum,
    sbomText: sbom,
    tarball,
  });
  assert.deepEqual(candidate.package, manifest.package);
  assert.deepEqual(candidate.assets, manifest.assets);
  const proof = await readProducerPackageProof({
    download: async () => bytes,
    artifact: { ...original, size_in_bytes: original.bytes },
    tarball,
    sbom,
    candidate,
    expectedProofVersion: 1,
    platform,
    npm,
  });
  if (manifest.ci)
    assert.deepEqual(
      proof.evidence,
      manifest.ci.evidence,
      "Legacy ZIP members differ from the admitted qualification",
    );
  const projection = {
    schemaVersion: 1,
    original: {
      id: original.id,
      name: original.name,
      bytes: original.bytes,
      digest: original.digest,
    },
    manifestSha256,
    lockedAndLocklessGraphsEquivalent: true,
    productionIdentities: proof.legacy.identities,
    nativeMembers: proof.evidence,
  };
  return {
    name: legacyProofProjectionName(original.id),
    bytes: Buffer.from(stableJson(projection)),
  };
}
