/** Public-safe observations issued by the original archive acquisition job. */
import assert from "node:assert/strict";
import { sha256, stableJson } from "./digests.mjs";
import { verifyRegistrySignature } from "./registry-signatures.mjs";
import { isSeparatelyInstalledRuntimeLicence } from "./runtime-material-policy.mjs";

const digestPattern = /^[a-f0-9]{64}$/u;
const expression = (found) =>
  typeof found !== "string" || !found
    ? null
    : isSeparatelyInstalledRuntimeLicence(found)
      ? found
      : "OTHER_LICENCE";

function packageFacts(metadata, projected, keepBundleDeclaration) {
  const { name, version, license, bundleDependencies, bundledDependencies } =
    metadata;
  const facts = {
    name,
    version,
    license: isSeparatelyInstalledRuntimeLicence(license) ? license : null,
    licenseSha256: projected
      ? metadata.licenseSha256
      : sha256(stableJson(license ?? null)),
  };
  if (!keepBundleDeclaration) return facts;
  return {
    ...facts,
    ...(bundleDependencies === undefined ? {} : { bundleDependencies }),
    ...(bundledDependencies === undefined ? {} : { bundledDependencies }),
    ...(bundleDependencies === true || bundledDependencies === true
      ? {
          dependencies: Object.fromEntries(
            Object.keys({
              ...metadata.dependencies,
              ...metadata.optionalDependencies,
            }).map((name) => [name, true]),
          ),
        }
      : {}),
  };
}

/** Keep authenticated manifest hashes, legal-file references and only the scan
 * observations used by the standing rule. The archive/file bodies stay private. */
export function compactArchiveMaterial(
  { archive, scan },
  { projected = false } = {},
) {
  const bundledPackages = (archive.bundledPackages ?? []).map(
    ({ path, size, sha256, blob, packageMetadata }) => ({
      path,
      size,
      sha256,
      blob,
      packageMetadata: packageFacts(packageMetadata, projected, false),
    }),
  );
  const packageRoot = `${archive.archiveRoot}/`;
  const manifests = new Set([
    `${packageRoot}package.json`,
    ...bundledPackages.map(({ path }) => path),
  ]);
  const legalLocations = new Set(archive.evidenceFiles.map(({ path }) => path));
  const bundleRoots = bundledPackages
    .map(({ path }) => path.slice(0, -"package.json".length))
    .sort((a, b) => b.length - a.length);
  const inScope = (path, root) =>
    path.startsWith(root) && !path.slice(root.length).includes("node_modules/");
  const reported = new Set();
  const files = [];
  for (const { path, detected_license_expression_spdx } of scan.files) {
    const found = expression(detected_license_expression_spdx);
    const scope =
      bundleRoots.find((root) => inScope(path, root)) ??
      (inScope(path, packageRoot) ? packageRoot : null);
    const key = `${scope}\0${found}`;
    if (legalLocations.has(path) || (scope && found && !reported.has(key))) {
      files.push({ path, detected_license_expression_spdx: found });
      if (scope && found) reported.add(key);
    }
  }
  const detections = new Set(
    (scan.license_detections ?? [])
      .map(({ license_expression_spdx }) => expression(license_expression_spdx))
      .filter(Boolean),
  );
  return {
    archive: {
      archiveRoot: archive.archiveRoot,
      packageMetadata: packageFacts(
        archive.packageMetadata,
        projected,
        bundledPackages.length > 0,
      ),
      bundledPackages,
      entries: archive.entries.filter(({ path }) => manifests.has(path)),
      evidenceFiles: archive.evidenceFiles.map(
        ({ path, kind, size, sha256, blob }) => ({
          path,
          kind,
          size,
          sha256,
          blob,
        }),
      ),
    },
    scan: {
      files,
      license_detections: [...detections]
        .sort()
        .map((found) => ({ license_expression_spdx: found })),
      archiveCoverage: {
        omittedFiles: scan.archiveCoverage.omittedFiles
          .filter(({ reason }) => reason === "NATIVE_NODE_BINARY_NOT_SCANNED")
          .map(({ path, reason }) => ({ path, reason })),
      },
    },
  };
}

const pathSafe = (path) =>
  typeof path === "string" &&
  !/[\\:\p{Cc}]/u.test(path) &&
  !path.split("/").some((piece) => ["", ".", ".."].includes(piece));

