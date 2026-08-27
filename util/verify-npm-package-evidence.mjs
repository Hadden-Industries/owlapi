import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { stableJson } from "./third-party-evidence/digests.mjs";
import { ARCHIVE_LIMITS } from "./third-party-evidence/archive-evidence.mjs";
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

const maximum = (current, candidate) =>
  current === null || candidate.actual > current.actual ? candidate : current;

export const measureArchiveInventories = (records) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new TypeError("Archive measurements require at least one inventory");
  }
  const measurements = {
    compressedBytes: null,
    expandedBytes: null,
    entries: null,
    entryBytes: null,
    pathBytes: null,
    retainedEvidenceBytes: null,
  };
  let duplicateExtraEntryCount = 0;
  let duplicatePathCount = 0;
  let totalCompressedBytes = 0;
  let totalExpandedBytes = 0;
  let totalPhysicalEntryCount = 0;
  let totalRetainedEvidenceBytes = 0;
  for (const { artifact, inventory } of records) {
    const identity = {
      artifact: `${artifact.name}@${artifact.version}`,
      artifactId: artifact.artifactId,
    };
    measurements.compressedBytes = maximum(measurements.compressedBytes, {
      actual: inventory.compressedBytes,
      ...identity,
      limit: ARCHIVE_LIMITS.compressedBytes,
    });
    measurements.expandedBytes = maximum(measurements.expandedBytes, {
      actual: inventory.expandedBytes,
      ...identity,
      limit: ARCHIVE_LIMITS.expandedBytes,
    });
    measurements.entries = maximum(measurements.entries, {
      actual: inventory.physicalEntryCount,
      ...identity,
      limit: ARCHIVE_LIMITS.entries,
    });
    const retainedEvidenceBytes = inventory.evidenceFiles.reduce(
      (total, evidence) => total + evidence.size,
      0,
    );
    totalCompressedBytes += inventory.compressedBytes;
    totalExpandedBytes += inventory.expandedBytes;
    totalPhysicalEntryCount += inventory.physicalEntryCount;
    totalRetainedEvidenceBytes += retainedEvidenceBytes;
    duplicatePathCount += inventory.duplicateEntries.length;
    duplicateExtraEntryCount += inventory.duplicateEntries.reduce(
      (total, duplicate) => total + duplicate.occurrenceCount - 1,
      0,
    );
    measurements.retainedEvidenceBytes = maximum(
      measurements.retainedEvidenceBytes,
      {
        actual: retainedEvidenceBytes,
        ...identity,
        limit: ARCHIVE_LIMITS.retainedEvidenceBytes,
      },
    );
    for (const entry of inventory.entries) {
      measurements.entryBytes = maximum(measurements.entryBytes, {
        actual: entry.size,
        ...identity,
        limit: ARCHIVE_LIMITS.entryBytes,
        path: entry.path,
      });
      measurements.pathBytes = maximum(measurements.pathBytes, {
        actual: Buffer.byteLength(entry.path, "utf8"),
        ...identity,
        limit: ARCHIVE_LIMITS.pathBytes,
        path: entry.path,
      });
    }
  }
  return {
    artifactCount: records.length,
    duplicateExtraEntryCount,
    duplicatePathCount,
    ...measurements,
    totalCompressedBytes,
    totalExpandedBytes,
    totalPhysicalEntryCount,
    totalRetainedEvidenceBytes,
  };
};

export const measureRepositoryEvidence = async ({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) => {
  const provenanceRoot = resolve(repositoryRoot, "docs", "provenance");
  const manifest = await readJson(
    resolve(provenanceRoot, "npm-package-evidence.json"),
  );
  const blobRoot = resolve(provenanceRoot, "evidence", "npm");
  const records = await Promise.all(
    manifest.artifacts.map(async (artifact) => {
      const envelope = await readJson(
        join(blobRoot, artifact.archive.evidence.path),
      );
      if (
        envelope?.schemaVersion !== 1 ||
        envelope?.kind !== "ARCHIVE_INVENTORY" ||
        envelope?.artifactId !== artifact.artifactId
      ) {
        throw new TypeError(
          `Invalid archive measurement envelope for ${artifact.artifactId}`,
        );
      }
      return { artifact, inventory: envelope.evidence };
    }),
  );
  return measureArchiveInventories(records);
};

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
    const measurements = await measureRepositoryEvidence();
    process.stdout.write(
      stableJson({ status: "VERIFIED", summary, measurements }),
    );
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
