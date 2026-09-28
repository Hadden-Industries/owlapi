import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { arch, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PRE_REGISTRY_NPM_CONFIGURATION,
  assertGitInstallSuitability,
  compareInstalledPackageTrees,
  createInstalledPackageTreeManifest,
  normalizeProductionGraph,
  validateGitConsumerLock,
} from "./git-package-equivalence.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import {
  isStrictDescendantPath,
  readZipArchiveFiles,
  sha256Buffer,
} from "./release-artifacts.mjs";
import { verifyLocalReleaseTag } from "./verify-release-tag.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CANONICAL_REPOSITORY_URL =
  "git+https://github.com/Hadden-Industries/owlapi.git";
const FULL_GIT_SPEC_PATTERN =
  /^git\+https:\/\/github\.com\/Hadden-Industries\/owlapi\.git#([0-9a-f]{40})$/u;
const SHA256_IDENTIFIER_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export const INSTALLED_PACKAGE_TEST_SCRIPTS = Object.freeze([
  "installed-package-smoke.mjs",
  "installed-package-boundary.mjs",
  "installed-package-import-purity.mjs",
  "installed-package-no-network.mjs",
]);

const EXPECTED_EXPORTS = Object.freeze({
  ".": "./index.js",
  "./apibinding": "./apibinding/index.js",
  "./model": "./model/index.js",
  "./io": "./io/index.js",
  "./formats": "./formats/index.js",
});

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const assertObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
};

const commitFromGitSpec = (gitSpec) => {
  const match = FULL_GIT_SPEC_PATTERN.exec(gitSpec);
  if (!match) {
    throw new Error(
      "--git-spec must be the canonical owlapi Git URL followed by one full lowercase 40-hex commit.",
    );
  }
  return match[1];
};

export function parseQualificationArguments(argv) {
  const permitted = new Set(["--artifact-archive", "--git-spec", "--output"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!permitted.has(name) || !value || value.startsWith("--")) {
      throw new Error(
        `Unknown or incomplete qualification argument ${name ?? "<missing>"}.`,
      );
    }
    if (values.has(name)) {
      throw new Error(
        `Qualification argument ${name} was supplied more than once.`,
      );
    }
    values.set(name, value);
  }
  for (const name of permitted) {
    if (!values.has(name)) {
      throw new Error(`Missing required ${name} argument.`);
    }
  }
  commitFromGitSpec(values.get("--git-spec"));
  return {
    artifactArchivePath: values.get("--artifact-archive"),
    gitSpec: values.get("--git-spec"),
    outputDirectory: values.get("--output"),
  };
}

export function assertFreshOutputDirectory(outputDirectory) {
  if (existsSync(outputDirectory)) {
    throw new Error(
      `Qualification output already exists at ${outputDirectory}; preserve or remove it explicitly before rerunning.`,
    );
  }
  mkdirSync(outputDirectory, { recursive: true });
  return outputDirectory;
}

const consumerInstallPolicyArguments = () => [
  "--ignore-scripts=false",
  "--strict-allow-scripts=false",
  "--package-lock=true",
  "--install-strategy=hoisted",
  ...PRE_REGISTRY_NPM_CONFIGURATION.include.map(
    (dependencyType) => `--include=${dependencyType}`,
  ),
];

export function consumerInstallArguments(kind, cacheDirectory) {
  if (kind !== "candidate" && kind !== "git") {
    throw new Error(`Unknown equivalence consumer kind ${kind}.`);
  }
  return [
    "install",
    "--no-audit",
    "--no-fund",
    ...consumerInstallPolicyArguments(),
    ...(kind === "git" ? ["--allow-git=root"] : []),
    "--cache",
    cacheDirectory,
  ];
}

