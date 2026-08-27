import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";

const index = process.argv.indexOf("--candidate");
if (index === -1 || !process.argv[index + 1]) {
  throw new Error("Missing required --candidate argument.");
}
const candidateDirectory = resolve(process.argv[index + 1]);
if (!existsSync(candidateDirectory)) {
  throw new Error(
    `Downloaded candidate directory is absent: ${candidateDirectory}`,
  );
}

const fileNames = readdirSync(candidateDirectory);
const tarballFileName = fileNames.find((name) =>
  /^owlapi-.+\.tgz$/u.test(name),
);
const sbomFileName = fileNames.find((name) =>
  /^owlapi-.+\.cdx\.json$/u.test(name),
);
if (!tarballFileName || !sbomFileName) {
  throw new Error("Downloaded candidate is missing its tarball or SBOM.");
}
const result = verifyDownloadedCandidateBundle({
  checksumText: readFileSync(join(candidateDirectory, "SHA256SUMS"), "utf8"),
  fileNames,
  sbomText: readFileSync(join(candidateDirectory, sbomFileName), "utf8"),
  tarball: readFileSync(join(candidateDirectory, tarballFileName)),
});

const candidateManifest = {
  schemaVersion: 1,
  package: result.package,
  sourceState: "DOWNLOADED_SAME_RUN_CANDIDATE",
  tarball: result.tarball,
  sbom: result.sbom,
  checksumFile: "SHA256SUMS",
};
writeFileSync(
  join(candidateDirectory, "candidate-manifest.json"),
  `${JSON.stringify(candidateManifest, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  join(candidateDirectory, "bundle-verification.json"),
  `${JSON.stringify({ ...result, packageManifest: undefined }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${candidateDirectory}\n`);
