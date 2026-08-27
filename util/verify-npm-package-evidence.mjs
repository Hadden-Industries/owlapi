import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { stableJson } from "./third-party-evidence/digests.mjs";
import { verifyEvidenceManifest } from "./third-party-evidence/evidence-manifest.mjs";

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

export const parseVerifierArguments = (arguments_) => {
  if (!Array.isArray(arguments_) || arguments_.length !== 0) {
    throw new TypeError(
      "The offline evidence verifier does not accept arguments; its repository paths are fixed",
    );
  }
  return {};
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export const verifyRepositoryEvidence = async ({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) => {
  const provenanceRoot = resolve(repositoryRoot, "docs", "provenance");
  const [manifest, schema, lockfileBytes] = await Promise.all([
    readJson(resolve(provenanceRoot, "npm-package-evidence.json")),
    readJson(resolve(provenanceRoot, "npm-package-evidence.schema.json")),
    readFile(resolve(repositoryRoot, "package-lock.json")),
  ]);

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    throw new Error(
      `npm package evidence manifest violates its schema:\n${stableJson(validate.errors)}`,
    );
  }

  return verifyEvidenceManifest({
    manifest,
    lockfileBytes,
    blobRoot: resolve(provenanceRoot, "evidence", "npm"),
  });
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    parseVerifierArguments(process.argv.slice(2));
    const summary = await verifyRepositoryEvidence();
    process.stdout.write(stableJson({ status: "VERIFIED", summary }));
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
