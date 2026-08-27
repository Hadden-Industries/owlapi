import { createHash } from "node:crypto";
import { normalizeLockedRegistryGraph, verifySri } from "./lock-graph.mjs";

const ALPHA_INTEGRITY =
  "sha512-/X/Fvp13e9O5/oZJEC3tNeTJU6FFkdrsM2Pz8EfXCpuP5BB9sxNyQxxYsAfCXDWuCTd6femcc7ChDDZqaFWu8A==";
const BRAVO_INTEGRITY =
  "sha512-kc6+6QyWBeEvg+2eRW6X60E97TlzgNyRJk9BNJmcPvGvdbKbjmQM3LD+lT3j3pGbzn84Yhm7NVUVWnv59ha7wA==";

const lockfile = ({ entries = {}, lockfileVersion = 3 } = {}) =>
  Buffer.from(
    `${JSON.stringify({
      name: "fixture-root",
      version: "1.2.3",
      lockfileVersion,
      packages: {
        "": {
          name: "fixture-root",
          version: "1.2.3",
          license: "AGPL-3.0-only",
        },
        ...entries,
      },
    })}\n`,
  );

const alpha = (overrides = {}) => ({
  version: "1.0.0",
  resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
  integrity: ALPHA_INTEGRITY,
  dev: true,
  license: "MIT",
  ...overrides,
});

describe("normalizeLockedRegistryGraph", () => {
  it("deduplicates one immutable artifact while retaining every lockfile occurrence", () => {
    const bytes = lockfile({
      entries: {
        "node_modules/alpha": alpha(),
        "node_modules/tool/node_modules/alpha": alpha({
          optional: true,
          os: ["linux"],
          cpu: ["x64"],
          libc: ["glibc"],
        }),
      },
    });

    const graph = normalizeLockedRegistryGraph(bytes);

    expect(graph).toMatchObject({
      lockfileVersion: 3,
      package: { name: "fixture-root", version: "1.2.3" },
    });
    expect(graph.lockfileSha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(graph.artifacts).toHaveLength(1);
    expect(graph.artifacts[0]).toMatchObject({
      name: "alpha",
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
      integrity: ALPHA_INTEGRITY,
      occurrencePaths: [
        "node_modules/alpha",
        "node_modules/tool/node_modules/alpha",
      ],
    });
    expect(graph.artifacts[0].artifactId).toMatch(/^[0-9a-f]{64}$/u);
    expect(graph.occurrences).toEqual([
      {
        dependencyPath: "node_modules/alpha",
        dependencyName: "alpha",
        artifactId: graph.artifacts[0].artifactId,
        development: true,
        optional: false,
        platformSelectors: { cpu: [], os: [], libc: [] },
      },
      {
        dependencyPath: "node_modules/tool/node_modules/alpha",
        dependencyName: "alpha",
        artifactId: graph.artifacts[0].artifactId,
        development: true,
        optional: true,
        platformSelectors: {
          cpu: ["x64"],
          os: ["linux"],
          libc: ["glibc"],
        },
      },
    ]);
  });

  it("uses an alias lock entry's explicit package name to share the underlying tarball", () => {
    const bytes = lockfile({
      entries: {
        "node_modules/alpha": alpha(),
        "node_modules/alpha-compat": alpha({ name: "alpha" }),
      },
    });

    const graph = normalizeLockedRegistryGraph(bytes);

    expect(graph.artifacts).toHaveLength(1);
    expect(graph.artifacts[0]).toMatchObject({
      name: "alpha",
      occurrencePaths: ["node_modules/alpha", "node_modules/alpha-compat"],
    });
    expect(
      graph.occurrences.map(({ dependencyName }) => dependencyName),
    ).toEqual(["alpha", "alpha-compat"]);
    expect(
      new Set(graph.occurrences.map(({ artifactId }) => artifactId)).size,
    ).toBe(1);
  });

  it.each([
    [
      "non-v3 lockfile",
      lockfile({ lockfileVersion: 2 }),
      /lockfile version 3/iu,
    ],
    [
      "HTTP registry URL",
      lockfile({
        entries: {
          "node_modules/alpha": alpha({
            resolved: "http://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
          }),
        },
      }),
      /public npm registry HTTPS URL/iu,
    ],
    [
      "alternate HTTPS host",
      lockfile({
        entries: {
          "node_modules/alpha": alpha({
            resolved: "https://example.test/alpha/-/alpha-1.0.0.tgz",
          }),
        },
      }),
      /public npm registry HTTPS URL/iu,
    ],
    [
      "registry URL credentials",
      lockfile({
        entries: {
          "node_modules/alpha": alpha({
            resolved:
              "https://token@registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
          }),
        },
      }),
      /public npm registry HTTPS URL/iu,
    ],
    [
      "missing integrity",
      lockfile({
        entries: { "node_modules/alpha": alpha({ integrity: undefined }) },
      }),
      /exact sha512 SRI/iu,
    ],
    [
      "unsupported integrity",
      lockfile({
        entries: {
          "node_modules/alpha": alpha({
            integrity: "sha1-qUqP5cyxm6YcTAhz05Hph5gvu9M=",
          }),
        },
      }),
      /exact sha512 SRI/iu,
    ],
    [
      "missing version",
      lockfile({
        entries: { "node_modules/alpha": alpha({ version: undefined }) },
      }),
      /exact version/iu,
    ],
    [
      "non-node_modules path",
      lockfile({ entries: { vendor: alpha() } }),
      /node_modules dependency path/iu,
    ],
  ])("rejects %s", (_label, bytes, expectedMessage) => {
    expect(() => normalizeLockedRegistryGraph(bytes)).toThrow(expectedMessage);
  });

  it("rejects one package coordinate mapped to contradictory immutable content", () => {
    const bytes = lockfile({
      entries: {
        "node_modules/alpha": alpha(),
        "node_modules/tool/node_modules/alpha": alpha({
          integrity: BRAVO_INTEGRITY,
        }),
      },
    });

    expect(() => normalizeLockedRegistryGraph(bytes)).toThrow(
      /contradictory locked artifacts for alpha@1\.0\.0/iu,
    );
  });
});

describe("verifySri", () => {
  it("accepts bytes that match the exact SHA-512 SRI", () => {
    expect(verifySri(Buffer.from("artifact-a"), ALPHA_INTEGRITY)).toBe(true);
  });

  it("rejects changed bytes", () => {
    expect(() => verifySri(Buffer.from("artifact-b"), ALPHA_INTEGRITY)).toThrow(
      /integrity mismatch/iu,
    );
  });
});
