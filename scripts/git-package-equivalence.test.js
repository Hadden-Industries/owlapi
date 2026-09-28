import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GIT_BUILD_TRIGGER_SCRIPTS,
  assertGitInstallSuitability,
  compareInstalledPackageTrees,
  createInstalledPackageTreeManifest,
  normalizeProductionGraph,
  validateGitConsumerLock,
} from "./git-package-equivalence.mjs";
import * as equivalence from "./git-package-equivalence.mjs";
import { sha256Buffer } from "./release-artifacts.mjs";

const EXPECTED_EXPORTS = {
  ".": "./index.js",
  "./apibinding": "./apibinding/index.js",
  "./model": "./model/index.js",
  "./io": "./io/index.js",
  "./formats": "./formats/index.js",
};

const EXPECTED_PACKAGE = {
  name: "owlapi",
  version: "0.1.0-alpha.0",
  exports: EXPECTED_EXPORTS,
  repositoryUrl: "git+https://github.com/Hadden-Industries/owlapi.git",
};

const GIT_COMMIT = "caabb1197ffdab91c1e10d596d177b5142aea5c1";
const GIT_SPEC = `git+https://github.com/Hadden-Industries/owlapi.git#${GIT_COMMIT}`;

const validManifest = (overrides = {}) => ({
  name: "owlapi",
  version: "0.1.0-alpha.0",
  type: "module",
  exports: EXPECTED_EXPORTS,
  files: ["index.js", "internal/"],
  sideEffects: false,
  scripts: { test: "jest" },
  dependencies: { n3: "2.3.0" },
  repository: {
    type: "git",
    url: "git+https://github.com/Hadden-Industries/owlapi.git",
  },
  ...overrides,
});

const canonicalTreeDigest = (entries) =>
  sha256Buffer(Buffer.from(`${JSON.stringify(entries)}\n`, "utf8"));

const treeManifest = (entries) => ({
  entries,
  fileCount: entries.length,
  rootSha256: canonicalTreeDigest(entries),
});

const fileEntry = (path, content, mode = "regular") => ({
  path,
  type: "file",
  mode,
  bytes: Buffer.byteLength(content),
  sha256: sha256Buffer(Buffer.from(content, "utf8")),
});

describe("Git-install package suitability", () => {
  test("freezes every lifecycle script that could affect consumer installation or Git packing", () => {
    expect(GIT_BUILD_TRIGGER_SCRIPTS).toEqual([
      "preinstall",
      "install",
      "postinstall",
      "prepare",
      "prepack",
      "postpack",
      "prepublish",
      "prepublishOnly",
      "build",
    ]);
  });

  test("accepts the exact package identity, export map, repository, and root package shape", () => {
    expect(
      assertGitInstallSuitability(validManifest(), EXPECTED_PACKAGE),
    ).toEqual({
      name: "owlapi",
      version: "0.1.0-alpha.0",
      exports: EXPECTED_EXPORTS,
      repositoryUrl: "git+https://github.com/Hadden-Industries/owlapi.git",
      gitBuildTriggers: [],
    });
  });

  test("rejects npm's build Git-preparation trigger", () => {
    expect(() =>
      assertGitInstallSuitability(
        validManifest({ scripts: { build: "node build.mjs" } }),
        EXPECTED_PACKAGE,
      ),
    ).toThrow(/build/u);
  });

  test.each([
    ["package name", { name: "owlapi-js" }],
    ["package version", { version: "0.1.0-alpha.1" }],
    [
      "repository",
      { repository: { type: "git", url: "https://example.test/owlapi.git" } },
    ],
    [
      "export target",
      { exports: { ...EXPECTED_EXPORTS, "./io": "./internal/io.js" } },
    ],
    [
      "extra export",
      { exports: { ...EXPECTED_EXPORTS, "./rdf": "./internal/rdf.js" } },
    ],
  ])("rejects drift in the %s", (_label, override) => {
    expect(() =>
      assertGitInstallSuitability(validManifest(override), EXPECTED_PACKAGE),
    ).toThrow();
  });

  test.each(GIT_BUILD_TRIGGER_SCRIPTS)(
    "rejects the %s lifecycle trigger",
    (scriptName) => {
      expect(() =>
        assertGitInstallSuitability(
          validManifest({ scripts: { [scriptName]: "node build.mjs" } }),
          EXPECTED_PACKAGE,
        ),
      ).toThrow(new RegExp(scriptName, "u"));
    },
  );

  test.each([
    ["workspaces", { workspaces: ["packages/*"] }],
    ["bundleDependencies", { bundleDependencies: ["n3"] }],
    ["bundledDependencies", { bundledDependencies: ["n3"] }],
    ["publishConfig.directory", { publishConfig: { directory: "dist" } }],
  ])(
    "rejects a non-root or bundled package authority through %s",
    (_label, override) => {
      expect(() =>
        assertGitInstallSuitability(validManifest(override), EXPECTED_PACKAGE),
      ).toThrow();
    },
  );
});

