import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  assertReleasePacklist,
  formatSha256Sums,
  inspectGzipTar,
  isStrictDescendantPath,
  sha256File,
} from "./release-artifacts.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"),
);
const VERSION = packageJson.version;
const DEFAULT_OUTPUT_DIRECTORY = join(
  REPOSITORY_ROOT,
  ".release",
  "candidate",
  VERSION,
);
const TEST_SCRIPTS = Object.freeze([
  "installed-package-smoke.mjs",
  "installed-package-boundary.mjs",
  "installed-package-import-purity.mjs",
  "installed-package-no-network.mjs",
]);

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const outputArgumentIndex = process.argv.indexOf("--output");
const outputDirectory = resolve(
  outputArgumentIndex === -1
    ? DEFAULT_OUTPUT_DIRECTORY
    : process.argv[outputArgumentIndex + 1],
);

if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
  throw new Error(
    `Candidate output already exists at ${outputDirectory}; preserve or remove it explicitly before rebuilding.`,
  );
}
mkdirSync(outputDirectory, { recursive: true });

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error(
    "Run candidate construction through its named npm script so the accepted local npm CLI is authoritative.",
  );
}

const run = (executable, arguments_, options = {}) => {
  const result = spawnSync(executable, arguments_, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${options.label ?? executable} failed with status ${result.status}:\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
};

const runNpm = (arguments_, options = {}) =>
  run(process.execPath, [npmCli, ...arguments_], {
    ...options,
    label: options.label ?? `npm ${arguments_.join(" ")}`,
  });

const observeNpm = (arguments_, options = {}) => {
  const result = spawnSync(process.execPath, [npmCli, ...arguments_], {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const npmJson = (arguments_, options) =>
  JSON.parse(runNpm(arguments_, options));

const firstPackResult = (value) =>
  Array.isArray(value) ? value[0] : value[Object.keys(value)[0]];

const sortedPackEntries = (entries) =>
  entries
    .map(({ path, size }) => ({ path, size }))
    .sort((left, right) => compareCodeUnits(left.path, right.path));

const flattenNpmGraph = (root) => {
  const identities = new Set();
  const visit = (node) => {
    if (node?.name && node?.version) {
      identities.add(`${node.name}@${node.version}`);
    }
    for (const dependency of Object.values(node?.dependencies ?? {})) {
      visit(dependency);
    }
  };
  visit(root);
  return [...identities].sort(compareCodeUnits);
};

const writeJson = (fileName, value) =>
  writeFileSync(join(outputDirectory, fileName), stableJson(value), "utf8");

const writeConsumerManifest = (directory, tarballPath) =>
  writeFileSync(
    join(directory, "package.json"),
    stableJson({
      name: "owlapi-release-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: { owlapi: `file:${tarballPath.replaceAll("\\", "/")}` },
    }),
    "utf8",
  );

const runInstalledConsumerScripts = (directory) => {
  for (const scriptName of TEST_SCRIPTS) {
    copyFileSync(
      join(REPOSITORY_ROOT, "test", scriptName),
      join(directory, scriptName),
    );
    run(process.execPath, [scriptName], {
      cwd: directory,
      label: `installed consumer ${scriptName}`,
    });
  }
};

const assertNoHighProductionVulnerabilities = (audit) => {
  const vulnerabilities = audit.metadata?.vulnerabilities;
  if (!vulnerabilities) {
    throw new Error(
      "npm production audit did not report vulnerability metadata.",
    );
  }
  if ((vulnerabilities.high ?? 0) > 0 || (vulnerabilities.critical ?? 0) > 0) {
    throw new Error(
      `Production audit found high=${vulnerabilities.high ?? 0} critical=${vulnerabilities.critical ?? 0}.`,
    );
  }
};

const temporaryRoot = mkdtempSync(join(tmpdir(), "owlapi-release-candidate-"));
const resolvedTemporaryRoot = resolve(temporaryRoot);
const resolvedSystemTemp = resolve(tmpdir());
if (!isStrictDescendantPath(resolvedSystemTemp, resolvedTemporaryRoot)) {
  throw new Error(
    `Refusing to use unexpected temporary path ${temporaryRoot}.`,
  );
}
try {
  const dryRun = firstPackResult(
    npmJson(["pack", "--dry-run", "--json"], {
      label: "npm pack dry run",
    }),
  );
  const actualPack = firstPackResult(
    npmJson(["pack", "--json", "--pack-destination", outputDirectory]),
  );
  const tarballPath = join(outputDirectory, actualPack.filename);
  const archiveEntries = inspectGzipTar(readFileSync(tarballPath)).sort(
    (left, right) => compareCodeUnits(left.path, right.path),
  );
  const dryRunEntries = sortedPackEntries(dryRun.files);
  const actualPackEntries = sortedPackEntries(actualPack.files);

  if (stableJson(dryRunEntries) !== stableJson(actualPackEntries)) {
    throw new Error("npm pack dry-run and actual pack manifests differ.");
  }
  if (stableJson(actualPackEntries) !== stableJson(archiveEntries)) {
    throw new Error("npm pack manifest and actual tarball contents differ.");
  }
  assertReleasePacklist(archiveEntries.map(({ path }) => path));
  writeJson("pack-dry-run.json", dryRun);
  writeJson("pack-actual.json", actualPack);

  runNpm(["run", "release:lint-package", "--", tarballPath], {
    label: "strict publint retained-tarball check",
  });

  const subjectDirectory = join(temporaryRoot, "sbom-subject");
  mkdirSync(subjectDirectory);
  for (const fileName of ["package.json", "package-lock.json", ".npmrc"]) {
    copyFileSync(
      join(REPOSITORY_ROOT, fileName),
      join(subjectDirectory, fileName),
    );
  }
  const subjectCache = join(temporaryRoot, "sbom-npm-cache");
  runNpm(["ci", "--omit=dev", "--cache", subjectCache], {
    cwd: subjectDirectory,
    label: "production-only SBOM subject install",
  });
  const sbomFileName = `owlapi-${VERSION}.cdx.json`;
  const sbomPath = join(outputDirectory, sbomFileName);
  runNpm(
    [
      "run",
      "release:sbom",
      "--",
      "--output-file",
      sbomPath,
      join(subjectDirectory, "package.json"),
    ],
    { label: "CycloneDX production-subject generation" },
  );

  const lockedGraph = npmJson(["ls", "--omit=dev", "--all", "--json"], {
    label: "locked production graph",
  });
  const subjectGraph = npmJson(["ls", "--omit=dev", "--all", "--json"], {
    cwd: subjectDirectory,
    label: "SBOM subject production graph",
  });
  const lockedIdentities = flattenNpmGraph(lockedGraph);
  const subjectIdentities = flattenNpmGraph(subjectGraph);
  if (stableJson(lockedIdentities) !== stableJson(subjectIdentities)) {
    throw new Error(
      "Production-only SBOM subject graph differs from the locked graph.",
    );
  }
  writeJson("locked-production-graph.json", lockedGraph);
  writeJson("sbom-subject-production-graph.json", subjectGraph);

  const fullAuditObservation = observeNpm(["audit", "--json"]);
  const fullAudit = JSON.parse(fullAuditObservation.stdout);
  writeJson("npm-audit-full.json", {
    commandExitStatus: fullAuditObservation.status,
    report: fullAudit,
  });
  const productionAuditObservation = observeNpm([
    "audit",
    "--omit=dev",
    "--audit-level=high",
    "--json",
  ]);
  const productionAudit = JSON.parse(productionAuditObservation.stdout);
  assertNoHighProductionVulnerabilities(productionAudit);
  if (productionAuditObservation.status !== 0) {
    throw new Error(
      `Blocking production audit exited ${productionAuditObservation.status}: ${productionAuditObservation.stderr}`,
    );
  }
  writeJson("npm-audit-production.json", {
    commandExitStatus: productionAuditObservation.status,
    report: productionAudit,
  });

  const consumerDirectory = join(temporaryRoot, "lockless-consumer");
  mkdirSync(consumerDirectory);
  writeConsumerManifest(consumerDirectory, tarballPath);
  const consumerCache = join(temporaryRoot, "consumer-npm-cache");
  runNpm(["install", "--ignore-scripts", "--cache", consumerCache], {
    cwd: consumerDirectory,
    label: "lockless inspection consumer install",
  });
  runInstalledConsumerScripts(consumerDirectory);
  const inspectionGraph = npmJson(["ls", "--omit=dev", "--all", "--json"], {
    cwd: consumerDirectory,
    label: "lockless inspection consumer production graph",
  });

  const normalConsumerDirectory = join(temporaryRoot, "normal-consumer");
  mkdirSync(normalConsumerDirectory);
  writeConsumerManifest(normalConsumerDirectory, tarballPath);
  const normalConsumerCache = join(temporaryRoot, "normal-consumer-npm-cache");
  runNpm(["install", "--cache", normalConsumerCache], {
    cwd: normalConsumerDirectory,
    label: "normal lockless consumer install",
  });
  runInstalledConsumerScripts(normalConsumerDirectory);
  const locklessGraph = npmJson(["ls", "--omit=dev", "--all", "--json"], {
    cwd: normalConsumerDirectory,
    label: "normal lockless consumer production graph",
  });
  const installedOwlapi = locklessGraph.dependencies?.owlapi;
  if (!installedOwlapi) {
    throw new Error("Lockless consumer graph does not contain owlapi.");
  }
  if (installedOwlapi.version !== VERSION) {
    throw new Error(
      `Lockless consumer installed owlapi@${installedOwlapi.version ?? "unknown"}, expected ${VERSION}.`,
    );
  }
  const locklessIdentities = [
    `${packageJson.name}@${VERSION}`,
    ...flattenNpmGraph(installedOwlapi),
  ]
    .filter(
      (identity, index, identities) => identities.indexOf(identity) === index,
    )
    .sort(compareCodeUnits);
  if (stableJson(lockedIdentities) !== stableJson(locklessIdentities)) {
    const missing = lockedIdentities.filter(
      (identity) => !locklessIdentities.includes(identity),
    );
    const unexpected = locklessIdentities.filter(
      (identity) => !lockedIdentities.includes(identity),
    );
    throw new Error(
      `Lockless retained-tarball graph differs from the locked graph: missing=${JSON.stringify(missing)} unexpected=${JSON.stringify(unexpected)}`,
    );
  }
  writeJson("lockless-consumer-production-graph.json", locklessGraph);
  writeJson("inspection-consumer-production-graph.json", inspectionGraph);
  copyFileSync(
    join(normalConsumerDirectory, "package-lock.json"),
    join(outputDirectory, "lockless-consumer-package-lock.json"),
  );
  const consumerAuditObservation = observeNpm(
    ["audit", "--omit=dev", "--audit-level=high", "--json"],
    { cwd: normalConsumerDirectory },
  );
  const consumerAudit = JSON.parse(consumerAuditObservation.stdout);
  assertNoHighProductionVulnerabilities(consumerAudit);
  if (consumerAuditObservation.status !== 0) {
    throw new Error(
      `Normal consumer production audit exited ${consumerAuditObservation.status}: ${consumerAuditObservation.stderr}`,
    );
  }
  writeJson("normal-consumer-npm-audit-production.json", {
    commandExitStatus: consumerAuditObservation.status,
    report: consumerAudit,
  });
  writeJson("dependency-graph-reconciliation.json", {
    lockedIdentities,
    sbomSubjectIdentities: subjectIdentities,
    locklessConsumerIdentities: locklessIdentities,
    differences: [],
  });

  const tarballFileName = basename(tarballPath);
  const checksumEntries = [
    { fileName: tarballFileName, sha256: sha256File(tarballPath) },
    { fileName: sbomFileName, sha256: sha256File(sbomPath) },
  ];
  writeFileSync(
    join(outputDirectory, "SHA256SUMS"),
    formatSha256Sums(checksumEntries),
    "utf8",
  );
  writeJson("candidate-manifest.json", {
    schemaVersion: 1,
    package: { name: packageJson.name, version: VERSION },
    sourceState: "UNCOMMITTED_QUALIFICATION_SNAPSHOT",
    nodeVersion: process.version,
    npmVersion: runNpm(["--version"]).trim(),
    tarball: {
      fileName: tarballFileName,
      sha256: checksumEntries.find(
        ({ fileName }) => fileName === tarballFileName,
      ).sha256,
      bytes: readFileSync(tarballPath).length,
      fileCount: archiveEntries.length,
    },
    sbom: {
      fileName: sbomFileName,
      sha256: checksumEntries.find(({ fileName }) => fileName === sbomFileName)
        .sha256,
      specVersion: "1.6",
      componentType: "library",
      reproducible: true,
    },
    checksumFile: "SHA256SUMS",
    lockedAndLocklessGraphsEquivalent: true,
    productionAuditHighOrCriticalCount: 0,
    installedConsumerScripts: [...TEST_SCRIPTS],
  });

  process.stdout.write(`${outputDirectory}\n`);
} finally {
  // Only the unique directory returned by mkdtemp is eligible for cleanup.
  // The explicit preflight above guards this recursive operation from path drift.
  rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
}
