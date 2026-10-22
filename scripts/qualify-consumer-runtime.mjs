/** Run only after producer admission and exact consumer Node/npm selection. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform, arch } from "node:os";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import {
  runtimeDigest,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import { assertConsumerNpm } from "./consumer-runtime-tools.mjs";

const matrix = validateFrozenMatrix(
  JSON.parse(process.env.OWLAPI_RUNTIME_MATRIX),
);
assert.equal(process.versions.node, process.env.OWLAPI_EXPECTED_NODE);
const lane = matrix.include.find(
  (entry) =>
    entry.node === process.versions.node &&
    entry.os === platform() &&
    entry.arch === arch(),
);
assert.ok(lane, "Actual runtime/platform is outside the frozen matrix");
assert.equal(
  process.env.RUNNER_OS,
  { linux: "Linux", win32: "Windows", darwin: "macOS" }[lane.os],
);
const npm = assertConsumerNpm(process.env.OWLAPI_CONSUMER_NPM);
assert.match(process.env.OWLAPI_CANDIDATE_ID, /^[1-9]\d*$/u);
assert.match(process.env.OWLAPI_CANDIDATE_DIGEST, /^sha256:[a-f0-9]{64}$/u);
const output = ".release/runtime-report";
mkdirSync(output, { recursive: true });
const run = (args, timeout) => {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    timeout,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `Runtime qualification failed: ${result.status ?? result.signal}`,
  );
};
// Linux source tests supplement the package behavior exercised on every platform.
if (lane.os === "linux")
  run(["scripts/consumer-runtime-tools.mjs", "product"], 45 * 60_000);
run(
  [
    "scripts/qualify-installed-candidate.mjs",
    "--candidate",
    ".release/runtime-candidate",
    "--output",
    join(output, "portability.json"),
  ],
  25 * 60_000,
);
const portability = JSON.parse(
  readFileSync(join(output, "portability.json"), "utf8"),
);
assert.equal(portability.result, "PASS");
assert.equal(portability.runtime.node, `v${lane.node}`);
assert.equal(portability.runtime.npm, CI_RUNTIME.consumerNpm);
const report = {
  schemaVersion: 1,
  result: "PASS",
  lane,
  matrixSha256: runtimeDigest(matrix),
  candidateArtifact: {
    id: Number(process.env.OWLAPI_CANDIDATE_ID),
    digest: process.env.OWLAPI_CANDIDATE_DIGEST,
  },
  commit: process.env.GITHUB_SHA,
  runId: Number(process.env.GITHUB_RUN_ID),
  runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  npm,
  productSuite: lane.os === "linux" ? "PASS" : "PRODUCER_LINUX_COVERAGE",
  portability,
};
writeFileSync(
  join(output, "lane.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
