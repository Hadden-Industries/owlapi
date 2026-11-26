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
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateFrozenMatrix,
  runtimeDigest,
} from "./consumer-runtime-matrix.mjs";
import { assertConsumerNpm } from "./consumer-runtime-tools.mjs";
import {
  fetchRegistryMetadata,
  installRegistryConsumer,
  observeLegacyRegistryGraph,
} from "./public-registry-consumer.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";
import {
  captureResolutionEvidence,
  verifyTestedConsumerResolution,
} from "./release-consumer-evidence.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { stableJson } from "./canonical-json.mjs";
import {
  PUBLIC_CONSUMERS,
  packPublicObservation,
  publicResolutionDigest,
} from "./public-recipient-observation.mjs";
import {
  publicReplayPlanPath,
  readPublicReplayPlan,
} from "./public-recipient-plan.mjs";

export async function runPublicRecipientLane(
  mode,
  env = process.env,
  {
    readMetadata = fetchRegistryMetadata,
    readTarball = readPublicRegistry,
    install = installRegistryConsumer,
  } = {},
) {
  assert.ok(
    ["observe", "test", "legacy"].includes(mode),
    "Select public observation or test",
  );
  const matrix = validateFrozenMatrix(JSON.parse(env.OWLAPI_RUNTIME_MATRIX));
  const input = JSON.parse(env.OWLAPI_PUBLIC_RECIPIENT);
  const legacy = mode === "legacy";
  assert.equal(input.schemaVersion, legacy ? 1 : 2);
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
  const npm = assertConsumerNpm(npmCli);
  const origin = {
    commit: env.GITHUB_SHA,
    run: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
  };
  const trusted =
    mode === "test"
      ? readPublicReplayPlan(
          readFileSync(publicReplayPlanPath),
          env.PUBLIC_REPLAY_PLAN_SHA256,
          { lane, input, origin },
        )
      : undefined;
  const metadata = await readMetadata(input.package.version);
  const registryTarball = assertRegistryTarballUrl(metadata.dist.tarball);
  assert.equal(metadata.dist.integrity, input.integrity);
  if (trusted) assert.equal(registryTarball, trusted.registryTarball);
  const tarball = await readTarball(registryTarball, {
    maxBytes: 16 * 1024 * 1024,
  });
  assert.equal(sha256Buffer(tarball), input.tarballSha256);
  assert.equal(
    "sha512-" + createHash("sha512").update(tarball).digest("base64"),
    input.integrity,
  );

  const tmp = realpathSync(tmpdir());
  const root = mkdtempSync(join(tmp, "owlapi-registry-lane-"));
  assert.ok(isStrictDescendantPath(tmp, root));
  const consumers = {};
  try {
    for (const [variant, dependencyName] of Object.entries(PUBLIC_CONSUMERS)) {
      const directory = join(root, variant);
      const original = trusted?.consumers[variant];
      const { identity, environment } = install({
        directory,
        dependencyName,
        metadata,
        npmCli,
        ...(original ? { original } : {}),
        ...(legacy ? { legacyStageTarball: tarball } : {}),
      });
      if (legacy) {
        writeInstalledConsumerFixtures(directory, dependencyName);
        for (const script of INSTALLED_TEST_SCRIPTS)
          execFileSync(process.execPath, [script], {
            cwd: directory,
            env: environment,
            timeout: 120000,
            stdio: "pipe",
          });
        consumers[variant] = {
          identity,
          installedTests: INSTALLED_TEST_SCRIPTS,
          ...observeLegacyRegistryGraph({
            directory,
            environment,
            dependencyName,
            npmCli,
          }),
        };
        continue;
      }
      const resolutionOptions = {
        tarball,
        dependencyName,
        npmCli,
        registryTarball,
      };
      const evidence = await captureResolutionEvidence(
        directory,
        resolutionOptions,
      );
      if (!trusted) {
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
        assert.ok(
          Date.now() < trusted.expiresAt,
          "The admitted public advisory decision expired before testing",
        );
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
      await verifyTestedConsumerResolution(
        directory,
        resolutionOptions,
        evidence.resolution,
      );
      consumers[variant] = {
        resolutionSha256: original.resolutionSha256,
        decisionSha256: original.decisionSha256,
        installedTests: INSTALLED_TEST_SCRIPTS,
      };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  if (legacy) {
    mkdirSync(".release/public-lane", { recursive: true });
    writeFileSync(
      ".release/public-lane/lane.json",
      JSON.stringify({ lane, consumers, npm, ...origin, input }) + "\n",
      { flag: "wx" },
    );
  } else if (!trusted) {
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
        advisory: trusted.advisory,
      }),
      { flag: "wx" },
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await runPublicRecipientLane(process.argv[2]);
