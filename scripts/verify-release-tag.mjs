import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertReleaseTag, buildAllowedSigners } from "./release-signers.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const FINGERPRINT_PATTERN = "SHA256:[A-Za-z0-9+/]{43}";

export const parseSshVerification = (output) => {
  const match = new RegExp(
    `Good ["']git["'] signature for (?<principal>[A-Za-z0-9-]+) with [A-Za-z0-9-]+ key (?<fingerprint>${FINGERPRINT_PATTERN})`,
    "u",
  ).exec(output);
  if (!match?.groups) {
    throw new Error("Git did not report a valid SSH signature.");
  }
  return match.groups;
};

export const verifyReleaseTagFacts = ({
  expectedTag,
  expectedCommit,
  objectType,
  targetCommit,
  localVerification,
  githubTag,
  registry,
  releaseDate,
}) => {
  if (
    githubTag?.tag !== expectedTag ||
    githubTag.object?.type !== "commit" ||
    githubTag.object.sha !== expectedCommit
  ) {
    throw new Error(
      "The GitHub tag object does not target the captured release commit.",
    );
  }
  const local = parseSshVerification(localVerification);
  const accepted = assertReleaseTag({
    actualTag: githubTag.tag,
    expectedTag,
    objectType,
    targetCommit,
    expectedCommit,
    fingerprint: local.fingerprint,
    githubVerification: githubTag.verification,
    registry,
    releaseDate,
  });
  const signer = registry.signers.find(({ id }) => id === accepted.signerId);
  if (local.principal !== signer?.githubIdentity) {
    throw new Error(
      `SSH principal ${local.principal} does not match registered identity ${signer?.githubIdentity}.`,
    );
  }
  return {
    result: "PASS",
    tag: expectedTag,
    sourceCommit: expectedCommit,
    signerId: accepted.signerId,
    signerPrincipal: local.principal,
    fingerprint: accepted.fingerprint,
    githubVerifiedAt: accepted.verifiedAt,
  };
};

const runGit = (arguments_) => {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.stdout}${result.stderr}`,
    );
  }
  return result;
};

const fetchJson = async (url, token) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2026-03-10",
        },
      });
      if (response.ok) {
        return response.json();
      }
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`GitHub returned HTTP ${response.status}.`);
      }
      lastError = new Error(`GitHub returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) {
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, attempt * 1000),
      );
    }
  }
  throw lastError;
};

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

export const writeReleaseTagReport = (outputPath, report) => {
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

const main = async () => {
  const expectedTag = argumentValue("--tag");
  const expectedCommit = argumentValue("--commit");
  const outputPath = argumentValue("--output");
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (
    !expectedTag ||
    !/^[0-9a-f]{40}$/u.test(expectedCommit ?? "") ||
    !outputPath ||
    !repository ||
    !token
  ) {
    throw new Error(
      "Tag verification requires --tag, --commit, --output, GITHUB_REPOSITORY, and GITHUB_TOKEN.",
    );
  }
  const registry = JSON.parse(
    readFileSync(
      join(repositoryRoot, "docs", "provenance", "release-signers.json"),
      "utf8",
    ),
  );
  const reference = `refs/tags/${expectedTag}`;
  const objectType = runGit(["cat-file", "-t", reference]).stdout.trim();
  const targetCommit = runGit(["rev-list", "-n", "1", reference]).stdout.trim();
  const allowedSignersPath = join(
    tmpdir(),
    `owlapi-release-signers-${randomUUID()}`,
  );
  let localVerification;
  try {
    // The temporary trust file is derived exclusively from the reviewed registry;
    // a human private key never crosses into the workflow.
    writeFileSync(allowedSignersPath, buildAllowedSigners(registry), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const verification = runGit([
      "-c",
      "gpg.format=ssh",
      "-c",
      `gpg.ssh.allowedSignersFile=${allowedSignersPath}`,
      "verify-tag",
      "--raw",
      expectedTag,
    ]);
    localVerification = `${verification.stdout}${verification.stderr}`;
  } finally {
    if (existsSync(allowedSignersPath)) {
      unlinkSync(allowedSignersPath);
    }
  }

  const encodedTag = encodeURIComponent(expectedTag);
  const referenceRecord = await fetchJson(
    `https://api.github.com/repos/${repository}/git/ref/tags/${encodedTag}`,
    token,
  );
  if (referenceRecord.object?.type !== "tag") {
    throw new Error(`${expectedTag} is not an annotated GitHub tag object.`);
  }
  const githubTag = await fetchJson(referenceRecord.object.url, token);
  const report = verifyReleaseTagFacts({
    expectedTag,
    expectedCommit,
    objectType,
    targetCommit,
    localVerification,
    githubTag,
    registry,
    releaseDate: new Date().toISOString().slice(0, 10),
  });
  writeReleaseTagReport(outputPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
