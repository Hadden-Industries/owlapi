// Authenticate source-corpus identities and join the recipient observation to
// its native lock. Neither input can redirect a retained evidence path.
import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  REVIEW_DIGEST_ALGORITHM,
  reviewFactsDigest,
} from "../../scripts/review-facts.mjs";
import { archiveEvidencePolicy } from "./archive-evidence-policy.mjs";
import { computeCorpusRoot } from "./blob-store.mjs";
import { sha256, stableJson } from "./digests.mjs";
import { createRetainedArtifactVerifier } from "./evidence-manifest.mjs";
import { EVIDENCE_MANIFEST_NAME } from "./format.mjs";
import {
  indexRegistryOccurrences,
  normalizeLockedRegistryGraph,
} from "./lock-graph.mjs";

export const sha256Pattern = /^[0-9a-f]{64}$/u;
// Release proof transport separately enforces its smaller aggregate limits.
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_OCCURRENCES = 10_000;

/** Read a bounded original member before parsing or hashing. */
export const readJsonBytes = async (path) => {
  const file = await lstat(path);
  assert.ok(
    file.isFile() && file.size <= MAX_JSON_BYTES,
    "Invalid bounded material input file",
  );
  return readFile(path);
};

const groupByArtifact = (occurrences) => {
  const groups = new Map();
  for (const occurrence of occurrences) {
    const group = groups.get(occurrence.artifactId) ?? [];
    group.push(occurrence);
    groups.set(occurrence.artifactId, group);
  }
  return groups;
};

/** Immutable registry archive identity, including the exact URL and SRI. */
export const archiveIdentity = ({
  name,
  version,
  resolved,
  integrity,
  artifactId,
}) => ({
  artifactId,
  name,
  version,
  resolved,
  integrity,
});

export const coordinate = ({ name, version }) => `${name}@${version}`;

/** Retain the declarations npm uses to create installed production edges. */
export function productionDependencyDeclarations(metadata) {
  const declarations = Object.fromEntries(
    [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      "peerDependenciesMeta",
      "acceptDependencies",
    ].map((field) => [field, metadata[field] ?? {}]),
  );
  // npm's optionalDedupe removes the shadowed required request from its lock entry.
  declarations.dependencies = Object.fromEntries(
    Object.entries(declarations.dependencies).filter(
      ([name]) => !Object.hasOwn(declarations.optionalDependencies, name),
    ),
  );
  return declarations;
}

/** Select and authenticate the source-lock facts of an admitted checkout. */
export async function openCanonicalEvidence(
  repositoryRoot,
  canonicalLockfileBytes,
  readCanonicalBytes,
) {
  const provenanceRoot = join(repositoryRoot, "docs", "provenance");
  const materialPath = "docs/provenance/third-party-material.json";
  assert.ok(
    !(canonicalLockfileBytes && readCanonicalBytes),
    "Canonical corpus requires one trusted byte source",
  );
  const read = readCanonicalBytes
    ? async (path) => readCanonicalBytes(path, MAX_JSON_BYTES)
    : (path) => readJsonBytes(join(repositoryRoot, path));
  const [bytes, lockBytes, materialBytes] = await Promise.all([
    read(`docs/provenance/${EVIDENCE_MANIFEST_NAME}`),
    canonicalLockfileBytes ?? read("package-lock.json"),
    read(materialPath).catch((error) => {
      if (readCanonicalBytes || error.code !== "ENOENT") throw error;
      return null;
    }),
  ]);
  const manifest = JSON.parse(bytes);
  const graph = normalizeLockedRegistryGraph(lockBytes);
  const manifestSha256 = sha256(bytes);
  assert.equal(
    manifest.schemaVersion,
    1,
    "Unsupported canonical npm evidence schema",
  );
  assert.equal(
    manifest.lockfile.sha256,
    graph.lockfileSha256,
    "Canonical npm evidence requires the authentic lockfile of its own source revision",
  );
  assert.equal(manifest.lockfile.version, graph.lockfileVersion);
  assert.equal(stableJson(manifest.package), stableJson(graph.package));
  assert.equal(stableJson(manifest.occurrences), stableJson(graph.occurrences));
  assert.equal(manifest.artifacts.length, graph.artifacts.length);
  assert.equal(
    stableJson(manifest.policy),
    stableJson(archiveEvidencePolicy()),
    "Canonical evidence was collected under a different archive policy",
  );
  assert.equal(manifest.corpusRoot, computeCorpusRoot(manifest.blobs));
  const byCoordinate = new Map();
  for (const [index, archive] of manifest.artifacts.entries()) {
    const identity = graph.artifacts[index];
    assert.equal(
      stableJson(archiveIdentity(archive)),
      stableJson(archiveIdentity(identity)),
    );
    assert.equal(
      stableJson(archive.lockfileLicenses),
      stableJson(identity.lockfileLicenses),
    );
    assert.equal(
      stableJson(archive.occurrencePaths),
      stableJson(identity.occurrencePaths),
    );
    byCoordinate.set(coordinate(archive), archive);
  }
  const material = materialBytes && JSON.parse(materialBytes);
  if (material) {
    assert.equal(material.package.evidenceManifestSha256, manifestSha256);
    assert.equal(material.package.evidenceCorpusRoot, manifest.corpusRoot);
    assert.equal(material.package.lockfileSha256, graph.lockfileSha256);
    assert.equal(material.review.digestAlgorithm, REVIEW_DIGEST_ALGORITHM);
    assert.equal(
      material.review.factsSha256,
      reviewFactsDigest("thirdParty", material),
    );
  }
  const verify = createRetainedArtifactVerifier({
    blobRoot: join(provenanceRoot, "evidence", "npm"),
    readBlobBytes:
      readCanonicalBytes &&
      ((path, maximum) =>
        readCanonicalBytes(`docs/provenance/evidence/npm/${path}`, maximum)),
    blobs: manifest.blobs,
    registryKeys: manifest.registryKeys,
  });
  return {
    byCoordinate,
    registryKeys: manifest.registryKeys,
    descriptor: {
      path: `docs/provenance/${EVIDENCE_MANIFEST_NAME}`,
      bytes: bytes.length,
      sha256: manifestSha256,
      lockfileSha256: graph.lockfileSha256,
      corpusRoot: manifest.corpusRoot,
      material: material && {
        path: materialPath,
        bytes: materialBytes.length,
        sha256: sha256(materialBytes),
        reviewStatus: material.review.status,
      },
    },
    occurrences: groupByArtifact(graph.occurrences),
    materials: groupByArtifact(material?.components ?? []),
    verify,
  };
}

