import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertPublishedRelease,
  assertReleaseAssets,
  GitHubReleaseClient,
} from "./github-release.mjs";
import { GITHUB_CLI_IDENTITY } from "./github-cli.mjs";
import { sha256File } from "./release-artifacts.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";

const version = "0.1.0-alpha.0";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const runGh = async (executable, arguments_, token) => {
  let lastFailure;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync(executable, arguments_, {
      encoding: "utf8",
      env: {
        ...process.env,
        GH_TOKEN: token,
        GH_PROMPT_DISABLED: "1",
        GH_NO_UPDATE_NOTIFIER: "1",
      },
    });
    if (result.status === 0) {
      return JSON.parse(result.stdout);
    }
    lastFailure = `${result.stdout}${result.stderr}`;
    if (attempt < 3) {
      // Immutable-release attestations may become readable shortly after the
      // publishing write; retrying this verification is a bounded read only.
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, attempt * 2000),
      );
    }
  }
  throw new Error(`GitHub CLI verification failed: ${lastFailure}`);
};

const downloadAsset = async ({ repository, token, asset, directory }) => {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Release asset ${asset.name} returned HTTP ${response.status}.`,
    );
  }
  const path = join(directory, asset.name);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()), {
    flag: "wx",
  });
  return path;
};

const main = async () => {
  const executable = resolve(argumentValue("--gh") ?? "");
  const outputDirectory = resolve(argumentValue("--output-directory") ?? "");
  const reportPath = argumentValue("--report");
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const commit = process.env.GITHUB_SHA;
  const tag = `v${version}`;
  if (
    !reportPath ||
    repository !== "Hadden-Industries/owlapi" ||
    !token ||
    !/^[0-9a-f]{40}$/u.test(commit ?? "")
  ) {
    throw new Error(
      "Immutable-release verification received an invalid identity.",
    );
  }
  const versionCheck = spawnSync(executable, ["--version"], {
    encoding: "utf8",
  });
  if (
    versionCheck.status !== 0 ||
    !versionCheck.stdout.startsWith(
      `gh version ${GITHUB_CLI_IDENTITY.version} `,
    )
  ) {
    throw new Error(
      "Immutable verification did not receive the pinned GitHub CLI.",
    );
  }
  mkdirSync(outputDirectory, { recursive: true });
  const client = new GitHubReleaseClient({ repository, token });
  let release;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    release = await client.getReleaseByTag(tag);
    if (release?.immutable === true) break;
    if (attempt < 3) {
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, attempt * 2000),
      );
    }
  }
  const accepted = assertPublishedRelease(release, {
    tag,
    commit,
    requireImmutable: true,
  });
  const expectedNames = [
    "SHA256SUMS",
    `owlapi-${version}.cdx.json`,
    `owlapi-${version}.release-evidence.json`,
    `owlapi-${version}.tgz`,
  ].sort();
  if (
    JSON.stringify(release.assets.map(({ name }) => name).sort()) !==
    JSON.stringify(expectedNames)
  ) {
    throw new Error(
      "The immutable release does not contain exactly four assets.",
    );
  }
  const paths = [];
  for (const asset of release.assets) {
    paths.push(
      await downloadAsset({
        repository,
        token,
        asset,
        directory: outputDirectory,
      }),
    );
  }
  const evidencePath = paths.find((path) =>
    path.endsWith(".release-evidence.json"),
  );
  const evidence = validateReleaseEvidence(
    JSON.parse(readFileSync(evidencePath, "utf8")),
  );
  if (evidence.source.commit !== commit || evidence.source.tag !== tag) {
    throw new Error(
      "Downloaded release evidence belongs to a different source.",
    );
  }
  const expectedAssets = [
    ...evidence.githubRelease.assets,
    {
      name: basename(evidencePath),
      bytes: statSync(evidencePath).size,
      sha256: sha256File(evidencePath),
    },
  ];
  const observedAssets = release.assets.map(({ name, size, digest }) => ({
    name,
    size,
    digest,
  }));
  assertReleaseAssets({ assets: observedAssets, expected: expectedAssets });
  for (const path of paths) {
    const asset = expectedAssets.find(({ name }) => name === basename(path));
    if (
      sha256File(path) !== asset.sha256 ||
      statSync(path).size !== asset.bytes
    ) {
      throw new Error(
        `Freshly downloaded asset ${asset.name} differs from evidence.`,
      );
    }
  }

  const releaseAttestation = await runGh(
    executable,
    ["release", "verify", tag, "--repo", repository, "--format", "json"],
    token,
  );
  const assetAttestations = {};
  for (const path of paths) {
    assetAttestations[basename(path)] = await runGh(
      executable,
      [
        "release",
        "verify-asset",
        tag,
        path,
        "--repo",
        repository,
        "--format",
        "json",
      ],
      token,
    );
  }
  const report = {
    schemaVersion: 1,
    result: "PASS",
    verifiedAt: new Date().toISOString(),
    release: accepted,
    tag,
    sourceCommit: commit,
    githubCli: {
      version: GITHUB_CLI_IDENTITY.version,
      archiveSha256: GITHUB_CLI_IDENTITY.sha256,
      checksumsSha256: GITHUB_CLI_IDENTITY.checksumsSha256,
    },
    assets: expectedAssets,
    releaseAttestation,
    assetAttestations,
  };
  writeFileSync(
    resolve(reportPath),
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
