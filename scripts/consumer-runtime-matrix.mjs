/** Resolve once, then transport exact minimum/latest/reference lanes to every gate.
 * Reuses json-quality/markdown-quality's release-metadata selection strategy.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CI_RUNTIME,
  validateRuntimePolicy,
  runtimeSemver as semver,
} from "./runtime-policy.mjs";
import { canonicalJson } from "./canonical-json.mjs";

export const runtimeDigest = (value) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export const runtimePolicyDigest = (policy = CI_RUNTIME) =>
  runtimeDigest(validateRuntimePolicy(policy));

export function qualificationMatrix(releases, policy = CI_RUNTIME) {
  validateRuntimePolicy(policy);
  assert.ok(
    Array.isArray(releases) && releases.length > 0 && releases.length <= 10000,
  );
  const versions = releases
    .map(({ version }) => {
      assert.equal(typeof version, "string");
      assert.equal(version[0], "v");
      const parsed = semver.valid(version.slice(1));
      assert.equal(parsed, version.slice(1));
      return parsed;
    })
    .filter((version) => semver.prerelease(version) === null);
  const selections = policy.minimums.map((minimum) => {
    const reference = policy.node[semver.major(minimum)];
    assert.ok(
      versions.includes(minimum) && versions.includes(reference),
      "Missing minimum/reference release",
    );
    const latest = semver.maxSatisfying(versions, `^${minimum}`);
    assert.ok(
      latest && semver.gte(latest, reference),
      "Latest release is below the reference",
    );
    return { minimum, latest, reference };
  });
  const nodes = [
    ...new Set(
      selections.flatMap(({ minimum, latest, reference }) => [
        minimum,
        latest,
        reference,
      ]),
    ),
  ].sort(semver.compare);
  return {
    schemaVersion: 1,
    policySha256: runtimePolicyDigest(policy),
    selections,
    include: policy.consumerPlatforms.flatMap((platform) =>
      nodes.map((node) => ({ ...platform, node })),
    ),
  };
}

/** Reconstruct the complete Cartesian product; omissions, extra lanes and drift fail. */
export function validateFrozenMatrix(matrix, policy = CI_RUNTIME) {
  assert.ok(matrix && Array.isArray(matrix.selections));
  const releases = matrix.selections
    .flatMap(({ minimum, latest, reference }) => [minimum, latest, reference])
    .map((version) => ({ version: `v${version}` }));
  assert.deepEqual(
    matrix,
    qualificationMatrix(releases, policy),
    "Frozen runtime matrix is incomplete or differs from policy",
  );
  return matrix;
}

export async function resolveQualificationMatrix(fetchImpl = fetch) {
  const response = await fetchImpl("https://nodejs.org/dist/index.json", {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200);
  assert.ok(response.body, "Missing Node release metadata");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    assert.ok(bytes <= 1024 * 1024, "Node metadata exceeds its bound");
    chunks.push(chunk);
  }
  return qualificationMatrix(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(process.argv.length, 3, "Use freeze or check");
  if (process.argv[2] === "freeze") {
    const matrix = await resolveQualificationMatrix();
    const target = resolve(".release/runtime-matrix.json");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(matrix, null, 2)}\n`);
    assert.ok(process.env.GITHUB_OUTPUT);
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `matrix=${JSON.stringify(matrix)}\nsha256=${runtimeDigest(matrix)}\n`,
    );
  } else {
    assert.equal(process.argv[2], "check");
    validateFrozenMatrix(
      JSON.parse(
        process.env.OWLAPI_RUNTIME_MATRIX ??
          readFileSync(".release/runtime-matrix.json", "utf8"),
      ),
    );
  }
}
