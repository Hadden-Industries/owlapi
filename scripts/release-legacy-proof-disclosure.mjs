/** Produce the public readback of a privately authenticated legacy producer ZIP. */
import assert from "node:assert/strict";
import { stableJson } from "./canonical-json.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { readProducerPackageProof } from "./release-ci-package.mjs";

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
    name: `artifact-${original.id}-legacy-proof.json`,
    bytes: Buffer.from(stableJson(projection)),
  };
}
