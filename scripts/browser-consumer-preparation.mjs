import { spawnSync } from "node:child_process";
import { installedConsumerEnvironment } from "./installed-consumer-fixtures.mjs";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import { documentationExampleModules } from "./documentation-examples.mjs";
import { assertPackageIdentity } from "./package-identity.mjs";
import {
  prepareTarballConsumer,
  verifyTestedConsumerResolution,
} from "./release-consumer-evidence.mjs";
import { qualifyCiConsumerInstall } from "./ci-recipient-attribution.mjs";
import { assertServedPackagePayload } from "./release-consumer-resolution.mjs";
import {
  BROWSER_CONSUMER_MODES as MODES,
  BROWSER_PREPARATION_NAME,
  browserFixturePayloadDigests,
  indexBrowserNpmAttributions,
} from "./browser-consumer-evidence.mjs";
import { admitReviewedReferenceMap } from "./reference-import-map-admission.mjs";
import { assertApprovedProviderPinChanges } from "./reference-import-map-approval.mjs";
import {
  generateReferenceImportMap,
  hydrateReferenceImportMap,
  readJson,
  stableJson,
  writeJson,
} from "./reference-import-map.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE_SOURCE_ROOT = join(
  REPOSITORY_ROOT,
  "test",
  "consumers",
  "browser",
);
const SHARED_MODULES = Object.freeze([
  ["scripts/canonical-json.mjs", "json-identity.mjs"],
  ["test/consumers/browser/_shared/exercise-package.js", "exercise-package.js"],
  ["test/import-closure/public-contract.js", "public-contract.js"],
  ["test/import-closure/rc2-public-contract.js", "rc2-public-contract.js"],
  ...[
    "public-model-cases.js",
    "public-model-probes.js",
    "acquisition-contracts.js",
    "writer-configuration.js",
  ].map((name) => [`test/consumers/owl-contract/${name}`, name]),
]);

const runNpm = (npmCli, arguments_, cwd, cacheDirectory) => {
  const result = spawnSync(process.execPath, [npmCli, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: {
      ...installedConsumerEnvironment(),
      npm_config_cache: cacheDirectory,
    },
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `npm ${arguments_.join(" ")} failed in ${cwd}:\n${result.stdout}${result.stderr}`,
      { cause: result.error },
    );
  }
};

const installFixture = async ({
  mode,
  outputDirectory,
  tarballPath,
  candidateManifest,
  npmCli,
  temporaryRoot,
  tarball,
  verifyConsumerEvidence,
}) => {
  const directory = join(outputDirectory, mode);
  const fixtureModules = ["main.js"];
  if (mode === "worker") fixtureModules.push("ontology-worker.js");
  mkdirSync(directory);
  // Stage only the runtime inputs, so a reviewed-map refresh temporary file
  // left by an interrupted process cannot enter a subsequent fixture.
  for (const file of ["index.html", ...fixtureModules]) {
    copyFileSync(join(FIXTURE_SOURCE_ROOT, mode, file), join(directory, file));
  }
  for (const [source, name] of SHARED_MODULES) {
    copyFileSync(join(REPOSITORY_ROOT, source), join(directory, name));
    fixtureModules.push(name);
  }

  const writeModule = (name, source) => {
    writeFileSync(join(directory, name), source, "utf8");
    fixtureModules.push(name);
  };
  const closureDocuments = Object.fromEntries(
    ["root", "left", "right", "leaf"].map((name) => [
      name,
      readFileSync(
        join(
          REPOSITORY_ROOT,
          "test",
          "import-closure",
          "fixtures",
          "closure",
          `${name}.ofn`,
        ),
        "utf8",
      ),
    ]),
  );
  writeModule(
    "import-closure-documents.js",
    `export default ${JSON.stringify(closureDocuments)};\n`,
  );
  prepareTarballConsumer(directory, tarballPath, "owlapi", {
    name: "owlapi-browser-consumer",
    version: "0.0.0",
    private: true,
    type: "module",
  });
  runNpm(
    npmCli,
    [
      "install",
      "--engine-strict",
      "--ignore-scripts",
      "--package-lock",
      "--no-audit",
      "--no-fund",
    ],
    directory,
    join(temporaryRoot, `${mode}-npm-cache`),
  );

  const packageRoot = join(directory, "node_modules", "owlapi");
  const installedManifest = readJson(join(packageRoot, "package.json"));
  if (
    installedManifest.name !== candidateManifest.package.name ||
    installedManifest.version !== candidateManifest.package.version
  ) {
    throw new Error(
      `The ${mode} fixture installed an unexpected package identity`,
    );
  }
  const attribution = await qualifyCiConsumerInstall({
    directory,
    tarball,
    npmCli,
    dependencyName: "owlapi",
    role:
      mode === "import-map" ? "browser-import-map-input" : `browser-${mode}`,
    verifyConsumerEvidence,
    candidate: candidateManifest,
    decisionDirectory: join(outputDirectory, "eligibility"),
  });
  const examples = documentationExampleModules(
    readFileSync(join(packageRoot, "README.md"), "utf8"),
  );
  const ids = Object.keys(examples);
  for (const [id, source] of Object.entries(examples)) {
    writeModule(`readme-${id}.js`, source);
  }
  writeModule(
    "exercise-documentation.js",
    `${ids.map((id, index) => `import { exercise as example${index} } from "./readme-${id}.js";`).join("\n")}\nexport async function exerciseDocumentation() { ${ids.map((_, index) => `await example${index}();`).join(" ")} return { examples: ${ids.length} }; }\n`,
  );
  return { directory, packageRoot, fixtureModules, attribution };
};

