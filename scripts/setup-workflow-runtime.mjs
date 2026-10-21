/** Cold bootstrap: native Node/npm only; the project graph is not installed yet. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  findNpmCliCandidates,
  selectNpmCliForVersion,
  observeNpmVersion,
} from "./assert-workflow-runtime.mjs";

export const SETUP_DEFAULTS = Object.freeze({
  phase: "producer",
  "node-family": "canonical",
  "npm-timeout-minutes": "20",
  "verify-runtime": "true",
  install: "none",
});

export function validateSetupInputs(input = {}) {
  for (const key of Object.keys(input))
    assert.ok(
      Object.hasOwn(SETUP_DEFAULTS, key),
      `Unknown setup input: ${key}`,
    );
  const values = { ...SETUP_DEFAULTS, ...input };
  assert.ok(
    ["producer", "runtime", "npm"].includes(values.phase),
    "Unknown setup phase",
  );
  assert.ok(
    ["true", "false"].includes(values["verify-runtime"]),
    "Invalid assertion selection",
  );
  assert.ok(
    ["none", "locked-no-scripts"].includes(values.install),
    "Invalid seed installation mode",
  );
  assert.ok(
    values.install === "none" || values.phase === "npm",
    "Seed installation requires npm-only phase",
  );
  bootstrapTimeout(values["npm-timeout-minutes"]);
  return values;
}

export function selectWorkflowReference(
  policy,
  family = SETUP_DEFAULTS["node-family"],
) {
  const selected = family === "canonical" ? policy.canonicalNodeMajor : family;
  assert.ok(
    Object.hasOwn(policy.node, selected),
    "Unknown reference Node family",
  );
  const node = policy.node[selected];
  // Full policy/semver validation belongs to check:node after installation.
  // Cold bootstrap admits only exact scalar values, never commands or ranges.
  assert.match(node, /^\d+\.\d+\.\d+$/u);
  assert.match(policy.npm, /^\d+\.\d+\.\d+$/u);
  return { node, npm: policy.npm, canonical: family === "canonical" };
}

export function bootstrapTimeout(
  value = SETUP_DEFAULTS["npm-timeout-minutes"],
) {
  assert.match(value, /^[1-9]\d*$/u, "Expected a positive minute count");
  const minutes = Number(value);
  assert.ok(
    Number.isSafeInteger(minutes) && minutes <= 60,
    "Invalid bootstrap deadline",
  );
  return minutes * 60_000;
}

const run = (args, timeout) => {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Runtime bootstrap failed (${result.status ?? result.signal})`,
    );
};

const main = () => {
  assert.equal(process.argv.length, 3, "Use policy, npm, assert or seed");
  const policy = JSON.parse(
    readFileSync(
      new URL("../docs/release/runtime-policy.json", import.meta.url),
      "utf8",
    ),
  );
  const selected = selectWorkflowReference(
    policy,
    process.env.OWLAPI_NODE_FAMILY,
  );
  const operation = process.argv[2];
  if (operation === "policy") {
    validateSetupInputs({
      phase: process.env.OWLAPI_BOOTSTRAP_PHASE,
      "node-family": process.env.OWLAPI_NODE_FAMILY,
      "verify-runtime": process.env.OWLAPI_VERIFY_RUNTIME,
      install: process.env.OWLAPI_SEED_INSTALL,
      "npm-timeout-minutes": process.env.OWLAPI_NPM_TIMEOUT_MINUTES,
    });
    assert.ok(process.env.GITHUB_OUTPUT, "Missing GitHub output file");
    const versionFile = fileURLToPath(
      new URL("../.node-version", import.meta.url),
    );
    if (selected.canonical)
      assert.equal(
        readFileSync(versionFile, "utf8").trim(),
        selected.node,
        "Canonical runtime projection drift",
      );
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `node-version=${selected.canonical ? "" : selected.node}\nnode-version-file=${selected.canonical ? versionFile : ""}\n`,
    );
    return;
  }
  assert.equal(
    process.version,
    `v${selected.node}`,
    "Selected Node reference differs from policy",
  );
  if (operation === "assert") {
    run(
      [
        fileURLToPath(
          new URL("./assert-workflow-runtime.mjs", import.meta.url),
        ),
        "--node",
        selected.node,
        "--npm",
        selected.npm,
      ],
      5 * 60_000,
    );
    return;
  }
  assert.ok(["npm", "seed"].includes(operation), "Unknown bootstrap operation");
  const npmCli = findNpmCliCandidates()[0];
  assert.ok(npmCli, "No native npm CLI available for bootstrap");
  if (operation === "npm") {
    run(
      [
        npmCli,
        "install",
        "--global",
        `npm@${selected.npm}`,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ],
      bootstrapTimeout(process.env.OWLAPI_NPM_TIMEOUT_MINUTES),
    );
  } else {
    const exactNpm = selectNpmCliForVersion({
      expectedNpm: selected.npm,
      candidates: findNpmCliCandidates(),
      observeVersion: observeNpmVersion,
    }).npmCli;
    run(
      [exactNpm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      2 * 60_000,
    );
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
