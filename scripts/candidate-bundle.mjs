import { basename } from "node:path";

import {
  formatSha256Sums,
  readGzipTarFile,
  sha256Buffer,
} from "./release-artifacts.mjs";

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

export const verifyDownloadedCandidateBundle = ({
  checksumText,
  fileNames,
  sbomText,
  tarball,
}) => {
  const packageManifest = JSON.parse(
    readGzipTarFile(tarball, "package.json").toString("utf8"),
  );
  const { name, version } = packageManifest;
  if (name !== "owlapi" || typeof version !== "string") {
    throw new Error(
      "Downloaded candidate tarball has an unexpected package identity.",
    );
  }
  const tarballFileName = `${name}-${version}.tgz`;
  const sbomFileName = `${name}-${version}.cdx.json`;
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
    sbom.metadata?.component?.name !== name ||
    sbom.metadata?.component?.version !== version
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
