import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { computeCorpusRoot, verifyBlob } from "./blob-store.mjs";
import { validateArchiveInventory } from "./archive-evidence.mjs";
import { compareCodeUnits, stableJson } from "./digests.mjs";
import {
  canonicalizeEvidenceBlobs,
  createEvidenceShard,
  selectShardArtifacts,
} from "./evidence-shards.mjs";
import { normalizeLockedRegistryGraph } from "./lock-graph.mjs";
import { verifyRegistrySignature } from "./registry-signatures.mjs";

const EVIDENCE_KINDS = Object.freeze([
  "ARCHIVE_INVENTORY",
  "NPM_PROVENANCE",
  "REGISTRY_SIGNATURE",
  "SCANCODE_FINDINGS",
]);

export class EvidenceVerificationError extends Error {
  constructor(classification, code, message, options = undefined) {
    super(message, options);
    this.name = "EvidenceVerificationError";
    this.classification = classification;
    this.code = code;
  }
}

const fail = (classification, code, message, cause) => {
  throw new EvidenceVerificationError(classification, code, message, {
    cause,
  });
};

const controlFailure = (code, message, cause) =>
  fail("CONTROL_FAILURE", code, message, cause);

const productFailure = (code, message, cause) =>
  fail("PRODUCT_FAILURE", code, message, cause);

const canonicalClone = (value) => JSON.parse(stableJson(value));

const assertExact = (actual, expected, code, label) => {
  if (stableJson(actual) !== stableJson(expected)) {
    controlFailure(code, `${label} does not match its authoritative source`);
  }
};

const requireArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value;
};

const referenceKey = (reference) => `${reference.kind}:${reference.sha256}`;

const sortReferences = (references) =>
  [...references].sort((left, right) =>
    compareCodeUnits(referenceKey(left), referenceKey(right)),
  );

const calculateSummary = ({ occurrences, artifacts, blobs }) => ({
  occurrenceCount: occurrences.length,
  artifactCount: artifacts.length,
  blobCount: blobs.length,
  retainedBytes: blobs.reduce((total, blob) => total + blob.bytes, 0),
  registrySignatureVerifiedCount: artifacts.filter(
    ({ registrySignature }) => registrySignature.state === "VERIFIED",
  ).length,
  provenanceVerifiedCount: artifacts.filter(
    ({ provenance }) => provenance.state === "VERIFIED",
  ).length,
  provenanceNotPublishedCount: artifacts.filter(
    ({ provenance }) => provenance.state === "NOT_PUBLISHED",
  ).length,
  archiveVerifiedCount: artifacts.filter(
    ({ archive }) => archive.state === "VERIFIED",
  ).length,
  scanVerifiedCount: artifacts.filter(({ scan }) => scan.state === "VERIFIED")
    .length,
});

const indexUnique = (values, keyOf, label) => {
  const result = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (typeof key !== "string" || key.length === 0 || result.has(key)) {
      throw new TypeError(`Expected unique ${label}: ${String(key)}`);
    }
    result.set(key, value);
  }
  return result;
};

export const createEvidenceManifest = ({
  graph,
  policy,
  registryKeys,
  artifacts,
  blobs,
}) => {
  if (!graph || typeof graph !== "object") {
    throw new TypeError("A normalized lockfile graph is required");
  }
  const evidenceByArtifact = indexUnique(
    requireArray(artifacts, "artifact evidence"),
    ({ artifactId }) => artifactId,
    "artifact evidence",
  );
  const graphArtifactIds = new Set(
    requireArray(graph.artifacts, "graph artifacts").map(
      ({ artifactId }) => artifactId,
    ),
  );
  if (
    evidenceByArtifact.size !== graphArtifactIds.size ||
    [...evidenceByArtifact.keys()].some(
      (artifactId) => !graphArtifactIds.has(artifactId),
    )
  ) {
    throw new TypeError("Artifact evidence does not close over the lock graph");
  }

  // Content-addressed legal files are often byte-identical across packages.
  // Deduplicate exact references while still rejecting conflicting metadata for
  // the same kind/digest identity.
  const canonicalBlobs = canonicalizeEvidenceBlobs(
    sortReferences(requireArray(blobs, "evidence blobs")),
  );
  const canonicalArtifacts = graph.artifacts.map((identity) => {
    const evidence = evidenceByArtifact.get(identity.artifactId);
    return canonicalClone({ ...identity, ...evidence });
  });
  const manifest = {
    $schema: "./npm-package-evidence.schema.json",
    schemaVersion: 1,
    generatedBy: {
      path: "util/acquire-npm-package-evidence.mjs",
      version: "1.0.0",
    },
    package: canonicalClone(graph.package),
    lockfile: {
      path: "package-lock.json",
      version: graph.lockfileVersion,
      sha256: graph.lockfileSha256,
    },
    policy: canonicalClone(policy),
    registryKeys: canonicalClone(
      [...requireArray(registryKeys, "registry keys")].sort((left, right) =>
        compareCodeUnits(left.keyid, right.keyid),
      ),
    ),
    occurrences: canonicalClone(graph.occurrences),
    artifacts: canonicalArtifacts,
    blobs: canonicalClone(canonicalBlobs),
  };
  manifest.summary = calculateSummary(manifest);
  manifest.corpusRoot = computeCorpusRoot(manifest.blobs);
  return canonicalClone(manifest);
};