export function consumerNpmConfigurationArguments({
  userConfigPath,
  globalConfigPath,
}) {
  for (const [name, value] of Object.entries({
    userConfigPath,
    globalConfigPath,
  })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${name} must be a non-empty path.`);
    }
  }
  return [
    `--userconfig=${userConfigPath.replaceAll("\\", "/")}`,
    `--globalconfig=${globalConfigPath.replaceAll("\\", "/")}`,
    `--registry=${PRE_REGISTRY_NPM_CONFIGURATION.registry}`,
  ];
}

const EFFECTIVE_NPM_CONFIGURATION_KEYS = Object.freeze([
  "userconfig",
  "globalconfig",
  "registry",
  "ignore-scripts",
  "strict-allow-scripts",
  "package-lock",
  "install-strategy",
  "include",
  "omit",
]);

export function parseNpmConfigGetOutput(output) {
  if (typeof output !== "string") {
    throw new TypeError("Effective npm configuration output must be text.");
  }
  const allowed = new Set(EFFECTIVE_NPM_CONFIGURATION_KEYS);
  const values = new Map();
  for (const line of output.split(/\r?\n/u)) {
    if (line.length === 0) {
      continue;
    }
    const separator = line.indexOf("=");
    const name = separator > 0 ? line.slice(0, separator) : "";
    if (!allowed.has(name)) {
      throw new Error(`Unexpected npm configuration output line ${line}.`);
    }
    if (values.has(name)) {
      throw new Error(
        `Effective npm configuration contains duplicate ${name}.`,
      );
    }
    values.set(name, line.slice(separator + 1));
  }
  for (const name of EFFECTIVE_NPM_CONFIGURATION_KEYS) {
    if (!values.has(name)) {
      throw new Error(`Effective npm configuration is missing ${name}.`);
    }
  }

  const booleanValue = (name) => {
    const value = values.get(name);
    if (value !== "true" && value !== "false") {
      throw new Error(`Effective npm configuration has invalid ${name}.`);
    }
    return value === "true";
  };
  const listValue = (name) => {
    const value = values.get(name);
    if (value === "") {
      return [];
    }
    const entries = value.split(",");
    if (entries.some((entry) => entry.length === 0)) {
      throw new Error(`Effective npm configuration has invalid ${name}.`);
    }
    return entries;
  };

  return {
    userconfig: values.get("userconfig"),
    globalconfig: values.get("globalconfig"),
    registry: values.get("registry"),
    "ignore-scripts": booleanValue("ignore-scripts"),
    "strict-allow-scripts": booleanValue("strict-allow-scripts"),
    "package-lock": booleanValue("package-lock"),
    "install-strategy": values.get("install-strategy"),
    include: listValue("include"),
    omit: listValue("omit"),
  };
}

export function validateEffectiveNpmConfiguration(
  effective,
  { userConfigPath, globalConfigPath },
) {
  assertObject(effective, "Effective npm configuration");
  const pathsMatch =
    typeof effective.userconfig === "string" &&
    typeof effective.globalconfig === "string" &&
    resolve(effective.userconfig) === resolve(userConfigPath) &&
    resolve(effective.globalconfig) === resolve(globalConfigPath);
  const projected = {
    userConfig: PRE_REGISTRY_NPM_CONFIGURATION.userConfig,
    globalConfig: PRE_REGISTRY_NPM_CONFIGURATION.globalConfig,
    registry: effective.registry,
    nodeEnvironment: PRE_REGISTRY_NPM_CONFIGURATION.nodeEnvironment,
    ignoreScripts: effective["ignore-scripts"],
    strictAllowScripts: effective["strict-allow-scripts"],
    packageLock: effective["package-lock"],
    installStrategy: effective["install-strategy"],
    include: effective.include,
    omit: effective.omit,
  };
  if (
    !pathsMatch ||
    JSON.stringify(projected) !== JSON.stringify(PRE_REGISTRY_NPM_CONFIGURATION)
  ) {
    throw new Error(
      "Effective npm configuration does not match the accepted qualification policy.",
    );
  }
  return structuredClone(PRE_REGISTRY_NPM_CONFIGURATION);
}

const expectedPackage = {
  name: "owlapi",
  version: "0.1.0-alpha.0",
  exports: EXPECTED_EXPORTS,
  repositoryUrl: CANONICAL_REPOSITORY_URL,
};

export function verifyCandidateArtifactArchive({ archive, expectedDigest }) {
  if (!SHA256_IDENTIFIER_PATTERN.test(expectedDigest)) {
    throw new Error(
      "Controlled artifact digest must be a lowercase SHA-256 identifier.",
    );
  }
  const archiveBytes = Buffer.from(archive);
  const artifactArchive = {
    bytes: archiveBytes.length,
    sha256: sha256Buffer(archiveBytes),
  };
  if (`sha256:${artifactArchive.sha256}` !== expectedDigest) {
    throw new Error(
      "Candidate artifact archive digest does not match publication control.",
    );
  }

  const tarballFileName = `owlapi-${expectedPackage.version}.tgz`;
  const sbomFileName = `owlapi-${expectedPackage.version}.cdx.json`;
  const expectedPaths = ["SHA256SUMS", sbomFileName, tarballFileName].sort();
  const entries = readZipArchiveFiles(archiveBytes);
  const actualPaths = entries.map(({ path }) => path).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      `Candidate artifact archive inventory is not closed: expected=${JSON.stringify(expectedPaths)} actual=${JSON.stringify(actualPaths)}.`,
    );
  }
  const files = new Map(entries.map((entry) => [entry.path, entry.content]));
  const tarball = files.get(tarballFileName);
  const candidate = verifyDownloadedCandidateBundle({
    checksumText: files.get("SHA256SUMS").toString("utf8"),
    fileNames: actualPaths,
    sbomText: files.get(sbomFileName).toString("utf8"),
    tarball,
  });
  return { artifactArchive, candidate, tarball };
}

const assertCandidateBinding = ({
  candidateBundle,
  artifactArchive,
  publicationControl,
  gitSpec,
}) => {
  assertObject(candidateBundle, "Verified candidate bundle");
  assertObject(artifactArchive, "Verified artifact archive");
  assertObject(publicationControl, "Publication control");
  const reconciliation = publicationControl.reconciliation;
  const source = reconciliation?.source;
  const artifact = reconciliation?.candidateArtifact;
  const commit = commitFromGitSpec(gitSpec);
  if (
    candidateBundle.package?.name !== expectedPackage.name ||
    candidateBundle.package?.version !== expectedPackage.version ||
    publicationControl.coordinate !==
      `${expectedPackage.name}@${expectedPackage.version}` ||
    publicationControl.enabled !== true ||
    publicationControl.mode !== "DIRECT_BOOTSTRAP" ||
    reconciliation?.enabled !== true ||
    source?.repository !== "Hadden-Industries/owlapi" ||
    source.runId !== 33_160_042_447 ||
    source.runAttempt !== 1 ||
    source.commit !== commit ||
    source.tag !== `v${expectedPackage.version}` ||
    artifact?.id !== 9_682_090_118 ||
    artifact.name !== "owlapi-0.1.0-alpha.0-candidate-33160042447-1" ||
    artifact.digest !==
      "sha256:f5967321e1c18a9c5aa14ad44a1d45fe3606605453866ce7746afe9c394f52d7"
  ) {
    throw new Error(
      "Prepared candidate, publication control, and exact Git source are not the approved Phase 19D identities.",
    );
  }
  if (
    !Number.isSafeInteger(artifactArchive.bytes) ||
    artifactArchive.bytes < 1 ||
    artifactArchive.sha256 !== artifact.digest.slice("sha256:".length)
  ) {
    throw new Error(
      "Verified artifact archive digest does not match publication control.",
    );
  }
  if (
    candidateBundle.tarball?.fileName !==
    `owlapi-${expectedPackage.version}.tgz`
  ) {
    throw new Error("Prepared candidate tarball has the wrong filename.");
  }

  return {
    package: {
      name: expectedPackage.name,
      version: expectedPackage.version,
    },
    tarball: structuredClone(candidateBundle.tarball),
    source: {
      repository: source.repository,
      runId: source.runId,
      runAttempt: source.runAttempt,
      artifactId: artifact.id,
      artifactName: artifact.name,
      artifactBytes: artifactArchive.bytes,
      artifactDigest: `sha256:${artifactArchive.sha256}`,
      gitSpec,
      commit,
      tag: source.tag,
    },
  };
};

const assertInstalledObservation = (observation, kind) => {
  assertObject(observation, `${kind} consumer observation`);
  assertObject(observation.installedManifest, `${kind} installed manifest`);
  const packageFacts = assertGitInstallSuitability(
    observation.installedManifest,
    expectedPackage,
  );
  if (!Array.isArray(observation.tests)) {
    throw new Error(`${kind} consumer did not report its installed tests.`);
  }
  const testMap = new Map();
  for (const test of observation.tests) {
    if (
      !test ||
      !INSTALLED_PACKAGE_TEST_SCRIPTS.includes(test.script) ||
      test.result !== "PASS" ||
      testMap.has(test.script)
    ) {
      throw new Error(`${kind} consumer has an invalid installed-test result.`);
    }
    testMap.set(test.script, test.result);
  }
  if (testMap.size !== INSTALLED_PACKAGE_TEST_SCRIPTS.length) {
    throw new Error(
      `${kind} consumer did not pass every installed-package test.`,
    );
  }

  const prohibitedPath = observation.tree?.entries?.find(({ path }) =>
    /(^|\/)(?:\.git|\.github|scripts|test|tests|fixtures|util)(?:\/|$)|(?:^|\/)__tests__(?:\/|$)|\.test\.[cm]?js$/u.test(
      path,
    ),
  );
  if (prohibitedPath) {
    throw new Error(
      `${kind} installed package contains development-only path ${prohibitedPath.path}.`,
    );
  }

  return {
    package: packageFacts,
    tree: observation.tree,
    productionGraph: normalizeProductionGraph(observation.npmLs),
    tests: observation.tests,
    lockfile: observation.lockfile,
  };
};

const failureRecord = (error, failedAt) => ({
  schemaVersion: 1,
  result: "FAIL",
  failedAt,
  error: {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  },
});

export async function qualifyGitPackageEquivalence(input, adapters) {
  await adapters.prepareOutput(input.outputDirectory);
  const loaded = await adapters.loadInputs(input);
  const binding = assertCandidateBinding({
    ...loaded,
    gitSpec: input.gitSpec,
  });
  const sourcePackage = assertGitInstallSuitability(
    loaded.sourceManifest,
    expectedPackage,
  );
  const temporary = await adapters.createTemporaryRoot();
  if (!isStrictDescendantPath(temporary.parent, temporary.root)) {
    throw new Error(
      `Refusing unsafe temporary root ${temporary.root}; it is not a strict child of ${temporary.parent}.`,
    );
  }

  try {
    const npmConfiguration = await adapters.npmConfigurationFacts({
      temporaryRoot: temporary.root,
      npmConfigurationPaths: temporary.npmConfigurationPaths,
    });
    const candidateRaw = await adapters.observeConsumer({
      kind: "candidate",
      dependency: `file:${loaded.tarballPath.replaceAll("\\", "/")}`,
      temporaryRoot: temporary.root,
      npmConfigurationPaths: temporary.npmConfigurationPaths,
    });
    const gitRaw = await adapters.observeConsumer({
      kind: "git",
      dependency: input.gitSpec,
      temporaryRoot: temporary.root,
      npmConfigurationPaths: temporary.npmConfigurationPaths,
    });
    const candidate = assertInstalledObservation(candidateRaw, "candidate");
    const git = assertInstalledObservation(gitRaw, "git");

    const treeComparison = compareInstalledPackageTrees(
      candidate.tree,
      git.tree,
    );
    if (!treeComparison.equal) {
      throw new Error(
        `Installed package trees differ: ${JSON.stringify(treeComparison.differences)}.`,
      );
    }
    const productionGraphEqual =
      candidate.productionGraph.rootSha256 === git.productionGraph.rootSha256;
    if (!productionGraphEqual) {
      throw new Error(
        `Installed production graphs differ: candidate ${candidate.productionGraph.rootSha256}, Git ${git.productionGraph.rootSha256}.`,
      );
    }
    const gitLock = validateGitConsumerLock(git.lockfile, {
      gitSpec: input.gitSpec,
      commit: binding.source.commit,
      name: binding.package.name,
      version: binding.package.version,
    });
    const runtime = await adapters.runtimeFacts({
      npmConfigurationPaths: temporary.npmConfigurationPaths,
    });
    const installedTests = INSTALLED_PACKAGE_TEST_SCRIPTS.map((script) => ({
      script,
      candidate: candidate.tests.find((test) => test.script === script).result,
      git: git.tests.find((test) => test.script === script).result,
    }));

    const result = {
      schemaVersion: 1,
      result: "PASS",
      qualifiedAt: adapters.now(),
      package: {
        name: binding.package.name,
        version: binding.package.version,
        exports: structuredClone(sourcePackage.exports),
      },
      source: binding.source,
      npmConfiguration,
      retainedCandidate: {
        tarball: binding.tarball,
        installedPackageTree: candidate.tree,
        productionGraph: candidate.productionGraph,
      },
      gitInstallation: {
        installedPackageTree: git.tree,
        productionGraph: git.productionGraph,
        lock: gitLock,
      },
      comparisons: {
        installedPackageTree: treeComparison,
        productionGraph: { equal: productionGraphEqual },
      },
      installedTests,
      runtime,
      evidenceLimitations: [
        "NO_REGISTRY_INTEGRITY",
        "NO_REGISTRY_SIGNATURE",
        "NO_NPM_PROVENANCE",
        "NO_PUBLICATION_ATTESTATION",
        "NO_DISTRIBUTION_TAG",
        "NO_IMMUTABLE_PUBLIC_COORDINATE",
      ],
    };
    await adapters.persistSuccess(result);
    return result;
  } catch (error) {
    await adapters.persistFailure(failureRecord(error, adapters.now()));
    throw error;
  } finally {
    await adapters.cleanup(temporary.root);
  }
}

export const sanitizedConsumerEnvironment = (environment = process.env) => ({
  ...Object.fromEntries(
    Object.entries(environment).filter(([name]) => {
      const normalized = name.toLowerCase();
      return (
        !normalized.startsWith("npm_config_") &&
        !normalized.startsWith("npm_package_") &&
        normalized !== "node_env" &&
        normalized !== "node_auth_token" &&
        normalized !== "npm_token"
      );
    }),
  ),
  NODE_ENV: PRE_REGISTRY_NPM_CONFIGURATION.nodeEnvironment,
});

const runProcess = ({
  executable,
  arguments_,
  cwd,
  env = process.env,
  label,
  logPath,
}) => {
  const result = spawnSync(executable, arguments_, {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 128 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (logPath) {
    writeFileSync(logPath, output, "utf8");
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}:\n${output}`);
  }
  return result.stdout ?? "";
};

