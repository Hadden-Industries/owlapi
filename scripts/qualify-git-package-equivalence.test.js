import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync, gzipSync } from "node:zlib";

import * as qualification from "./qualify-git-package-equivalence.mjs";
import {
  INSTALLED_PACKAGE_TEST_SCRIPTS,
  assertFreshOutputDirectory,
  consumerInstallArguments,
  parseQualificationArguments,
  qualifyGitPackageEquivalence,
} from "./qualify-git-package-equivalence.mjs";
import { formatSha256Sums, sha256Buffer } from "./release-artifacts.mjs";

const COMMIT = "caabb1197ffdab91c1e10d596d177b5142aea5c1";
const GIT_SPEC = `git+https://github.com/Hadden-Industries/owlapi.git#${COMMIT}`;
const TARBALL_SHA256 = "a".repeat(64);
const ARTIFACT_DIGEST =
  "sha256:f5967321e1c18a9c5aa14ad44a1d45fe3606605453866ce7746afe9c394f52d7";
const EXPORTS = {
  ".": "./index.js",
  "./apibinding": "./apibinding/index.js",
  "./model": "./model/index.js",
  "./io": "./io/index.js",
  "./formats": "./formats/index.js",
};
const ACCEPTED_NPM_CONFIGURATION = {
  userConfig: "GENERATED_EMPTY",
  globalConfig: "GENERATED_EMPTY",
  registry: "https://registry.npmjs.org/",
  nodeEnvironment: "development",
  ignoreScripts: false,
  strictAllowScripts: false,
  packageLock: true,
  installStrategy: "hoisted",
  include: ["prod", "dev", "optional", "peer"],
  omit: [],
};

const canonicalDigest = (value) =>
  sha256Buffer(Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));

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

