import {
  assertDryRunMatchesCandidate,
  assertRecordedRequirement,
  assertRegistryBootstrapState,
  normalizeNpmPublishDryRun,
  npmPublishDryRunInvocation,
} from "./qualify-release.mjs";

const candidate = {
  package: { name: "owlapi", version: "0.1.0-alpha.0" },
  tarball: {
    fileName: "owlapi-0.1.0-alpha.0.tgz",
    sha256: "a".repeat(64),
    bytes: 1234,
  },
  packedPaths: ["README.md", "index.js", "package.json"],
};

describe("release-candidate publication qualification", () => {
  test("normalizes npm 12's single package-keyed dry-run envelope", () => {
    const record = {
      name: "owlapi",
      version: "0.1.0-alpha.0",
      filename: "owlapi-0.1.0-alpha.0.tgz",
    };

    expect(normalizeNpmPublishDryRun({ owlapi: record })).toEqual(record);
  });

  test("rejects an ambiguous or mislabeled dry-run envelope", () => {
    expect(() =>
      normalizeNpmPublishDryRun({
        owlapi: { name: "owlapi", version: "0.1.0-alpha.0" },
        other: { name: "other", version: "1.0.0" },
      }),
    ).toThrow(/exactly one package record/u);
    expect(() =>
      normalizeNpmPublishDryRun({
        unexpected: { name: "owlapi", version: "0.1.0-alpha.0" },
      }),
    ).toThrow(/key disagrees/u);
  });

  test("invokes the exact npm CLI through Node without a command shell", () => {
    expect(
      npmPublishDryRunInvocation({
        npmCli: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
        tarballPath: "C:\\candidate\\owlapi.tgz",
      }),
    ).toMatchObject({
      command: process.execPath,
      arguments: [
        "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
        "publish",
        "C:\\candidate\\owlapi.tgz",
        "--dry-run",
        "--tag",
        "next",
        "--access",
        "public",
        "--registry=https://registry.npmjs.org/",
        "--json",
      ],
    });
  });

  test("accepts an exact npm dry-run projection of the retained tarball", () => {
    expect(
      assertDryRunMatchesCandidate({
        candidate,
        dryRun: {
          name: "owlapi",
          version: "0.1.0-alpha.0",
          filename: "owlapi-0.1.0-alpha.0.tgz",
          size: 1234,
          entryCount: 3,
          files: [
            { path: "package.json" },
            { path: "README.md" },
            { path: "index.js" },
          ],
        },
      }),
    ).toEqual({
      coordinate: "owlapi@0.1.0-alpha.0",
      fileCount: 3,
      tarballSha256: "a".repeat(64),
    });
  });

  test("rejects a dry run with an extra packed path", () => {
    expect(() =>
      assertDryRunMatchesCandidate({
        candidate,
        dryRun: {
          name: "owlapi",
          version: "0.1.0-alpha.0",
          filename: "owlapi-0.1.0-alpha.0.tgz",
          size: 1234,
          entryCount: 4,
          files: [
            { path: "package.json" },
            { path: "README.md" },
            { path: "index.js" },
            { path: "unexpected.js" },
          ],
        },
      }),
    ).toThrow(/packlist/u);
  });

  test("accepts only the absent-coordinate direct-bootstrap state", () => {
    expect(
      assertRegistryBootstrapState({
        canonicalTagExists: false,
        registryVersion: null,
        retainedSha256: "a".repeat(64),
      }),
    ).toEqual({ action: "DIRECT_BOOTSTRAP_READY" });
  });

  test("rejects an already public coordinate at pre-publication time", () => {
    expect(() =>
      assertRegistryBootstrapState({
        canonicalTagExists: false,
        registryVersion: { tarballSha256: "a".repeat(64) },
        retainedSha256: "a".repeat(64),
      }),
    ).toThrow(/already public/u);
  });

  test("accepts only a terminal PASS result for a requested gate requirement", () => {
    expect(
      assertRecordedRequirement(
        {
          accepted: true,
          requirements: [
            { requirementId: "P19-BOUNDARY-001", finalResult: "PASS" },
          ],
        },
        "P19-BOUNDARY-001",
      ),
    ).toEqual({ requirementId: "P19-BOUNDARY-001", finalResult: "PASS" });
    expect(() =>
      assertRecordedRequirement(
        {
          accepted: false,
          requirements: [
            {
              requirementId: "P19-BOUNDARY-001",
              finalResult: "CONTROL_FAILURE",
            },
          ],
        },
        "P19-BOUNDARY-001",
      ),
    ).toThrow(/not PASS/u);
  });
});
