import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compareCodeUnits, sha256, stableJson } from "./digests.mjs";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const expectedReference = (digest, bytes) => ({
  sha256: digest,
  bytes,
  path: `blobs/sha256/${digest.slice(0, 2)}/${digest}`,
});

const validateReference = (reference) => {
  if (!reference || !SHA256_PATTERN.test(reference.sha256)) {
    throw new TypeError("Invalid evidence blob SHA-256");
  }
  if (!Number.isSafeInteger(reference.bytes) || reference.bytes < 0) {
    throw new TypeError("Invalid evidence blob byte length");
  }
  const expected = expectedReference(reference.sha256, reference.bytes);
  if (reference.path !== undefined && reference.path !== expected.path) {
    throw new TypeError("Evidence blob path does not match its SHA-256");
  }
  return expected;
};

const absoluteBlobPath = (root, reference) =>
  join(root, "blobs", "sha256", reference.sha256.slice(0, 2), reference.sha256);

export const verifyBlob = async (root, reference) => {
  const expected = validateReference(reference);
  const bytes = await readFile(absoluteBlobPath(root, expected));
  if (bytes.length !== expected.bytes) {
    throw new Error(
      `Evidence blob byte length mismatch for ${expected.sha256}`,
    );
  }
  if (sha256(bytes) !== expected.sha256) {
    throw new Error(`Evidence blob digest mismatch for ${expected.sha256}`);
  }
  return true;
};

export const retainBlob = async (root, value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const reference = expectedReference(sha256(bytes), bytes.length);
  const directory = join(root, "blobs", "sha256", reference.sha256.slice(0, 2));
  const destination = absoluteBlobPath(root, reference);
  await mkdir(directory, { recursive: true });

  try {
    await verifyBlob(root, reference);
    return reference;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error(
        `Existing evidence blob is corrupt at ${reference.path}`,
        { cause: error },
      );
    }
  }

  const temporary = join(
    directory,
    `.${reference.sha256}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    try {
      await rename(temporary, destination);
    } catch (error) {
      // A concurrent writer may have won the content-addressed destination.
      // Only accept that race after independently verifying the winning bytes.
      if (!new Set(["EEXIST", "EPERM"]).has(error?.code)) {
        throw error;
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
  await verifyBlob(root, reference);
  return reference;
};

export const computeCorpusRoot = (references) => {
  if (!Array.isArray(references)) {
    throw new TypeError("Corpus references must be an array");
  }
  const canonical = new Map();
  for (const reference of references) {
    const expected = validateReference(reference);
    if (typeof reference.kind !== "string" || reference.kind.length === 0) {
      throw new TypeError("Corpus reference must have a semantic kind");
    }
    const record = {
      sha256: expected.sha256,
      bytes: expected.bytes,
      kind: reference.kind,
    };
    canonical.set(stableJson(record), record);
  }
  const records = [...canonical.values()].sort((left, right) =>
    compareCodeUnits(stableJson(left), stableJson(right)),
  );
  return sha256(stableJson(records));
};
