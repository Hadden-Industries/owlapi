import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertDraftRelease,
  assertPublishedRelease,
  assertReleaseAssets,
  GitHubReleaseClient,
} from "./github-release.mjs";
import { sha256File } from "./release-artifacts.mjs";
import { assertReleaseExecutionIdentity } from "./release-evidence.mjs";
import { validateReleaseEvidence } from "./validate-release-evidence.mjs";

const version = "0.1.0-alpha.0";

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const finalReleaseBody = (evidence) => {
  const required = evidence.requiredJobs
    .map(({ name }) => `- ${name}: PASS`)
    .join("\n");
  const extended = evidence.extendedTests
    .map(
      ({ environment, result, reason }) =>
        `- ${environment}: ${result} (${reason})`,
    )
    .join("\n");
  return `# owlapi ${version}

Initial-development prerelease of the native-ESM \`owlapi\` package. It implements a documented subset of Java OWLAPI concepts; \`API.md\` and the compatibility registry enumerate the exact surface and gaps.

## Required release qualification

${required}

The public npm tarball was re-downloaded from a fresh cache, matched byte-for-byte to the retained candidate, passed the public export smoke suite, and remained exclusively on the \`next\` channel. The machine-readable release-evidence asset records the source, workflow, signer, approvals, package integrity, npm signature/provenance audit, and exact asset digests.

## Extended observations

These observations are transparent and non-blocking:

${extended}
`;
};

const main = async () => {
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
  const evidence = validateReleaseEvidence(
    JSON.parse(readFileSync(evidencePath, "utf8")),
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
    bytes: statSync(evidencePath).size,
    sha256: sha256File(evidencePath),
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
      body: readFileSync(evidencePath),
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
