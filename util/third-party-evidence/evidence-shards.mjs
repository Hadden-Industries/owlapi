import { computeCorpusRoot } from "./blob-store.mjs";
import { compareCodeUnits, stableJson } from "./digests.mjs";

export const EVIDENCE_SHARD_ALGORITHM = "ARTIFACT_ID_UNSIGNED_PREFIX32_MODULO";

const MAXIMUM_SHARD_COUNT = 256;
const ARTIFACT_ID_PATTERN = /^[0-9a-f]{64}$/u;

const canonicalClone = (value) => JSON.parse(stableJson(value));

const assertExact = (actual, expected, label) => {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new TypeError(
      `${label} does not match the lock-bound shard contract`,
    );
  }
};

const normalizeShard = ({ count, index } = {}) => {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > MAXIMUM_SHARD_COUNT
  ) {
    throw new TypeError(
      `Shard count must be an integer from 1 through ${MAXIMUM_SHARD_COUNT}`,
    );
  }
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) {
    throw new TypeError(
      `Shard index must be an integer from 0 through ${count - 1}`,
    );
  }
  return { count, index };
};

export const artifactShardIndex = (artifactId, shardCount) => {
  if (!ARTIFACT_ID_PATTERN.test(artifactId)) {
    throw new TypeError("Artifact id must be a lowercase SHA-256 digest");
  }
  const { count } = normalizeShard({ count: shardCount, index: 0 });
  // The first eight hexadecimal digits are an unsigned 32-bit word. Number can
  // represent every uint32 exactly, so this partition is identical in all JS
  // runtimes without relying on host byte order or signed bitwise operators.
  return Number.parseInt(artifactId.slice(0, 8), 16) % count;
};

export const selectShardArtifacts = (artifacts, shard) => {
  if (!Array.isArray(artifacts)) {
    throw new TypeError("Shard selection requires an artifact array");
  }
  const { count, index } = normalizeShard(shard);
  return artifacts.filter(
    ({ artifactId }) => artifactShardIndex(artifactId, count) === index,
  );
};

const blobKey = ({ kind, sha256 }) => `${kind}:${sha256}`;

const deduplicateExact = (values, keyOf, label) => {
  if (!Array.isArray(values)) {
    throw new TypeError(`${label} must be an array`);
  }
  const byKey = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError(`${label} contains an invalid identity`);
    }
    const previous = byKey.get(key);
    if (previous && stableJson(previous) !== stableJson(value)) {
      throw new TypeError(`${label} contains conflicting values for ${key}`);
    }
    byKey.set(key, value);
  }
  return [...byKey.values()];
};

export const canonicalizeEvidenceBlobs = (blobs) =>
  deduplicateExact(blobs, blobKey, "Evidence blobs").sort((left, right) =>
    compareCodeUnits(blobKey(left), blobKey(right)),
  );

const canonicalRegistryKeys = (keys) =>
  deduplicateExact(keys, ({ keyid }) => keyid, "Registry keys").sort(
    (left, right) => compareCodeUnits(left.keyid, right.keyid),
  );

const expectedLockfile = (graph) => ({
  path: "package-lock.json",
  version: graph.lockfileVersion,
  sha256: graph.lockfileSha256,
});

const identityFields = Object.freeze([
  "artifactId",
  "name",
  "version",
  "resolved",
  "integrity",
  "lockfileLicenses",
  "occurrencePaths",
]);

const artifactIdentity = (artifact) =>
  Object.fromEntries(identityFields.map((field) => [field, artifact[field]]));

const indexUniqueArtifacts = (artifacts, label) => {
  const byId = new Map();
  for (const artifact of artifacts) {
    if (!ARTIFACT_ID_PATTERN.test(artifact?.artifactId)) {
      throw new TypeError(`${label} contains an invalid artifact id`);
    }
    if (byId.has(artifact.artifactId)) {
      throw new TypeError(
        `${label} contains duplicate artifact ${artifact.artifactId}`,
      );
    }
    byId.set(artifact.artifactId, artifact);
  }
  return byId;
};

const expectedOccurrences = (graph, selectedIds) =>
  graph.occurrences.filter(({ artifactId }) => selectedIds.has(artifactId));

