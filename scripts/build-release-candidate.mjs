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
  assertNpmSbomInventory,
  flattenNpmGraph,
} from "./npm-production-graph.mjs";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { assertHealthyNpmGraph } from "./npm-production-graph.mjs";
import {
  captureResolutionEvidence,
  prepareTarballConsumer,
} from "./release-consumer-evidence.mjs";
import { compareConsumerResolutions } from "./release-consumer-resolution.mjs";
import { verifyCiConsumerEvidence } from "./ci-consumer-evidence-verification.mjs";
import { recipientMaterialCaseDirectory } from "./recipient-material-case.mjs";
import {
  assertConsistentArchives,
  packProducerResolutions,
  producerResolutionFilename,
} from "./release-resolution-proof.mjs";
import { publicRegistryEnvironment } from "./public-registry-consumer.mjs";
import { preflightFullReleaseAudit } from "./release-audit-evaluator.mjs";
import { stableJson as canonicalOutput } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import {
  DOCUMENTATION_PATHS,
  inspectReleaseDocumentation,
} from "./release-documentation.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_FILE_STEM,
  assertPackageIdentity,
} from "./package-identity.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  productionInstallScriptPolicy,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";

import { isStrictDescendantPath, sha256File } from "./release-file-utils.mjs";
import {
  assertReleasePacklist,
  formatSha256Sums,
  inspectGzipTar,
} from "./release-artifacts.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"),
);
const VERSION = packageJson.version;
assertPackageIdentity(packageJson);
const DEFAULT_OUTPUT_DIRECTORY = join(
  REPOSITORY_ROOT,
  ".release",
  "candidate",
  VERSION,
);
const TEST_SCRIPTS = INSTALLED_TEST_SCRIPTS;

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

const npmJson = (arguments_, options) =>
  JSON.parse(runNpm(arguments_, options));

const firstPackResult = (value) =>
  Array.isArray(value) ? value[0] : value[Object.keys(value)[0]];

const sortedPackEntries = (entries) =>
  entries
    .map(({ path, size }) => ({ path, size }))
    .sort((left, right) => compareCodeUnits(left.path, right.path));

const writeJson = (fileName, value) =>
  writeFileSync(join(outputDirectory, fileName), stableJson(value), "utf8");