const evidenceReferencesFor = (artifact) => [
  artifact.archive.evidence,
  artifact.registrySignature.evidence,
  artifact.provenance.evidence,
  artifact.scan.evidence,
];

const readEvidenceEnvelope = async (blobRoot, reference, artifactId) => {
  let envelope;
  try {
    envelope = JSON.parse(
      await readFile(join(blobRoot, reference.path), "utf8"),
    );
  } catch (error) {
    controlFailure(
      "EVIDENCE_BLOB_INVALID_JSON",
      `Evidence blob is not canonical JSON: ${reference.path}`,
      error,
    );
  }
  if (
    envelope?.schemaVersion !== 1 ||
    envelope?.kind !== reference.kind ||
    envelope?.artifactId !== artifactId ||
    !("evidence" in envelope)
  ) {
    controlFailure(
      "EVIDENCE_ENVELOPE_MISMATCH",
      `Evidence envelope is not bound to ${artifactId} and ${reference.kind}`,
    );
  }
  return envelope.evidence;
};

const verifyCompletionStates = (artifact) => {
  if (artifact.archive?.state !== "VERIFIED") {
    productFailure(
      "ARCHIVE_NOT_VERIFIED",
      `Archive inspection is incomplete for ${artifact.artifactId}`,
    );
  }
  if (artifact.registrySignature?.state !== "VERIFIED") {
    productFailure(
      "REGISTRY_SIGNATURE_NOT_VERIFIED",
      `Registry signature is incomplete for ${artifact.artifactId}`,
    );
  }
  if (!new Set(["VERIFIED", "NOT_PUBLISHED"]).has(artifact.provenance?.state)) {
    productFailure(
      "PROVENANCE_INVALID",
      `Provenance is neither verified nor absent for ${artifact.artifactId}`,
    );
  }
  if (artifact.scan?.state !== "VERIFIED") {
    productFailure(
      "SCAN_NOT_VERIFIED",
      `ScanCode inspection is incomplete for ${artifact.artifactId}`,
    );
  }
};