const zipArchive = (entries) => {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const { path, content } of entries) {
    const name = Buffer.from(path, "utf8");
    const body = Buffer.from(content);
    const compressed = deflateRawSync(body);
    const checksum = crc32(body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(body.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    const localRecord = Buffer.concat([localHeader, name, compressed]);
    localParts.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(body.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([centralHeader, name]));
    localOffset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const candidateArtifactArchive = () => {
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
  return zipArchive([
    { path: "SHA256SUMS", content: checksumText },
    { path: sbomFileName, content: sbomText },
    { path: tarballFileName, content: tarball },
  ]);
};

const packageManifest = (overrides = {}) => ({
  name: "owlapi",
  version: "0.1.0-alpha.0",
  type: "module",
  exports: EXPORTS,
  files: ["index.js", "internal/"],
  sideEffects: false,
  scripts: { test: "jest" },
  repository: {
    type: "git",
    url: "git+https://github.com/Hadden-Industries/owlapi.git",
  },
  ...overrides,
});

const candidateBundle = (overrides = {}) => ({
  schemaVersion: 1,
  package: { name: "owlapi", version: "0.1.0-alpha.0" },
  sourceState: "DOWNLOADED_SAME_RUN_CANDIDATE",
  tarball: {
    fileName: "owlapi-0.1.0-alpha.0.tgz",
    bytes: 179_356,
    sha256: TARBALL_SHA256,
  },
  sbom: {
    fileName: "owlapi-0.1.0-alpha.0.cdx.json",
    bytes: 100,
    sha256: "c".repeat(64),
    specVersion: "1.6",
  },
  checksumFile: "SHA256SUMS",
  ...overrides,
});

const publicationControl = () => ({
  schemaVersion: 2,
  enabled: true,
  mode: "DIRECT_BOOTSTRAP",
  coordinate: "owlapi@0.1.0-alpha.0",
  channel: "next",
  reconciliation: {
    enabled: true,
    source: {
      repository: "Hadden-Industries/owlapi",
      workflow: ".github/workflows/release.yml",
      runId: 33_160_042_447,
      runAttempt: 1,
      commit: COMMIT,
      tag: "v0.1.0-alpha.0",
    },
    candidateArtifact: {
      id: 9_682_090_118,
      name: "owlapi-0.1.0-alpha.0-candidate-33160042447-1",
      digest: ARTIFACT_DIGEST,
      expiresAt: "2026-11-26T09:36:09Z",
    },
  },
});

const fileEntry = (path, content) => ({
  path,
  type: "file",
  mode: "regular",
  bytes: Buffer.byteLength(content),
  sha256: sha256Buffer(Buffer.from(content, "utf8")),
});

const tree = (entries = [fileEntry("index.js", "export {};\n")]) => ({
  entries,
  fileCount: entries.length,
  rootSha256: canonicalDigest(entries),
});

const productionGraph = (version = "2.3.0") => ({
  name: "consumer",
  version: "1.0.0",
  path: "C:/ignored/consumer",
  dependencies: {
    owlapi: {
      version: "0.1.0-alpha.0",
      resolved: "ignored-transport",
      dependencies: { n3: { version } },
    },
  },
});

const gitLock = () => ({
  lockfileVersion: 3,
  packages: {
    "": {
      dependencies: { owlapi: GIT_SPEC },
    },
    "node_modules/owlapi": {
      version: "0.1.0-alpha.0",
      resolved: GIT_SPEC,
    },
  },
});

const successfulObservation = (kind) => ({
  kind,
  installedManifest: packageManifest(),
  tree: tree(),
  npmLs: productionGraph(),
  lockfile: kind === "git" ? gitLock() : { lockfileVersion: 3 },
  tests: INSTALLED_PACKAGE_TEST_SCRIPTS.map((script) => ({
    script,
    result: "PASS",
  })),
});

const input = () => ({
  artifactArchivePath: "C:/candidate-artifact.zip",
  gitSpec: GIT_SPEC,
  outputDirectory: "C:/output",
});

const makeAdapters = (overrides = {}) => {
  const events = [];
  const persisted = [];
  const adapters = {
    prepareOutput: async () => events.push("prepare-output"),
    loadInputs: async () => ({
      candidateBundle: candidateBundle(),
      publicationControl: publicationControl(),
      sourceManifest: packageManifest(),
      artifactArchive: {
        bytes: 200_000,
        sha256: ARTIFACT_DIGEST.slice("sha256:".length),
      },
      tarballPath: "C:/candidate/owlapi-0.1.0-alpha.0.tgz",
    }),
    createTemporaryRoot: async () => ({
      parent: "C:/temporary",
      root: "C:/temporary/owlapi-equivalence-test",
    }),
    npmConfigurationFacts: async () =>
      structuredClone(ACCEPTED_NPM_CONFIGURATION),
    observeConsumer: async ({ kind }) => {
      events.push(`observe-${kind}`);
      return successfulObservation(kind);
    },
    runtimeFacts: async () => ({
      node: "v24.19.0",
      npm: "12.0.2",
      platform: "win32",
      architecture: "x64",
      osRelease: "test",
    }),
    persistSuccess: async (value) => {
      events.push("persist-success");
      persisted.push(value);
    },
    persistFailure: async (value) => {
      events.push("persist-failure");
      persisted.push(value);
    },
    cleanup: async () => events.push("cleanup"),
    now: () => "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
  return { adapters, events, persisted };
};

describe("qualification command boundary", () => {
  test("pins proof-affecting npm settings and removes hostile ambient npm controls", () => {
    expect(
      qualification.sanitizedConsumerEnvironment({
        Path: "C:/tools",
        NODE_ENV: "production",
        npm_config_ignore_scripts: "true",
        NPM_CONFIG_REGISTRY: "https://registry.example.test/",
        npm_package_name: "ambient-package",
        NODE_AUTH_TOKEN: "secret",
        NPM_TOKEN: "secret",
      }),
    ).toEqual({ Path: "C:/tools", NODE_ENV: "development" });
    expect(
      qualification.consumerNpmConfigurationArguments({
        userConfigPath: "C:/temporary/user.npmrc",
        globalConfigPath: "C:/temporary/global.npmrc",
      }),
    ).toEqual([
      "--userconfig=C:/temporary/user.npmrc",
      "--globalconfig=C:/temporary/global.npmrc",
      "--registry=https://registry.npmjs.org/",
    ]);
  });

  test("accepts only the effective npm settings emitted by the isolated configuration", () => {
    const paths = {
      userConfigPath: "C:/temporary/user.npmrc",
      globalConfigPath: "C:/temporary/global.npmrc",
    };
    const effective = {
      userconfig: "C:/temporary/user.npmrc",
      globalconfig: "C:/temporary/global.npmrc",
      registry: "https://registry.npmjs.org/",
      "ignore-scripts": false,
      "strict-allow-scripts": false,
      "package-lock": true,
      "install-strategy": "hoisted",
      include: ["prod", "dev", "optional", "peer"],
      omit: [],
    };
    const output = [
      "userconfig=C:\\temporary\\user.npmrc",
      "globalconfig=C:\\temporary\\global.npmrc",
      "registry=https://registry.npmjs.org/",
      "ignore-scripts=false",
      "strict-allow-scripts=false",
      "package-lock=true",
      "install-strategy=hoisted",
      "include=prod,dev,optional,peer",
      "omit=",
      "",
    ].join("\n");

    expect(qualification.parseNpmConfigGetOutput(output)).toEqual({
      ...effective,
      userconfig: "C:\\temporary\\user.npmrc",
      globalconfig: "C:\\temporary\\global.npmrc",
    });
    expect(() =>
      qualification.parseNpmConfigGetOutput(`${output}registry=duplicate\n`),
    ).toThrow(/duplicate/u);

    expect(
      qualification.validateEffectiveNpmConfiguration(effective, paths),
    ).toEqual(ACCEPTED_NPM_CONFIGURATION);

    expect(() =>
      qualification.validateEffectiveNpmConfiguration(
        { ...effective, "ignore-scripts": true },
        paths,
      ),
    ).toThrow(/npm configuration/u);
  });

  test("derives candidate bytes only from an archive matching the controlled artifact digest", () => {
    const archive = candidateArtifactArchive();
    const digest = `sha256:${sha256Buffer(archive)}`;

    expect(
      qualification.verifyCandidateArtifactArchive({
        archive,
        expectedDigest: digest,
      }),
    ).toMatchObject({
      artifactArchive: {
        bytes: archive.length,
        sha256: digest.slice("sha256:".length),
      },
      candidate: {
        package: { name: "owlapi", version: "0.1.0-alpha.0" },
        tarball: { fileName: "owlapi-0.1.0-alpha.0.tgz" },
      },
    });

    expect(() =>
      qualification.verifyCandidateArtifactArchive({
        archive,
        expectedDigest: `sha256:${"0".repeat(64)}`,
      }),
    ).toThrow(/artifact archive digest/u);
  });

  test("allows only the direct root Git dependency in the Git consumer", () => {
    expect(consumerInstallArguments("candidate", "C:/cache")).toEqual([
      "install",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts=false",
      "--strict-allow-scripts=false",
      "--package-lock=true",
      "--install-strategy=hoisted",
      "--include=prod",
      "--include=dev",
      "--include=optional",
      "--include=peer",
      "--cache",
      "C:/cache",
    ]);
    expect(consumerInstallArguments("git", "C:/cache")).toEqual([
      "install",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts=false",
      "--strict-allow-scripts=false",
      "--package-lock=true",
      "--install-strategy=hoisted",
      "--include=prod",
      "--include=dev",
      "--include=optional",
      "--include=peer",
      "--allow-git=root",
      "--cache",
      "C:/cache",
    ]);
  });

  test("parses the three required arguments and rejects unknown, duplicate, or mutable input", () => {
    expect(
      parseQualificationArguments([
        "--artifact-archive",
        "artifact.zip",
        "--git-spec",
        GIT_SPEC,
        "--output",
        "output",
      ]),
    ).toEqual({
      artifactArchivePath: "artifact.zip",
      gitSpec: GIT_SPEC,
      outputDirectory: "output",
    });

    for (const arguments_ of [
      ["--artifact-archive", "artifact.zip", "--output", "output"],
      [
        "--artifact-archive",
        "artifact.zip",
        "--git-spec",
        GIT_SPEC,
        "--output",
        "output",
        "--extra",
        "value",
      ],
      [
        "--artifact-archive",
        "artifact.zip",
        "--artifact-archive",
        "again.zip",
        "--git-spec",
        GIT_SPEC,
        "--output",
        "output",
      ],
      [
        "--artifact-archive",
        "artifact.zip",
        "--git-spec",
        "github:Hadden-Industries/owlapi#main",
        "--output",
        "output",
      ],
    ]) {
      expect(() => parseQualificationArguments(arguments_)).toThrow();
    }
  });

  test("creates only an absent output directory and rejects an occupied one", () => {
    const root = mkdtempSync(join(tmpdir(), "owlapi-equivalence-output-test-"));
    try {
      const absent = join(root, "new-output");
      expect(assertFreshOutputDirectory(absent)).toBe(absent);
      expect(() => assertFreshOutputDirectory(absent)).toThrow(
        /already exists/u,
      );

      const occupied = join(root, "occupied");
      mkdirSync(occupied);
      expect(() => assertFreshOutputDirectory(occupied)).toThrow(
        /already exists/u,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe("two-consumer qualification orchestration", () => {
  test("assembles deterministic PASS evidence and always cleans the validated temporary root", async () => {
    const { adapters, events, persisted } = makeAdapters();

    const result = await qualifyGitPackageEquivalence(input(), adapters);

    expect(result).toEqual(persisted[0]);
    expect(result).toMatchObject({
      schemaVersion: 1,
      result: "PASS",
      qualifiedAt: "2026-08-31T12:00:00.000Z",
      package: { name: "owlapi", version: "0.1.0-alpha.0", exports: EXPORTS },
      source: {
        runId: 33_160_042_447,
        runAttempt: 1,
        artifactId: 9_682_090_118,
        artifactDigest: ARTIFACT_DIGEST,
        gitSpec: GIT_SPEC,
        commit: COMMIT,
        tag: "v0.1.0-alpha.0",
      },
      comparisons: {
        installedPackageTree: { equal: true, differences: [] },
        productionGraph: { equal: true },
      },
      npmConfiguration: {
        userConfig: "GENERATED_EMPTY",
        globalConfig: "GENERATED_EMPTY",
        registry: "https://registry.npmjs.org/",
        nodeEnvironment: "development",
        ignoreScripts: false,
        strictAllowScripts: false,
        packageLock: true,
        installStrategy: "hoisted",
        include: ["prod", "dev", "optional", "peer"],
        omit: [],
      },
    });
    expect(result.installedTests).toEqual(
      INSTALLED_PACKAGE_TEST_SCRIPTS.map((script) => ({
        script,
        candidate: "PASS",
        git: "PASS",
      })),
    );
    expect(events).toEqual([
      "prepare-output",
      "observe-candidate",
      "observe-git",
      "persist-success",
      "cleanup",
    ]);
  });

  test.each([
    [
      "artifact archive digest drift",
      () =>
        makeAdapters({
          loadInputs: async () => ({
            candidateBundle: candidateBundle(),
            publicationControl: publicationControl(),
            sourceManifest: packageManifest(),
            artifactArchive: {
              bytes: 200_000,
              sha256: "0".repeat(64),
            },
            tarballPath: "C:/candidate/owlapi-0.1.0-alpha.0.tgz",
          }),
        }),
      /artifact archive digest/u,
      ["prepare-output"],
    ],
    [
      "source manifest drift",
      () =>
        makeAdapters({
          loadInputs: async () => ({
            candidateBundle: candidateBundle(),
            publicationControl: publicationControl(),
            sourceManifest: packageManifest({ exports: { ".": "./wrong.js" } }),
            artifactArchive: {
              bytes: 200_000,
              sha256: ARTIFACT_DIGEST.slice("sha256:".length),
            },
            tarballPath: "C:/candidate/owlapi-0.1.0-alpha.0.tgz",
          }),
        }),
      /exports/u,
      ["prepare-output"],
    ],
    [
      "unsafe temporary root",
      () =>
        makeAdapters({
          createTemporaryRoot: async () => ({
            parent: "C:/temporary",
            root: "C:/temporary",
          }),
        }),
      /temporary root/u,
      ["prepare-output"],
    ],
  ])(
    "fails closed before installation on %s",
    async (_label, create, message, expectedEvents) => {
      const { adapters, events } = create();
      await expect(
        qualifyGitPackageEquivalence(input(), adapters),
      ).rejects.toThrow(message);
      expect(events).toEqual(expectedEvents);
    },
  );

  test("persists a bounded failure and cleans up when the command runner fails", async () => {
    const { adapters, events, persisted } = makeAdapters({
      observeConsumer: async ({ kind }) => {
        if (kind === "candidate") throw new Error("npm install failed");
        return successfulObservation(kind);
      },
    });

    await expect(
      qualifyGitPackageEquivalence(input(), adapters),
    ).rejects.toThrow(/npm install failed/u);
    expect(events).toEqual(["prepare-output", "persist-failure", "cleanup"]);
    expect(persisted[0]).toEqual({
      schemaVersion: 1,
      result: "FAIL",
      failedAt: "2026-08-31T12:00:00.000Z",
      error: { name: "Error", message: "npm install failed" },
    });
  });

  test.each([
    [
      "partial installation",
      (kind) => ({ ...successfulObservation(kind), installedManifest: null }),
      /installed manifest/u,
    ],
    [
      "package-tree mismatch",
      (kind) => ({
        ...successfulObservation(kind),
        tree:
          kind === "git"
            ? tree([fileEntry("index.js", "export const changed = true;\n")])
            : tree(),
      }),
      /package trees differ/u,
    ],
    [
      "production-graph mismatch",
      (kind) => ({
        ...successfulObservation(kind),
        npmLs: productionGraph(kind === "git" ? "2.3.1" : "2.3.0"),
      }),
      /production graphs differ/u,
    ],
  ])(
    "persists failure and cleans up on %s",
    async (_label, observation, message) => {
      const { adapters, events } = makeAdapters({
        observeConsumer: async ({ kind }) => observation(kind),
      });

      await expect(
        qualifyGitPackageEquivalence(input(), adapters),
      ).rejects.toThrow(message);
      expect(events.at(-2)).toBe("persist-failure");
      expect(events.at(-1)).toBe("cleanup");
    },
  );
});
