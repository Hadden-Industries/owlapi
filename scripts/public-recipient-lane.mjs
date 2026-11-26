import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateFrozenMatrix,
  runtimeDigest,
} from "./consumer-runtime-matrix.mjs";
import { assertConsumerNpm } from "./consumer-runtime-tools.mjs";
import {
  fetchRegistryMetadata,
  installRegistryConsumer,
} from "./public-registry-consumer.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";
import { captureResolutionEvidence } from "./release-consumer-evidence.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { stableJson } from "./canonical-json.mjs";
import {
  PUBLIC_CONSUMERS,
  packPublicObservation,
  publicResolutionDigest,
} from "./public-recipient-observation.mjs";
import { readPublicTestInputs } from "./release-public-proof.mjs";

const env = process.env;
const mode = process.argv[2];
assert.ok(
  ["observe", "test"].includes(mode),
  "Select public observation or test",
);
const matrix = validateFrozenMatrix(JSON.parse(env.OWLAPI_RUNTIME_MATRIX));
const input = JSON.parse(env.OWLAPI_PUBLIC_RECIPIENT);
assert.equal(input.schemaVersion, 2);
assert.deepEqual(input.package, {
  name: PACKAGE_NAME,
  version: PACKAGE_VERSION,
});
assert.equal(input.matrixSha256, runtimeDigest(matrix));
const lane = matrix.include.find(
  (item) =>
    item.node === process.versions.node &&
    item.os === process.platform &&
    item.arch === process.arch,
);
assert.ok(lane);
assert.equal(lane.node, env.OWLAPI_EXPECTED_NODE);
const npmCli = env.OWLAPI_CONSUMER_NPM;
assertConsumerNpm(npmCli);
const origin = {
  commit: env.GITHUB_SHA,
  run: env.GITHUB_RUN_ID,
  attempt: env.GITHUB_RUN_ATTEMPT,
};
const metadata = await fetchRegistryMetadata(input.package.version);
const registryTarball = assertRegistryTarballUrl(metadata.dist.tarball);
assert.equal(metadata.dist.integrity, input.integrity);
const tarball = await readPublicRegistry(registryTarball, {
  maxBytes: 16 * 1024 * 1024,
});
assert.equal(sha256Buffer(tarball), input.tarballSha256);
assert.equal(
  "sha512-" + createHash("sha512").update(tarball).digest("base64"),
  input.integrity,
);

const trusted =
  mode === "test"
    ? await readPublicTestInputs(
        new GitHubReleaseClient({
          repository: REPOSITORY,
          token: env.GH_TOKEN,
        }),
        readFileSync(".release/public-material/material.json"),
        { lane, input, origin, tarball, npmCli, registryTarball },
      )
    : undefined;
const tmp = realpathSync(tmpdir());
const root = mkdtempSync(join(tmp, "owlapi-registry-lane-"));
assert.ok(isStrictDescendantPath(tmp, root));
const consumers = {};
try {
  for (const [variant, dependencyName] of Object.entries(PUBLIC_CONSUMERS)) {
    const directory = join(root, variant);
    const original = trusted?.consumers[variant];
    const { identity, environment } = installRegistryConsumer({
      directory,
      dependencyName,
      metadata,
      npmCli,
      ...(original ? { original: original.evidence } : {}),
    });
    const evidence = await captureResolutionEvidence(directory, {
      tarball,
      dependencyName,
      npmCli,
      registryTarball,
    });
    if (mode === "observe") {
      consumers[variant] = { identity, evidence };
      continue;
    }
    assert.equal(
      publicResolutionDigest(evidence.resolution),
      original.resolutionSha256,
      "The public replay selected different files or native dependency edges",
    );
    writeInstalledConsumerFixtures(directory, dependencyName);
    for (const script of INSTALLED_TEST_SCRIPTS) {
      try {
        execFileSync(process.execPath, [script], {
          cwd: directory,
          env: environment,
          timeout: 120000,
          stdio: "pipe",
        });
      } catch {
        throw new Error("A public installed-package contract check failed");
      }
    }
    assert.equal(
      sha256Buffer(readFileSync(join(directory, "package.json"))),
      evidence.resolution.manifestSha256,
    );
    assert.equal(
      sha256Buffer(readFileSync(join(directory, "package-lock.json"))),
      evidence.resolution.lockSha256,
    );
    consumers[variant] = {
      resolutionSha256: original.resolutionSha256,
      decisionSha256: trusted.decisions[variant],
      installedTests: INSTALLED_TEST_SCRIPTS,
    };
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
if (mode === "observe") {
  mkdirSync(".release/public-observation", { recursive: true });
  writeFileSync(
    ".release/public-observation/observation.json",
    stableJson(packPublicObservation({ lane, input, origin, consumers })),
    { flag: "wx" },
  );
} else {
  mkdirSync(".release/public-lane", { recursive: true });
  writeFileSync(
    ".release/public-lane/lane.json",
    stableJson({
      schemaVersion: 2,
      lane,
      input,
      origin,
      consumers,
      observation: trusted.observation,
      materialSha256: trusted.materialSha256,
    }),
    { flag: "wx" },
  );
}
