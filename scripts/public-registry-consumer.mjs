import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { readGzipTarFile } from "./release-artifacts.mjs";
import {
  assertNpmSbomInventory,
  flattenNpmGraph,
} from "./npm-production-graph.mjs";
import { indexRegistryOccurrences } from "../util/third-party-evidence/lock-graph.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  NPM_REGISTRY,
  PUBLIC_SUBPATHS,
  assertPackageIdentity,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const publicSpec = (dependencyName, version = PACKAGE_VERSION) =>
  dependencyName === "owlapi" ? `npm:${PACKAGE_NAME}@${version}` : version;

const expectedRoot = (value, dependencyName, legacy = false) => {
  const invalid = [
    ...(!legacy ? ["overrides"] : []),
    "workspaces",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
    "bundleDependencies",
    "packageExtensions",
  ];
  return (
    value &&
    value.dependencies?.[dependencyName] === publicSpec(dependencyName) &&
    Object.keys(value.dependencies).length === 1 &&
    invalid.every((key) => !Object.hasOwn(value, key))
  );
};

/** Validate actual installed files and the native lockfile before executing consumer code. */
export const verifyRegistryInstallation = ({
  directory,
  dependencyName,
  metadata,
  legacyStageTarball,
}) => {
  if (![PACKAGE_NAME, "owlapi"].includes(dependencyName))
    throw new Error("Unexpected consumer dependency name.");
  assertPackageIdentity(metadata);
  assertRegistryTarballUrl(metadata.dist?.tarball);
  const consumer = readJson(join(directory, "package.json"));
  const lock = readJson(join(directory, "package-lock.json"));
  const specifier = publicSpec(dependencyName);
  const packageRoot = join(directory, "node_modules", dependencyName);
  const installedManifest = join(packageRoot, "package.json");
  const entry = lock.packages?.[`node_modules/${dependencyName}`];
  if (
    !expectedRoot(consumer, dependencyName, Boolean(legacyStageTarball)) ||
    !expectedRoot(
      lock.packages?.[""],
      dependencyName,
      Boolean(legacyStageTarball),
    ) ||
    lock.lockfileVersion !== 3 ||
    !entry ||
    entry.link ||
    entry.version !== PACKAGE_VERSION ||
    (dependencyName === "owlapi" && entry.name !== PACKAGE_NAME) ||
    (entry.name !== undefined && entry.name !== PACKAGE_NAME) ||
    entry.resolved !== metadata.dist.tarball ||
    entry.integrity !== metadata.dist.integrity ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity ?? "") ||
    !lstatSync(packageRoot).isDirectory() ||
    !isStrictDescendantPath(
      realpathSync(directory),
      realpathSync(packageRoot),
    ) ||
    !lstatSync(installedManifest).isFile() ||
    !isStrictDescendantPath(
      realpathSync(packageRoot),
      realpathSync(installedManifest),
    )
  )
    throw new Error(
      "Installed package is not the exact registry dependency and integrity.",
    );
  const installed = readJson(installedManifest);
  assertPackageIdentity(installed);
  const exports = Object.fromEntries(
    PUBLIC_SUBPATHS.map((subpath) => [
      subpath ? `.${subpath}` : ".",
      subpath ? `.${subpath}/index.js` : "./index.js",
    ]),
  );
  if (
    !installed.exports ||
    Object.keys(installed.exports).length !== Object.keys(exports).length ||
    Object.entries(exports).some(
      ([key, target]) => installed.exports[key] !== target,
    )
  ) {
    throw new Error("Installed package has an unexpected export surface.");
  }
  const require = createRequire(join(resolve(directory), "package.json"));
  const specifiers = PUBLIC_SUBPATHS.map(
    (subpath) => `${dependencyName}${subpath}`,
  );
  for (const specifier of specifiers) {
    if (
      !isStrictDescendantPath(
        realpathSync(packageRoot),
        realpathSync(require.resolve(specifier)),
      )
    ) {
      throw new Error("Public export resolved outside the installed package.");
    }
  }
  return {
    mode: "PUBLIC_REGISTRY",
    package: { name: installed.name, version: installed.version },
    dependencyName,
    specifier,
    resolved: entry.resolved,
    integrity: entry.integrity,
    importSpecifiers: specifiers,
  };
};

/** Ignore user registry overrides and credentials during public, isolated verification. */
export const publicRegistryEnvironment = (root) => {
  const userConfig = join(root, "user.npmrc");
  const globalConfig = join(root, "global.npmrc");
  writeFileSync(userConfig, "", { flag: "wx" });
  writeFileSync(globalConfig, "", { flag: "wx" });
  return {
    ...(process.platform === "win32" && process.env.SystemRoot
      ? { SystemRoot: process.env.SystemRoot }
      : {}),
    CI: "true",
    PATH: dirname(process.execPath),
    HOME: root,
    USERPROFILE: root,
    APPDATA: root,
    LOCALAPPDATA: root,
    TMPDIR: root,
    TEMP: root,
    TMP: root,
    npm_config_userconfig: userConfig,
    npm_config_globalconfig: globalConfig,
  };
};

