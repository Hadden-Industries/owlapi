import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { arch, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isStrictDescendantPath, sha256File } from "./release-artifacts.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEST_SCRIPTS = Object.freeze([
  "installed-package-smoke.mjs",
  "installed-package-boundary.mjs",
  "installed-package-import-purity.mjs",
  "installed-package-no-network.mjs",
]);
const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return process.argv[index + 1];
};
const candidateDirectory = resolve(valueAfter("--candidate"));
const outputPath = resolve(valueAfter("--output"));
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error(
    "Run installed-candidate qualification through its named npm script.",
  );
}

const candidate = JSON.parse(
  readFileSync(join(candidateDirectory, "candidate-manifest.json"), "utf8"),
);
const tarballPath = join(candidateDirectory, candidate.tarball.fileName);
if (sha256File(tarballPath) !== candidate.tarball.sha256) {
  throw new Error(
    "Portable candidate tarball digest no longer matches its manifest.",
  );
}

const temporaryParent = process.env.RUNNER_TEMP
  ? resolve(process.env.RUNNER_TEMP)
  : resolve(tmpdir());
const temporaryRoot = mkdtempSync(join(temporaryParent, "owlapi-portable-"));
const expectedTemporaryParent = process.env.RUNNER_TEMP
  ? resolve(process.env.RUNNER_TEMP)
  : resolve(tmpdir());
if (!isStrictDescendantPath(expectedTemporaryParent, temporaryRoot)) {
  throw new Error(
    `Refusing unexpected portability directory ${temporaryRoot}.`,
  );
}

const run = (arguments_, options = {}) => {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: options.cwd ?? temporaryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${options.label ?? arguments_.join(" ")} failed with status ${result.status}:\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
};

try {
  const consumerDirectory = join(temporaryRoot, "consumer");
  mkdirSync(consumerDirectory);
  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "owlapi-portability-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
        dependencies: { owlapi: `file:${tarballPath.replaceAll("\\", "/")}` },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  run([npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerDirectory,
    label: "portable retained-tarball install",
  });
  for (const testScript of TEST_SCRIPTS) {
    copyFileSync(
      join(REPOSITORY_ROOT, "test", testScript),
      join(consumerDirectory, testScript),
    );
    run([testScript], {
      cwd: consumerDirectory,
      label: `portable ${testScript}`,
    });
  }
  const npmTree = JSON.parse(
    run([npmCli, "ls", "--omit=dev", "--all", "--json"], {
      cwd: consumerDirectory,
      label: "portable production dependency graph",
    }),
  );
  const result = {
    schemaVersion: 1,
    result: "PASS",
    package: candidate.package,
    tarball: candidate.tarball,
    runtime: {
      node: process.version,
      npm: run([npmCli, "--version"], { cwd: consumerDirectory }).trim(),
      platform: platform(),
      architecture: arch(),
      osRelease: release(),
    },
    installedTests: TEST_SCRIPTS,
    productionGraph: npmTree,
  };
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
} finally {
  // Recursive cleanup is restricted to the unique validated runner-temp child.
  rmSync(temporaryRoot, { recursive: true, force: true });
}
