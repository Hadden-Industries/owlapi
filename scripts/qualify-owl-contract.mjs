/** Install one exact retained candidate and execute the same producer assertions in CI and release. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import {
  assertPackageIdentity,
  PACKAGE_FILE_STEM,
  PACKAGE_VERSION,
} from "./package-identity.mjs";
import { isStrictDescendantPath } from "./release-artifacts.mjs";
import {
  captureConsumerSources,
  assertReviewedConsumerSources,
} from "./consumer-source-snapshot.mjs";
import {
  assertOwlContractReport,
  REVIEWED_CONSUMER_SOURCES,
  OWL_CONTRACT_FIXTURES,
  OWL_CONTRACT_INVENTORY_SHA256,
  owlContractFixtureSha256,
} from "./owl-contract-evidence.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

/** Native bundle verification before installation; prepared auxiliary files are never trusted as proof. */
export const readOwlContractCandidate = (directory) => {
  const tarballName = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}.tgz`;
  const sbomName = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}.cdx.json`;
  const names = readdirSync(directory).filter(
    (name) =>
      !["candidate-manifest.json", "bundle-verification.json"].includes(name),
  );
  const candidate = verifyDownloadedCandidateBundle({
    fileNames: names,
    checksumText: readFileSync(join(directory, "SHA256SUMS"), "utf8"),
    sbomText: readFileSync(join(directory, sbomName), "utf8"),
    tarball: readFileSync(join(directory, tarballName)),
  });
  return { ...candidate, tarballPath: join(directory, tarballName) };
};

export const qualifyOwlContract = async ({
  candidateDirectory,
  outputDirectory,
  sources = null,
  environment = process.env,
}) => {
  const candidate = readOwlContractCandidate(resolve(candidateDirectory));
  const consumerSources = assertReviewedConsumerSources(
    sources ?? (await captureConsumerSources()),
    REVIEWED_CONSUMER_SOURCES,
  );
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  if (readdirSync(output).length !== 0)
    throw new Error(
      "Contract evidence requires a fresh empty output directory.",
    );
  const npmCli = environment.npm_execpath;
  if (!npmCli) throw new Error("Run qualification through test:owl-contract.");
  const parent = resolve(environment.RUNNER_TEMP ?? tmpdir());
  const temporary = mkdtempSync(join(parent, "owlapi-contract-"));
  if (!isStrictDescendantPath(parent, temporary))
    throw new Error("Unexpected contract installation root.");
  const run = (arguments_, label) => {
    const result = spawnSync(process.execPath, arguments_, {
      cwd: temporary,
      encoding: "utf8",
      windowsHide: true,
      timeout: 300000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...environment,
        NODE_PATH: "",
        NODE_OPTIONS: "",
        GH_TOKEN: "",
        GITHUB_TOKEN: "",
        NODE_AUTH_TOKEN: "",
        NPM_TOKEN: "",
        NPM_BOOTSTRAP_TOKEN: "",
      },
    });
    if (label === "Installed public contract assertions")
      writeFileSync(join(output, "native.ndjson"), result.stdout ?? "");
    if (result.error || result.status !== 0)
      throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
    return result.stdout;
  };
  try {
    writeFileSync(
      join(temporary, "package.json"),
      JSON.stringify({
        name: "owlapi-contract-fixture",
        private: true,
        type: "module",
        dependencies: {
          owlapi: `file:${candidate.tarballPath.replaceAll("\\", "/")}`,
        },
      }),
    );
    run(
      [
        npmCli,
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--cache",
        join(temporary, "npm-cache"),
      ],
      "Retained candidate installation",
    );
    assertPackageIdentity(
      JSON.parse(
        readFileSync(
          join(temporary, "node_modules/owlapi/package.json"),
          "utf8",
        ),
      ),
    );
    for (const path of OWL_CONTRACT_FIXTURES) {
      const target = join(temporary, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(new URL(`../${path}`, import.meta.url), target);
    }
    const nativeText = run(
      [
        "--test",
        "--test-reporter=./test/consumers/owl-contract/native-reporter.mjs",
        "test/consumers/owl-contract/contract.test.mjs",
      ],
      "Installed public contract assertions",
    );
    writeFileSync(join(output, "native.ndjson"), nativeText);
    const identity = {
      workflow: environment.GITHUB_WORKFLOW ?? "LOCAL",
      runId: environment.GITHUB_RUN_ID
        ? Number(environment.GITHUB_RUN_ID)
        : null,
      runAttempt: environment.GITHUB_RUN_ATTEMPT
        ? Number(environment.GITHUB_RUN_ATTEMPT)
        : null,
      commit:
        environment.GITHUB_SHA ??
        spawnSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
          windowsHide: true,
          timeout: 10000,
        }).stdout.trim(),
    };
    const report = assertOwlContractReport({
      schemaVersion: 1,
      check: "owl_contract",
      result: "PASS",
      identity,
      candidate: {
        package: candidate.package,
        tarballSha256: candidate.tarball.sha256,
        artifact:
          identity.workflow === "LOCAL"
            ? null
            : {
                id: Number(environment.CANDIDATE_ARTIFACT_ID),
                digest: `sha256:${environment.CANDIDATE_ARTIFACT_DIGEST}`,
              },
      },
      consumerSources,
      inventorySha256: OWL_CONTRACT_INVENTORY_SHA256,
      fixtureSha256: owlContractFixtureSha256(),
      nativeReportSha256: sha256(nativeText),
      assertions: nativeText
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    });
    writeFileSync(
      join(output, "qualification.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    return report;
  } finally {
    // Only the unique tool-created installation is removed; durable execution evidence survives.
    rmSync(temporary, { recursive: true, force: true });
  }
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const candidateDirectory = argument("--candidate");
  const outputDirectory = argument("--output");
  if (!candidateDirectory || !outputDirectory)
    throw new Error("Expected --candidate and --output.");
  const report = await qualifyOwlContract({
    candidateDirectory,
    outputDirectory,
  });
  process.stdout.write(
    `${JSON.stringify({ result: report.result, assertions: report.assertions.length, consumerSources: report.consumerSources.snapshots.map(({ repository, commit }) => ({ repository, commit })) })}\n`,
  );
}
