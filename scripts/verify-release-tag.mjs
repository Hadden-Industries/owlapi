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

import {
  assertLocalReleaseTag,
  assertReleaseTag,
  buildAllowedSigners,
} from "./release-signers.mjs";

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

const assertRegisteredPrincipal = ({ accepted, local, registry }) => {
  const signer = registry.signers.find(({ id }) => id === accepted.signerId);
  if (local.principal !== signer?.githubIdentity) {
    throw new Error(
      `SSH principal ${local.principal} does not match registered identity ${signer?.githubIdentity}.`,
    );
  }
};

export const verifyLocalReleaseTagFacts = ({
  expectedTag,
  expectedCommit,
  objectType,
  targetCommit,
  localVerification,
  registry,
  releaseDate,
}) => {
  const local = parseSshVerification(localVerification);
  const accepted = assertLocalReleaseTag({
    actualTag: expectedTag,
    expectedTag,
    objectType,
    targetCommit,
    expectedCommit,
    fingerprint: local.fingerprint,
    registry,
    releaseDate,
  });
  assertRegisteredPrincipal({ accepted, local, registry });
  return {
    result: "PASS",
    tag: expectedTag,
    sourceCommit: expectedCommit,
    signerId: accepted.signerId,
    signerPrincipal: local.principal,
    fingerprint: accepted.fingerprint,
  };
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
  assertRegisteredPrincipal({ accepted, local, registry });
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

const runGit = (cwd, arguments_) => {
  const result = spawnSync("git", arguments_, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.stdout}${result.stderr}`,
    );
  }
  return result;
};

const inspectLocalReleaseTag = ({
  repositoryRoot: localRepositoryRoot,
  expectedTag,
  expectedCommit,
  registry,
  temporaryDirectory = tmpdir(),
}) => {
  const reference = `refs/tags/${expectedTag}`;
  const objectType = runGit(localRepositoryRoot, [
    "cat-file",
    "-t",
    reference,
  ]).stdout.trim();
  const targetCommit = runGit(localRepositoryRoot, [
    "rev-list",
    "-n",
    "1",
    reference,
  ]).stdout.trim();
  if (objectType !== "tag") {
    throw new Error(`${expectedTag} is not an annotated tag.`);
  }
  if (targetCommit !== expectedCommit) {
    throw new Error(
      `${expectedTag} targets ${targetCommit}, not captured commit ${expectedCommit}.`,
    );
  }

  const allowedSignersPath = join(
    temporaryDirectory,
    `owlapi-release-signers-${randomUUID()}`,
  );
  let localVerification;
  try {
    // Trust is derived exclusively from the reviewed registry; private keys
    // and ambient Git trust configuration are never consulted.
    writeFileSync(allowedSignersPath, buildAllowedSigners(registry), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const verification = runGit(localRepositoryRoot, [
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
  return { localVerification, objectType, targetCommit };
};

export const verifyLocalReleaseTag = ({
  repositoryRoot: localRepositoryRoot,
  expectedTag,
  expectedCommit,
  registry,
  releaseDate,
  temporaryDirectory,
}) => {
  const inspection = inspectLocalReleaseTag({
    repositoryRoot: localRepositoryRoot,
    expectedTag,
    expectedCommit,
    registry,
    temporaryDirectory,
  });
  return verifyLocalReleaseTagFacts({
    expectedTag,
    expectedCommit,
    ...inspection,
    registry,
    releaseDate,
  });
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
  const { localVerification, objectType, targetCommit } =
    inspectLocalReleaseTag({
      repositoryRoot,
      expectedTag,
      expectedCommit,
      registry,
    });

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
