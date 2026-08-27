import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareCommittedEvidence,
  publishEvidence,
} from "./acquire-npm-package-evidence.mjs";
import { sha256, stableJson } from "./third-party-evidence/digests.mjs";
import { verifyEvidenceManifest } from "./third-party-evidence/evidence-manifest.mjs";

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MANIFEST_NAME = "npm-package-evidence.json";

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

/**
 * Promote one already-recanonicalized, fully verified bootstrap aggregate.
 * Transformation and promotion stay separate so a reviewer can compare both
 * platform candidates before this command performs its single atomic write.
 */
export const promoteEvidenceAggregate = async ({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  inputRoot,
  expectedCurrentManifestSha256 = null,
} = {}) => {
  if (typeof inputRoot !== "string" || inputRoot.length === 0) {
    throw new TypeError("Evidence promotion requires an input root");
  }
  const absoluteInput = resolve(repositoryRoot, inputRoot);
  const candidateManifestBytes = await readFile(
    join(absoluteInput, MANIFEST_NAME),
  );
  const manifest = JSON.parse(candidateManifestBytes.toString("utf8"));
  const canonicalManifestBytes = Buffer.from(stableJson(manifest));
  if (!candidateManifestBytes.equals(canonicalManifestBytes)) {
    throw new TypeError(
      "Evidence promotion requires a canonical candidate manifest",
    );
  }

  const lockfileBytes = await readFile(
    join(repositoryRoot, "package-lock.json"),
  );
  const candidateCorpusRoot = join(absoluteInput, "corpus");
  await verifyEvidenceManifest({
    manifest,
    lockfileBytes,
    blobRoot: candidateCorpusRoot,
  });

  const provenanceRoot = join(repositoryRoot, "docs", "provenance");
  const committedManifestPath = join(
    provenanceRoot,
    "npm-package-evidence.json",
  );
  const committedCorpusRoot = join(provenanceRoot, "evidence", "npm");
  const hasCommittedManifest = await exists(committedManifestPath);
  if (hasCommittedManifest) {
    if (expectedCurrentManifestSha256 === null) {
      throw new TypeError("Committed npm evidence already exists");
    }
    if (!/^[0-9a-f]{64}$/u.test(expectedCurrentManifestSha256)) {
      throw new TypeError("Expected committed manifest SHA-256 is invalid");
    }
    const currentManifestBytes = await readFile(committedManifestPath);
    if (sha256(currentManifestBytes) !== expectedCurrentManifestSha256) {
      throw new TypeError(
        "Committed npm evidence does not match the authorized replacement digest",
      );
    }
    await verifyEvidenceManifest({
      manifest: JSON.parse(currentManifestBytes.toString("utf8")),
      lockfileBytes,
      blobRoot: committedCorpusRoot,
      allowLegacyArchiveInventory: true,
    });
  } else if (expectedCurrentManifestSha256 !== null) {
    throw new TypeError("No committed npm evidence exists to replace");
  }
  if (!hasCommittedManifest && (await exists(committedCorpusRoot))) {
    const entries = await readdir(committedCorpusRoot);
    if (
      entries.some((entry) => entry !== ".gitattributes") ||
      entries.filter((entry) => entry === ".gitattributes").length > 1
    ) {
      throw new TypeError("Committed npm evidence already exists");
    }
  }

  await publishEvidence({
    repositoryRoot,
    stagingCorpus: candidateCorpusRoot,
    manifest,
  });
  const summary = await compareCommittedEvidence({
    repositoryRoot,
    manifest,
    lockfileBytes,
  });
  const committedManifestBytes = await readFile(committedManifestPath);
  if (!committedManifestBytes.equals(canonicalManifestBytes)) {
    throw new Error("Committed npm evidence manifest differs after promotion");
  }
  return {
    corpusRoot: manifest.corpusRoot,
    manifestSha256: sha256(committedManifestBytes),
    summary,
  };
};

export const parsePromotionArguments = (arguments_) => {
  if (
    !Array.isArray(arguments_) ||
    arguments_.length < 1 ||
    arguments_.length > 2
  ) {
    throw new TypeError(
      "Evidence promotion requires --input and at most one replacement digest",
    );
  }
  const values = new Map();
  for (const argument of arguments_) {
    const match = /^(--(?:input|replace-manifest-sha256))=(.+)$/u.exec(
      argument,
    );
    if (!match || values.has(match[1])) {
      throw new TypeError(`Invalid evidence promotion argument: ${argument}`);
    }
    values.set(match[1], match[2]);
  }
  const inputRoot = values.get("--input");
  if (!inputRoot) {
    throw new TypeError("Evidence promotion requires --input=<path>");
  }
  const expectedCurrentManifestSha256 =
    values.get("--replace-manifest-sha256") ?? null;
  if (
    expectedCurrentManifestSha256 !== null &&
    !/^[0-9a-f]{64}$/u.test(expectedCurrentManifestSha256)
  ) {
    throw new TypeError("Replacement manifest SHA-256 must be lowercase hex");
  }
  return { inputRoot, expectedCurrentManifestSha256 };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const result = await promoteEvidenceAggregate(
      parsePromotionArguments(process.argv.slice(2)),
    );
    process.stdout.write(stableJson({ status: "PROMOTED", ...result }));
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
