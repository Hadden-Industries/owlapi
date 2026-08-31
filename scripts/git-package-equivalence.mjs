import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const GIT_BUILD_TRIGGER_SCRIPTS = Object.freeze([
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

export const PRE_REGISTRY_NPM_CONFIGURATION = Object.freeze({
  userConfig: "GENERATED_EMPTY",
  globalConfig: "GENERATED_EMPTY",
  registry: "https://registry.npmjs.org/",
  nodeEnvironment: "development",
  ignoreScripts: false,
  strictAllowScripts: false,
  packageLock: true,
  installStrategy: "hoisted",
  include: Object.freeze(["prod", "dev", "optional", "peer"]),
  omit: Object.freeze([]),
});

const PACKAGE_TREE_TYPES = new Set(["file"]);
const PORTABLE_MODES = new Set(["regular", "executable"]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const FULL_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_IDENTIFIER_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PRE_REGISTRY_INSTALLED_TESTS = Object.freeze([
  "installed-package-smoke.mjs",
  "installed-package-boundary.mjs",
  "installed-package-import-purity.mjs",
  "installed-package-no-network.mjs",
]);
const PRE_REGISTRY_LIMITATIONS = Object.freeze([
  "NO_REGISTRY_INTEGRITY",
  "NO_REGISTRY_SIGNATURE",
  "NO_NPM_PROVENANCE",
  "NO_PUBLICATION_ATTESTATION",
  "NO_DISTRIBUTION_TAG",
  "NO_IMMUTABLE_PUBLIC_COORDINATE",
]);
const PRE_REGISTRY_EXPORTS = Object.freeze({
  ".": "./index.js",
  "./apibinding": "./apibinding/index.js",
  "./model": "./model/index.js",
  "./io": "./io/index.js",
  "./formats": "./formats/index.js",
});
const PRE_REGISTRY_REPOSITORY_URL =
  "git+https://github.com/Hadden-Industries/owlapi.git";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const compareStrings = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const canonicalDigest = (value) =>
  sha256(Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));

const assertObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
};

const assertExactJson = (actual, expected, label) => {
  if (canonicalizeJson(actual) !== canonicalizeJson(expected)) {
    throw new Error(`${label} does not match the approved value.`);
  }
};

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const repositoryUrl = (repository) => {
  if (typeof repository === "string") {
    return repository;
  }
  if (repository && typeof repository === "object") {
    return repository.url;
  }
  return undefined;
};

/**
 * Git dependencies receive lifecycle treatment that ordinary registry tarballs
 * do not. This guard keeps the selected commit a passive package source so the
 * transport comparison cannot hide generated or installation-mutated bytes.
 */
export function assertGitInstallSuitability(manifest, expected) {
  assertObject(manifest, "Package manifest");
  assertObject(expected, "Expected package identity");

  for (const field of ["name", "version"]) {
    if (manifest[field] !== expected[field]) {
      throw new Error(
        `Package ${field} must be ${JSON.stringify(expected[field])}; received ${JSON.stringify(manifest[field])}.`,
      );
    }
  }

  assertExactJson(manifest.exports, expected.exports, "Package exports");

  const actualRepositoryUrl = repositoryUrl(manifest.repository);
  if (actualRepositoryUrl !== expected.repositoryUrl) {
    throw new Error(
      `Package repository must be ${expected.repositoryUrl}; received ${actualRepositoryUrl ?? "none"}.`,
    );
  }

  const scripts = manifest.scripts ?? {};
  assertObject(scripts, "Package scripts");
  const gitBuildTriggers = GIT_BUILD_TRIGGER_SCRIPTS.filter((scriptName) =>
    hasOwn(scripts, scriptName),
  );
  if (gitBuildTriggers.length > 0) {
    throw new Error(
      `Package manifest defines prohibited Git-install lifecycle trigger(s): ${gitBuildTriggers.join(", ")}.`,
    );
  }

  for (const field of [
    "workspaces",
    "bundleDependencies",
    "bundledDependencies",
  ]) {
    if (hasOwn(manifest, field)) {
      throw new Error(`Package manifest must not define ${field}.`);
    }
  }
  if (
    manifest.publishConfig &&
    typeof manifest.publishConfig === "object" &&
    hasOwn(manifest.publishConfig, "directory")
  ) {
    throw new Error(
      "Package manifest must publish from the repository root; publishConfig.directory is prohibited.",
    );
  }

  return {
    name: manifest.name,
    version: manifest.version,
    exports: structuredClone(manifest.exports),
    repositoryUrl: actualRepositoryUrl,
    gitBuildTriggers,
  };
}

const normalizeTreePath = (path) => {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(
      `Package tree contains unsafe path: ${JSON.stringify(path)}.`,
    );
  }
  return path;
};

