import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { arch, platform, release, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { PACKAGE_NAME, assertPackageIdentity } from "./package-identity.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";

import { isStrictDescendantPath, sha256File } from "./release-artifacts.mjs";

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
assertPackageIdentity(candidate.package);
if (basename(candidate.tarball.fileName) !== candidate.tarball.fileName)
  throw new Error("Candidate tarball must be a basename.");
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
  const consumers = {};
  for (const [mode, dependencyName] of [
    ["alias", "owlapi"],
    ["scoped", PACKAGE_NAME],
  ]) {
    const consumerDirectory = join(temporaryRoot, mode);
    mkdirSync(consumerDirectory);
    writeFileSync(
      join(consumerDirectory, "package.json"),
      `${JSON.stringify(
        {
          name: "owlapi-portability-consumer",
          version: "0.0.0",
          private: true,
          type: "module",
          dependencies: {
            [dependencyName]: `file:${tarballPath.replaceAll("\\", "/")}`,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    run(
      [
        npmCli,
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--cache",
        join(consumerDirectory, "npm-cache"),
      ],
      {
        cwd: consumerDirectory,
        label: "portable retained-tarball install",
      },
    );
    assertPackageIdentity(
      JSON.parse(
        readFileSync(
          join(
            consumerDirectory,
            "node_modules",
            dependencyName,
            "package.json",
          ),
          "utf8",
        ),
      ),
    );
    writeInstalledConsumerFixtures(consumerDirectory, dependencyName);
    for (const testScript of INSTALLED_TEST_SCRIPTS) {
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
    consumers[mode] = {
      mode: "LOCAL_TARBALL",
      dependencyName,
      installedTests: INSTALLED_TEST_SCRIPTS,
      productionGraph: npmTree,
    };
  }
  const result = {
    schemaVersion: 1,
    result: "PASS",
    package: candidate.package,
    tarball: candidate.tarball,
    runtime: {
      node: process.version,
      npm: run([npmCli, "--version"]).trim(),
      platform: platform(),
      architecture: arch(),
      osRelease: release(),
    },
    consumers,
  };
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
} finally {
  // Recursive cleanup is restricted to the unique validated runner-temp child.
  rmSync(temporaryRoot, { recursive: true, force: true });
}
