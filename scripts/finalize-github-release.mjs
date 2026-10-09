import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertDraftRelease,
  assertPublishedRelease,
  assertReleaseAssets,
  GitHubReleaseClient,
} from "./github-release.mjs";
import { assertReleaseExecutionIdentity } from "./release-evidence.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";

import { PACKAGE_VERSION } from "./package-identity.mjs";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

export const finalizationEvidencePin = (args) => {
  const index = args.indexOf("--evidence-sha256");
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!/^[0-9a-f]{64}$/u.test(value ?? ""))
    throw new Error("--evidence-sha256 requires a valid digest.");
  return value;
};

export const readFinalizationEvidence = (path, expectedSha256) => {
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    expectedSha256 !== undefined &&
    (!/^[0-9a-f]{64}$/u.test(expectedSha256) || expectedSha256 !== sha256)
  )
    throw new Error(
      "Finalization evidence differs from the approved byte digest.",
    );
  return { bytes, sha256 };
};

const finalReleaseBody = (evidence) => {
  const version = evidence.package.version;
  const required = evidence.requiredJobs
    .map(({ name }) => `- ${name}: PASS`)
    .join("\n");
  const extended = evidence.extendedTests
    .map(
      ({ environment, result, reason }) =>
        `- ${environment}: ${result} (${reason})`,
    )
    .join("\n");
  const channels =
    evidence.package.version === PACKAGE_VERSION
      ? `Both \`next\` and \`latest\` identify \`${version}\`.`
      : "The historical publication remained exclusively on the `next` channel.";
  return `# owlapi ${version}

Initial-development prerelease of the native-ESM \`${evidence.package.name}\` package. It implements a documented subset of Java OWLAPI concepts; \`API.md\` and the compatibility registry enumerate the exact surface and gaps.

## Required release qualification

${required}

The public npm tarball was re-downloaded from a fresh cache, matched byte-for-byte to the retained candidate, and passed the public export smoke suite. ${channels} The machine-readable release-evidence asset records the source, workflow, signer, approvals, package integrity, npm signature/provenance audit, and exact asset digests.

## Extended observations

These observations are transparent and non-blocking:

${extended}
`;
};

const main = async () => {
  const version = argumentValue("--version") ?? PACKAGE_VERSION;
  if (![PACKAGE_VERSION, "0.1.0-alpha.0"].includes(version))
    throw new Error("Unexpected release version.");
  const evidencePath = resolve(argumentValue("--evidence") ?? "");
  const output = argumentValue("--output");
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const promotionCommit = process.env.GITHUB_SHA;
  const sourceCommit =
    argumentValue("--source-commit") ?? process.env.GITHUB_SHA;
  const tag = `v${version}`;
  if (
    !output ||
    repository !== "Hadden-Industries/owlapi" ||
    !token ||
    !/^[0-9a-f]{40}$/u.test(promotionCommit ?? "") ||
    !/^[0-9a-f]{40}$/u.test(sourceCommit ?? "")
  ) {
    throw new Error(
      "GitHub finalization received an invalid workflow identity.",
    );
  }
  const evidenceInput = readFinalizationEvidence(
    evidencePath,
    finalizationEvidencePin(process.argv.slice(2)),
  );
  const evidence = validateReleaseEvidence(
    JSON.parse(evidenceInput.bytes.toString("utf8")),
  );
  assertReleaseExecutionIdentity({
    evidence,
    promotionCommit,
    sourceCommit,
    tag,
  });
  const client = new GitHubReleaseClient({ repository, token });
  const release = await client.getReleaseByTag(tag);
  const acceptedDraft = assertDraftRelease(release, {
    tag,
    commit: sourceCommit,
  });
  assertReleaseAssets({
    assets: release.assets,
    expected: evidence.githubRelease.assets,
  });

  const evidenceAsset = {
    name: basename(evidencePath),
    bytes: evidenceInput.bytes.length,
    sha256: evidenceInput.sha256,
  };
  const upload = await client.write(
    `/releases/${acceptedDraft.id}/assets?name=${encodeURIComponent(evidenceAsset.name)}`,
    {
      method: "POST",
      upload: true,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(evidenceAsset.bytes),
      },
      body: evidenceInput.bytes,
    },
  );
  if (upload.state === "CONFIRMED") {
    assertReleaseAssets({ assets: [upload.value], expected: [evidenceAsset] });
  } else {
    const reconciled = (await client.listAssets(acceptedDraft.id)).filter(
      ({ name }) => name === evidenceAsset.name,
    );
    assertReleaseAssets({ assets: reconciled, expected: [evidenceAsset] });
  }

  const expectedAssets = [...evidence.githubRelease.assets, evidenceAsset];
  assertReleaseAssets({
    assets: await client.listAssets(acceptedDraft.id),
    expected: expectedAssets,
  });
  const publication = await client.write(`/releases/${acceptedDraft.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `owlapi ${version}`,
      body: finalReleaseBody(evidence),
      draft: false,
      prerelease: true,
      make_latest: "false",
    }),
  });
  let published;
  let mutationState;
  if (publication.state === "CONFIRMED") {
    published = publication.value;
    mutationState = "CONFIRMED";
  } else {
    published = await client.getReleaseByTag(tag);
    mutationState = "RECONCILED_AMBIGUOUS_WRITE";
  }
  const accepted = assertPublishedRelease(published, {
    tag,
    commit: sourceCommit,
  });
  assertReleaseAssets({ assets: published.assets, expected: expectedAssets });
  const report = {
    schemaVersion: 1,
    result: "PASS",
    releaseId: accepted.id,
    releaseUrl: accepted.url,
    tag,
    sourceCommit,
    promotionCommit,
    publishedAt: accepted.publishedAt,
    immutableAtResponse: accepted.immutable,
    mutationState,
    assets: expectedAssets,
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
