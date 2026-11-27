/** Source and installed-package helpers for ontology qualification. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { isStrictDescendantPath } from "../../scripts/release-file-utils.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PACKAGE_NAME,
  assertPackageIdentity,
} from "../../scripts/package-identity.mjs";
import { bindRetainedConsumerLock } from "./comparison-release-evidence.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });

/** Bind source-mode evidence to actual bytes, including uncommitted task changes. */
export const captureSourceIdentity = async (repository) => {
  const git = (...args) =>
    execFileSync("git", ["-C", repository, ...args], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
  const paths = [
    ...new Set(
      git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const files = [];
  for (const path of paths) {
    try {
      files.push({
        path,
        sha256: sha256(await readFile(join(repository, path))),
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      files.push({ path, sha256: null });
    }
  }
  return {
    mode: "SOURCE",
    head: git("rev-parse", "HEAD").trim(),
    contentSha256: sha256(JSON.stringify(files)),
    files,
  };
};

/** Generated evidence must not become a new input in the source fingerprint. */
export const assertSourceQualificationOutputDirectory = (
  repository,
  outputDirectory,
) => {
  const relativeOutput = relative(
    resolve(repository),
    resolve(outputDirectory),
  );
  if (
    isAbsolute(relativeOutput) ||
    relativeOutput === ".." ||
    relativeOutput.startsWith(`..${sep}`)
  )
    return;
  if (relativeOutput) {
    const ignored = spawnSync(
      "git",
      [
        "-C",
        repository,
        "check-ignore",
        "--quiet",
        "--no-index",
        "--",
        `${relativeOutput}${sep}`,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (ignored.error) throw ignored.error;
    if (ignored.status === 0) return;
    if (ignored.status !== 1)
      throw new Error(
        `Cannot determine output-directory ignore status: ${ignored.stderr}`,
      );
  }
  throw new Error(
    "Source-mode --output must be outside the owlapi checkout or in a Git-ignored directory",
  );
};

export function assertRegistryQualificationOutputDirectory(output) {
  const resolvedOutput = existsSync(output)
    ? realpathSync(output)
    : join(realpathSync(dirname(output)), basename(output));
  const resolvedRepository = realpathSync(REPOSITORY_ROOT);
  if (
    resolvedOutput === resolvedRepository ||
    isStrictDescendantPath(resolvedRepository, resolvedOutput)
  )
    throw new Error(
      "Public-registry qualification requires output outside the owlapi checkout.",
    );
}

export const loadPublicApi = async ({
  packageDirectory,
  consumerDirectory,
  includeManchesterRenderer = false,
  includeProfiles = false,
  includeSearch = false,
  includeLocality = false,
  includeNodeTransport = false,
  includeParameters = false,
}) => {
  const require = createRequire(
    join(consumerDirectory ?? packageDirectory, "package.json"),
  );
  const dependencyName = consumerDirectory ? "owlapi" : PACKAGE_NAME;
  const subpaths = ["apibinding", "formats", "io", "model", "util"];
  if (includeManchesterRenderer) subpaths.push("manchestersyntax/renderer");
  if (includeProfiles) subpaths.push("profiles");
  if (includeSearch) subpaths.push("search");
  if (includeLocality) subpaths.push("modularity/locality");
  if (includeNodeTransport) subpaths.push("io/node");
  if (includeParameters) subpaths.push("model/parameters");
  const modules = await Promise.all(
    subpaths.map((subpath) => {
      const path = require.resolve(`${dependencyName}/${subpath}`);
      if (
        !isStrictDescendantPath(
          realpathSync(packageDirectory),
          realpathSync(path),
        )
      )
        throw new Error(
          "Ontology qualification resolved outside the selected package.",
        );
      return import(pathToFileURL(path).href);
    }),
  );
  return Object.assign({}, ...modules);
};

/** Native npm installs only the verified retained tarball; Java never enters runtime deps. */
export const installCandidate = async (
  candidateDirectory,
  outputDirectory,
  { consumerLock, offline = false } = {},
) => {
  const candidate = JSON.parse(
    await readFile(join(candidateDirectory, "candidate-manifest.json"), "utf8"),
  );
  assertPackageIdentity(candidate.package);
  if (basename(candidate.tarball.fileName) !== candidate.tarball.fileName)
    throw new Error("Candidate tarball must be a basename");
  const tarballPath = resolve(candidateDirectory, candidate.tarball.fileName);
  const tarball = await readFile(tarballPath);
  if (sha256(tarball) !== candidate.tarball.sha256)
    throw new Error("Candidate tarball digest mismatch");
  if (!process.env.npm_execpath)
    throw new Error("Run candidate qualification through npm");
  const consumerDirectory = join(outputDirectory, "consumer");
  await mkdir(consumerDirectory);
  let lock = consumerLock;
  if (!lock) {
    try {
      lock = JSON.parse(
        await readFile(
          join(candidateDirectory, "lockless-consumer-package-lock.json"),
          "utf8",
        ),
      );
    } catch (error) {
      if (error.code !== "ENOENT" || offline) throw error;
    }
  }
  const bound =
    lock &&
    bindRetainedConsumerLock(lock, {
      tarballPath,
      integrity:
        "sha512-" + createHash("sha512").update(tarball).digest("base64"),
    });
  if (bound)
    await writeJson(join(consumerDirectory, "package-lock.json"), bound);
  await writeJson(join(consumerDirectory, "package.json"), {
    name: bound?.packages[""].name ?? "owlapi-ontology-qualification",
    ...(bound ? { version: bound.packages[""].version } : {}),
    private: true,
    type: "module",
    dependencies: { owlapi: pathToFileURL(tarballPath).href },
  });
  const log = execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      bound ? "ci" : "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...(offline ? ["--offline"] : []),
    ],
    {
      cwd: consumerDirectory,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  await writeFile(join(outputDirectory, "candidate-install.log"), log);
  assertPackageIdentity(
    JSON.parse(
      await readFile(
        join(consumerDirectory, "node_modules", "owlapi", "package.json"),
        "utf8",
      ),
    ),
  );
  return {
    packageDirectory: join(consumerDirectory, "node_modules", "owlapi"),
    consumerDirectory,
    identity: candidate,
  };
};
