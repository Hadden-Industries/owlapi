import { PACKAGE_VERSION } from "./package-identity.mjs";
import { gzipSync } from "node:zlib";

import {
  verifyDownloadedCandidateBundle,
  verifyHistoricalRc2CandidateBundle,
} from "./candidate-bundle.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { formatSha256Sums } from "./release-artifacts.mjs";

const tarEntry = (name, content) => {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write(
    `${body.length.toString(8).padStart(11, "0")}\0`,
    124,
    12,
    "ascii",
  );
  header.write("0", 156, 1, "ascii");
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
};

const fixture = (version = PACKAGE_VERSION) => {
  const tarballFileName = `hadden-industries-owlapi-${version}.tgz`;
  const sbomFileName = `hadden-industries-owlapi-${version}.cdx.json`;
  const tarball = gzipSync(
    Buffer.concat([
      tarEntry(
        "package/package.json",
        `${JSON.stringify({ name: "@hadden-industries/owlapi", version })}\n`,
      ),
      Buffer.alloc(1024),
    ]),
  );
  const sbomText = `${JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: {
        type: "library",
        name: "@hadden-industries/owlapi",
        version,
        purl: `pkg:npm/%40hadden-industries/owlapi@${version}?vcs_url=git%2Bhttps%3A%2F%2Fgithub.com%2FHadden-Industries%2Fowlapi.git`,
      },
    },
  })}\n`;
  const checksumText = formatSha256Sums([
    { fileName: tarballFileName, sha256: sha256Buffer(tarball) },
    {
      fileName: sbomFileName,
      sha256: sha256Buffer(Buffer.from(sbomText)),
    },
  ]);
  return {
    checksumText,
    fileNames: [tarballFileName, sbomFileName, "SHA256SUMS"],
    sbomText,
    tarball,
  };
};

describe("downloaded release-candidate bundle", () => {
  test("historical rc.2 verification is isolated from the current candidate", () => {
    const historical = fixture("0.1.0-rc.2");
    expect(verifyHistoricalRc2CandidateBundle(historical).package.version).toBe(
      "0.1.0-rc.2",
    );
    expect(() => verifyDownloadedCandidateBundle(historical)).toThrow(
      /identity/u,
    );
    for (const version of [PACKAGE_VERSION, "0.1.0-rc.1", "0.1.0"])
      expect(() =>
        verifyHistoricalRc2CandidateBundle(fixture(version)),
      ).toThrow(/identity/u);
    const wrongPurl = {
      ...historical,
      sbomText: historical.sbomText.replace(
        "pkg:npm/%40hadden-industries/owlapi@0.1.0-rc.2?",
        `pkg:npm/%40hadden-industries/owlapi@${PACKAGE_VERSION}?`,
      ),
    };
    expect(() => verifyHistoricalRc2CandidateBundle(wrongPurl)).toThrow(
      /SBOM identity/u,
    );
  });
  test("rejects an unscoped SBOM PURL despite matching labels and checksums", () => {
    const input = fixture();
    input.sbomText = input.sbomText.replace(
      "pkg:npm/%40hadden-industries/owlapi@",
      "pkg:npm/owlapi@",
    );
    input.checksumText = formatSha256Sums([
      {
        fileName: `hadden-industries-owlapi-${PACKAGE_VERSION}.tgz`,
        sha256: sha256Buffer(input.tarball),
      },
      {
        fileName: `hadden-industries-owlapi-${PACKAGE_VERSION}.cdx.json`,
        sha256: sha256Buffer(Buffer.from(input.sbomText)),
      },
    ]);
    expect(() => verifyDownloadedCandidateBundle(input)).toThrow(
      /SBOM identity/u,
    );
  });
  test("derives and verifies identity from the tarball itself", () => {
    const result = verifyDownloadedCandidateBundle(fixture());

    expect(result.package).toEqual({
      name: "@hadden-industries/owlapi",
      version: PACKAGE_VERSION,
    });
    expect(result.sbom.specVersion).toBe("1.6");
    expect(result.tarball.sha256).toHaveLength(64);
  });

  test("rejects extra files before producing any derived evidence", () => {
    const input = fixture();
    input.fileNames.push("candidate-manifest.json");

    expect(() => verifyDownloadedCandidateBundle(input)).toThrow(
      /inventory is not closed/u,
    );
  });

  test("rejects checksum or SBOM identity drift", () => {
    const wrongRepository = fixture();
    wrongRepository.sbomText = wrongRepository.sbomText.replace(
      "Hadden-Industries%2F",
      "another-owner%2F",
    );
    expect(() => verifyDownloadedCandidateBundle(wrongRepository)).toThrow(
      /SBOM identity/u,
    );
    expect(() =>
      verifyDownloadedCandidateBundle({
        ...fixture(),
        checksumText: "0".repeat(64),
      }),
    ).toThrow(/SHA256SUMS/u);

    const input = fixture();
    input.sbomText = input.sbomText.replace(
      '"name":"@hadden-industries/owlapi"',
      '"name":"other"',
    );
    expect(() => verifyDownloadedCandidateBundle(input)).toThrow(
      /SBOM identity/u,
    );
  });
});