const validateTreeManifest = (manifest, label) => {
  assertObject(manifest, label);
  if (!Array.isArray(manifest.entries)) {
    throw new TypeError(`${label}.entries must be an array.`);
  }

  const exactPaths = new Set();
  const foldedPaths = new Map();
  let previousPath;
  for (const entry of manifest.entries) {
    assertObject(entry, `${label} entry`);
    const path = normalizeTreePath(entry.path);
    if (exactPaths.has(path)) {
      throw new Error(`${label} contains duplicate path ${path}.`);
    }
    exactPaths.add(path);

    const foldedPath = path.toLocaleLowerCase("en-US");
    const existingFoldedPath = foldedPaths.get(foldedPath);
    if (existingFoldedPath && existingFoldedPath !== path) {
      throw new Error(
        `${label} contains case collision ${existingFoldedPath} / ${path}.`,
      );
    }
    foldedPaths.set(foldedPath, path);

    if (previousPath !== undefined && compareStrings(previousPath, path) >= 0) {
      throw new Error(`${label} entries are not in deterministic path order.`);
    }
    previousPath = path;

    if (!PACKAGE_TREE_TYPES.has(entry.type)) {
      throw new Error(
        `${label} contains prohibited ${entry.type ?? "unknown"} entry at ${path}.`,
      );
    }
    if (!PORTABLE_MODES.has(entry.mode)) {
      throw new Error(`${label} contains invalid portable mode at ${path}.`);
    }
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`${label} contains invalid byte count at ${path}.`);
    }
    if (!SHA256_PATTERN.test(entry.sha256)) {
      throw new Error(`${label} contains invalid SHA-256 at ${path}.`);
    }
  }

  if (manifest.fileCount !== manifest.entries.length) {
    throw new Error(`${label} fileCount does not match its entries.`);
  }
  const expectedRootSha256 = canonicalDigest(manifest.entries);
  if (manifest.rootSha256 !== expectedRootSha256) {
    throw new Error(`${label} rootSha256 does not match its entries.`);
  }
  return manifest;
};

const portableMode = (mode) =>
  // Node exposes stat.mode as a POSIX-style mask on every supported host. Only
  // the three portable execute bits belong in the npm payload comparison.
  // eslint-disable-next-line no-bitwise
  (mode & 0o111) === 0 ? "regular" : "executable";

/**
 * The manifest intentionally excludes directory metadata and host ACL/owner
 * fields. npm package identity is the complete set of file paths, bytes, and
 * the only portable payload mode distinction: regular versus executable.
 */