const verifyArtifactEvidence = async ({
  artifact,
  keyById,
  blobRoot,
  blobByReference,
  referencedBlobs,
  allowLegacyArchiveInventory,
  allowLegacyScancodeNormalization,
}) => {
  verifyCompletionStates(artifact);
  const expectedKinds = new Set(EVIDENCE_KINDS);
  for (const reference of evidenceReferencesFor(artifact)) {
    if (!reference || !expectedKinds.delete(reference.kind)) {
      controlFailure(
        "ARTIFACT_EVIDENCE_KIND_INVALID",
        `Artifact evidence kinds are incomplete for ${artifact.artifactId}`,
      );
    }
    const key = referenceKey(reference);
    const retained = blobByReference.get(key);
    if (!retained) {
      controlFailure(
        "BLOB_CLOSURE_MISMATCH",
        `Artifact references an undeclared blob: ${key}`,
      );
    }
    assertExact(reference, retained, "BLOB_REFERENCE_MISMATCH", key);
    referencedBlobs.add(key);
  }
  if (expectedKinds.size !== 0) {
    controlFailure(
      "ARTIFACT_EVIDENCE_KIND_INVALID",
      `Artifact evidence kinds are incomplete for ${artifact.artifactId}`,
    );
  }

  const archive = await readEvidenceEnvelope(
    blobRoot,
    artifact.archive.evidence,
    artifact.artifactId,
  );
  if (
    archive?.packageIdentity?.name !== artifact.name ||
    archive?.packageIdentity?.version !== artifact.version ||
    archive?.packageMetadata?.name !== artifact.name ||
    archive?.packageMetadata?.version !== artifact.version ||
    stableJson(archive?.tarball) !== stableJson(artifact.tarball)
  ) {
    productFailure(
      "ARCHIVE_IDENTITY_MISMATCH",
      `Archive identity does not match ${artifact.name}@${artifact.version}`,
    );
  }
  if (
    !Array.isArray(archive.evidenceFiles) ||
    !Array.isArray(archive.entries)
  ) {
    controlFailure(
      "ARCHIVE_INVENTORY_INVALID",
      `Archive inventory is incomplete for ${artifact.artifactId}`,
    );
  }
  const isLegacyOccurrenceInventory =
    archive.duplicateEntries === undefined &&
    archive.physicalEntryCount === undefined;
  if (!isLegacyOccurrenceInventory || !allowLegacyArchiveInventory) {
    try {
      validateArchiveInventory(archive);
    } catch (error) {
      controlFailure(
        "ARCHIVE_INVENTORY_INVALID",
        `Archive inventory is invalid for ${artifact.artifactId}`,
        error,
      );
    }
  }
  const entryByPath = indexUnique(
    archive.entries,
    ({ path }) => path,
    "archive inventory path",
  );
  const archiveRoot = archive.archiveRoot;
  const rootPrefix = `${archiveRoot}/`;
  if (
    typeof archiveRoot !== "string" ||
    archiveRoot.length === 0 ||
    archiveRoot === "." ||
    archiveRoot === ".." ||
    archiveRoot.includes("/") ||
    archiveRoot.includes("\\") ||
    archive.entries.some(
      ({ path }) => path !== archiveRoot && !path.startsWith(rootPrefix),
    ) ||
    entryByPath.get(`${rootPrefix}package.json`)?.type !== "FILE"
  ) {
    controlFailure(
      "ARCHIVE_ROOT_MISMATCH",
      `Archive inventory does not have one authenticated package root for ${artifact.artifactId}`,
    );
  }
  for (const evidenceFile of archive.evidenceFiles) {
    const reference = evidenceFile?.blob;
    if (reference?.kind !== "PACKAGE_EVIDENCE_FILE") {
      controlFailure(
        "PACKAGE_EVIDENCE_REFERENCE_INVALID",
        `Legal evidence lacks a file blob for ${artifact.artifactId}`,
      );
    }
    const key = referenceKey(reference);
    const retained = blobByReference.get(key);
    if (!retained) {
      controlFailure(
        "BLOB_CLOSURE_MISMATCH",
        `Archive references an undeclared legal-evidence blob: ${key}`,
      );
    }
    assertExact(reference, retained, "BLOB_REFERENCE_MISMATCH", key);
    const entry = entryByPath.get(evidenceFile.path);
    if (
      !entry ||
      entry.type !== "FILE" ||
      entry.size !== evidenceFile.size ||
      entry.sha256 !== evidenceFile.sha256 ||
      reference.bytes !== evidenceFile.size ||
      reference.sha256 !== evidenceFile.sha256
    ) {
      controlFailure(
        "PACKAGE_EVIDENCE_BINDING_MISMATCH",
        `Legal evidence does not match the archive inventory for ${artifact.artifactId}`,
      );
    }
    referencedBlobs.add(key);
  }

  const signatureEvidence = await readEvidenceEnvelope(
    blobRoot,
    artifact.registrySignature.evidence,
    artifact.artifactId,
  );
  if (
    signatureEvidence?.publishedAt !== artifact.registrySignature.publishedAt ||
    stableJson(signatureEvidence?.signatures) !==
      stableJson(artifact.registrySignature.signatures) ||
    stableJson(signatureEvidence?.keyids) !==
      stableJson(
        artifact.registrySignature.signatures?.map(({ keyid }) => keyid),
      )
  ) {
    controlFailure(
      "SIGNATURE_EVIDENCE_MISMATCH",
      `Signature evidence does not match the manifest for ${artifact.artifactId}`,
    );
  }
  if (
    !Array.isArray(artifact.registrySignature.signatures) ||
    artifact.registrySignature.signatures.length === 0
  ) {
    productFailure(
      "REGISTRY_SIGNATURE_MISSING",
      `Registry signature is absent for ${artifact.artifactId}`,
    );
  }
  for (const signature of artifact.registrySignature.signatures) {
    const key = keyById.get(signature.keyid);
    if (!key) {
      productFailure(
        "REGISTRY_KEY_MISSING",
        `No retained registry key verifies ${artifact.artifactId}`,
      );
    }
    try {
      verifyRegistrySignature({
        identity: {
          name: artifact.name,
          version: artifact.version,
          integrity: artifact.integrity,
          publishedAt: artifact.registrySignature.publishedAt,
        },
        signature,
        key,
      });
    } catch (error) {
      productFailure(
        "SIGNATURE_INVALID",
        `Registry signature is invalid for ${artifact.artifactId}`,
        error,
      );
    }
  }

  const provenance = await readEvidenceEnvelope(
    blobRoot,
    artifact.provenance.evidence,
    artifact.artifactId,
  );
  if (provenance?.state !== artifact.provenance.state) {
    productFailure(
      "PROVENANCE_EVIDENCE_MISMATCH",
      `Provenance evidence does not match ${artifact.artifactId}`,
    );
  }
  const attestations = provenance?.attestations;
  if (
    !Array.isArray(attestations) ||
    (artifact.provenance.state === "VERIFIED" && attestations.length === 0) ||
    (artifact.provenance.state === "NOT_PUBLISHED" && attestations.length !== 0)
  ) {
    productFailure(
      "PROVENANCE_INVALID",
      `Provenance evidence is invalid for ${artifact.artifactId}`,
    );
  }

  const scan = await readEvidenceEnvelope(
    blobRoot,
    artifact.scan.evidence,
    artifact.artifactId,
  );
  const normalizationVersion = scan?.scanner?.normalizationVersion;
  if (
    scan?.scanner?.name !== "scancode-toolkit" ||
    scan?.scanner?.version !== "32.5.0" ||
    scan?.scanner?.outputFormatVersion !== "4.1.0" ||
    !(
      normalizationVersion === 1 ||
      (allowLegacyScancodeNormalization && normalizationVersion === undefined)
    )
  ) {
    productFailure(
      "SCANCODE_EVIDENCE_INVALID",
      `ScanCode evidence is invalid for ${artifact.artifactId}`,
    );
  }
};

