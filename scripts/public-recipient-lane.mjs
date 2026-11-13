import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
import { PACKAGE_NAME, assertRegistryTarballUrl } from "./package-identity.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";
const env = process.env;
const matrix = validateFrozenMatrix(JSON.parse(env.OWLAPI_RUNTIME_MATRIX));
const lane = matrix.include.find(
  (l) =>
    l.node === process.versions.node &&
    l.os === process.platform &&
    l.arch === process.arch,
);
assert.ok(lane);
assert.equal(lane.node, env.OWLAPI_EXPECTED_NODE);
const npm = assertConsumerNpm(env.OWLAPI_CONSUMER_NPM);
const metadata = await fetchRegistryMetadata();
const bytes = await readPublicRegistry(
  assertRegistryTarballUrl(metadata.dist.tarball),
  { maxBytes: 16 * 1024 * 1024 },
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  env.TARBALL_SHA256,
);
assert.equal(
  "sha512-" + createHash("sha512").update(bytes).digest("base64"),
  metadata.dist.integrity,
);
const root = mkdtempSync(join(tmpdir(), "owlapi-registry-lane-")),
  consumers = {};
for (const [mode, name] of [
  ["alias", "owlapi"],
  ["scoped", PACKAGE_NAME],
]) {
  const directory = join(root, mode);
  const { identity, environment } = installRegistryConsumer({
    directory,
    dependencyName: name,
    metadata,
    npmCli: env.OWLAPI_CONSUMER_NPM,
  });
  writeInstalledConsumerFixtures(directory, name);
  for (const script of INSTALLED_TEST_SCRIPTS)
    execFileSync(process.execPath, [script], {
      cwd: directory,
      env: environment,
      timeout: 120000,
      stdio: "inherit",
    });
  consumers[mode] = { identity, installedTests: INSTALLED_TEST_SCRIPTS };
}
mkdirSync(".release/public-lane", { recursive: true });
writeFileSync(
  ".release/public-lane/lane.json",
  JSON.stringify({
    lane,
    consumers,
    npm,
    commit: env.GITHUB_SHA,
    run: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
    matrixSha256: runtimeDigest(matrix),
    tarballSha256: env.TARBALL_SHA256,
  }) + "\n",
  { flag: "wx" },
);
