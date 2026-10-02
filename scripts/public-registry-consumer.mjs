import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { isStrictDescendantPath } from "./release-artifacts.mjs";
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

/** Validate actual installed files and the native lockfile before executing consumer code. */
export const verifyRegistryInstallation = ({
  directory,
  dependencyName,
  metadata,
}) => {
  if (![PACKAGE_NAME, "owlapi"].includes(dependencyName))
    throw new Error("Unexpected consumer dependency name.");
  assertPackageIdentity(metadata);
  assertRegistryTarballUrl(metadata.dist?.tarball);
  const consumer = readJson(join(directory, "package.json"));
  const lock = readJson(join(directory, "package-lock.json"));
  const specifier =
    dependencyName === "owlapi"
      ? `npm:${PACKAGE_NAME}@${PACKAGE_VERSION}`
      : PACKAGE_VERSION;
  const packageRoot = join(directory, "node_modules", dependencyName);
  const installed = readJson(join(packageRoot, "package.json"));
  const entry = lock.packages?.[`node_modules/${dependencyName}`];
  assertPackageIdentity(installed);
  if (
    consumer.dependencies?.[dependencyName] !== specifier ||
    lock.packages?.[""].dependencies?.[dependencyName] !== specifier ||
    !entry ||
    entry.link ||
    entry.version !== PACKAGE_VERSION ||
    (dependencyName === "owlapi" && entry.name !== PACKAGE_NAME) ||
    (entry.name !== undefined && entry.name !== PACKAGE_NAME) ||
    entry.resolved !== metadata.dist.tarball ||
    entry.integrity !== metadata.dist.integrity ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity ?? "") ||
    lstatSync(packageRoot).isSymbolicLink() ||
    !isStrictDescendantPath(realpathSync(directory), realpathSync(packageRoot))
  )
    throw new Error(
      "Installed package is not the exact registry dependency and integrity.",
    );
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
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(?:npm_config_|node_auth_token$|npm_token$|node_options$|node_path$)/iu.test(
          key,
        ),
    ),
  );
  const userConfig = join(root, "user.npmrc");
  const globalConfig = join(root, "global.npmrc");
  writeFileSync(userConfig, "", { flag: "wx" });
  writeFileSync(globalConfig, "", { flag: "wx" });
  return {
    ...environment,
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
}) => {
  assertPackageIdentity(metadata);
  assertRegistryTarballUrl(metadata.dist?.tarball);
  if (!npmCli || ![PACKAGE_NAME, "owlapi"].includes(dependencyName))
    throw new Error(
      "Run registry qualification through npm with an approved dependency name.",
    );
  mkdirSync(directory);
  const specifier =
    dependencyName === "owlapi"
      ? `npm:${PACKAGE_NAME}@${PACKAGE_VERSION}`
      : PACKAGE_VERSION;
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify(
      {
        name: "owlapi-registry-consumer",
        private: true,
        type: "module",
        dependencies: { [dependencyName]: specifier },
      },
      null,
      2,
    ),
  );
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
  execFileSync(process.execPath, [npmCli, "install", ...arguments_], {
    cwd: directory,
    env: environment,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const identity = verifyRegistryInstallation({
    directory,
    dependencyName,
    metadata,
  });
  return { identity, environment, npmArguments: arguments_ };
};

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
