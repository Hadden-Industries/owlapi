import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { arch, platform, release, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PACKAGE_NAME, assertPackageIdentity } from "./package-identity.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  installedConsumerEnvironment,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";

import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import {
  captureResolutionEvidence,
  prepareReplayedTarballConsumer,
  prepareTarballConsumer,
} from "./release-consumer-evidence.mjs";
import { qualifyCiConsumerInstall } from "./ci-recipient-attribution.mjs";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import { publicRegistryEnvironment } from "./public-registry-consumer.mjs";
import { writeStandalonePortabilityProof } from "./standalone-portability-proof.mjs";
import { currentResolutionPlatform } from "./release-consumer-resolution.mjs";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return process.argv[index + 1];
};
/** Run portability tests from each freshly measured and cleared recipient. */
export async function qualifyInstalledCandidate({
  candidateDirectory,
  outputPath,
  npmCli = process.env.OWLAPI_CONSUMER_NPM ?? process.env.npm_execpath,
  verifyConsumerEvidence,
}) {
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
  const tarball = readFileSync(tarballPath);
  if (sha256Buffer(tarball) !== candidate.tarball.sha256) {
    throw new Error(
      "Portable candidate tarball digest no longer matches its manifest.",
    );
  }
  verifyConsumerEvidence ??= (
    await import("./ci-consumer-evidence-verification.mjs")
  ).verifyCiConsumerEvidence;

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
      env: installedConsumerEnvironment(options.env),
      maxBuffer: 128 * 1024 * 1024,
      timeout: 10 * 60_000,
      windowsHide: true,
      shell: false,
    });
    if (result.status !== 0) {
      throw new Error(
        `${options.label ?? arguments_.join(" ")} failed with status ${result.status}:\n${result.stdout}${result.stderr}`,
      );
    }
    return result.stdout;
  };

  try {
    const admittedTarball = join(temporaryRoot, "candidate.tgz");
    writeFileSync(admittedTarball, tarball, { flag: "wx" });
    const consumers = {};
    for (const [mode, dependencyName] of [
      ["alias", "owlapi"],
      ["scoped", PACKAGE_NAME],
    ]) {
      const role = `portability-${mode}`;
      const recovery =
        process.platform === "darwin" &&
        process.env.RECIPIENT_MATERIAL_CHECKPOINT
          ? await (
              await import("./macos-material-readmission.mjs")
            ).loadMacRecipientMeasurements({
              tarball,
              npmCli,
              role,
              platform: currentResolutionPlatform(npmCli),
            })
          : undefined;
      const consumerDirectory = join(temporaryRoot, mode);
      mkdirSync(consumerDirectory);
      if (recovery?.evidence) {
        assert.equal(
          recovery.evidence.resolution.dependencyName,
          dependencyName,
        );
        prepareReplayedTarballConsumer(
          consumerDirectory,
          tarball,
          recovery.evidence,
        );
      } else
        prepareTarballConsumer(
          consumerDirectory,
          admittedTarball,
          dependencyName,
          {
            name: "owlapi-portability-consumer",
            version: "0.0.0",
            private: true,
            type: "module",
          },
        );
      const environment = publicRegistryEnvironment(consumerDirectory);
      run(
        [
          npmCli,
          recovery?.evidence ? "ci" : "install",
          "--engine-strict",
          "--ignore-scripts",
          "--package-lock",
          "--no-audit",
          "--no-fund",
          "--cache",
          join(consumerDirectory, "npm-cache"),
        ],
        {
          cwd: consumerDirectory,
          env: environment,
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
      const attribution = await qualifyCiConsumerInstall({
        directory: consumerDirectory,
        tarball,
        npmCli,
        dependencyName,
        role,
        verifyConsumerEvidence,
        candidate,
        expectedEvidence: recovery?.evidence,
        trustedArchiveMeasurements: recovery?.trustedArchiveMeasurements,
        archiveMeasurementAuthorization: recovery?.archiveMeasurements,
        decisionDirectory: join(dirname(outputPath), "eligibility"),
      });
      writeInstalledConsumerFixtures(consumerDirectory, dependencyName);
      for (const testScript of INSTALLED_TEST_SCRIPTS) {
        run([testScript], {
          cwd: consumerDirectory,
          env: environment,
          label: `portable ${testScript}`,
        });
      }
      const after = await captureResolutionEvidence(consumerDirectory, {
        tarball,
        npmCli,
        dependencyName,
      });
      assert.ok(
        jsonEquals(after, attribution.evidence),
        `Portable ${mode} exercised a different installed graph`,
      );
      consumers[mode] = {
        mode: "LOCAL_TARBALL",
        dependencyName,
        installedTests: INSTALLED_TEST_SCRIPTS,
        attribution,
        afterExecutionSha256: sha256Buffer(
          Buffer.from(stableJson(after.resolution)),
        ),
      };
    }
    const result = {
      schemaVersion: 2,
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
    writeStandalonePortabilityProof(result, dirname(outputPath));
    return result;
  } finally {
    // Recursive cleanup is restricted to the unique validated runner-temp child.
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const outputPath = resolve(valueAfter("--output"));
  const report = await qualifyInstalledCandidate({
    candidateDirectory: resolve(valueAfter("--candidate")),
    outputPath,
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const graphDigests = Object.entries(report.consumers).map(
      ([mode, { attribution }]) =>
        `- ${mode} recipient graph \`${attribution.decision.resolutionSha256}\``,
    );
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `Installed candidate \`${report.tarball.sha256}\``,
        "",
        ...graphDigests,
        "",
        "",
      ].join("\n"),
    );
  }
  process.stdout.write(`${outputPath}\n`);
}
