/** One editable version policy; consumer bounds and exact reference lanes are distinct. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { findNpmCliCandidates } from "./assert-workflow-runtime.mjs";

// Receipt admission precedes project installation. Reuse npm's native semver
// without importing the development graph or executing npm on a consumer floor.
const nativeNpm =
  process.env.OWLAPI_CONSUMER_NPM ??
  process.env.npm_execpath ??
  findNpmCliCandidates()[0];
assert.ok(nativeNpm, "A native npm CLI is required to read runtime policy");
export const runtimeSemver = createRequire(nativeNpm)("semver");
const semver = runtimeSemver;

const assertStableVersion = (version) => {
  assert.equal(typeof version, "string", "Expected a version string");
  assert.equal(
    semver.valid(version),
    version,
    "Expected an exact Node/npm version",
  );
  assert.equal(
    semver.prerelease(version),
    null,
    "Prerelease runtime selection",
  );
};

export function validateRuntimePolicy(policy) {
  assert.equal(policy.schemaVersion, 1);
  assert.ok(Array.isArray(policy.minimums) && policy.minimums.length > 0);
  const families = policy.minimums.map((minimum) => {
    assertStableVersion(minimum);
    return String(semver.major(minimum));
  });
  assert.equal(
    new Set(families).size,
    families.length,
    "Duplicate Node family",
  );
  assert.deepEqual(
    Object.keys(policy.node),
    families,
    "Reference family mismatch",
  );
  for (const minimum of policy.minimums) {
    const reference = policy.node[semver.major(minimum)];
    assertStableVersion(reference);
    assert.ok(
      semver.satisfies(reference, `^${minimum}`),
      "Reference below consumer minimum",
    );
  }
  assert.ok(
    Object.hasOwn(policy.node, policy.canonicalNodeMajor),
    "Missing canonical reference",
  );
  assertStableVersion(policy.npm);
  assertStableVersion(policy.npmMinimum);
  assertStableVersion(policy.consumerNpm);
  assert.ok(
    Array.isArray(policy.consumerPlatforms) &&
      policy.consumerPlatforms.length > 0,
  );
  assert.equal(
    new Set(policy.consumerPlatforms.map(({ runner }) => runner)).size,
    policy.consumerPlatforms.length,
  );
  for (const platform of policy.consumerPlatforms) {
    assert.match(platform.runner, /^[a-z]+-[a-z0-9.]+$/u);
    assert.ok(["linux", "win32", "darwin"].includes(platform.os));
    assert.ok(["x64", "arm64"].includes(platform.arch));
    assert.equal(platform.shell, platform.os === "win32" ? "pwsh" : "bash");
  }
  assert.ok(
    semver.gte(policy.npm, policy.npmMinimum),
    "npm reference below local minimum",
  );
  return policy;
}

const policy = validateRuntimePolicy(
  JSON.parse(
    readFileSync(
      new URL("../docs/release/runtime-policy.json", import.meta.url),
      "utf8",
    ),
  ),
);
export const CI_RUNTIME = Object.freeze({
  ...policy,
  minimums: Object.freeze(policy.minimums),
  node: Object.freeze(policy.node),
});

export const CANONICAL_NODE = CI_RUNTIME.node[CI_RUNTIME.canonicalNodeMajor];

const nodeFamilyRange = (versions) =>
  versions
    .map((minimum) => `>=${minimum} <${semver.major(minimum) + 1}`)
    .join(" || ");

export const consumerNodeRange = (policy = CI_RUNTIME) =>
  nodeFamilyRange(policy.minimums);

const versionList = (values) =>
  values.length < 2
    ? values.join("")
    : `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;

/** Expand only closed selector tokens; no generic workflow expression evaluation. */
export function projectRuntimeText(text, policy = CI_RUNTIME) {
  const selectors = {
    npm: policy.npm,
    consumerNpm: policy.consumerNpm,
    npmRange: `>=${policy.npmMinimum}`,
    canonicalNode: policy.node[policy.canonicalNodeMajor],
    consumerRange: consumerNodeRange(policy),
    minimumNodeMajor: String(
      semver.major(semver.minVersion(consumerNodeRange(policy))),
    ),
    minimums: versionList(policy.minimums),
    references: versionList(Object.values(policy.node)),
    referenceRange: nodeFamilyRange(Object.values(policy.node)),
    ...Object.fromEntries(
      Object.entries(policy.node).map(([major, version]) => [
        `node.${major}`,
        version,
      ]),
    ),
  };
  return text.replace(/\{\{runtime:([^}]+)\}\}/gu, (_, key) => {
    assert.ok(
      Object.hasOwn(selectors, key),
      `Unknown runtime selector: ${key}`,
    );
    return selectors[key];
  });
}