describe("installed package-tree manifests", () => {
  const temporaryRoots = [];

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test("orders POSIX paths and hashes every file deterministically", () => {
    const root = mkdtempSync(join(tmpdir(), "owlapi-tree-test-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "tool.js"), "beta\n");
    writeFileSync(join(root, "README.md"), "alpha\n");

    const entries = [
      {
        path: "README.md",
        type: "file",
        mode: "regular",
        bytes: 6,
        sha256:
          "b6a98d9ce9a2d9149288fa3df42d377c3e42737afdcdaf714e33c0a100b51060",
      },
      {
        path: "nested/tool.js",
        type: "file",
        mode: "regular",
        bytes: 5,
        sha256:
          "f2c82decdd7181cf98945929a62598db7e6b477e11f6e0eb0ae97020eff151ad",
      },
    ];

    expect(createInstalledPackageTreeManifest(root)).toEqual({
      entries,
      fileCount: 2,
      rootSha256: canonicalTreeDigest(entries),
    });
  });

  test("reports changed paths, bytes, and portable modes without depending on enumeration order", () => {
    const baseline = treeManifest([
      fileEntry("a.js", "one\n"),
      fileEntry("nested/b.js", "two\n"),
    ]);

    expect(
      compareInstalledPackageTrees(
        baseline,
        treeManifest([
          fileEntry("a.js", "one\n"),
          fileEntry("nested/c.js", "two\n"),
        ]),
      ),
    ).toEqual({
      equal: false,
      differences: [
        { kind: "missing-right", path: "nested/b.js" },
        { kind: "missing-left", path: "nested/c.js" },
      ],
    });

    expect(
      compareInstalledPackageTrees(
        baseline,
        treeManifest(
          [fileEntry("nested/b.js", "two\n"), fileEntry("a.js", "ONE\n")].sort(
            (left, right) => left.path.localeCompare(right.path, "en"),
          ),
        ),
      ),
    ).toEqual({
      equal: false,
      differences: [
        {
          kind: "changed",
          path: "a.js",
          fields: ["sha256"],
        },
      ],
    });

    expect(
      compareInstalledPackageTrees(
        baseline,
        treeManifest([
          fileEntry("a.js", "one\n", "executable"),
          fileEntry("nested/b.js", "two\n"),
        ]),
      ),
    ).toEqual({
      equal: false,
      differences: [
        {
          kind: "changed",
          path: "a.js",
          fields: ["mode"],
        },
      ],
    });
  });

  test("reports case-only spelling drift explicitly", () => {
    expect(
      compareInstalledPackageTrees(
        treeManifest([fileEntry("README.md", "same\n")]),
        treeManifest([fileEntry("readme.md", "same\n")]),
      ),
    ).toEqual({
      equal: false,
      differences: [
        {
          kind: "case-mismatch",
          leftPath: "README.md",
          rightPath: "readme.md",
        },
      ],
    });
  });

  test.each([
    [
      "duplicate normalized paths",
      [fileEntry("a.js", "one\n"), fileEntry("a.js", "two\n")],
      /duplicate path/u,
    ],
    [
      "case collisions",
      [fileEntry("A.js", "one\n"), fileEntry("a.js", "two\n")],
      /case collision/u,
    ],
    ["path escape", [fileEntry("../outside.js", "one\n")], /unsafe path/u],
    [
      "symlinks",
      [{ ...fileEntry("link", "target"), type: "symlink" }],
      /symlink/u,
    ],
    [
      "directories",
      [{ ...fileEntry("empty", ""), type: "directory" }],
      /directory/u,
    ],
    ["special files", [{ ...fileEntry("pipe", ""), type: "fifo" }], /fifo/u],
  ])("rejects %s in a supplied tree manifest", (_label, entries, message) => {
    expect(() =>
      compareInstalledPackageTrees(
        treeManifest(entries),
        treeManifest([fileEntry("safe.js", "safe\n")]),
      ),
    ).toThrow(message);
  });
});

describe("production graph normalization", () => {
  const graph = (transport) => ({
    name: "consumer",
    version: "1.0.0",
    path: `C:/temporary/${transport}`,
    dependencies: {
      owlapi: {
        version: "0.1.0-alpha.0",
        resolved: transport,
        path: `C:/temporary/${transport}/node_modules/owlapi`,
        dependencies: {
          n3: {
            version: "2.3.0",
            resolved: "https://registry.npmjs.org/n3/-/n3-2.3.0.tgz",
            path: `C:/temporary/${transport}/node_modules/n3`,
          },
        },
      },
    },
  });

  test("removes source locations while preserving package identities and dependency edges", () => {
    const normalized = normalizeProductionGraph(graph("candidate.tgz"));

    expect(normalized).toEqual({
      packages: [
        {
          path: "owlapi",
          name: "owlapi",
          version: "0.1.0-alpha.0",
        },
        { path: "owlapi>n3", name: "n3", version: "2.3.0" },
      ],
      edges: [
        { from: "$root", dependency: "owlapi", to: "owlapi" },
        { from: "owlapi", dependency: "n3", to: "owlapi>n3" },
      ],
      rootSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });

    expect(normalizeProductionGraph(graph(GIT_SPEC))).toEqual(normalized);
  });

  test("rejects an incomplete dependency identity", () => {
    const input = graph(GIT_SPEC);
    delete input.dependencies.owlapi.dependencies.n3.version;

    expect(() => normalizeProductionGraph(input)).toThrow(/n3.*version/u);
  });
});

describe("exact Git consumer lock validation", () => {
  const validLock = () => ({
    name: "owlapi-git-consumer",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "owlapi-git-consumer",
        version: "1.0.0",
        dependencies: { owlapi: GIT_SPEC },
      },
      "node_modules/owlapi": {
        version: "0.1.0-alpha.0",
        resolved: GIT_SPEC,
        license: "AGPL-3.0-only",
        dependencies: { n3: "2.3.0" },
      },
    },
  });

  test("requires lockfile v3 and the exact full commit in root and installed resolutions", () => {
    expect(
      validateGitConsumerLock(validLock(), {
        gitSpec: GIT_SPEC,
        commit: GIT_COMMIT,
        name: "owlapi",
        version: "0.1.0-alpha.0",
      }),
    ).toEqual({
      lockfileVersion: 3,
      rootSpecifier: GIT_SPEC,
      resolved: GIT_SPEC,
      commit: GIT_COMMIT,
      package: { name: "owlapi", version: "0.1.0-alpha.0" },
    });
  });

  test.each([
    [
      "lockfile version",
      (lock) => {
        lock.lockfileVersion = 2;
      },
    ],
    [
      "root specifier",
      (lock) => {
        lock.packages[""].dependencies.owlapi =
          "github:Hadden-Industries/owlapi#main";
      },
    ],
    [
      "installed resolution",
      (lock) => {
        lock.packages["node_modules/owlapi"].resolved =
          "git+https://github.com/Hadden-Industries/owlapi.git#main";
      },
    ],
    [
      "installed version",
      (lock) => {
        lock.packages["node_modules/owlapi"].version = "0.1.0-alpha.1";
      },
    ],
  ])("rejects drift in the %s", (_label, mutate) => {
    const lock = validLock();
    mutate(lock);
    expect(() =>
      validateGitConsumerLock(lock, {
        gitSpec: GIT_SPEC,
        commit: GIT_COMMIT,
        name: "owlapi",
        version: "0.1.0-alpha.0",
      }),
    ).toThrow();
  });
});

