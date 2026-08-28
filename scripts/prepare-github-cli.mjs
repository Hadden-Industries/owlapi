import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { extract } from "tar";

import { assertGitHubCliArchive, GITHUB_CLI_IDENTITY } from "./github-cli.mjs";
import { sha256Buffer } from "./release-artifacts.mjs";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const download = async (name) => {
  const response = await fetch(
    `https://github.com/cli/cli/releases/download/v${GITHUB_CLI_IDENTITY.version}/${name}`,
    { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
  );
  if (!response.ok) {
    throw new Error(`GitHub CLI download returned HTTP ${response.status}.`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const main = async () => {
  const output = argumentValue("--output");
  if (!output || process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("The pinned GitHub CLI installer supports only Linux x64.");
  }
  const outputDirectory = resolve(output);
  mkdirSync(outputDirectory, { recursive: true });
  const [archive, checksums] = await Promise.all([
    download(GITHUB_CLI_IDENTITY.name),
    download(GITHUB_CLI_IDENTITY.checksumsName),
  ]);
  const archiveSha256 = sha256Buffer(archive);
  assertGitHubCliArchive({
    name: GITHUB_CLI_IDENTITY.name,
    sha256: archiveSha256,
  });
  if (
    sha256Buffer(checksums) !== GITHUB_CLI_IDENTITY.checksumsSha256 ||
    !checksums
      .toString("utf8")
      .split(/\r?\n/u)
      .includes(`${archiveSha256}  ${GITHUB_CLI_IDENTITY.name}`)
  ) {
    throw new Error(
      "The independently downloaded GitHub CLI checksum set disagrees.",
    );
  }
  const archivePath = join(outputDirectory, GITHUB_CLI_IDENTITY.name);
  writeFileSync(archivePath, archive, { flag: "wx" });
  await extract({ cwd: outputDirectory, file: archivePath, strict: true });
  const executable = join(
    outputDirectory,
    `gh_${GITHUB_CLI_IDENTITY.version}_linux_amd64`,
    "bin",
    "gh",
  );
  const versionCheck = spawnSync(executable, ["--version"], {
    encoding: "utf8",
  });
  if (
    versionCheck.status !== 0 ||
    !versionCheck.stdout.startsWith(
      `gh version ${GITHUB_CLI_IDENTITY.version} `,
    )
  ) {
    throw new Error("The extracted GitHub CLI binary has the wrong version.");
  }
  const report = {
    schemaVersion: 1,
    result: "PASS",
    version: GITHUB_CLI_IDENTITY.version,
    archive: GITHUB_CLI_IDENTITY.name,
    archiveSha256,
    checksumsSha256: GITHUB_CLI_IDENTITY.checksumsSha256,
    executable,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