const stageBrowserConsumerFixtures = async (options) => {
  if (!options.npmCli) {
    throw new Error(
      "Run browser-consumer preparation through its named npm script so the accepted local npm CLI is authoritative.",
    );
  }
  const verifyConsumerEvidence =
    options.verifyConsumerEvidence ??
    (await import("./ci-consumer-evidence-verification.mjs"))
      .verifyCiConsumerEvidence;
  const fixtures = {};
  for (const mode of MODES)
    fixtures[mode] = await installFixture({
      ...options,
      mode,
      verifyConsumerEvidence,
    });
  for (const mode of ["bundler", "worker"]) {
    const { directory } = fixtures[mode];
    await build({
      base: "./",
      root: directory,
      logLevel: "info",
      worker: { format: "es" },
      build: { emptyOutDir: true, outDir: join(directory, "dist") },
    });
  }
  for (const { directory, attribution } of Object.values(fixtures)) {
    await verifyTestedConsumerResolution(
      directory,
      {
        tarball: options.tarball,
        npmCli: options.npmCli,
        dependencyName: "owlapi",
      },
      attribution.evidence.resolution,
    );
  }
  return {
    ...fixtures["import-map"],
    npmAttributions: Object.fromEntries(
      MODES.map((mode) => [mode, fixtures[mode].attribution]),
    ),
  };
};