/** Use native npm exact aliases/direct specs with a fresh cache; never fall back to local source. */
export const installRegistryConsumer = ({
  directory,
  dependencyName = "owlapi",
  metadata,
  npmCli = process.env.npm_execpath,
  original,
  legacyStageTarball,
}) => {
  assertPackageIdentity(metadata);
  assertRegistryTarballUrl(metadata.dist?.tarball);
  if (!npmCli || ![PACKAGE_NAME, "owlapi"].includes(dependencyName))
    throw new Error(
      "Run registry qualification through npm with an approved dependency name.",
    );
  mkdirSync(directory);
  assert.ok(
    !original || !legacyStageTarball,
    "Legacy stage overrides cannot enter a reconciled replay",
  );
  const overrides =
    legacyStageTarball &&
    JSON.parse(readGzipTarFile(legacyStageTarball, "package.json")).overrides;
  const manifest = join(directory, "package.json");
  const lock = join(directory, "package-lock.json");
  if (original) {
    assert.ok(
      expectedRoot(JSON.parse(original.manifest), dependencyName),
      "The original recipient has a different root dependency",
    );
    const originalLock = JSON.parse(original.lock);
    const firstParty =
      originalLock.packages?.[`node_modules/${dependencyName}`];
    assert.ok(
      originalLock.lockfileVersion === 3 &&
        expectedRoot(originalLock.packages?.[""], dependencyName) &&
        firstParty?.resolved === metadata.dist.tarball &&
        firstParty.integrity === metadata.dist.integrity,
      "Public replay requires the exact registry-resolved root and integrity",
    );
    try {
      indexRegistryOccurrences(originalLock.packages);
    } catch {
      throw new Error("Public replay requires an admitted registry lock");
    }
    writeFileSync(manifest, original.manifest, { flag: "wx" });
    writeFileSync(lock, original.lock, { flag: "wx" });
  } else {
    writeFileSync(
      manifest,
      JSON.stringify(
        {
          name: "owlapi-registry-consumer",
          private: true,
          type: "module",
          dependencies: { [dependencyName]: publicSpec(dependencyName) },
          ...(overrides ? { overrides } : {}),
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  }
  writeFileSync(
    join(directory, ".npmrc"),
    `registry=${NPM_REGISTRY}\n@hadden-industries:registry=${NPM_REGISTRY}\n`,
  );
  const environment = publicRegistryEnvironment(directory);
  const arguments_ = [
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    `--registry=${NPM_REGISTRY}`,
    "--cache",
    join(directory, "npm-cache"),
  ];
  try {
    execFileSync(
      process.execPath,
      [npmCli, original ? "ci" : "install", ...arguments_],
      {
        cwd: directory,
        env: environment,
        encoding: "utf8",
        windowsHide: true,
        stdio: "pipe",
        maxBuffer: 32 * 1024 * 1024,
        timeout: 10 * 60_000,
      },
    );
  } catch {
    throw new Error("Public npm install did not complete");
  }
  if (original) {
    assert.ok(
      readFileSync(manifest).equals(Buffer.from(original.manifest)),
      "The replay changed the original recipient manifest",
    );
    assert.ok(
      readFileSync(lock).equals(Buffer.from(original.lock)),
      "The replay changed the original recipient lock",
    );
  }
  const identity = verifyRegistryInstallation({
    directory,
    dependencyName,
    metadata,
    legacyStageTarball,
  });
  return { identity, environment, npmArguments: arguments_ };
};

/** Previously submitted stages retain their original installed-versus-locked equality contract. */
export function observeLegacyRegistryGraph({
  directory,
  environment,
  dependencyName,
  npmCli = process.env.npm_execpath,
  sbom,
}) {
  const readGraph = (extra) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [npmCli, "ls", "--all", "--omit=dev", "--json", ...extra],
        {
          cwd: directory,
          env: environment,
          encoding: "utf8",
          maxBuffer: 8 * 1024 * 1024,
          timeout: 120000,
          windowsHide: true,
          stdio: "pipe",
        },
      ),
    );
  const graph = readGraph([]);
  const identitiesFor = (tree) =>
    flattenNpmGraph(tree.dependencies?.[dependencyName], PACKAGE_NAME);
  const identities = identitiesFor(graph);
  assert.deepEqual(
    identitiesFor(readGraph(["--package-lock-only"])),
    identities,
    "Public installed and locked production graphs differ",
  );
  if (sbom) assertNpmSbomInventory(sbom, identities);
  return {
    graph,
    identities,
    lockSha256: sha256Buffer(
      readFileSync(join(directory, "package-lock.json")),
    ),
    manifest: readJson(join(directory, "package.json")),
    manifestSha256: sha256Buffer(readFileSync(join(directory, "package.json"))),
  };
}

/** Refresh metadata without authentication, redirect or cache ambiguity. */
export const fetchRegistryMetadata = async (version = PACKAGE_VERSION) => {
  if (version !== PACKAGE_VERSION)
    throw new Error("Select the exact scoped RC version.");
  const url = new URL(
    `${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(version)}`,
    NPM_REGISTRY,
  );
  url.searchParams.set("owlapi-read", String(Date.now()));
  const metadata = JSON.parse((await readPublicRegistry(url)).toString("utf8"));
  assertPackageIdentity(metadata);
  assertRegistryTarballUrl(metadata.dist?.tarball);
  return metadata;
};