const createDefaultAdapters = (input, npmCli) => {
  const outputDirectory = resolve(input.outputDirectory);
  const logsDirectory = join(outputDirectory, "logs");
  const writeJson = (fileName, value) =>
    writeFileSync(join(outputDirectory, fileName), stableJson(value), "utf8");
  const consumerEnvironment = sanitizedConsumerEnvironment();

  const runNpm = (arguments_, options, npmConfigurationPaths) =>
    runProcess({
      executable: process.execPath,
      arguments_: [
        npmCli,
        ...consumerNpmConfigurationArguments(npmConfigurationPaths),
        ...arguments_,
      ],
      cwd: options.cwd,
      env: consumerEnvironment,
      label: options.label,
      logPath: options.logPath,
    });

  return {
    prepareOutput: async () => {
      assertFreshOutputDirectory(outputDirectory);
      mkdirSync(logsDirectory);
    },
    loadInputs: async () => {
      const artifactArchivePath = resolve(input.artifactArchivePath);
      if (!existsSync(artifactArchivePath)) {
        throw new Error(
          `Candidate artifact archive is absent: ${artifactArchivePath}.`,
        );
      }
      const publicationControl = JSON.parse(
        readFileSync(
          join(REPOSITORY_ROOT, "docs", "release", "publication-control.json"),
          "utf8",
        ),
      );
      const verifiedArtifact = verifyCandidateArtifactArchive({
        archive: readFileSync(artifactArchivePath),
        expectedDigest:
          publicationControl.reconciliation?.candidateArtifact?.digest,
      });
      const tarballPath = join(
        outputDirectory,
        verifiedArtifact.candidate.tarball.fileName,
      );
      writeFileSync(tarballPath, verifiedArtifact.tarball);
      const commit = commitFromGitSpec(input.gitSpec);
      const sourceManifestText = runProcess({
        executable: "git",
        arguments_: ["show", `${commit}:package.json`],
        cwd: REPOSITORY_ROOT,
        label: "exact Git source manifest inspection",
        logPath: join(logsDirectory, "git-source-manifest.log"),
      });
      const signerRegistry = JSON.parse(
        readFileSync(
          join(REPOSITORY_ROOT, "docs", "provenance", "release-signers.json"),
          "utf8",
        ),
      );
      const tagVerification = verifyLocalReleaseTag({
        repositoryRoot: REPOSITORY_ROOT,
        expectedTag: publicationControl.reconciliation.source.tag,
        expectedCommit: commit,
        registry: signerRegistry,
        releaseDate: new Date().toISOString().slice(0, 10),
      });
      writeFileSync(
        join(logsDirectory, "git-tag-verification.log"),
        stableJson(tagVerification),
        "utf8",
      );
      return {
        candidateBundle: verifiedArtifact.candidate,
        artifactArchive: verifiedArtifact.artifactArchive,
        publicationControl,
        sourceManifest: JSON.parse(sourceManifestText),
        tarballPath,
      };
    },
    createTemporaryRoot: async () => {
      const parent = resolve(process.env.RUNNER_TEMP ?? tmpdir());
      const root = mkdtempSync(join(parent, "owlapi-git-equivalence-"));
      const npmConfigurationDirectory = join(root, "npm-config");
      mkdirSync(npmConfigurationDirectory);
      const npmConfigurationPaths = {
        userConfigPath: join(npmConfigurationDirectory, "user.npmrc"),
        globalConfigPath: join(npmConfigurationDirectory, "global.npmrc"),
      };
      writeFileSync(npmConfigurationPaths.userConfigPath, "", "utf8");
      writeFileSync(npmConfigurationPaths.globalConfigPath, "", "utf8");
      return {
        parent,
        root,
        npmConfigurationPaths,
      };
    },
    npmConfigurationFacts: async ({ temporaryRoot, npmConfigurationPaths }) => {
      if (
        readFileSync(npmConfigurationPaths.userConfigPath, "utf8") !== "" ||
        readFileSync(npmConfigurationPaths.globalConfigPath, "utf8") !== ""
      ) {
        throw new Error(
          "Generated npm user and global configuration files must be empty.",
        );
      }
      const effectiveText = runNpm(
        [
          ...consumerInstallPolicyArguments(),
          "config",
          "get",
          "userconfig",
          "globalconfig",
          "registry",
          "ignore-scripts",
          "strict-allow-scripts",
          "package-lock",
          "install-strategy",
          "include",
          "omit",
        ],
        {
          cwd: temporaryRoot,
          label: "accepted effective npm configuration",
        },
        npmConfigurationPaths,
      );
      return validateEffectiveNpmConfiguration(
        parseNpmConfigGetOutput(effectiveText),
        npmConfigurationPaths,
      );
    },
    observeConsumer: async ({
      kind,
      dependency,
      temporaryRoot,
      npmConfigurationPaths,
    }) => {
      const consumerDirectory = join(temporaryRoot, `${kind}-consumer`);
      const cacheDirectory = join(temporaryRoot, `${kind}-npm-cache`);
      mkdirSync(consumerDirectory);
      writeFileSync(
        join(consumerDirectory, "package.json"),
        stableJson({
          name: `owlapi-${kind}-equivalence-consumer`,
          version: "0.0.0",
          private: true,
          type: "module",
          dependencies: { owlapi: dependency },
        }),
        "utf8",
      );
      runNpm(
        consumerInstallArguments(kind, cacheDirectory),
        {
          cwd: consumerDirectory,
          label: `${kind} ordinary npm install`,
          logPath: join(logsDirectory, `${kind}-install.log`),
        },
        npmConfigurationPaths,
      );

      const tests = [];
      for (const script of INSTALLED_PACKAGE_TEST_SCRIPTS) {
        copyFileSync(
          join(REPOSITORY_ROOT, "test", script),
          join(consumerDirectory, script),
        );
        runProcess({
          executable: process.execPath,
          arguments_: [script],
          cwd: consumerDirectory,
          env: consumerEnvironment,
          label: `${kind} ${script}`,
          logPath: join(logsDirectory, `${kind}-${script}.log`),
        });
        tests.push({ script, result: "PASS" });
      }

      const npmLsText = runNpm(
        ["ls", "--omit=dev", "--all", "--json"],
        {
          cwd: consumerDirectory,
          label: `${kind} production dependency graph`,
          logPath: join(logsDirectory, `${kind}-npm-ls.log`),
        },
        npmConfigurationPaths,
      );
      const packageRoot = join(consumerDirectory, "node_modules", "owlapi");
      if (!existsSync(packageRoot)) {
        throw new Error(
          `${kind} npm install did not create node_modules/owlapi.`,
        );
      }
      return {
        kind,
        installedManifest: JSON.parse(
          readFileSync(join(packageRoot, "package.json"), "utf8"),
        ),
        tree: createInstalledPackageTreeManifest(packageRoot),
        npmLs: JSON.parse(npmLsText),
        lockfile: JSON.parse(
          readFileSync(join(consumerDirectory, "package-lock.json"), "utf8"),
        ),
        tests,
      };
    },
    runtimeFacts: async ({ npmConfigurationPaths }) => ({
      node: process.version,
      npm: runNpm(
        ["--version"],
        {
          cwd: REPOSITORY_ROOT,
          label: "accepted npm version",
          logPath: join(logsDirectory, "npm-version.log"),
        },
        npmConfigurationPaths,
      ).trim(),
      platform: platform(),
      architecture: arch(),
      osRelease: release(),
    }),
    persistSuccess: async (result) => {
      writeJson(
        "candidate-package-tree.json",
        result.retainedCandidate.installedPackageTree,
      );
      writeJson(
        "git-package-tree.json",
        result.gitInstallation.installedPackageTree,
      );
      writeJson(
        "candidate-production-graph.json",
        result.retainedCandidate.productionGraph,
      );
      writeJson(
        "git-production-graph.json",
        result.gitInstallation.productionGraph,
      );
      writeJson("git-lock-facts.json", result.gitInstallation.lock);
      writeJson("qualification.json", result);
    },
    persistFailure: async (failure) => {
      writeJson("failure.json", failure);
    },
    cleanup: async (temporaryRoot) => {
      const parent = resolve(process.env.RUNNER_TEMP ?? tmpdir());
      if (!isStrictDescendantPath(parent, temporaryRoot)) {
        throw new Error(
          `Refusing to clean unexpected qualification path ${temporaryRoot}.`,
        );
      }
      rmSync(temporaryRoot, { recursive: true, force: true });
    },
    now: () => new Date().toISOString(),
  };
};

const main = async () => {
  if (!process.env.npm_execpath) {
    throw new Error(
      "Run Git-package equivalence through the named npm script so the accepted local npm CLI is authoritative.",
    );
  }
  const parsed = parseQualificationArguments(process.argv.slice(2));
  const input = {
    artifactArchivePath: resolve(parsed.artifactArchivePath),
    gitSpec: parsed.gitSpec,
    outputDirectory: resolve(parsed.outputDirectory),
  };
  if (input.artifactArchivePath === input.outputDirectory) {
    throw new Error("Artifact archive and output paths must be different.");
  }
  const result = await qualifyGitPackageEquivalence(
    input,
    createDefaultAdapters(input, process.env.npm_execpath),
  );
  process.stdout.write(`${result.result} ${input.outputDirectory}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