function assertReference(reference, kind) {
  assert.equal(reference.kind, kind);
  assert.match(reference.sha256, digestPattern);
  assert.ok(Number.isSafeInteger(reference.bytes) && reference.bytes >= 0);
  assert.equal(
    reference.path,
    `blobs/sha256/${reference.sha256.slice(0, 2)}/${reference.sha256}`,
  );
  return stableJson(reference);
}

/** Reverify registry authenticity and validate scope/closure of measurements
 * from the authenticated collection job. This path does not reopen tar bytes. */
export function verifyCompactArchiveMaterial(artifact, registryKeys) {
  const {
    compact,
    archiveTarball,
    tarball,
    registrySignature,
    provenance,
    scan,
    blobs,
  } = artifact;
  assert.equal(artifact.source, "RECIPIENT_ARCHIVE");
  assert.equal(archiveTarball.sha256, tarball.sha256);
  assert.equal(archiveTarball.bytes, tarball.bytes);
  assertReference(archiveTarball, undefined);
  assert.equal(artifact.archive.state, "VERIFIED");
  assert.equal(registrySignature.state, "VERIFIED");
  assert.equal(scan.state, "VERIFIED");
  assert.ok(["VERIFIED", "NOT_PUBLISHED"].includes(provenance.state));
  assert.ok(registrySignature.signatures.length > 0);
  for (const signature of registrySignature.signatures) {
    const key = registryKeys.get(signature.keyid);
    assert.ok(key, `No trusted registry key for ${artifact.artifactId}`);
    verifyRegistrySignature({
      identity: { ...artifact, publishedAt: registrySignature.publishedAt },
      signature,
      key,
    });
  }
  const { archive } = compact;
  assert.equal(archive.packageMetadata.name, artifact.name);
  assert.equal(archive.packageMetadata.version, artifact.version);
  assert.ok(
    pathSafe(archive.archiveRoot) && !archive.archiveRoot.includes("/"),
  );
  const manifestPaths = new Set([
    `${archive.archiveRoot}/package.json`,
    ...archive.bundledPackages.map(({ path }) => path),
  ]);
  assert.equal(manifestPaths.size, archive.bundledPackages.length + 1);
  for (const { path, type, sha256: digest, size } of archive.entries) {
    assert.ok(pathSafe(path) && manifestPaths.delete(path));
    assert.equal(type, "FILE");
    assert.match(digest, digestPattern);
    assert.ok(Number.isSafeInteger(size) && size > 0);
  }
  assert.equal(
    manifestPaths.size,
    0,
    "Compact archive evidence lacks an original package manifest",
  );
  for (const metadata of [
    archive.packageMetadata,
    ...archive.bundledPackages.map((member) => member.packageMetadata),
  ]) {
    assert.match(metadata.licenseSha256, digestPattern);
    if (metadata.license !== null) {
      assert.ok(isSeparatelyInstalledRuntimeLicence(metadata.license));
      assert.equal(
        metadata.licenseSha256,
        sha256(stableJson(metadata.license)),
      );
    }
  }
  const references = new Set([
    assertReference(artifact.archive.evidence, "ARCHIVE_INVENTORY"),
    assertReference(registrySignature.evidence, "REGISTRY_SIGNATURE"),
    assertReference(provenance.evidence, "NPM_PROVENANCE"),
    assertReference(scan.evidence, "SCANCODE_FINDINGS"),
  ]);
  for (const { path, blob, size, sha256 } of [
    ...archive.evidenceFiles,
    ...archive.bundledPackages,
  ]) {
    assert.ok(pathSafe(path) && path.startsWith(`${archive.archiveRoot}/`));
    assert.equal(blob.bytes, size);
    assert.equal(blob.sha256, sha256);
    references.add(assertReference(blob, "PACKAGE_EVIDENCE_FILE"));
  }
  assert.equal(blobs.length, references.size);
  assert.ok(
    blobs.every((reference) => references.delete(stableJson(reference))),
    "Compact archive evidence contains a missing or substituted original reference",
  );
  assert.equal(
    stableJson(compactArchiveMaterial(compact, { projected: true })),
    stableJson(compact),
    "Malformed compact material measurements",
  );
  return compact;
}
