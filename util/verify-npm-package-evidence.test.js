import {
  measureArchiveInventories,
  parseVerifierArguments,
} from "./verify-npm-package-evidence.mjs";

describe("offline npm package evidence verifier CLI", () => {
  it("accepts no arguments because repository evidence paths are fixed", () => {
    expect(parseVerifierArguments([])).toEqual({});
  });

  it.each([["--write"], ["--manifest"], ["unexpected"]])(
    "rejects the unsupported argument %s",
    (argument) => {
      expect(() => parseVerifierArguments([argument])).toThrow(
        /does not accept arguments/iu,
      );
    },
  );

  it("reports reproducible maxima against every archive safety dimension", () => {
    expect(
      measureArchiveInventories([
        {
          artifact: { artifactId: "a", name: "alpha", version: "1.0.0" },
          inventory: {
            compressedBytes: 10,
            duplicateEntries: [],
            expandedBytes: 30,
            physicalEntryCount: 2,
            entries: [
              { path: "package/a", size: 20 },
              { path: "package/licence", size: 10 },
            ],
            evidenceFiles: [{ size: 10 }],
          },
        },
        {
          artifact: { artifactId: "b", name: "beta", version: "2.0.0" },
          inventory: {
            compressedBytes: 25,
            duplicateEntries: [],
            expandedBytes: 40,
            physicalEntryCount: 1,
            entries: [{ path: "package/a-longer-path", size: 40 }],
            evidenceFiles: [],
          },
        },
      ]),
    ).toEqual({
      artifactCount: 2,
      duplicateExtraEntryCount: 0,
      duplicatePathCount: 0,
      compressedBytes: {
        actual: 25,
        artifact: "beta@2.0.0",
        artifactId: "b",
        limit: 104857600,
      },
      expandedBytes: {
        actual: 40,
        artifact: "beta@2.0.0",
        artifactId: "b",
        limit: 536870912,
      },
      entries: {
        actual: 2,
        artifact: "alpha@1.0.0",
        artifactId: "a",
        limit: 100000,
      },
      entryBytes: {
        actual: 40,
        artifact: "beta@2.0.0",
        artifactId: "b",
        limit: 134217728,
        path: "package/a-longer-path",
      },
      pathBytes: {
        actual: 21,
        artifact: "beta@2.0.0",
        artifactId: "b",
        limit: 4096,
        path: "package/a-longer-path",
      },
      retainedEvidenceBytes: {
        actual: 10,
        artifact: "alpha@1.0.0",
        artifactId: "a",
        limit: 16777216,
      },
      totalCompressedBytes: 35,
      totalExpandedBytes: 70,
      totalPhysicalEntryCount: 3,
      totalRetainedEvidenceBytes: 10,
    });
  });
});
