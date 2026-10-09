import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { sha256Buffer } from "./release-artifacts.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";
import { installRegistryConsumer } from "./public-registry-consumer.mjs";
import { verifyRegistryProvenance } from "./registry-provenance.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  writeInstalledConsumerFixtures,
} from "./installed-consumer-fixtures.mjs";

const registry = "https://registry.npmjs.org/";

export const assertPublicRegistryFacts = ({
  expectedVersion,
  retainedSha256,
  metadata,
  distTags,
  registryTarballSha256,
}) => {
  if (
    metadata?.name !== PACKAGE_NAME ||
    expectedVersion !== PACKAGE_VERSION ||
    metadata.version !== expectedVersion
  ) {
    throw new Error(
      "Public registry metadata has the wrong package coordinate.",
    );
  }
  if (
    distTags?.next !== expectedVersion ||
    distTags?.latest !== expectedVersion
  ) {
    throw new Error(
      "Both next and latest must identify the exact qualified rc.2 version.",
    );
  }
  if (registryTarballSha256 !== retainedSha256) {
    throw new Error(
      "Public registry bytes differ from the retained candidate.",
    );
  }
  if (
    !metadata.dist?.integrity ||
    !assertRegistryTarballUrl(metadata.dist.tarball)
  ) {
    throw new Error("Public registry distribution metadata is incomplete.");
  }
  return {
    coordinate: `${PACKAGE_NAME}@${expectedVersion}`,
    channel: "next",
    next: expectedVersion,
    latest: expectedVersion,
    integrity: metadata.dist.integrity,
    tarballSha256: registryTarballSha256,
  };
};

const fetchJson = async (path) => {
  const url = new URL(path, registry);
  url.searchParams.set("owlapi-read", String(Date.now()));
  return JSON.parse((await readPublicRegistry(url)).toString("utf8"));
};

const fetchTarball = async (url) => {
  return readPublicRegistry(url);
};

const verifyIntegrity = (buffer, integrity) => {
  const match = /^sha512-(?<digest>[A-Za-z0-9+/]+={0,2})$/u.exec(integrity);
  if (!match?.groups) {
    throw new Error("Registry integrity is not an exact sha512 SRI value.");
  }
  const actual = createHash("sha512").update(buffer).digest("base64");
  if (actual !== match.groups.digest) {
    throw new Error("Registry tarball fails its published sha512 integrity.");
  }
};

const readCandidate = (directory) => {
  const fileNames = readdirSync(directory);
  const tarballName = fileNames.find((name) =>
    /^hadden-industries-owlapi-.+\.tgz$/u.test(name),
  );
  const sbomName = fileNames.find((name) =>
    /^hadden-industries-owlapi-.+\.cdx\.json$/u.test(name),
  );
  if (!tarballName || !sbomName) {
    throw new Error("The retained candidate bundle is incomplete.");
  }
  return verifyDownloadedCandidateBundle({
    checksumText: readFileSync(join(directory, "SHA256SUMS"), "utf8"),
    fileNames,
    sbomText: readFileSync(join(directory, sbomName), "utf8"),
    tarball: readFileSync(join(directory, tarballName)),
  });
};

const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    shell: process.platform === "win32" && command === "npm",
    ...options,
  });
  return result;
};

const requireSuccess = (result, label) => {
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stdout}${result.stderr}`);
  }
  return result;
};

const exerciseFreshConsumers = async (metadata, tarball) => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-public-registry-"));
  try {
    const results = {};
    for (const [mode, dependencyName] of [
      ["scoped", PACKAGE_NAME],
      ["alias", "owlapi"],
    ]) {
      const directory = join(root, mode);
      const { identity, environment, npmArguments } = installRegistryConsumer({
        directory,
        dependencyName,
        metadata,
      });
      writeInstalledConsumerFixtures(directory, dependencyName);
      for (const script of INSTALLED_TEST_SCRIPTS) {
        requireSuccess(
          run(process.execPath, [script], { cwd: directory, env: environment }),
          script,
        );
      }
      const graph = JSON.parse(
        requireSuccess(
          run(
            process.execPath,
            [process.env.npm_execpath, "ls", "--all", "--json"],
            { cwd: directory, env: environment },
          ),
          "Fresh dependency graph",
        ).stdout,
      );
      const signatures = JSON.parse(
        requireSuccess(
          run(
            process.execPath,
            [
              process.env.npm_execpath,
              "audit",
              "signatures",
              "--json",
              ...npmArguments,
            ],
            { cwd: directory, env: environment },
          ),
          "Registry signature and provenance audit",
        ).stdout,
      );
      results[mode] = {
        ...identity,
        installedTests: INSTALLED_TEST_SCRIPTS,
        dependencyGraph: graph,
        signatureAudit: signatures,
      };
    }
    const provenance = await verifyRegistryProvenance({
      metadata,
      tarball,
      cache: join(root, "provenance-cache"),
      commit: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    });
    return { consumer: results, provenance };
  } finally {
    // The directory is a fresh mkdtemp child of the system temporary directory.
    rmSync(root, { recursive: true, force: true });
  }
};

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const main = async () => {
  const candidatePath = argumentValue("--candidate");
  const outputPath = argumentValue("--output");
  if (!candidatePath || !outputPath) {
    throw new Error(
      "Registry qualification requires --candidate and --output.",
    );
  }
  const candidate = readCandidate(resolve(candidatePath));
  const { version } = candidate.package;
  const [metadata, distTags] = await Promise.all([
    fetchJson(
      `${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(version)}`,
    ),
    fetchJson(`-/package/${encodeURIComponent(PACKAGE_NAME)}/dist-tags`),
  ]);
  const registryTarball = await fetchTarball(
    assertRegistryTarballUrl(metadata.dist?.tarball),
  );
  verifyIntegrity(registryTarball, metadata.dist?.integrity);
  const facts = assertPublicRegistryFacts({
    expectedVersion: version,
    retainedSha256: candidate.tarball.sha256,
    metadata,
    distTags,
    registryTarballSha256: sha256Buffer(registryTarball),
  });
  const { consumer, provenance } = await exerciseFreshConsumers(
    metadata,
    registryTarball,
  );
  const report = {
    schemaVersion: 1,
    result: "PASS",
    verifiedAt: new Date().toISOString(),
    registry,
    ...facts,
    tarballUrl: metadata.dist.tarball,
    npmPublishedAt: metadata.time ?? null,
    consumer,
    provenance,
  };
  writeFileSync(
    resolve(outputPath),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
