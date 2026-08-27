import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
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

import { build } from "vite";

import {
  hydrateReferenceImportMap,
  generateReferenceImportMap,
  readJson,
  stableJson,
  writeJson,
} from "./reference-import-map.mjs";
import {
  isStrictDescendantPath,
  sha256Buffer,
  sha256File,
} from "./release-artifacts.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE_SOURCE_ROOT = join(
  REPOSITORY_ROOT,
  "test",
  "consumers",
  "browser",
);
const SHARED_EXERCISE_PATH = join(
  FIXTURE_SOURCE_ROOT,
  "_shared",
  "exercise-package.js",
);
const REVIEWED_MAP_PATH = join(
  FIXTURE_SOURCE_ROOT,
  "import-map",
  "reference-import-map.json",
);
const MODES = Object.freeze(["bundler", "import-map", "worker"]);

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument`);
  }
  return process.argv[index + 1];
};

const candidateDirectory = resolve(argumentValue("--candidate"));
const outputDirectory = resolve(argumentValue("--output"));
const writeReviewedMap = process.argv.includes("--write-reviewed-map");

if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
  throw new Error(
    `Browser-consumer output already exists at ${outputDirectory}; preserve or remove it explicitly before rebuilding.`,
  );
}
mkdirSync(outputDirectory, { recursive: true });

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error(
    "Run browser-consumer preparation through its named npm script so the accepted local npm CLI is authoritative.",
  );
}

const candidateManifest = readJson(
  join(candidateDirectory, "candidate-manifest.json"),
);
const tarballPath = join(
  candidateDirectory,
  candidateManifest.tarball.fileName,
);
if (sha256File(tarballPath) !== candidateManifest.tarball.sha256) {
  throw new Error("Retained candidate tarball no longer matches its manifest");
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "owlapi-browser-consumers-"));
if (!isStrictDescendantPath(tmpdir(), temporaryRoot)) {
  throw new Error(`Refusing to use unexpected temporary path ${temporaryRoot}`);
}

const runNpm = (arguments_, cwd, cacheDirectory) => {
  const result = spawnSync(process.execPath, [npmCli, ...arguments_], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cacheDirectory },
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `npm ${arguments_.join(" ")} failed in ${cwd}:\n${result.stdout}${result.stderr}`,
    );
  }
};

const installFixture = (mode) => {
  const fixtureDirectory = join(outputDirectory, mode);
  cpSync(join(FIXTURE_SOURCE_ROOT, mode), fixtureDirectory, {
    recursive: true,
  });
  copyFileSync(
    SHARED_EXERCISE_PATH,
    join(fixtureDirectory, "exercise-package.js"),
  );
  writeFileSync(
    join(fixtureDirectory, "package.json"),
    stableJson({
      name: `owlapi-browser-${mode}-consumer`,
      version: "0.0.0",
      private: true,
      type: "module",
      dependencies: {
        owlapi: `file:${tarballPath.replaceAll("\\", "/")}`,
      },
    }),
    "utf8",
  );
  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--package-lock=false",
      "--no-audit",
      "--no-fund",
    ],
    fixtureDirectory,
    join(temporaryRoot, `${mode}-npm-cache`),
  );

  const installedManifest = readJson(
    join(fixtureDirectory, "node_modules", "owlapi", "package.json"),
  );
  if (
    installedManifest.name !== candidateManifest.package.name ||
    installedManifest.version !== candidateManifest.package.version
  ) {
    throw new Error(
      `The ${mode} fixture installed an unexpected package identity`,
    );
  }
  return fixtureDirectory;
};

try {
  const fixtureDirectories = Object.fromEntries(
    MODES.map((mode) => [mode, installFixture(mode)]),
  );

  for (const mode of ["bundler", "worker"]) {
    await build({
      base: "./",
      root: fixtureDirectories[mode],
      logLevel: "info",
      worker: { format: "es" },
      build: {
        emptyOutDir: true,
        outDir: join(fixtureDirectories[mode], "dist"),
      },
    });
  }

  const importMapDirectory = fixtureDirectories["import-map"];
  const generatedMap = await generateReferenceImportMap({
    applicationPath: join(importMapDirectory, "main.js"),
    packageRoot: join(importMapDirectory, "node_modules", "owlapi"),
  });
  const generatedMapText = stableJson(generatedMap);
  if (writeReviewedMap) {
    writeFileSync(REVIEWED_MAP_PATH, generatedMapText, "utf8");
  } else if (
    !existsSync(REVIEWED_MAP_PATH) ||
    readFileSync(REVIEWED_MAP_PATH, "utf8") !== generatedMapText
  ) {
    throw new Error(
      "Generated reference import map differs from the committed reviewed map",
    );
  }

  const runtimeDirectory = join(importMapDirectory, "runtime");
  mkdirSync(runtimeDirectory, { recursive: true });
  copyFileSync(
    join(importMapDirectory, "main.js"),
    join(runtimeDirectory, "main.js"),
  );
  copyFileSync(
    join(importMapDirectory, "exercise-package.js"),
    join(runtimeDirectory, "exercise-package.js"),
  );
  cpSync(
    join(importMapDirectory, "node_modules", "owlapi"),
    join(runtimeDirectory, "package", "owlapi"),
    { recursive: true },
  );

  const { inventory, localMap } = await hydrateReferenceImportMap({
    map: generatedMap,
    mirrorRoot: runtimeDirectory,
  });
  writeJson(
    join(importMapDirectory, "reference-import-map.generated.json"),
    generatedMap,
  );
  writeJson(join(importMapDirectory, "provider-inventory.json"), {
    schemaVersion: 1,
    provider: "jspm.io",
    conditions: ["production", "browser", "module"],
    modules: inventory,
  });
  writeJson(
    join(runtimeDirectory, "reference-import-map.local.json"),
    localMap,
  );

  const html = readFileSync(join(importMapDirectory, "index.html"), "utf8");
  const marker = "<!-- REFERENCE_IMPORT_MAP -->";
  if (!html.includes(marker)) {
    throw new Error("Import-map fixture is missing its injection marker");
  }
  const importMapElement = `<script type="importmap">\n${JSON.stringify(localMap, null, 2)}\n    </script>`;
  writeFileSync(
    join(runtimeDirectory, "index.html"),
    html.replace(marker, importMapElement),
    "utf8",
  );

  writeJson(join(outputDirectory, "browser-consumer-manifest.json"), {
    schemaVersion: 1,
    package: candidateManifest.package,
    candidate: {
      directory: basename(candidateDirectory),
      tarball: candidateManifest.tarball,
    },
    consumers: MODES,
    referenceImportMap: {
      generatedSha256: sha256Buffer(Buffer.from(generatedMapText)),
      provider: "jspm.io",
      providerModuleCount: inventory.length,
      reviewedPath:
        "test/consumers/browser/import-map/reference-import-map.json",
    },
  });

  process.stdout.write(`${outputDirectory}\n`);
} finally {
  // The only recursively removed path is the unique mkdtemp child validated
  // above; retained candidate and browser evidence directories are untouched.
  rmSync(temporaryRoot, { recursive: true, force: true });
}