const verifyEvidenceDocument = async ({
  manifest,
  graph,
  blobRoot,
  allowLegacyArchiveInventory = false,
  allowLegacyScancodeNormalization = false,
}) => {
  try {
    if (!manifest || typeof manifest !== "object") {
      controlFailure("MANIFEST_INVALID", "Evidence manifest must be an object");
    }
    assertExact(
      manifest.package,
      graph.package,
      "PACKAGE_BINDING_MISMATCH",
      "Package",
    );
    assertExact(
      manifest.lockfile,
      {
        path: "package-lock.json",
        version: graph.lockfileVersion,
        sha256: graph.lockfileSha256,
      },
      "LOCKFILE_BINDING_MISMATCH",
      "Lockfile",
    );
    assertExact(
      manifest.occurrences,
      graph.occurrences,
      "OCCURRENCE_CLOSURE_MISMATCH",
      "Lockfile occurrences",
    );

    const blobByReference = indexUnique(
      requireArray(manifest.blobs, "manifest blobs"),
      referenceKey,
      "manifest blob reference",
    );
    for (const reference of manifest.blobs) {
      try {
        await verifyBlob(blobRoot, reference);
      } catch (error) {
        controlFailure(
          "BLOB_VERIFICATION_FAILED",
          `Retained evidence blob failed verification: ${referenceKey(reference)}`,
          error,
        );
      }
    }
    if (manifest.corpusRoot !== computeCorpusRoot(manifest.blobs)) {
      controlFailure(
        "CORPUS_ROOT_MISMATCH",
        "Evidence corpus root does not match its retained blobs",
      );
    }

    const artifactById = indexUnique(
      requireArray(manifest.artifacts, "manifest artifacts"),
      ({ artifactId }) => artifactId,
      "manifest artifact",
    );
    if (artifactById.size !== graph.artifacts.length) {
      controlFailure(
        "ARTIFACT_CLOSURE_MISMATCH",
        "Evidence artifacts do not close over the lockfile graph",
      );
    }
    const keyById = indexUnique(
      requireArray(manifest.registryKeys, "registry keys"),
      ({ keyid }) => keyid,
      "registry key",
    );
    const referencedBlobs = new Set();
    for (const identity of graph.artifacts) {
      const artifact = artifactById.get(identity.artifactId);
      if (!artifact) {
        controlFailure(
          "ARTIFACT_CLOSURE_MISMATCH",
          `Missing evidence for ${identity.artifactId}`,
        );
      }
      const manifestIdentity = Object.fromEntries(
        [
          "artifactId",
          "name",
          "version",
          "resolved",
          "integrity",
          "lockfileLicenses",
          "occurrencePaths",
        ].map((key) => [key, artifact[key]]),
      );
      assertExact(
        manifestIdentity,
        identity,
        "ARTIFACT_IDENTITY_MISMATCH",
        `Artifact ${identity.artifactId}`,
      );
      await verifyArtifactEvidence({
        artifact,
        keyById,
        blobRoot,
        blobByReference,
        referencedBlobs,
        allowLegacyArchiveInventory,
        allowLegacyScancodeNormalization,
      });
    }
    if (
      referencedBlobs.size !== blobByReference.size ||
      [...blobByReference.keys()].some((key) => !referencedBlobs.has(key))
    ) {
      controlFailure(
        "BLOB_CLOSURE_MISMATCH",
        "Manifest contains unreferenced or missing evidence blobs",
      );
    }

    const summary = calculateSummary(manifest);
    assertExact(
      manifest.summary,
      summary,
      "SUMMARY_MISMATCH",
      "Evidence summary",
    );
    return summary;
  } catch (error) {
    if (error instanceof EvidenceVerificationError) {
      throw error;
    }
    controlFailure(
      "MANIFEST_VERIFICATION_EXCEPTION",
      `Evidence verification could not complete: ${error.message}`,
      error,
    );
  }
};

