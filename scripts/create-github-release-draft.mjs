import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertDraftRelease,
  assertReleaseAssetSubset,
  assertReleaseAssets,
  GitHubReleaseClient,
} from "./github-release.mjs";
import { sha256File } from "./release-artifacts.mjs";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const contentType = (name) => {
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".tgz")) return "application/gzip";
  return "text/plain; charset=utf-8";
};

const readCandidateAssets = (candidateDirectory, version) => {
  const expectedNames = [
    "SHA256SUMS",
    `owlapi-${version}.cdx.json`,
    `owlapi-${version}.tgz`,
  ].sort();
  const observedNames = readdirSync(candidateDirectory).sort();
  if (JSON.stringify(observedNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      "The draft release input is not the closed candidate bundle.",
    );
  }
  return expectedNames.map((name) => {
    const path = join(candidateDirectory, name);
    return {
      name,
      path,
      bytes: statSync(path).size,
      sha256: sha256File(path),
    };
  });
};

const releaseBody = (version) => `# owlapi ${version}

This draft contains the exact retained candidate that passed the required pre-publication qualification recorded for this release identity. It remains unpublished until npm registry verification and the fourth machine-readable release-evidence asset pass.

The package is an initial-development JavaScript implementation of a documented subset of Java OWLAPI concepts. See \`CHANGELOG.md\`, \`API.md\`, and the compatibility registry in the package for the exact implemented surface and known gaps.
`;

const exactExistingAsset = (assets, expected) => {
  const existing = assets.find(({ name }) => name === expected.name);
  if (!existing) return null;
  if (
    existing.size !== expected.bytes ||
    existing.digest !== `sha256:${expected.sha256}`
  ) {
    throw new Error(
      `Existing GitHub asset ${expected.name} is not byte-exact.`,
    );
  }
  return existing;
};

const main = async () => {
  const candidateDirectory = resolve(argumentValue("--candidate") ?? "");
  const version = argumentValue("--version");
  const tag = argumentValue("--tag");
  const commit = argumentValue("--commit");
  const output = argumentValue("--output");
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (
    !version ||
    tag !== `v${version}` ||
    !/^[0-9a-f]{40}$/u.test(commit ?? "") ||
    !output ||
    repository !== "Hadden-Industries/owlapi" ||
    !token
  ) {
    throw new Error(
      "GitHub draft creation received an invalid release identity.",
    );
  }
  const assets = readCandidateAssets(candidateDirectory, version);
  const client = new GitHubReleaseClient({ repository, token });
  let release = await client.getReleaseByTag(tag);
  let creation = "OBSERVED_EXISTING_DRAFT";
  if (!release) {
    const result = await client.write("/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: commit,
        name: `owlapi ${version}`,
        body: releaseBody(version),
        draft: true,
        prerelease: true,
        generate_release_notes: false,
        make_latest: "false",
      }),
    });
    if (result.state === "CONFIRMED") {
      release = result.value;
      creation = "CONFIRMED";
    } else {
      release = await client.getReleaseByTag(tag);
      if (!release) {
        throw new Error(
          "Draft creation was ambiguous and read-only reconciliation found no exact draft.",
        );
      }
      creation = "RECONCILED_AMBIGUOUS_WRITE";
    }
  }
  const accepted = assertDraftRelease(release, { tag, commit });

  for (const asset of assets) {
    const existingAssets = await client.listAssets(accepted.id);
    assertReleaseAssetSubset({ assets: existingAssets, expected: assets });
    if (exactExistingAsset(existingAssets, asset)) continue;
    const result = await client.write(
      `/releases/${accepted.id}/assets?name=${encodeURIComponent(asset.name)}`,
      {
        method: "POST",
        upload: true,
        headers: {
          "Content-Type": contentType(asset.name),
          "Content-Length": String(asset.bytes),
        },
        body: readFileSync(asset.path),
      },
    );
    if (result.state === "CONFIRMED") {
      exactExistingAsset([result.value], asset);
    } else {
      const reconciled = await client.listAssets(accepted.id);
      if (!exactExistingAsset(reconciled, asset)) {
        throw new Error(
          `Upload of ${asset.name} was ambiguous and could not be reconciled exactly.`,
        );
      }
    }
  }
  const finalAssets = await client.listAssets(accepted.id);
  assertReleaseAssets({ assets: finalAssets, expected: assets });
  const report = {
    schemaVersion: 1,
    result: "PASS",
    releaseId: accepted.id,
    releaseUrl: accepted.url,
    tag,
    sourceCommit: commit,
    draft: true,
    creation,
    assets: assets.map(({ path: _path, ...asset }) => asset),
  };
  writeFileSync(
    resolve(output),
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
