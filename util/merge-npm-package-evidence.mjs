import { constants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  compareCommittedEvidence,
  publishEvidence,
} from "./acquire-npm-package-evidence.mjs";
import { verifyBlob } from "./third-party-evidence/blob-store.mjs";
import {
  compareCodeUnits,
  stableJson,
} from "./third-party-evidence/digests.mjs";
import {
  createEvidenceManifest,
  verifyEvidenceManifest,
  verifyEvidenceShard,
} from "./third-party-evidence/evidence-manifest.mjs";
import { mergeEvidenceShardDocuments } from "./third-party-evidence/evidence-shards.mjs";
import { normalizeLockedRegistryGraph } from "./third-party-evidence/lock-graph.mjs";

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SHARD_MANIFEST_NAME = "npm-package-evidence-shard.json";
const AGGREGATE_MANIFEST_NAME = "npm-package-evidence.json";
const SCHEMA_ROOT = join(DEFAULT_REPOSITORY_ROOT, "docs", "provenance");

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

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const loadSchemaValidators = async () => {
  const [manifestSchema, shardSchema] = await Promise.all([
    readJson(join(SCHEMA_ROOT, "npm-package-evidence.schema.json")),
    readJson(join(SCHEMA_ROOT, "npm-package-evidence-shard.schema.json")),
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(manifestSchema);
  return {
    manifest: ajv.getSchema(manifestSchema.$id),
    shard: ajv.compile(shardSchema),
  };
};

const assertSchema = (validate, value, label) => {
  if (!validate(value)) {
    throw new TypeError(
      `${label} violates its schema:\n${stableJson(validate.errors)}`,
    );
  }
};

const discoverShardDirectories = async (inputRoot) => {
  const entries = await readdir(inputRoot, { withFileTypes: true });
  if (entries.length === 0 || entries.some((entry) => !entry.isDirectory())) {
    throw new TypeError(
      "Shard input must contain only non-empty per-shard directories",
    );
  }
  return entries
    .map(({ name }) => join(inputRoot, name))
    .sort(compareCodeUnits);
};

const copyShardBlobs = async ({ sources, destination }) => {
  const copied = new Set();
  for (const { shard, root } of sources) {
    for (const reference of shard.blobs) {
      // Blob paths are content-addressed independently of semantic reference
      // kind, so one byte sequence can legitimately satisfy several kinds.
      const identity = reference.sha256;
      if (copied.has(identity)) {
        continue;
      }
      const source = join(root, reference.path);
      const target = join(destination, reference.path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target, constants.COPYFILE_EXCL);
      await verifyBlob(destination, reference);
      copied.add(identity);
    }
  }
};

/**
 * Verify every downloaded shard independently before copying any content, then
 * reconstruct the one canonical full manifest. The temporary sibling makes a
 * failed merge invisible to later workflow steps and prevents stale partial
 * output from being mistaken for a successful aggregate.
 */
export const mergeEvidenceShardDirectories = async ({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  inputRoot,
  outputRoot,
  verifyCommitted = false,
  write = false,
} = {}) => {
  if (typeof inputRoot !== "string" || inputRoot.length === 0) {
    throw new TypeError("Shard merge requires an input root");
  }
  if (typeof outputRoot !== "string" || outputRoot.length === 0) {
    throw new TypeError("Shard merge requires an output root");
  }
  const absoluteInput = resolve(repositoryRoot, inputRoot);
  const absoluteOutput = resolve(repositoryRoot, outputRoot);
  if (await exists(absoluteOutput)) {
    throw new TypeError(`Aggregate output already exists: ${absoluteOutput}`);
  }
  const lockfileBytes = await readFile(
    join(repositoryRoot, "package-lock.json"),
  );
  const graph = normalizeLockedRegistryGraph(lockfileBytes);
  const validators = await loadSchemaValidators();
  const shardRoots = await discoverShardDirectories(absoluteInput);
  const sources = [];
  for (const root of shardRoots) {
    const shard = await readJson(join(root, SHARD_MANIFEST_NAME));
    assertSchema(validators.shard, shard, `Evidence shard at ${root}`);
    await verifyEvidenceShard({ shard, lockfileBytes, blobRoot: root });
    sources.push({ root, shard });
  }
  const merged = mergeEvidenceShardDocuments({
    graph,
    shards: sources.map(({ shard }) => shard),
  });
  const manifest = createEvidenceManifest({ graph, ...merged });
  assertSchema(validators.manifest, manifest, "Merged evidence manifest");

  const pending = `${absoluteOutput}.pending`;
  const corpusRoot = join(pending, "corpus");
  await rm(pending, { recursive: true, force: true });
  await mkdir(corpusRoot, { recursive: true });
  try {
    await copyShardBlobs({ sources, destination: corpusRoot });
    const summary = await verifyEvidenceManifest({
      manifest,
      lockfileBytes,
      blobRoot: corpusRoot,
    });
    await writeFile(
      join(pending, AGGREGATE_MANIFEST_NAME),
      stableJson(manifest),
      {
        flag: "wx",
      },
    );
    await rename(pending, absoluteOutput);

    if (verifyCommitted) {
      await compareCommittedEvidence({
        repositoryRoot,
        manifest,
        lockfileBytes,
      });
    }
    if (write) {
      await publishEvidence({
        repositoryRoot,
        stagingCorpus: join(absoluteOutput, "corpus"),
        manifest,
      });
    }
    return {
      manifest,
      summary,
      outputRoot: absoluteOutput,
      wrote: write,
      verifiedCommitted: verifyCommitted,
    };
  } catch (error) {
    await rm(pending, { recursive: true, force: true });
    if (await exists(absoluteOutput)) {
      await rm(absoluteOutput, { recursive: true, force: true });
    }
    throw error;
  }
};

export const parseMergeArguments = (arguments_) => {
  if (!Array.isArray(arguments_)) {
    throw new TypeError("Shard merge arguments must be an array");
  }
  const values = new Map();
  let verifyCommitted = false;
  let write = false;
  for (const argument of arguments_) {
    if (argument === "--verify-committed") {
      if (verifyCommitted) {
        throw new TypeError("Duplicate --verify-committed argument");
      }
      verifyCommitted = true;
      continue;
    }
    if (argument === "--write") {
      if (write) {
        throw new TypeError("Duplicate --write argument");
      }
      write = true;
      continue;
    }
    const match = /^(--(?:input|output))=(.+)$/u.exec(argument);
    if (!match) {
      throw new TypeError(`Unknown shard merge argument: ${argument}`);
    }
    const [, key, value] = match;
    if (values.has(key)) {
      throw new TypeError(`Duplicate shard merge argument: ${key}`);
    }
    values.set(key, value);
  }
  const inputRoot = values.get("--input");
  const outputRoot = values.get("--output");
  if (!inputRoot || !outputRoot) {
    throw new TypeError("Shard merge requires --input and --output");
  }
  if (write && verifyCommitted) {
    throw new TypeError(
      "--write and --verify-committed are mutually exclusive",
    );
  }
  return { inputRoot, outputRoot, verifyCommitted, write };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const options = parseMergeArguments(process.argv.slice(2));
    const result = await mergeEvidenceShardDirectories(options);
    process.stdout.write(
      stableJson({
        status: options.write
          ? "WRITTEN"
          : options.verifyCommitted
            ? "VERIFIED_COMMITTED"
            : "MERGED",
        corpusRoot: result.manifest.corpusRoot,
        summary: result.summary,
      }),
    );
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
