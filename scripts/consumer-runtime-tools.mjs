/** Producer tools stay on their reference; only admitted consumer tools run at floors. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CI_RUNTIME, runtimeSemver as semver } from "./runtime-policy.mjs";
import { validateFrozenMatrix } from "./consumer-runtime-matrix.mjs";
import {
  findNpmCliCandidates,
  selectNpmCliForVersion,
  observeNpmVersion,
} from "./assert-workflow-runtime.mjs";

export function assertConsumerNpm(npmCli, node = process.versions.node) {
  const native = createRequire(npmCli);
  const manifest = native("../package.json");
  assert.equal(manifest.name, "npm");
  assert.equal(manifest.version, CI_RUNTIME.consumerNpm);
  for (const entry of [
    manifest,
    ...["npm-package-arg", "cacache", "tar"].map((name) =>
      native(`${name}/package.json`),
    ),
  ]) {
    assert.ok(
      semver.satisfies(node, entry.engines.node),
      `${entry.name}@${entry.version} rejects Node ${node}`,
    );
  }
  return manifest.version;
}

const run = (args, options = {}) => {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    timeout: 20 * 60_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `Consumer tool failed: ${result.status ?? result.signal}`,
  );
};

/** Select product suites from the package's published source directories.
 * Governance, fixture producers and Java qualification remain producer-owned.
 */
export function productTestFiles(root = process.cwd()) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const directories = manifest.files.filter(
    (path) =>
      path.endsWith("/") &&
      !path.startsWith("test/") &&
      !path.startsWith("LICENSES/"),
  );
  const paths = directories.flatMap((directory) =>
    readdirSync(join(root, directory), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
      .map((entry) => join(entry.parentPath ?? entry.path, entry.name)),
  );
  // This test deliberately uses the producer's zlib CRC32 as an independent oracle.
  const explicit = manifest.files
    .filter((path) => !path.startsWith("!") && path.endsWith(".js"))
    .map((path) => join(root, path.replace(/\.js$/u, ".test.js")))
    .filter((path) => existsSync(path));
  return [...new Set([...paths, ...explicit])]
    .filter((path) => !path.endsWith(join("io", "node", "crc32.test.js")))
    .sort();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(process.argv.length, 3, "Use prepare, assert or product");
  const matrix = validateFrozenMatrix(
    JSON.parse(process.env.OWLAPI_RUNTIME_MATRIX),
  );
  const node = process.env.OWLAPI_EXPECTED_NODE;
  assert.ok(
    matrix.include.some((lane) => lane.node === node),
    "Node is outside the frozen matrix",
  );
  if (process.argv[2] === "prepare") {
    assert.equal(
      process.versions.node,
      CI_RUNTIME.node[CI_RUNTIME.canonicalNodeMajor],
    );
    assert.ok(process.env.RUNNER_TEMP && process.env.GITHUB_ENV);
    const producerCli = selectNpmCliForVersion({
      expectedNpm: CI_RUNTIME.npm,
      candidates: findNpmCliCandidates(),
      observeVersion: observeNpmVersion,
    }).npmCli;
    const directory = mkdtempSync(
      join(process.env.RUNNER_TEMP, "owlapi-consumer-npm-"),
    );
    run([
      producerCli,
      "install",
      "--prefix",
      directory,
      `npm@${CI_RUNTIME.consumerNpm}`,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ]);
    const npmCli = join(directory, "node_modules/npm/bin/npm-cli.js");
    assertConsumerNpm(npmCli, node);
    appendFileSync(process.env.GITHUB_ENV, `OWLAPI_CONSUMER_NPM=${npmCli}\n`);
  } else {
    assert.equal(
      process.versions.node,
      node,
      "Selected Node differs from frozen lane",
    );
    assertConsumerNpm(process.env.OWLAPI_CONSUMER_NPM);
    if (process.argv[2] === "product") {
      const files = productTestFiles();
      assert.ok(files.length > 0, "Product suite selection is empty");
      run(
        [
          "--experimental-vm-modules",
          "node_modules/jest/bin/jest.js",
          "--runInBand",
          "--runTestsByPath",
          ...files,
        ],
        {
          timeout: 45 * 60_000,
          env: {
            ...process.env,
            npm_execpath: process.env.OWLAPI_CONSUMER_NPM,
          },
        },
      );
    } else assert.equal(process.argv[2], "assert");
  }
}