const calculateSummary = ({ occurrences, artifacts, blobs }) => ({
  occurrenceCount: occurrences.length,
  artifactCount: artifacts.length,
  blobCount: blobs.length,
  retainedBytes: blobs.reduce((total, blob) => total + blob.bytes, 0),
  registrySignatureVerifiedCount: artifacts.filter(
    ({ registrySignature }) => registrySignature?.state === "VERIFIED",
  ).length,
  provenanceVerifiedCount: artifacts.filter(
    ({ provenance }) => provenance?.state === "VERIFIED",
  ).length,
  provenanceNotPublishedCount: artifacts.filter(
    ({ provenance }) => provenance?.state === "NOT_PUBLISHED",
  ).length,
  archiveVerifiedCount: artifacts.filter(
    ({ archive }) => archive?.state === "VERIFIED",
  ).length,
  scanVerifiedCount: artifacts.filter(({ scan }) => scan?.state === "VERIFIED")
    .length,
});

const canonicalShardArtifacts = ({ graph, artifacts, count, index }) => {
  const selected = selectShardArtifacts(graph.artifacts, { count, index });
  const evidenceById = indexUniqueArtifacts(artifacts, "Shard evidence");
  if (evidenceById.size !== selected.length) {
    throw new TypeError(
      `Shard ${index} evidence does not close over its assignment`,
    );
  }
  return selected.map((identity) => {
    const evidence = evidenceById.get(identity.artifactId);
    if (!evidence) {
      throw new TypeError(
        `Shard ${index} is missing assigned artifact ${identity.artifactId}`,
      );
    }
    const repeatedIdentityFields = identityFields.slice(1);
    const suppliedIdentityFields = repeatedIdentityFields.filter(
      (field) => evidence[field] !== undefined,
    );
    // Acquisition produces evidence-only records; persisted shard documents
    // contain the merged lock identity. Accept either complete representation,
    // but never a partially repeated identity that could hide disagreement.
    if (
      suppliedIdentityFields.length !== 0 &&
      suppliedIdentityFields.length !== repeatedIdentityFields.length
    ) {
      throw new TypeError(
        `Shard ${index} artifact ${identity.artifactId} repeats only part of its identity`,
      );
    }
    if (suppliedIdentityFields.length === repeatedIdentityFields.length) {
      assertExact(
        artifactIdentity(evidence),
        identity,
        `Shard ${index} artifact ${identity.artifactId}`,
      );
    }
    return canonicalClone({ ...identity, ...evidence });
  });
};

export const createEvidenceShard = ({
  graph,
  policy,
  registryKeys,
  artifacts,
  blobs,
  shard,
}) => {
  if (!graph || typeof graph !== "object") {
    throw new TypeError("A normalized lockfile graph is required");
  }
  if (!policy || typeof policy !== "object") {
    throw new TypeError("An evidence policy is required");
  }
  const { count, index } = normalizeShard(shard);
  const canonicalArtifacts = canonicalShardArtifacts({
    graph,
    artifacts,
    count,
    index,
  });
  const artifactIds = canonicalArtifacts.map(({ artifactId }) => artifactId);
  const selectedIds = new Set(artifactIds);
  const document = {
    $schema: "./npm-package-evidence-shard.schema.json",
    schemaVersion: 1,
    generatedBy: {
      path: "util/acquire-npm-package-evidence.mjs",
      version: "1.0.0",
    },
    package: canonicalClone(graph.package),
    lockfile: expectedLockfile(graph),
    policy: canonicalClone(policy),
    shard: {
      algorithm: EVIDENCE_SHARD_ALGORITHM,
      count,
      index,
      artifactIds,
    },
    registryKeys: canonicalClone(canonicalRegistryKeys(registryKeys)),
    occurrences: canonicalClone(expectedOccurrences(graph, selectedIds)),
    artifacts: canonicalArtifacts,
    blobs: canonicalClone(canonicalizeEvidenceBlobs(blobs)),
  };
  document.summary = calculateSummary(document);
  document.corpusRoot = computeCorpusRoot(document.blobs);
  return canonicalClone(document);
};

