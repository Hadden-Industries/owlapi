import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stableJson } from "./third-party-evidence/digests.mjs";
import { verifyEvidenceManifest } from "./third-party-evidence/evidence-manifest.mjs";

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MANIFEST_NAME = "npm-package-evidence.json";

const readManifest = async (root) =>
  JSON.parse(await readFile(join(root, MANIFEST_NAME), "utf8"));

/**
 * Cross-host parity is deliberately stricter than comparing the blob Merkle
 * root alone. Equal canonical manifests prove that package identities,
 * signatures, provenance states, normalized findings, summaries, and retained
 * bytes all agree between operating systems.
 */
export const verifyEvidenceAggregateParity = async ({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  leftRoot,
  rightRoot,
} = {}) => {
  if (typeof leftRoot !== "string" || typeof rightRoot !== "string") {
    throw new TypeError(
      "Evidence parity requires left and right aggregate roots",
    );
  }
  const left = resolve(repositoryRoot, leftRoot);
  const right = resolve(repositoryRoot, rightRoot);
  const lockfileBytes = await readFile(
    join(repositoryRoot, "package-lock.json"),
  );
  const [leftManifest, rightManifest] = await Promise.all([
    readManifest(left),
    readManifest(right),
  ]);
  const [leftSummary, rightSummary] = await Promise.all([
    verifyEvidenceManifest({
      manifest: leftManifest,
      lockfileBytes,
      blobRoot: join(left, "corpus"),
    }),
    verifyEvidenceManifest({
      manifest: rightManifest,
      lockfileBytes,
      blobRoot: join(right, "corpus"),
    }),
  ]);
  if (stableJson(leftManifest) !== stableJson(rightManifest)) {
    throw new Error(
      "Windows and Ubuntu npm evidence manifests are not canonically identical",
    );
  }
  return {
    corpusRoot: leftManifest.corpusRoot,
    summary: leftSummary,
    comparedSummaries: [leftSummary, rightSummary],
  };
};

export const parseParityArguments = (arguments_) => {
  if (!Array.isArray(arguments_)) {
    throw new TypeError("Evidence parity arguments must be an array");
  }
  const values = new Map();
  for (const argument of arguments_) {
    const match = /^(--(?:left|right))=(.+)$/u.exec(argument);
    if (!match) {
      throw new TypeError(`Unknown evidence parity argument: ${argument}`);
    }
    const [, key, value] = match;
    if (values.has(key)) {
      throw new TypeError(`Duplicate evidence parity argument: ${key}`);
    }
    values.set(key, value);
  }
  const leftRoot = values.get("--left");
  const rightRoot = values.get("--right");
  if (!leftRoot || !rightRoot) {
    throw new TypeError("Evidence parity requires --left and --right");
  }
  return { leftRoot, rightRoot };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const options = parseParityArguments(process.argv.slice(2));
    const result = await verifyEvidenceAggregateParity(options);
    process.stdout.write(stableJson({ status: "PARITY_VERIFIED", ...result }));
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