const runInstalledConsumerScripts = (directory, dependencyName, env) => {
  writeInstalledConsumerFixtures(directory, dependencyName);
  for (const script of TEST_SCRIPTS)
    run(process.execPath, [script], {
      cwd: directory,
      env,
      label: "installed consumer " + script,
    });
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
  for (const packed of [dryRun, actualPack]) {
    assertPackageIdentity(packed);
    if (packed.filename !== `${PACKAGE_FILE_STEM}-${VERSION}.tgz`) {
      throw new Error(
        "npm pack returned an unexpected scoped tarball filename.",
      );
    }
  }
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
  inspectReleaseDocumentation(
    readFileSync(tarballPath),
    packageJson,
    Object.fromEntries(
      DOCUMENTATION_PATHS.map((path) => [
        path,
        readFileSync(join(REPOSITORY_ROOT, path), "utf8"),
      ]),
    ),
  );
  writeJson("pack-dry-run.json", dryRun);
  writeJson("pack-actual.json", actualPack);

  runNpm(["run", "lint:package", "--", tarballPath], {
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
  runNpm(
    [
      "ci",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      subjectCache,
    ],
    {
      cwd: subjectDirectory,
      label: "production-only SBOM subject install",
    },
  );
  for (const file of ["package.json", "package-lock.json"]) {
    if (
      !readFileSync(join(subjectDirectory, file)).equals(
        readFileSync(join(REPOSITORY_ROOT, file)),
      )
    ) {
      throw new Error(
        "Production inventory install changed its frozen " + file,
      );
    }
  }
  const sbomFileName = `${PACKAGE_FILE_STEM}-${VERSION}.cdx.json`;
  const sbomPath = join(outputDirectory, sbomFileName);
  runNpm(
    [
      "run",
      "generate:release-sbom",
      "--",
      "--output-file",
      sbomPath,
      join(subjectDirectory, "package.json"),
    ],
    { label: "CycloneDX production-subject generation" },
  );

  const tarball = readFileSync(tarballPath);
  const decisionDirectory = join(temporaryRoot, "eligibility");
  const observations = {};
  async function measure(directory, mode, dependencyName) {
    const evidence = await captureResolutionEvidence(directory, {
      tarball,
      npmCli,
      dependencyName,
    });
    const eligibility = await verifyCiConsumerEvidence({
      directory,
      evidence,
      role: "candidate-" + mode,
      decisionDirectory,
      npmCli,
      caseDirectory: join(outputDirectory, recipientMaterialCaseDirectory),
      caseContext: {
        kind: "PRODUCER_CANDIDATE",
        sbomSha256: sha256File(sbomPath),
      },
    });
    observations[mode] = { evidence, eligibility };
    return evidence.resolution;
  }
  const baseline = await measure(subjectDirectory, "producer", null);
  const { manifest, lock } = observations.producer.evidence;
  const full = await preflightFullReleaseAudit(
    {
      manifestBytes: Buffer.from(manifest),
      lockBytes: Buffer.from(lock),
      tarballSha256: baseline.tarballSha256,
      graphSha256: sha256Buffer(
        Buffer.from(canonicalOutput(JSON.parse(lock).packages)),
      ),
      role: "producer",
      scope: "full",
      platform: { ...baseline.platform, npm: baseline.npm },
    },
    { npmCli, npm: baseline.npm },
  );
  if (!full.eligible)
    throw new Error("Full release dependency audit needs disposition");
  const subjectGraph = npmJson(["ls", "--omit=dev", "--all", "--json"], {
    cwd: subjectDirectory,
  });
  assertHealthyNpmGraph(subjectGraph);
  assertNpmSbomInventory(
    JSON.parse(readFileSync(sbomPath, "utf8")),
    flattenNpmGraph(subjectGraph),
    { graph: baseline.graph, tarball },
  );
  for (const [mode, dependencyName, normal] of [
    ["inspection", "owlapi", false],
    ["normal", "owlapi", true],
    ["scoped", PACKAGE_NAME, false],
  ]) {
    const directory = join(temporaryRoot, mode);
    mkdirSync(directory);
    const scripts = productionInstallScriptPolicy();
    // A newly authorised positive lifecycle decision needs exact-archive
    // authentication before execution. Today's only production decision is deny.
    if (normal && Object.values(scripts).some(Boolean))
      throw new Error(
        "Normal install requires pre-authentication for approved lifecycle archives",
      );
    prepareTarballConsumer(directory, tarballPath, dependencyName, {
      name: "owlapi-release-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
      ...(normal ? { allowScripts: scripts } : {}),
    });
    const env = publicRegistryEnvironment(directory);
    runNpm(
      [
        "install",
        normal ? "--strict-allow-scripts" : "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--cache",
        join(temporaryRoot, mode + "-cache"),
      ],
      {
        cwd: directory,
        env,
        label: "fresh " + mode + " install",
      },
    );
    const graph = npmJson(["ls", "--omit=dev", "--all", "--json"], {
      cwd: directory,
      env,
    });
    assertHealthyNpmGraph(graph);
    const observed = await measure(directory, mode, dependencyName);
    const delta = compareConsumerResolutions(baseline, observed);
    runInstalledConsumerScripts(directory, dependencyName, env);
    process.stdout.write(
      mode +
        ": " +
        observed.graph.nodes.length +
        " npm occurrences, " +
        delta.occurrences.length +
        " changed, " +
        delta.edges.length +
        " changed edges; installed checks passed.\n",
    );
  }
  assertConsistentArchives(
    Object.values(observations).map(({ evidence }) => evidence.resolution),
  );
  const proof = packProducerResolutions(observations, decisionDirectory);
  writeJson(producerResolutionFilename, proof);
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
  // Validate the real generator output through the same closed reader used by later jobs.
  const verified = verifyDownloadedCandidateBundle({
    fileNames: ["SHA256SUMS", tarballFileName, sbomFileName],
    checksumText: readFileSync(join(outputDirectory, "SHA256SUMS"), "utf8"),
    sbomText: readFileSync(sbomPath, "utf8"),
    tarball: readFileSync(tarballPath),
  });
  writeJson("candidate-manifest.json", {
    schemaVersion: 2,
    package: { name: packageJson.name, version: VERSION },
    sourceState: "UNCOMMITTED_QUALIFICATION_SNAPSHOT",
    nodeVersion: process.version,
    npmVersion: runNpm(["--version"]).trim(),
    tarball: {
      ...verified.tarball,
      fileCount: archiveEntries.length,
    },
    sbom: {
      ...verified.sbom,
      reproducible: true,
    },
    checksumFile: "SHA256SUMS",
    fullGraphCheck: {
      result: "PASS",
      subject: full.subject,
      observedAt: full.observedAt,
    },
    resolutionProof: {
      fileName: producerResolutionFilename,
      sha256: sha256File(join(outputDirectory, producerResolutionFilename)),
    },
    installedConsumerScripts: [...TEST_SCRIPTS],
  });

  process.stdout.write(`${outputDirectory}\n`);
} finally {
  // Only the unique directory returned by mkdtemp is eligible for cleanup.
  // The explicit preflight above guards this recursive operation from path drift.
  rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
}