// Bind all three npm installs to one verified copy even if the external
// retained tarball path changes after admission.
const stageAdmittedCandidate = async ({
  candidateDirectory,
  candidateManifest,
  outputDirectory,
  npmCli,
  stageFixtures,
  verifyConsumerEvidence,
}) => {
  const { fileName, sha256 } = candidateManifest.tarball;
  if (basename(fileName) !== fileName || !fileName.endsWith(".tgz")) {
    throw new Error("Candidate tarball must be a .tgz basename");
  }
  const temporaryRoot = mkdtempSync(
    join(tmpdir(), "owlapi-browser-consumers-"),
  );
  if (!isStrictDescendantPath(tmpdir(), temporaryRoot)) {
    throw new Error(
      `Refusing to use unexpected temporary path ${temporaryRoot}`,
    );
  }
  try {
    const tarballPath = join(temporaryRoot, fileName);
    copyFileSync(join(candidateDirectory, fileName), tarballPath);
    const tarball = readFileSync(tarballPath);
    if (sha256Buffer(tarball) !== sha256) {
      throw new Error(
        "Retained candidate tarball no longer matches its manifest",
      );
    }
    mkdirSync(outputDirectory, { recursive: true });
    const staged = await stageFixtures({
      candidateManifest,
      outputDirectory,
      tarballPath,
      tarball,
      npmCli,
      temporaryRoot,
      verifyConsumerEvidence,
    });
    return { ...staged, admittedTarball: tarball };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

const readReviewedMap = (path) => {
  try {
    return readFileSync(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(
      `Restore the approved starting reference import map at ${path} before preparation`,
      { cause: error },
    );
  }
};

// Opening exclusively establishes ownership even if writing the bytes fails.
const publishAtomic = (destination, bytes, replace = renameSync) => {
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.tmp`,
  );
  const handle = openSync(temporary, "wx");
  try {
    try {
      writeFileSync(handle, bytes);
    } finally {
      closeSync(handle);
    }
    replace(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
};

/** Admit one retained candidate and publish complete evidence under single-writer checkout custody. */
export const prepareBrowserConsumers = async ({
  candidateDirectory,
  outputDirectory,
  reviewedMapPath,
  writeReviewedMap = false,
  approvedProviderPinChangesPath,
  npmCli,
  createGenerator,
  fetchImplementation,
  replaceReviewedMap = renameSync,
  stageFixtures = stageBrowserConsumerFixtures,
  verifyConsumerEvidence,
}) => {
  if (approvedProviderPinChangesPath !== undefined && !writeReviewedMap) {
    throw new Error(
      "--approved-provider-pin-changes requires --write-reviewed-map",
    );
  }
  const startingBytes = readReviewedMap(reviewedMapPath);
  const reviewedMap = admitReviewedReferenceMap(
    JSON.parse(startingBytes.toString("utf8")),
  );
  if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
    throw new Error(
      `Browser-consumer output already exists at ${outputDirectory}; preserve it and choose a fresh path.`,
    );
  }
  const candidateManifest = readJson(
    join(candidateDirectory, "candidate-manifest.json"),
  );
  assertPackageIdentity(candidateManifest.package);
  const {
    directory,
    packageRoot,
    fixtureModules,
    npmAttributions,
    admittedTarball,
  } = await stageAdmittedCandidate({
    candidateDirectory,
    candidateManifest,
    outputDirectory,
    npmCli,
    stageFixtures,
    verifyConsumerEvidence,
  });
  const generatedMap = await generateReferenceImportMap({
    applicationPath: join(directory, "main.js"),
    packageRoot,
    fixtureModules,
    createGenerator,
  });
  const generatedMapText = stableJson(generatedMap);
  if (writeReviewedMap) {
    await assertApprovedProviderPinChanges({
      startingBytes,
      startingPins: reviewedMap.integrity,
      generatedPins: generatedMap.integrity,
      approvalPath: approvedProviderPinChangesPath,
    });
  } else if (stableJson(reviewedMap) !== generatedMapText) {
    throw new Error(
      "Generated reference import map differs from the committed reviewed map",
    );
  }

  const runtimeDirectory = join(directory, "runtime");
  mkdirSync(runtimeDirectory);
  for (const fileName of fixtureModules) {
    const target = join(runtimeDirectory, fileName);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(directory, fileName), target);
  }
  cpSync(packageRoot, join(runtimeDirectory, "package", "owlapi"), {
    recursive: true,
    // The import-map runtime loads its own pinned provider subjects.
    filter: (source) => source !== join(packageRoot, "node_modules"),
  });

  const { inventory, localMap } = await hydrateReferenceImportMap({
    map: writeReviewedMap ? generatedMap : reviewedMap,
    mirrorRoot: runtimeDirectory,
    fetchImplementation,
  });
  writeFileSync(
    join(directory, "reference-import-map.generated.json"),
    generatedMapText,
    "utf8",
  );
  writeJson(join(directory, "provider-inventory.json"), {
    schemaVersion: 1,
    provider: "jspm.io",
    conditions: ["production", "browser", "module"],
    modules: inventory,
  });
  writeJson(
    join(runtimeDirectory, "reference-import-map.local.json"),
    localMap,
  );

  const html = readFileSync(join(directory, "index.html"), "utf8");
  const marker = "<!-- REFERENCE_IMPORT_MAP -->";
  if (!html.includes(marker)) {
    throw new Error("Import-map fixture is missing its injection marker");
  }
  const inlineMap = stableJson(localMap).replaceAll("<", "\\u003c");
  writeFileSync(
    join(runtimeDirectory, "index.html"),
    html.replace(
      marker,
      () => `<script type="importmap">\n${inlineMap}</script>`,
    ),
    "utf8",
  );

  assertServedPackagePayload(
    join(runtimeDirectory, "package", "owlapi"),
    admittedTarball,
  );
  const manifest = stableJson({
    schemaVersion: npmAttributions ? 2 : 1,
    ...(npmAttributions
      ? {
          npmAttributions: indexBrowserNpmAttributions(npmAttributions),
          fixturePayloadSha256: browserFixturePayloadDigests(outputDirectory),
        }
      : {}),
    package: candidateManifest.package,
    candidate: {
      directory: basename(candidateDirectory),
      tarball: candidateManifest.tarball,
    },
    consumers: MODES,
    referenceImportMap: {
      generatedSha256: sha256Buffer(Buffer.from(generatedMapText)),
      integrityScope: "provider-only",
      provider: "jspm.io",
      providerModuleCount: inventory.length,
      reviewedPath: isStrictDescendantPath(REPOSITORY_ROOT, reviewedMapPath)
        ? relative(REPOSITORY_ROOT, reviewedMapPath).split(sep).join("/")
        : resolve(reviewedMapPath),
    },
  });
  if (writeReviewedMap) {
    publishAtomic(
      reviewedMapPath,
      generatedMapText,
      (stagedPath, destination) => {
        if (!readReviewedMap(destination).equals(startingBytes)) {
          throw new Error(
            `Starting reviewed map changed during preparation: ${destination}`,
          );
        }
        replaceReviewedMap(stagedPath, destination);
      },
    );
  }
  // An interruption after the reviewed-map swap is recoverable from the staged
  // generated map. Only a complete manifest can follow the swap.
  publishAtomic(join(outputDirectory, BROWSER_PREPARATION_NAME), manifest);
};