export function createInstalledPackageTreeManifest(packageRoot) {
  const resolvedRoot = resolve(packageRoot);
  const rootStat = lstatSync(resolvedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(
      `Installed package root is not a real directory: ${packageRoot}.`,
    );
  }

  const entries = [];
  const walk = (absoluteDirectory, relativeDirectory) => {
    const children = readdirSync(absoluteDirectory, {
      withFileTypes: true,
    }).sort((left, right) => compareStrings(left.name, right.name));
    for (const child of children) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${child.name}`
        : child.name;
      const normalizedPath = normalizeTreePath(relativePath);
      const absolutePath = join(absoluteDirectory, child.name);
      const stat = lstatSync(absolutePath);

      if (child.isSymbolicLink() || stat.isSymbolicLink()) {
        throw new Error(
          `Installed package tree contains prohibited symlink or junction at ${normalizedPath}.`,
        );
      }
      if (child.isDirectory() && stat.isDirectory()) {
        walk(absolutePath, normalizedPath);
        continue;
      }
      if (!child.isFile() || !stat.isFile()) {
        throw new Error(
          `Installed package tree contains prohibited special entry at ${normalizedPath}.`,
        );
      }

      const bytes = readFileSync(absolutePath);
      entries.push({
        path: normalizedPath,
        type: "file",
        mode: portableMode(stat.mode),
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
    }
  };

  walk(resolvedRoot, "");
  entries.sort((left, right) => compareStrings(left.path, right.path));
  return validateTreeManifest(
    {
      entries,
      fileCount: entries.length,
      rootSha256: canonicalDigest(entries),
    },
    "Installed package tree manifest",
  );
}

export function compareInstalledPackageTrees(left, right) {
  validateTreeManifest(left, "Left package tree manifest");
  validateTreeManifest(right, "Right package tree manifest");

  const leftByFoldedPath = new Map(
    left.entries.map((entry) => [entry.path.toLocaleLowerCase("en-US"), entry]),
  );
  const rightByFoldedPath = new Map(
    right.entries.map((entry) => [
      entry.path.toLocaleLowerCase("en-US"),
      entry,
    ]),
  );
  const foldedPaths = [
    ...new Set([...leftByFoldedPath.keys(), ...rightByFoldedPath.keys()]),
  ].sort(compareStrings);

  const differences = [];
  for (const foldedPath of foldedPaths) {
    const leftEntry = leftByFoldedPath.get(foldedPath);
    const rightEntry = rightByFoldedPath.get(foldedPath);
    if (!leftEntry) {
      differences.push({ kind: "missing-left", path: rightEntry.path });
      continue;
    }
    if (!rightEntry) {
      differences.push({ kind: "missing-right", path: leftEntry.path });
      continue;
    }
    if (leftEntry.path !== rightEntry.path) {
      differences.push({
        kind: "case-mismatch",
        leftPath: leftEntry.path,
        rightPath: rightEntry.path,
      });
      continue;
    }

    const fields = ["type", "mode", "bytes", "sha256"].filter(
      (field) => leftEntry[field] !== rightEntry[field],
    );
    if (fields.length > 0) {
      differences.push({ kind: "changed", path: leftEntry.path, fields });
    }
  }

  return { equal: differences.length === 0, differences };
}

export function normalizeProductionGraph(npmLsOutput) {
  assertObject(npmLsOutput, "npm ls output");
  if (Array.isArray(npmLsOutput.problems) && npmLsOutput.problems.length > 0) {
    throw new Error(
      `npm ls reported an invalid production graph: ${npmLsOutput.problems.join("; ")}.`,
    );
  }

  const packages = [];
  const edges = [];
  let visitedCount = 0;
  const visit = (dependencies, parentPath) => {
    if (dependencies === undefined) {
      return;
    }
    assertObject(dependencies, `Dependencies for ${parentPath}`);
    for (const name of Object.keys(dependencies).sort(compareStrings)) {
      visitedCount += 1;
      if (visitedCount > 100_000) {
        throw new Error("npm ls production graph exceeds the safety limit.");
      }
      const dependency = dependencies[name];
      assertObject(dependency, `Dependency ${name}`);
      if (
        typeof dependency.version !== "string" ||
        dependency.version.length === 0
      ) {
        throw new Error(`Dependency ${name} is missing its version.`);
      }
      if (dependency.name !== undefined && dependency.name !== name) {
        throw new Error(
          `Dependency key ${name} disagrees with package name ${dependency.name}.`,
        );
      }

      const path = parentPath === "$root" ? name : `${parentPath}>${name}`;
      packages.push({ path, name, version: dependency.version });
      edges.push({ from: parentPath, dependency: name, to: path });
      visit(dependency.dependencies, path);
    }
  };

  visit(npmLsOutput.dependencies, "$root");
  packages.sort((left, right) => compareStrings(left.path, right.path));
  edges.sort((left, right) =>
    compareStrings(
      `${left.from}\0${left.dependency}\0${left.to}`,
      `${right.from}\0${right.dependency}\0${right.to}`,
    ),
  );
  return {
    packages,
    edges,
    rootSha256: canonicalDigest({ packages, edges }),
  };
}

export function validateGitConsumerLock(lockfile, expected) {
  assertObject(lockfile, "Git consumer lockfile");
  assertObject(expected, "Expected Git consumer identity");
  if (lockfile.lockfileVersion !== 3) {
    throw new Error("Git consumer lockfile must use lockfileVersion 3.");
  }
  if (!FULL_COMMIT_PATTERN.test(expected.commit)) {
    throw new Error(
      "Expected Git commit must be a lowercase full 40-hex commit.",
    );
  }
  if (
    typeof expected.gitSpec !== "string" ||
    !expected.gitSpec.endsWith(`#${expected.commit}`)
  ) {
    throw new Error(
      "Expected Git specifier must end in the exact full commit.",
    );
  }
  assertObject(lockfile.packages, "Git consumer lockfile packages");
  const root = lockfile.packages[""];
  const installed = lockfile.packages[`node_modules/${expected.name}`];
  assertObject(root, "Git consumer lockfile root package");
  assertObject(installed, `Installed ${expected.name} lock entry`);

  const rootSpecifier = root.dependencies?.[expected.name];
  if (rootSpecifier !== expected.gitSpec) {
    throw new Error(
      `Git consumer root specifier must be ${expected.gitSpec}; received ${rootSpecifier ?? "none"}.`,
    );
  }
  if (installed.resolved !== expected.gitSpec) {
    throw new Error(
      `Installed Git resolution must be ${expected.gitSpec}; received ${installed.resolved ?? "none"}.`,
    );
  }
  if (installed.version !== expected.version) {
    throw new Error(
      `Installed package version must be ${expected.version}; received ${installed.version ?? "none"}.`,
    );
  }

  return {
    lockfileVersion: 3,
    rootSpecifier,
    resolved: installed.resolved,
    commit: expected.commit,
    package: { name: expected.name, version: installed.version },
  };
}