const validateShardDocument = ({
  graph,
  shard,
  expectedCount,
  expectedPolicy,
}) => {
  if (!shard || typeof shard !== "object") {
    throw new TypeError("Evidence shard must be an object");
  }
  const coordinate = normalizeShard(shard.shard);
  if (coordinate.count !== expectedCount) {
    throw new TypeError("Evidence shards disagree on shard count");
  }
  if (shard.shard.algorithm !== EVIDENCE_SHARD_ALGORITHM) {
    throw new TypeError("Evidence shard uses an unknown assignment algorithm");
  }
  assertExact(
    shard.package,
    graph.package,
    `Shard ${coordinate.index} package`,
  );
  assertExact(
    shard.lockfile,
    expectedLockfile(graph),
    `Shard ${coordinate.index} lockfile`,
  );
  assertExact(shard.policy, expectedPolicy, `Shard ${coordinate.index} policy`);

  const expected = selectShardArtifacts(graph.artifacts, coordinate);
  const expectedIds = expected.map(({ artifactId }) => artifactId);
  assertExact(
    shard.shard.artifactIds,
    expectedIds,
    `Shard ${coordinate.index} membership`,
  );
  const artifacts = canonicalShardArtifacts({
    graph,
    artifacts: shard.artifacts,
    ...coordinate,
  });
  assertExact(
    shard.artifacts,
    artifacts,
    `Shard ${coordinate.index} artifact ordering`,
  );
  const selectedIds = new Set(expectedIds);
  assertExact(
    shard.occurrences,
    expectedOccurrences(graph, selectedIds),
    `Shard ${coordinate.index} occurrences`,
  );
  const blobs = canonicalizeEvidenceBlobs(shard.blobs);
  assertExact(shard.blobs, blobs, `Shard ${coordinate.index} blobs`);
  if (shard.corpusRoot !== computeCorpusRoot(blobs)) {
    throw new TypeError(`Shard ${coordinate.index} corpus root is corrupt`);
  }
  assertExact(
    shard.summary,
    calculateSummary(shard),
    `Shard ${coordinate.index} summary`,
  );
  return { coordinate, artifacts, blobs };
};

export const mergeEvidenceShardDocuments = ({ graph, shards }) => {
  if (!graph || typeof graph !== "object") {
    throw new TypeError("A normalized lockfile graph is required");
  }
  if (!Array.isArray(shards) || shards.length === 0) {
    throw new TypeError("At least one evidence shard is required");
  }
  const firstCoordinate = normalizeShard(shards[0]?.shard);
  const expectedCount = firstCoordinate.count;
  const expectedPolicy = shards[0].policy;
  const byIndex = new Map();
  for (const shard of shards) {
    const coordinate = normalizeShard(shard?.shard);
    if (byIndex.has(coordinate.index)) {
      throw new TypeError(`Duplicate shard index ${coordinate.index}`);
    }
    byIndex.set(coordinate.index, shard);
  }
  const missing = Array.from(
    { length: expectedCount },
    (_, index) => index,
  ).filter((index) => !byIndex.has(index));
  if (missing.length > 0) {
    throw new TypeError(`Missing shard indexes: ${missing.join(", ")}`);
  }
  if (byIndex.size !== expectedCount) {
    throw new TypeError("Evidence shard set contains an unexpected index");
  }

  const artifacts = [];
  const blobs = [];
  const registryKeys = [];
  const artifactIds = new Set();
  for (let index = 0; index < expectedCount; index += 1) {
    const shard = byIndex.get(index);
    const validated = validateShardDocument({
      graph,
      shard,
      expectedCount,
      expectedPolicy,
    });
    for (const artifact of validated.artifacts) {
      if (artifactIds.has(artifact.artifactId)) {
        throw new TypeError(`Duplicate artifact ${artifact.artifactId}`);
      }
      artifactIds.add(artifact.artifactId);
      artifacts.push(artifact);
    }
    blobs.push(...validated.blobs);
    registryKeys.push(...shard.registryKeys);
  }
  if (artifactIds.size !== graph.artifacts.length) {
    throw new TypeError(
      "Merged shard artifacts do not close over the lock graph",
    );
  }
  const artifactById = new Map(
    artifacts.map((artifact) => [artifact.artifactId, artifact]),
  );
  return canonicalClone({
    policy: expectedPolicy,
    registryKeys: canonicalRegistryKeys(registryKeys),
    artifacts: graph.artifacts.map(({ artifactId }) =>
      artifactById.get(artifactId),
    ),
    blobs: canonicalizeEvidenceBlobs(blobs),
  });
};