/** Join active, replay-validated installed locations to their exact lock archives. */
export function observedArchives(resolution, lockfileBytes) {
  assert.ok(
    Buffer.isBuffer(lockfileBytes) && lockfileBytes.length <= MAX_JSON_BYTES,
    "Recipient material requires the original bounded lock bytes",
  );
  assert.equal(resolution.schemaVersion, 1);
  assert.match(resolution.tarballSha256, sha256Pattern);
  assert.equal(
    resolution.lockSha256,
    sha256(lockfileBytes),
    "Recipient lock digest differs",
  );
  const { packages, lockfileVersion } = JSON.parse(lockfileBytes);
  assert.equal(lockfileVersion, 3);
  assert.ok(
    packages?.[""] && Object.keys(packages).length <= MAX_OCCURRENCES,
    "Invalid bounded recipient lock packages",
  );
  const { dependencyName, graph, manifests } = resolution;
  assert.ok(
    dependencyName === null ||
      ["owlapi", "@hadden-industries/owlapi"].includes(dependencyName),
  );
  const candidate =
    dependencyName === null ? "" : `node_modules/${dependencyName}`;
  const fromLocation = (location) =>
    location.startsWith("./") ? `${candidate}${location.slice(1)}` : location;
  const toLocation = (path) =>
    candidate && path.startsWith(`${candidate}/`)
      ? `.${path.slice(candidate.length)}`
      : path;
  const registryPackages = { ...packages };
  delete registryPackages[candidate];
  for (const entry of Object.values(registryPackages))
    assert.ok(
      !entry?.link,
      "Recipient material does not support linked packages",
    );
  const { artifacts, occurrences } = indexRegistryOccurrences(registryPackages);
  const byPath = new Map(
    occurrences.map((occurrence) => [occurrence.dependencyPath, occurrence]),
  );
  const byId = new Map(
    artifacts.map((artifact) => [artifact.artifactId, artifact]),
  );
  assert.ok(
    Array.isArray(graph.nodes) && graph.nodes.length <= MAX_OCCURRENCES,
  );
  const locations = new Set(graph.nodes.map(({ location }) => location));
  assert.equal(
    locations.size,
    graph.nodes.length,
    "Duplicate recipient manifest location",
  );
  assert.ok(locations.has("."), "Missing candidate manifest location");
  assert.deepEqual(
    Object.keys(manifests).sort(),
    [...locations].sort(),
    "Incomplete installed manifest inventory",
  );
  const active = [];
  for (const node of graph.nodes) {
    const { location } = node;
    const installedManifestSha256 = manifests[location];
    assert.match(installedManifestSha256, sha256Pattern);
    if (location === ".") continue; // The first-party payload is verified by native resolution capture and replay.
    const path = fromLocation(location);
    const occurrence = byPath.get(path);
    assert.ok(
      occurrence && location === toLocation(path),
      "Unrecognized recipient manifest location",
    );
    const artifact = byId.get(occurrence.artifactId);
    const { bundled } = occurrence;
    assert.equal(node.name, bundled?.name ?? artifact.name);
    assert.equal(node.version, bundled?.version ?? artifact.version);
    assert.equal(node.resolved, artifact.resolved);
    assert.equal(node.integrity, artifact.integrity);
    assert.equal(
      node.bundledIn,
      bundled ? toLocation(bundled.ownerDependencyPath) : undefined,
    );
    if (bundled)
      assert.ok(
        locations.has(node.bundledIn),
        "Missing bundled archive owner's location",
      );
    active.push({
      ...occurrence,
      location,
      installedManifestSha256,
      lockLicence: packages[path].license ?? null,
      lockDeclarations: productionDependencyDeclarations(packages[path]),
    });
  }
  return { byArtifact: groupByArtifact(active), byId };
}