const validateNormalizedProductionGraph = (graph, label) => {
  assertObject(graph, label);
  if (!Array.isArray(graph.packages) || !Array.isArray(graph.edges)) {
    throw new TypeError(`${label} must contain package and edge arrays.`);
  }
  for (const packageFact of graph.packages) {
    assertObject(packageFact, `${label} package`);
    for (const field of ["path", "name", "version"]) {
      if (
        typeof packageFact[field] !== "string" ||
        packageFact[field].length === 0
      ) {
        throw new Error(`${label} contains an invalid package ${field}.`);
      }
    }
  }
  for (const edge of graph.edges) {
    assertObject(edge, `${label} edge`);
    for (const field of ["from", "dependency", "to"]) {
      if (typeof edge[field] !== "string" || edge[field].length === 0) {
        throw new Error(`${label} contains an invalid edge ${field}.`);
      }
    }
  }
  const expectedRootSha256 = canonicalDigest({
    packages: graph.packages,
    edges: graph.edges,
  });
  if (graph.rootSha256 !== expectedRootSha256) {
    throw new Error(`${label} rootSha256 does not match its canonical facts.`);
  }
  return graph;
};

const assertNonemptyString = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
};

const assertSafePositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
};

/**
 * Reduce the large transient qualification result to the exact facts a human
 * can review and Git can retain. The projection deliberately revalidates the
 * source manifests and comparisons; reported PASS booleans are not trusted as
 * an alternative authority. Absolute paths, caches, logs, and file inventories
 * remain in the ignored local qualification directory.
 */
