import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { jsonEquals } from "./canonical-json.mjs";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertPublishedRelease,
  assertReleaseAssets,
  assertReleaseId,
  GitHubReleaseClient,
} from "./github-release.mjs";
import { GITHUB_CLI_IDENTITY } from "./github-cli.mjs";
import { sha256File } from "./release-file-utils.mjs";
import { assertReleaseExecutionIdentity } from "./release-evidence.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";
import { createRepositoryReader } from "./ci-verification-command.mjs";

import { PACKAGE_VERSION, PACKAGE_FILE_STEM } from "./package-identity.mjs";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

export const IMMUTABLE_VERIFICATION_POLICY = Object.freeze({
  totalBudgetMs: 540_000,
  indexingBudgetMs: 180_000,
  pollMs: 15_000,
  assetLimitBytes: 64 * 1024 * 1024,
  repositoryId: 1347610640,
  // Existing immutable rc.2 attestation, independently observed on 2026-10-29.
  // This is an access control, never evidence for the candidate's authenticity.
  controlTagSha: "79699c3816912084202551dc2e043a12e081a3ef",
});

const remainingMs = (deadline, now) => {
  const remaining = deadline - now();
  assert.ok(
    Number.isFinite(remaining) && remaining > 0,
    "Immutable verification budget exhausted",
  );
  return Math.max(1, Math.ceil(remaining));
};

export const runGh = async (
  executable,
  arguments_,
  token,
  {
    spawn = spawnSync,
    now = () => performance.now(),
    deadline = now() + 60_000,
  } = {},
) => {
  const result = spawn(executable, arguments_, {
    encoding: "utf8",
    timeout: Math.min(60_000, remainingMs(deadline, now)),
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GH_TOKEN: token,
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
    },
  });
  remainingMs(deadline, now);
  if (result.status === 0) {
    return JSON.parse(result.stdout);
  }
  throw new Error(
    `GitHub CLI verification failed: ${result.stdout ?? ""}${result.stderr ?? ""}`,
    { cause: result.error },
  );
};

