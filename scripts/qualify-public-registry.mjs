import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
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

const registry = "https://registry.npmjs.org/";

export const assertPublicRegistryFacts = ({
  expectedVersion,
  retainedSha256,
  metadata,
  distTags,
  registryTarballSha256,
}) => {
  if (metadata?.name !== "owlapi" || metadata.version !== expectedVersion) {
    throw new Error(
      "Public registry metadata has the wrong package coordinate.",
    );
  }
  if (distTags?.next !== expectedVersion || Object.hasOwn(distTags, "latest")) {
    throw new Error(
      "The public prerelease must be the sole next target and must not establish latest.",
    );
  }
  if (registryTarballSha256 !== retainedSha256) {
    throw new Error(
      "Public registry bytes differ from the retained candidate.",
    );
  }
  if (
    !metadata.dist?.integrity ||
    !metadata.dist.tarball?.startsWith(`${registry}owlapi/-/`)
  ) {
    throw new Error("Public registry distribution metadata is incomplete.");
  }
  return {
    coordinate: `owlapi@${expectedVersion}`,
    channel: "next",
    integrity: metadata.dist.integrity,
    tarballSha256: registryTarballSha256,
  };
};

const fetchJson = async (path) => {
  const url = new URL(path, registry);
  url.searchParams.set("owlapi-read", String(Date.now()));
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(
      `Fresh registry metadata read returned HTTP ${response.status}.`,
    );
  }
  return response.json();
};

const fetchTarball = async (url) => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(
      `Fresh registry tarball read returned HTTP ${response.status}.`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
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
  const tarballName = fileNames.find((name) => /^owlapi-.+\.tgz$/u.test(name));
  const sbomName = fileNames.find((name) =>
    /^owlapi-.+\.cdx\.json$/u.test(name),
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

const exerciseFreshConsumer = (version) => {
  if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
    throw new Error(
      "Public-registry verification must not receive npm credentials.",
    );
  }
  const root = mkdtempSync(join(tmpdir(), "owlapi-public-registry-"));
  const consumer = join(root, "consumer");
  const bare = join(root, "bare-default");
  const cache = join(root, "npm-cache");
  mkdirSync(consumer);
  mkdirSync(bare);
  mkdirSync(cache);
  try {
    writeFileSync(
      join(consumer, "package.json"),
      `${JSON.stringify({ name: "owlapi-public-verifier", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`,
      "utf8",
    );
    const common = [
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `--registry=${registry}`,
      "--cache",
      cache,
    ];
    requireSuccess(
      run("npm", ["install", "--save-exact", "owlapi@next", ...common], {
        cwd: consumer,
      }),
      "Fresh owlapi@next install",
    );
    const installed = JSON.parse(
      readFileSync(
        join(consumer, "node_modules", "owlapi", "package.json"),
        "utf8",
      ),
    );
    if (installed.version !== version) {
      throw new Error("owlapi@next installed a different public version.");
    }
    const imports = [
      "owlapi",
      "owlapi/apibinding",
      "owlapi/model",
      "owlapi/io",
      "owlapi/formats",
    ];
    requireSuccess(
      run(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `await Promise.all(${JSON.stringify(imports)}.map((specifier) => import(specifier)));`,
        ],
        { cwd: consumer },
      ),
      "Installed public export smoke test",
    );
    const graph = JSON.parse(
      requireSuccess(
        run("npm", ["ls", "--all", "--json"], { cwd: consumer }),
        "Fresh public dependency graph",
      ).stdout,
    );
    const signatures = JSON.parse(
      requireSuccess(
        run(
          "npm",
          [
            "audit",
            "signatures",
            "--json",
            `--registry=${registry}`,
            "--cache",
            cache,
          ],
          { cwd: consumer },
        ),
        "npm registry signature and provenance audit",
      ).stdout,
    );

    writeFileSync(
      join(bare, "package.json"),
      `${JSON.stringify({ name: "owlapi-bare-default-verifier", version: "0.0.0", private: true }, null, 2)}\n`,
      "utf8",
    );
    const bareInstall = run("npm", ["install", "owlapi", ...common], {
      cwd: bare,
    });
    if (bareInstall.status === 0) {
      throw new Error(
        "Bare npm install owlapi unexpectedly selected a prerelease.",
      );
    }
    return {
      installedVersion: installed.version,
      importSpecifiers: imports,
      dependencyGraph: graph,
      signatureAudit: signatures,
      bareInstallWithoutLatest: "EXPECTED_FAILURE",
    };
  } finally {
    // This path is created by mkdtemp in the system temporary directory and is
    // never derived from repository or user input, making bounded cleanup safe.
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
    fetchJson(`owlapi/${encodeURIComponent(version)}`),
    fetchJson("-/package/owlapi/dist-tags"),
  ]);
  const registryTarball = await fetchTarball(metadata.dist?.tarball);
  verifyIntegrity(registryTarball, metadata.dist?.integrity);
  const facts = assertPublicRegistryFacts({
    expectedVersion: version,
    retainedSha256: candidate.tarball.sha256,
    metadata,
    distTags,
    registryTarballSha256: sha256Buffer(registryTarball),
  });
  const consumer = exerciseFreshConsumer(version);
  const report = {
    schemaVersion: 1,
    result: "PASS",
    verifiedAt: new Date().toISOString(),
    registry,
    ...facts,
    tarballUrl: metadata.dist.tarball,
    npmPublishedAt: metadata.time ?? null,
    consumer,
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
