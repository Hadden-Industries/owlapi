import { gzipSync } from "node:zlib";

import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { formatSha256Sums, sha256Buffer } from "./release-artifacts.mjs";

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

const fixture = () => {
  const version = "0.1.0-alpha.0";
  const tarballFileName = `owlapi-${version}.tgz`;
  const sbomFileName = `owlapi-${version}.cdx.json`;
  const tarball = gzipSync(
    Buffer.concat([
      tarEntry(
        "package/package.json",
        `${JSON.stringify({ name: "owlapi", version })}\n`,
      ),
      Buffer.alloc(1024),
    ]),
  );
  const sbomText = `${JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: { type: "library", name: "owlapi", version },
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
  test("derives and verifies identity from the tarball itself", () => {
    const result = verifyDownloadedCandidateBundle(fixture());

    expect(result.package).toEqual({
      name: "owlapi",
      version: "0.1.0-alpha.0",
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
    expect(() =>
      verifyDownloadedCandidateBundle({
        ...fixture(),
        checksumText: "0".repeat(64),
      }),
    ).toThrow(/SHA256SUMS/u);

    const input = fixture();
    input.sbomText = input.sbomText.replace(
      '"name":"owlapi"',
      '"name":"other"',
    );
    expect(() => verifyDownloadedCandidateBundle(input)).toThrow(
      /SBOM identity/u,
    );
  });
});
