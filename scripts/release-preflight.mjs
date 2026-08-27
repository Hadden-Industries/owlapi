import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveWorkflowMetadata } from "./workflow-metadata.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
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

if (process.env.GITHUB_REF !== "refs/heads/main") {
  throw new Error(
    `Release dispatch must target refs/heads/main, not ${process.env.GITHUB_REF}.`,
  );
}
const head = runGit(["rev-parse", "HEAD"]).stdout.trim();
if (!process.env.GITHUB_SHA || head !== process.env.GITHUB_SHA) {
  throw new Error(
    `Checked-out HEAD ${head} does not equal captured ${process.env.GITHUB_SHA}.`,
  );
}
const remoteMain = runGit([
  "rev-parse",
  "refs/remotes/origin/main",
]).stdout.trim();
if (remoteMain !== head) {
  throw new Error(
    `Captured release commit ${head} is not current origin/main ${remoteMain}.`,
  );
}

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
if (tagLookup.status === 0) {
  throw new Error(
    `Canonical tag ${metadata.tag} already exists before qualification.`,
  );
}
if (tagLookup.status !== 1) {
  throw new Error(
    `Unable to establish absence of canonical tag ${metadata.tag}.`,
  );
}
if (publication.enabled) {
  throw new Error("Phase 19C release qualification cannot enable publication.");
}
process.stdout.write(
  `${JSON.stringify(
    {
      result: "PASS",
      sourceCommit: head,
      sourceRef: process.env.GITHUB_REF,
      canonicalTagAbsent: metadata.tag,
      publicationEnabled: false,
    },
    null,
    2,
  )}\n`,
);