export const downloadAsset = async ({
  repository,
  token,
  asset,
  directory,
  fetchImpl = fetch,
  now = () => performance.now(),
  deadline = now() + 60_000,
}) => {
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);
  assert.ok(
    Number.isSafeInteger(asset.id) &&
      asset.id > 0 &&
      Number.isSafeInteger(asset.size) &&
      asset.size > 0 &&
      asset.size <= IMMUTABLE_VERIFICATION_POLICY.assetLimitBytes &&
      typeof asset.name === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(asset.name),
    "Invalid release asset identity or size",
  );
  const signal = AbortSignal.timeout(
    Math.min(60_000, remainingMs(deadline, now)),
  );
  let response = await fetchImpl(
    `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`,
    {
      cache: "no-store",
      redirect: "manual",
      signal,
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  if (response.status === 302) {
    const url = new URL(response.headers.get("location"));
    assert.ok(
      url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.hash &&
        !url.port &&
        [
          "release-assets.githubusercontent.com",
          "objects.githubusercontent.com",
        ].includes(url.hostname),
      "Unexpected release asset storage origin",
    );
    await response.body?.cancel();
    response = await fetchImpl(url, {
      signal,
      redirect: "error",
      cache: "no-store",
    });
  }
  assert.ok(
    response.ok && response.body,
    `Release asset ${asset.name} returned HTTP ${response.status}.`,
  );
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      remainingMs(deadline, now);
      if (done) break;
      size += value.byteLength;
      assert.ok(size <= asset.size, "Release asset exceeds its admitted size");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  assert.equal(size, asset.size, "Release asset is truncated");
  const path = join(directory, asset.name);
  writeFileSync(path, Buffer.concat(chunks), {
    flag: "wx",
  });
  return path;
};

const attestationCount = (value) => {
  assert.ok(
    Array.isArray(value?.attestations),
    "Malformed attestation inventory",
  );
  for (const entry of value.attestations) {
    assert.equal(
      entry?.repository_id,
      IMMUTABLE_VERIFICATION_POLICY.repositoryId,
      "Unexpected attestation repository",
    );
    const inline = entry.bundle !== null && entry.bundle !== undefined;
    if (inline)
      assert.ok(
        typeof entry.bundle === "object" && !Array.isArray(entry.bundle),
        "Malformed attestation bundle",
      );
    let remote = false;
    if (entry.bundle_url !== null && entry.bundle_url !== undefined) {
      assert.equal(typeof entry.bundle_url, "string");
      const url = new URL(entry.bundle_url);
      assert.ok(
        url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.hash,
        "Unsafe attestation bundle URL",
      );
      remote = true;
    }
    assert.ok(inline || remote, "Attestation bundle is missing");
  }
  return value.attestations.length;
};

/** Wait only for typed visibility with a positive same-token attestation read. */
export async function waitForReleaseAttestation(
  { read, tag, tagSha, sourceCommit, releaseId, expectedAssets },
  {
    now = () => performance.now(),
    sleep = delay,
    deadline = now() + IMMUTABLE_VERIFICATION_POLICY.indexingBudgetMs,
  } = {},
) {
  assert.match(tagSha, /^[a-f0-9]{40}$/u);
  assert.match(sourceCommit, /^[a-f0-9]{40}$/u);
  const target = `/attestations/sha1%3A${tagSha}?predicate_type=release&per_page=100`;
  const control = `/attestations/sha1%3A${IMMUTABLE_VERIFICATION_POLICY.controlTagSha}?predicate_type=release&per_page=100`;
  const boundedRead = (path) =>
    read(path, { budgetMs: remainingMs(deadline, now) });
  let observedImmutable = false;
  const unchanged = async () => {
    remainingMs(deadline, now);
    const ref = await boundedRead(`/git/ref/tags/${encodeURIComponent(tag)}`);
    assert.equal(ref?.object?.type, "tag", "Release tag is not annotated");
    assert.equal(ref.object.sha, tagSha, "Release tag changed");
    const annotation = await boundedRead(`/git/tags/${tagSha}`);
    assert.equal(annotation?.sha, tagSha);
    assert.equal(annotation.tag, tag);
    assert.equal(annotation.object?.type, "commit");
    assert.equal(annotation.object.sha, sourceCommit, "Release source changed");
    assert.equal(
      annotation.verification?.verified,
      true,
      "Release tag signature is unverified",
    );
    assert.equal(annotation.verification.reason, "valid");
    const live = await boundedRead(`/releases/tags/${encodeURIComponent(tag)}`);
    assertReleaseId(live, releaseId);
    assertPublishedRelease(live, { tag, requireImmutable: observedImmutable });
    assert.equal(typeof live.immutable, "boolean", "Missing immutable state");
    assertReleaseAssets({ assets: live.assets, expected: expectedAssets });
    observedImmutable ||= live.immutable;
    remainingMs(deadline, now);
    return live;
  };
  for (let observations = 1; ; observations++) {
    const live = await unchanged();
    let visible = false;
    try {
      visible = attestationCount(await boundedRead(target)) > 0;
    } catch (error) {
      if (error.httpStatus !== 404) throw error;
    }
    if (visible && live.immutable) {
      const final = await unchanged();
      return { observations, releaseId, tagSha, release: final };
    }
    assert.notEqual(
      target,
      control,
      "Pending control attestation cannot prove its own readability",
    );
    assert.ok(
      attestationCount(await boundedRead(control)) > 0,
      "Attestation access control is unavailable",
    );
    const remaining = remainingMs(deadline, now);
    assert.ok(
      remaining > IMMUTABLE_VERIFICATION_POLICY.pollMs,
      "Release attestation indexing budget exhausted",
    );
    await sleep(IMMUTABLE_VERIFICATION_POLICY.pollMs);
  }
}

const main = async () => {
  const now = () => performance.now();
  const deadline = now() + IMMUTABLE_VERIFICATION_POLICY.totalBudgetMs;
  const version = argumentValue("--version") ?? PACKAGE_VERSION;
  if (![PACKAGE_VERSION, "0.1.0-alpha.0"].includes(version))
    throw new Error("Unexpected release version.");
  const stem = version === PACKAGE_VERSION ? PACKAGE_FILE_STEM : "owlapi";
  const executable = resolve(argumentValue("--gh") ?? "");
  const outputDirectory = resolve(argumentValue("--output-directory") ?? "");
  const reportPath = argumentValue("--report");
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const promotionCommit = process.env.GITHUB_SHA;
  const sourceCommit =
    argumentValue("--source-commit") ?? process.env.GITHUB_SHA;
  const tag = `v${version}`;
  if (
    !reportPath ||
    repository !== "Hadden-Industries/owlapi" ||
    !token ||
    !/^[0-9a-f]{40}$/u.test(promotionCommit ?? "") ||
    !/^[0-9a-f]{40}$/u.test(sourceCommit ?? "")
  ) {
    throw new Error(
      "Immutable-release verification received an invalid identity.",
    );
  }
  const versionCheck = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
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
  const reader = createRepositoryReader({
    repository,
    token,
    now,
    deadline,
    budgetMs: IMMUTABLE_VERIFICATION_POLICY.totalBudgetMs,
    requestLimit: 256,
  });
  const client = new GitHubReleaseClient({ repository, token, reader });
  const release = await client.getReleaseByTag(tag);
  const accepted = assertPublishedRelease(release, {
    tag,
    commit: sourceCommit,
    requireImmutable: false,
  });
  const tagReference = await reader(`/git/ref/tags/${encodeURIComponent(tag)}`);
  assert.equal(tagReference?.object?.type, "tag");
  const tagSha = tagReference.object.sha;
  const expectedNames = [
    "SHA256SUMS",
    `${stem}-${version}.cdx.json`,
    `${stem}-${version}.release-evidence.json`,
    `${stem}-${version}.tgz`,
  ].sort();
  if (
    !jsonEquals(release.assets.map(({ name }) => name).sort(), expectedNames)
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
        now,
        deadline,
      }),
    );
  }
  const evidencePath = paths.find((path) =>
    path.endsWith(".release-evidence.json"),
  );
  const evidence = validateReleaseEvidence(
    JSON.parse(readFileSync(evidencePath, "utf8")),
  );
  assertReleaseId(accepted, evidence.githubRelease.id);
  assertReleaseExecutionIdentity({
    evidence,
    promotionCommit,
    sourceCommit,
    tag,
  });
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

  const readiness = await waitForReleaseAttestation(
    {
      read: reader,
      tag,
      tagSha,
      sourceCommit,
      releaseId: accepted.id,
      expectedAssets,
    },
    {
      now,
      deadline: Math.min(
        deadline,
        now() + IMMUTABLE_VERIFICATION_POLICY.indexingBudgetMs,
      ),
    },
  );
  const releaseAttestation = await runGh(
    executable,
    ["release", "verify", tag, "--repo", repository, "--format", "json"],
    token,
    { now, deadline },
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
      { now, deadline },
    );
  }
  const report = {
    schemaVersion: 1,
    result: "PASS",
    verifiedAt: new Date().toISOString(),
    release: assertPublishedRelease(readiness.release, {
      tag,
      requireImmutable: true,
    }),
    attestationReadiness: { observations: readiness.observations, tagSha },
    tag,
    githubCli: {
      version: GITHUB_CLI_IDENTITY.version,
      archiveSha256: GITHUB_CLI_IDENTITY.sha256,
      checksumsSha256: GITHUB_CLI_IDENTITY.checksumsSha256,
    },
    assets: expectedAssets,
    releaseAttestation,
    assetAttestations,
    promotionCommit,
    sourceCommit,
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
