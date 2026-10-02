import { basename } from "node:path";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PACKAGE_FILE_STEM,
  PACKAGE_SBOM_PURL,
} from "./package-identity.mjs";

import {
  formatSha256Sums,
  readGzipTarFile,
  sha256Buffer,
} from "./release-artifacts.mjs";

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const verifyCandidateBundle = (
  { checksumText, fileNames, sbomText, tarball },
  historicalAlpha = false,
) => {
  const packageManifest = JSON.parse(
    readGzipTarFile(tarball, "package.json").toString("utf8"),
  );
  const { name, version } = packageManifest;
  const expectedName = historicalAlpha ? "owlapi" : PACKAGE_NAME;
  const expectedVersion = historicalAlpha ? "0.1.0-alpha.0" : PACKAGE_VERSION;
  const fileStem = historicalAlpha ? "owlapi" : PACKAGE_FILE_STEM;
  if (name !== expectedName || version !== expectedVersion) {
    throw new Error(
      "Downloaded candidate tarball has an unexpected package identity.",
    );
  }
  const tarballFileName = `${fileStem}-${version}.tgz`;
  const sbomFileName = `${fileStem}-${version}.cdx.json`;
  const expectedFileNames = ["SHA256SUMS", sbomFileName, tarballFileName].sort(
    compareCodeUnits,
  );
  const actualFileNames = [...fileNames]
    .map((fileName) => basename(fileName))
    .sort(compareCodeUnits);
  if (JSON.stringify(actualFileNames) !== JSON.stringify(expectedFileNames)) {
    throw new Error(
      `Downloaded candidate inventory is not closed: expected=${JSON.stringify(expectedFileNames)} actual=${JSON.stringify(actualFileNames)}.`,
    );
  }

  const sbom = JSON.parse(sbomText);
  if (
    sbom.bomFormat !== "CycloneDX" ||
    sbom.specVersion !== "1.6" ||
    sbom.metadata?.component?.type !== "library" ||
    (sbom.metadata?.component?.group
      ? `${sbom.metadata.component.group}/${sbom.metadata.component.name}`
      : sbom.metadata?.component?.name) !== name ||
    sbom.metadata?.component?.version !== version ||
    (!historicalAlpha && sbom.metadata?.component?.purl !== PACKAGE_SBOM_PURL)
  ) {
    throw new Error("Downloaded candidate SBOM identity is invalid.");
  }

  const tarballSha256 = sha256Buffer(tarball);
  const sbomSha256 = sha256Buffer(Buffer.from(sbomText));
  const expectedChecksums = formatSha256Sums([
    { fileName: tarballFileName, sha256: tarballSha256 },
    { fileName: sbomFileName, sha256: sbomSha256 },
  ]);
  if (checksumText !== expectedChecksums) {
    throw new Error(
      "Downloaded candidate SHA256SUMS is not the exact verified two-entry form.",
    );
  }

  return {
    package: { name, version },
    packageManifest,
    sbom: {
      fileName: sbomFileName,
      sha256: sbomSha256,
      specVersion: sbom.specVersion,
      componentType: sbom.metadata.component.type,
    },
    tarball: {
      fileName: tarballFileName,
      sha256: tarballSha256,
      bytes: tarball.length,
    },
  };
};

/** Current release path accepts only the owner-selected scoped RC. */
export const verifyDownloadedCandidateBundle = (input) =>
  verifyCandidateBundle(input);

/** Read-only historical replay; callers additionally bind the retained alpha source/run. */
export const verifyHistoricalAlphaCandidateBundle = (input) =>
  verifyCandidateBundle(input, true);
