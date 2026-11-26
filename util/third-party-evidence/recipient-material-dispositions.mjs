// Apply the standing external-runtime policy to authenticated material and the
// observed distribution relationship of each installed occurrence.
import assert from "node:assert/strict";
import { sha256, stableJson } from "./digests.mjs";
import { productionDependencyDeclarations } from "./recipient-material-inputs.mjs";
import {
  externalRuntimeLicenceEvidence,
  isSeparatelyInstalledRuntimeLicence,
} from "./runtime-material-policy.mjs";

function assessArchiveMember({
  bundled,
  artifact,
  archive,
  entryByPath,
  scan,
  canonicalMaterials,
  compactMeasurements,
}) {
  const archiveMember = `${archive.archiveRoot}/${bundled?.packageJsonPath ?? "package.json"}`;
  const manifestSha256 = entryByPath.get(archiveMember)?.sha256;
  const member =
    bundled &&
    archive.bundledPackages.find(({ path }) => path === archiveMember);
  const metadata = member?.packageMetadata ?? archive.packageMetadata;
  const packageRoot = archiveMember.slice(0, -"package.json".length);
  const inScope = (path) =>
    path.startsWith(packageRoot) &&
    !path.slice(packageRoot.length).includes("node_modules/");
  const legal = archive.evidenceFiles.filter(({ path }) => inScope(path));
  const licence = isSeparatelyInstalledRuntimeLicence(metadata.license)
    ? metadata.license
    : null;
  const externalEvidence = bundled
    ? []
    : externalRuntimeLicenceEvidence(artifact);
  const topLevelLicence = legal.filter(
    ({ path, kind, size }) =>
      kind === "LICENCE" &&
      size > 0 &&
      !path.slice(packageRoot.length).includes("/"),
  );
  const scope = bundled
    ? "BUNDLED_IN_EXTERNAL_RUNTIME_ARCHIVE"
    : "SEPARATELY_INSTALLED_EXTERNAL_RUNTIME";
  const reasons = [];
  if (!licence) reasons.push("DECLARATION_OUTSIDE_STANDING_RULE");
  if (bundled || archive.bundledPackages?.length)
    reasons.push("BUNDLED_MATERIAL_REQUIRES_RIGHTS_DISPOSITION");

  // The canonical project's existing disposition belongs to its original rights
  // review. Its exact facts may be reused while that review retains its own gate.
  const prior = canonicalMaterials.find(
    (entry) =>
      entry.name === metadata.name &&
      entry.version === metadata.version &&
      entry.relationship === "EXTERNAL_RUNTIME_DEPENDENCY" &&
      entry.distributionDisposition ===
        "ALLOWED_SEPARATELY_INSTALLED_EXTERNAL_RUNTIME" &&
      entry.noticeDisposition === "EXTERNAL_DEPENDENCY_RECORDED_NOT_PACKED" &&
      entry.packageTarballScope === false &&
      entry.licenseQualification ===
        "LOCKFILE_TARBALL_DECLARATIONS_CONSISTENT" &&
      entry.concludedLicenseExpression === licence &&
      entry.tarballDeclaredLicenseExpression === licence &&
      entry.artifactEvidence.archiveSha256 ===
        artifact.archive.evidence.sha256 &&
      entry.artifactEvidence.scanSha256 === artifact.scan.evidence.sha256,
  );
  if (!externalEvidence.length) {
    if (!topLevelLicence.length)
      reasons.push("MISSING_INSPECTABLE_LICENCE_TEXT");
    if (!prior) {
      const files = scan.files.filter(({ path }) => inScope(path));
      const detections = new Map(
        files.map(({ path, detected_license_expression_spdx }) => [
          path,
          detected_license_expression_spdx,
        ]),
      );
      if (
        licence &&
        !topLevelLicence.some(({ path }) => detections.get(path) === licence)
      )
        reasons.push("LICENCE_TEXT_NOT_CORROBORATED_BY_SCANCODE");
      if (
        licence &&
        (files.some(
          ({ detected_license_expression_spdx: found }) =>
            found && found !== licence,
        ) ||
          scan.license_detections?.some(
            ({ license_expression_spdx: found }) => found && found !== licence,
          ))
      )
        reasons.push("CONFLICTING_SCANCODE_LICENCE_EVIDENCE");
      if (
        legal.some(
          ({ kind, path, size }) =>
            ["THIRD_PARTY_LICENCE", "PATENTS"].includes(kind) ||
            (kind === "NOTICE" && (size === 0 || !detections.has(path))),
        ) ||
        scan.archiveCoverage.omittedFiles.some(
          ({ reason, path }) =>
            inScope(path) && reason === "NATIVE_NODE_BINARY_NOT_SCANNED",
        )
      )
        reasons.push("NOTICE_OR_OPAQUE_MATERIAL_REQUIRES_RIGHTS_DISPOSITION");
    }
  }
  return {
    manifestSha256,
    authenticatedDeclarations: stableJson(
      productionDependencyDeclarations(metadata),
    ),
    sourceLicenceSha256: compactMeasurements
      ? metadata.licenseSha256
      : sha256(stableJson(metadata.license ?? null)),
    material: {
      name: metadata.name,
      version: metadata.version,
      artifactId: artifact.artifactId,
      archiveMember,
      scope,
      licence,
      disposition:
        prior || externalEvidence.length
          ? "EXACT_CANONICAL_MATERIAL_EVIDENCE"
          : "STANDING_EXTERNAL_RUNTIME_RULE",
      reasons,
      legalFiles: legal.map(({ path, kind, blob }) => ({ path, kind, blob })),
      externalEvidence,
      ...(prior ? { canonicalMaterialLocation: prior.dependencyPath } : {}),
    },
  };
}

// Bind archive work once per physical package member, including when npm chose
// several aliases or nested locations for the same immutable archive.
export function materialDecisions({
  occurrences,
  artifact,
  archive,
  scan,
  canonicalMaterials,
  compactMeasurements,
}) {
  const entryByPath = new Map(
    archive.entries.map((entry) => [entry.path, entry]),
  );
  const byMemberPath = new Map();
  return occurrences.map(
    ({
      location,
      installedManifestSha256,
      lockLicence,
      lockDeclarations,
      bundled,
    }) => {
      const memberPath = bundled?.packageJsonPath ?? "package.json";
      if (!byMemberPath.has(memberPath))
        byMemberPath.set(
          memberPath,
          assessArchiveMember({
            bundled,
            artifact,
            archive,
            entryByPath,
            scan,
            canonicalMaterials,
            compactMeasurements,
          }),
        );
      const {
        manifestSha256,
        sourceLicenceSha256,
        authenticatedDeclarations,
        material,
      } = byMemberPath.get(memberPath);
      assert.equal(
        installedManifestSha256,
        manifestSha256,
        `Installed manifest differs from authenticated archive at ${location}`,
      );
      // Native replay independently determines edges from the retained lock.
      // A changed lock declaration must not broaden that native resolution.
      assert.equal(
        stableJson(lockDeclarations),
        authenticatedDeclarations,
        `Authenticated dependency declarations differ at ${location}`,
      );
      const reasons = [...material.reasons];
      if (
        lockLicence !== null &&
        sha256(stableJson(lockLicence)) !== sourceLicenceSha256
      )
        reasons.push("LOCK_AND_ARCHIVE_LICENCE_DISAGREE");
      return {
        ...material,
        location,
        installedManifestSha256,
        reasons,
        disposition: reasons.length
          ? "REQUIRES_HUMAN_REVIEW"
          : material.disposition,
      };
    },
  );
}