export function createPreRegistryEquivalenceEvidence(observation) {
  assertObject(observation, "Qualification observation");
  if (observation.schemaVersion !== 1 || observation.result !== "PASS") {
    throw new Error(
      "Pre-registry evidence requires a successful PASS qualification.",
    );
  }
  if (
    typeof observation.qualifiedAt !== "string" ||
    !Number.isFinite(Date.parse(observation.qualifiedAt))
  ) {
    throw new Error("Qualification observation has an invalid timestamp.");
  }

  assertObject(observation.package, "Qualification package");
  assertExactJson(
    observation.package,
    {
      name: "owlapi",
      version: "0.1.0-alpha.0",
      exports: PRE_REGISTRY_EXPORTS,
    },
    "Qualification package",
  );

  assertObject(observation.source, "Qualification source");
  const source = observation.source;
  const commit = assertNonemptyString(source.commit, "Git commit");
  if (!FULL_COMMIT_PATTERN.test(commit)) {
    throw new Error("Git commit must be a lowercase full 40-hex commit.");
  }
  const gitSpec = assertNonemptyString(source.gitSpec, "Git package specifier");
  if (gitSpec !== `${PRE_REGISTRY_REPOSITORY_URL}#${commit}`) {
    throw new Error(
      "Git package specifier does not bind the canonical full commit.",
    );
  }
  if (source.repository !== "Hadden-Industries/owlapi") {
    throw new Error("Qualification source has the wrong repository.");
  }
  if (source.tag !== `v${observation.package.version}`) {
    throw new Error(
      "Qualification source tag does not match the package version.",
    );
  }
  assertSafePositiveInteger(source.runId, "Workflow run ID");
  assertSafePositiveInteger(source.runAttempt, "Workflow run attempt");
  assertSafePositiveInteger(source.artifactId, "Candidate artifact ID");
  assertNonemptyString(source.artifactName, "Candidate artifact name");
  assertSafePositiveInteger(
    source.artifactBytes,
    "Candidate artifact archive byte count",
  );
  if (!SHA256_IDENTIFIER_PATTERN.test(source.artifactDigest)) {
    throw new Error("Candidate artifact digest must be a SHA-256 identifier.");
  }

  assertObject(observation.retainedCandidate, "Retained candidate");
  assertObject(observation.retainedCandidate.tarball, "Candidate tarball");
  const tarball = observation.retainedCandidate.tarball;
  assertNonemptyString(tarball.fileName, "Candidate tarball filename");
  assertSafePositiveInteger(tarball.bytes, "Candidate tarball byte count");
  if (!SHA256_PATTERN.test(tarball.sha256)) {
    throw new Error("Candidate tarball SHA-256 is invalid.");
  }

  assertObject(observation.gitInstallation, "Git installation");
  const candidateTree = validateTreeManifest(
    observation.retainedCandidate.installedPackageTree,
    "Retained candidate package tree",
  );
  const gitTree = validateTreeManifest(
    observation.gitInstallation.installedPackageTree,
    "Git installation package tree",
  );
  const treeComparison = compareInstalledPackageTrees(candidateTree, gitTree);
  if (!treeComparison.equal) {
    throw new Error(
      `Installed package trees differ: ${JSON.stringify(treeComparison.differences)}.`,
    );
  }
  assertExactJson(
    observation.comparisons?.installedPackageTree,
    treeComparison,
    "Reported installed package-tree comparison",
  );

  const candidateGraph = validateNormalizedProductionGraph(
    observation.retainedCandidate.productionGraph,
    "Retained candidate production graph",
  );
  const gitGraph = validateNormalizedProductionGraph(
    observation.gitInstallation.productionGraph,
    "Git installation production graph",
  );
  assertExactJson(
    { packages: gitGraph.packages, edges: gitGraph.edges },
    { packages: candidateGraph.packages, edges: candidateGraph.edges },
    "Installed production graphs",
  );
  if (candidateGraph.rootSha256 !== gitGraph.rootSha256) {
    throw new Error("Installed production graph root digests differ.");
  }
  assertExactJson(
    observation.comparisons?.productionGraph,
    { equal: true },
    "Reported production-graph comparison",
  );

  assertObject(observation.gitInstallation.lock, "Git installation lock facts");
  assertExactJson(
    observation.gitInstallation.lock,
    {
      lockfileVersion: 3,
      rootSpecifier: gitSpec,
      resolved: gitSpec,
      commit,
      package: {
        name: observation.package.name,
        version: observation.package.version,
      },
    },
    "Git installation lock facts",
  );

  if (!Array.isArray(observation.installedTests)) {
    throw new Error("Qualification must contain all installed-package checks.");
  }
  const installedTests = PRE_REGISTRY_INSTALLED_TESTS.map((script) => {
    const matches = observation.installedTests.filter(
      (result) => result?.script === script,
    );
    if (
      matches.length !== 1 ||
      matches[0].candidate !== "PASS" ||
      matches[0].git !== "PASS"
    ) {
      throw new Error(
        "Qualification must contain all exact PASS installed-package checks exactly once.",
      );
    }
    return {
      script,
      retainedCandidate: "PASS",
      gitInstallation: "PASS",
    };
  });
  if (
    observation.installedTests.length !== PRE_REGISTRY_INSTALLED_TESTS.length
  ) {
    throw new Error(
      "Qualification must contain only the exact installed-package checks.",
    );
  }

  assertObject(observation.runtime, "Qualification runtime");
  const runtime = Object.fromEntries(
    ["node", "npm", "platform", "architecture", "osRelease"].map((field) => [
      field,
      assertNonemptyString(observation.runtime[field], `Runtime ${field}`),
    ]),
  );
  assertExactJson(
    observation.npmConfiguration,
    PRE_REGISTRY_NPM_CONFIGURATION,
    "Qualification npm configuration",
  );
  assertExactJson(
    observation.evidenceLimitations,
    PRE_REGISTRY_LIMITATIONS,
    "Pre-registry evidence limitations",
  );

  const summary = {
    schemaVersion: 1,
    result: "PASS",
    observedAt: observation.qualifiedAt,
    source: {
      repository: source.repository,
      workflowRun: { id: source.runId, attempt: source.runAttempt },
      candidateArtifact: {
        id: source.artifactId,
        name: source.artifactName,
        bytes: source.artifactBytes,
        digest: source.artifactDigest,
      },
      candidateTarball: {
        fileName: tarball.fileName,
        bytes: tarball.bytes,
        digest: `sha256:${tarball.sha256}`,
      },
      git: {
        repositoryUrl: PRE_REGISTRY_REPOSITORY_URL,
        packageSpecifier: gitSpec,
        commit,
        tag: source.tag,
      },
    },
    package: structuredClone(observation.package),
    runtime,
    npmConfiguration: structuredClone(PRE_REGISTRY_NPM_CONFIGURATION),
    installedPackageTree: {
      retainedCandidate: {
        fileCount: candidateTree.fileCount,
        rootSha256: `sha256:${candidateTree.rootSha256}`,
      },
      gitInstallation: {
        fileCount: gitTree.fileCount,
        rootSha256: `sha256:${gitTree.rootSha256}`,
      },
      equal: true,
      differences: [],
    },
    productionGraph: {
      retainedCandidate: {
        packageCount: candidateGraph.packages.length,
        edgeCount: candidateGraph.edges.length,
        rootSha256: `sha256:${candidateGraph.rootSha256}`,
      },
      gitInstallation: {
        packageCount: gitGraph.packages.length,
        edgeCount: gitGraph.edges.length,
        rootSha256: `sha256:${gitGraph.rootSha256}`,
      },
      equal: true,
    },
    installedTests,
    limitations: [...PRE_REGISTRY_LIMITATIONS],
  };

  return {
    $schema: "./pre-registry-git-equivalence.schema.json",
    ...summary,
    qualificationSummarySha256: `sha256:${sha256(canonicalizeJson(summary))}`,
    review: {
      status: "PENDING_HUMAN_REVIEW",
      reviewer: null,
      reviewedOn: null,
      capacity: null,
      conclusion: null,
    },
  };
}