export const verifyEvidenceManifest = async ({
  manifest,
  lockfileBytes,
  blobRoot,
  allowLegacyArchiveInventory = false,
  allowLegacyScancodeNormalization = false,
}) =>
  verifyEvidenceDocument({
    manifest,
    graph: normalizeLockedRegistryGraph(lockfileBytes),
    blobRoot,
    allowLegacyArchiveInventory,
    allowLegacyScancodeNormalization,
  });

export const verifyEvidenceShard = async ({
  shard,
  lockfileBytes,
  blobRoot,
}) => {
  try {
    const graph = normalizeLockedRegistryGraph(lockfileBytes);
    const canonical = createEvidenceShard({
      graph,
      policy: shard?.policy,
      registryKeys: shard?.registryKeys,
      artifacts: shard?.artifacts,
      blobs: shard?.blobs,
      shard: shard?.shard,
    });
    if (stableJson(canonical) !== stableJson(shard)) {
      controlFailure(
        "SHARD_DOCUMENT_NONCANONICAL",
        "Evidence shard differs from its lock-bound canonical form",
      );
    }
    const selectedArtifacts = selectShardArtifacts(
      graph.artifacts,
      shard.shard,
    );
    const selectedIds = new Set(
      selectedArtifacts.map(({ artifactId }) => artifactId),
    );
    return verifyEvidenceDocument({
      manifest: shard,
      graph: {
        ...graph,
        artifacts: selectedArtifacts,
        occurrences: graph.occurrences.filter(({ artifactId }) =>
          selectedIds.has(artifactId),
        ),
      },
      blobRoot,
    });
  } catch (error) {
    if (error instanceof EvidenceVerificationError) {
      throw error;
    }
    controlFailure(
      "SHARD_VERIFICATION_EXCEPTION",
      `Evidence shard verification could not complete: ${error.message}`,
      error,
    );
  }
};