describe("pre-registry equivalence evidence", () => {
  const TREE_ROOT =
    "51b44340828d6d15414fa11cf123cca0ee157e54d94501ed24ca06354ef44def";
  const GRAPH_ROOT =
    "c29f06a4fe4b2c6581c198740ce2970b7f5c2935817864d7c79126940073df43";
  const ARTIFACT_DIGEST =
    "sha256:f5967321e1c18a9c5aa14ad44a1d45fe3606605453866ce7746afe9c394f52d7";
  const TARBALL_SHA256 =
    "80d56eb103c1a94dcdc006b4549e91cce16f7ed0eb076e0e26053e3d670704a3";
  const LIMITATIONS = [
    "NO_REGISTRY_INTEGRITY",
    "NO_REGISTRY_SIGNATURE",
    "NO_NPM_PROVENANCE",
    "NO_PUBLICATION_ATTESTATION",
    "NO_DISTRIBUTION_TAG",
    "NO_IMMUTABLE_PUBLIC_COORDINATE",
  ];
  const NPM_CONFIGURATION = {
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
  const INSTALLED_TESTS = [
    "installed-package-smoke.mjs",
    "installed-package-boundary.mjs",
    "installed-package-import-purity.mjs",
    "installed-package-no-network.mjs",
  ];

  const packageTree = () => ({
    entries: [
      {
        path: "index.js",
        type: "file",
        mode: "regular",
        bytes: 24,
        sha256:
          "ad5abda1e1f8bfb618e985a13fbe07068662681d75f2c253244ec898a773c120",
      },
    ],
    fileCount: 1,
    rootSha256: TREE_ROOT,
  });

  const productionGraph = () => ({
    packages: [{ path: "owlapi", name: "owlapi", version: "0.1.0-alpha.0" }],
    edges: [{ from: "$root", dependency: "owlapi", to: "owlapi" }],
    rootSha256: GRAPH_ROOT,
  });

  const qualificationObservation = () => ({
    schemaVersion: 1,
    result: "PASS",
    qualifiedAt: "2026-08-31T09:36:28.158Z",
    package: {
      name: "owlapi",
      version: "0.1.0-alpha.0",
      exports: EXPECTED_EXPORTS,
    },
    source: {
      repository: "Hadden-Industries/owlapi",
      runId: 33_160_042_447,
      runAttempt: 1,
      artifactId: 9_682_090_118,
      artifactName: "owlapi-0.1.0-alpha.0-candidate-33160042447-1",
      artifactBytes: 200_000,
      artifactDigest: ARTIFACT_DIGEST,
      gitSpec: GIT_SPEC,
      commit: GIT_COMMIT,
      tag: "v0.1.0-alpha.0",
    },
    npmConfiguration: structuredClone(NPM_CONFIGURATION),
    retainedCandidate: {
      tarball: {
        fileName: "owlapi-0.1.0-alpha.0.tgz",
        sha256: TARBALL_SHA256,
        bytes: 179_949,
      },
      installedPackageTree: packageTree(),
      productionGraph: productionGraph(),
    },
    gitInstallation: {
      installedPackageTree: packageTree(),
      productionGraph: productionGraph(),
      lock: {
        lockfileVersion: 3,
        rootSpecifier: GIT_SPEC,
        resolved: GIT_SPEC,
        commit: GIT_COMMIT,
        package: { name: "owlapi", version: "0.1.0-alpha.0" },
      },
    },
    comparisons: {
      installedPackageTree: { equal: true, differences: [] },
      productionGraph: { equal: true },
    },
    installedTests: INSTALLED_TESTS.map((script) => ({
      script,
      candidate: "PASS",
      git: "PASS",
    })),
    runtime: {
      node: "v24.19.0",
      npm: "12.0.2",
      platform: "win32",
      architecture: "x64",
      osRelease: "10.0.26200",
    },
    evidenceLimitations: LIMITATIONS,
  });

  test("projects only bounded, reviewable facts from a successful qualification", () => {
    const evidence = equivalence.createPreRegistryEquivalenceEvidence(
      qualificationObservation(),
    );
    const { qualificationSummarySha256, ...withoutDigest } = evidence;

    expect(withoutDigest).toEqual({
      $schema: "./pre-registry-git-equivalence.schema.json",
      schemaVersion: 1,
      result: "PASS",
      observedAt: "2026-08-31T09:36:28.158Z",
      source: {
        repository: "Hadden-Industries/owlapi",
        workflowRun: { id: 33_160_042_447, attempt: 1 },
        candidateArtifact: {
          id: 9_682_090_118,
          name: "owlapi-0.1.0-alpha.0-candidate-33160042447-1",
          bytes: 200_000,
          digest: ARTIFACT_DIGEST,
        },
        candidateTarball: {
          fileName: "owlapi-0.1.0-alpha.0.tgz",
          bytes: 179_949,
          digest: `sha256:${TARBALL_SHA256}`,
        },
        git: {
          repositoryUrl: "git+https://github.com/Hadden-Industries/owlapi.git",
          packageSpecifier: GIT_SPEC,
          commit: GIT_COMMIT,
          tag: "v0.1.0-alpha.0",
        },
      },
      package: {
        name: "owlapi",
        version: "0.1.0-alpha.0",
        exports: EXPECTED_EXPORTS,
      },
      runtime: {
        node: "v24.19.0",
        npm: "12.0.2",
        platform: "win32",
        architecture: "x64",
        osRelease: "10.0.26200",
      },
      npmConfiguration: NPM_CONFIGURATION,
      installedPackageTree: {
        retainedCandidate: {
          fileCount: 1,
          rootSha256: `sha256:${TREE_ROOT}`,
        },
        gitInstallation: {
          fileCount: 1,
          rootSha256: `sha256:${TREE_ROOT}`,
        },
        equal: true,
        differences: [],
      },
      productionGraph: {
        retainedCandidate: {
          packageCount: 1,
          edgeCount: 1,
          rootSha256: `sha256:${GRAPH_ROOT}`,
        },
        gitInstallation: {
          packageCount: 1,
          edgeCount: 1,
          rootSha256: `sha256:${GRAPH_ROOT}`,
        },
        equal: true,
      },
      installedTests: INSTALLED_TESTS.map((script) => ({
        script,
        retainedCandidate: "PASS",
        gitInstallation: "PASS",
      })),
      limitations: LIMITATIONS,
      review: {
        status: "PENDING_HUMAN_REVIEW",
        reviewer: null,
        reviewedOn: null,
        capacity: null,
        conclusion: null,
      },
    });
    expect(qualificationSummarySha256).toBe(
      "sha256:bc0650bf2b39ad9f7a52c5d6dd23139bb1f8b5ed9c2d685b086f6573283154a1",
    );
  });

  test("recomputes installed-tree equality instead of trusting reported booleans", () => {
    const observation = qualificationObservation();
    observation.gitInstallation.installedPackageTree.entries[0].sha256 =
      "0".repeat(64);

    expect(() =>
      equivalence.createPreRegistryEquivalenceEvidence(observation),
    ).toThrow(/rootSha256 does not match|package trees differ/u);
  });

  test("rejects a qualification produced under a different npm policy", () => {
    const observation = qualificationObservation();
    observation.npmConfiguration.ignoreScripts = true;

    expect(() =>
      equivalence.createPreRegistryEquivalenceEvidence(observation),
    ).toThrow(/npm configuration/u);
  });

  test("rejects a stale normalized production-graph digest", () => {
    const observation = qualificationObservation();
    observation.gitInstallation.productionGraph.rootSha256 = "0".repeat(64);

    expect(() =>
      equivalence.createPreRegistryEquivalenceEvidence(observation),
    ).toThrow(/production graph.*rootSha256/u);
  });

  test("rejects a missing installed-package check", () => {
    const observation = qualificationObservation();
    observation.installedTests.pop();

    expect(() =>
      equivalence.createPreRegistryEquivalenceEvidence(observation),
    ).toThrow(/installed-package checks/u);
  });

  test("rejects an unsuccessful qualification before projecting evidence", () => {
    const observation = qualificationObservation();
    observation.result = "FAIL";

    expect(() =>
      equivalence.createPreRegistryEquivalenceEvidence(observation),
    ).toThrow(/successful PASS qualification/u);
  });
});
