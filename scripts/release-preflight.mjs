import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { deriveWorkflowMetadata } from "./workflow-metadata.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export const assertReleasePreflight = ({
  sourceRef,
  checkoutHead,
  capturedSha,
  remoteMain,
  canonicalTagLookupStatus,
  manifest,
  publication,
}) => {
  if (sourceRef !== "refs/heads/main") {
    throw new Error(
      `Release dispatch must target refs/heads/main, not ${sourceRef}.`,
    );
  }
  if (!capturedSha || checkoutHead !== capturedSha) {
    throw new Error(
      `Checked-out HEAD ${checkoutHead} does not equal captured ${capturedSha}.`,
    );
  }
  if (remoteMain !== checkoutHead) {
    throw new Error(
      `Captured release commit ${checkoutHead} is not current origin/main ${remoteMain}.`,
    );
  }
  const metadata = deriveWorkflowMetadata({ manifest, publication });
  if (canonicalTagLookupStatus === 0) {
    throw new Error(
      `Canonical tag ${metadata.tag} already exists before qualification.`,
    );
  }
  if (canonicalTagLookupStatus !== 1) {
    throw new Error(
      `Unable to establish absence of canonical tag ${metadata.tag}.`,
    );
  }
  if (!publication.enabled || publication.mode !== "DIRECT_BOOTSTRAP") {
    throw new Error(
      "This release workflow requires the reviewed DIRECT_BOOTSTRAP boundary.",
    );
  }
  if (
    manifest.publishConfig?.access !== "public" ||
    manifest.publishConfig.registry !== "https://registry.npmjs.org/"
  ) {
    throw new Error(
      "The package must retain the reviewed public npm registry configuration.",
    );
  }
  return {
    result: "PASS",
    sourceCommit: checkoutHead,
    sourceRef,
    canonicalTagAbsent: metadata.tag,
    publicationEnabled: true,
    publicationMode: publication.mode,
    coordinate: metadata.coordinate,
    channel: metadata.channel,
  };
};

const runGit = (arguments_, { allowMissing = false } = {}) => {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0 && !allowMissing) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.stdout}${result.stderr}`,
    );
  }
  return result;
};

const main = () => {
  const checkoutHead = runGit(["rev-parse", "HEAD"]).stdout.trim();
  const remoteMain = runGit([
    "rev-parse",
    "refs/remotes/origin/main",
  ]).stdout.trim();
  const manifest = JSON.parse(
    readFileSync(join(repositoryRoot, "package.json"), "utf8"),
  );
  const publication = JSON.parse(
    readFileSync(
      join(repositoryRoot, "docs", "release", "publication-control.json"),
      "utf8",
    ),
  );
  const metadata = deriveWorkflowMetadata({ manifest, publication });
  const tagLookup = runGit(
    ["show-ref", "--verify", "--quiet", `refs/tags/${metadata.tag}`],
    { allowMissing: true },
  );
  const report = assertReleasePreflight({
    sourceRef: process.env.GITHUB_REF,
    checkoutHead,
    capturedSha: process.env.GITHUB_SHA,
    remoteMain,
    canonicalTagLookupStatus: tagLookup.status,
    manifest,
    publication,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
