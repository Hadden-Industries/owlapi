import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pacote from "pacote";

import { downloadLockedRegistryTarball } from "./acquire-npm-package-evidence.mjs";
import {
  inspectPackageTarball,
  validateArchiveInventory,
} from "./third-party-evidence/archive-evidence.mjs";
import { retainBlob } from "./third-party-evidence/blob-store.mjs";
import {
  sha256,
  stableJson,
  verifySha512Sri,
} from "./third-party-evidence/digests.mjs";
import {
  createEvidenceManifest,
  verifyEvidenceManifest,
} from "./third-party-evidence/evidence-manifest.mjs";
import { normalizeLockedRegistryGraph } from "./third-party-evidence/lock-graph.mjs";

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MANIFEST_NAME = "npm-package-evidence.json";
const MAX_PARALLEL_ARCHIVES = 8;

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
const referenceKey = ({ kind, sha256: digest }) => `${kind}:${digest}`;

const assertArchiveFactsUnchanged = ({ previous, inventory, artifact }) => {
  const observedEvidenceFiles = inventory.evidenceFiles.map(
    ({ bytes: _bytes, ...evidence }) => evidence,
  );
  const retainedEvidenceFiles = previous.evidenceFiles.map(
    ({ blob: _blob, ...evidence }) => evidence,
  );
  if (stableJson(observedEvidenceFiles) !== stableJson(retainedEvidenceFiles)) {
    throw new Error(
      `Archive legal-evidence files changed for ${artifact.name}@${artifact.version}`,
    );
  }
  const reconstructedPrevious = {
    archiveRoot: inventory.archiveRoot,
    compressedBytes: inventory.compressedBytes,
    expandedBytes: inventory.expandedBytes,
    packageIdentity: inventory.packageIdentity,
    packageMetadata: inventory.packageMetadata,
    tarball: artifact.tarball,
    entries: inventory.entries,
    evidenceFiles: previous.evidenceFiles,
  };
  const previousWithoutOccurrences = { ...previous };
  delete previousWithoutOccurrences.duplicateEntries;
  delete previousWithoutOccurrences.physicalEntryCount;
  if (
    stableJson(reconstructedPrevious) !== stableJson(previousWithoutOccurrences)
  ) {
    throw new Error(
      `Re-inspected archive facts changed for ${artifact.name}@${artifact.version}`,
    );
  }
};

const completeArtifactArchive = async ({
  artifact,
  sourceCorpus,
  destinationCorpus,
  workRoot,
  cache,
  downloadTarball,
  fetchImpl,
  pacoteClient,
}) => {
  const tarballPath = join(workRoot, `${artifact.artifactId}.tgz`);
  await downloadTarball({
    identity: artifact,
    destination: tarballPath,
    cache,
    fetchImpl,
    pacoteClient,
  });
  try {
    const tarballBytes = await readFile(tarballPath);
    if (
      tarballBytes.length !== artifact.tarball.bytes ||
      sha256(tarballBytes) !== artifact.tarball.sha256
    ) {
      throw new Error(
        `Re-downloaded tarball digest changed for ${artifact.name}@${artifact.version}`,
      );
    }
    verifySha512Sri(tarballBytes, artifact.integrity);
    const inventory = await inspectPackageTarball(tarballPath, {
      name: artifact.name,
      version: artifact.version,
    });
    validateArchiveInventory(inventory);

    const previousEnvelope = await readJson(
      join(sourceCorpus, artifact.archive.evidence.path),
    );
    if (
      previousEnvelope?.schemaVersion !== 1 ||
      previousEnvelope?.kind !== "ARCHIVE_INVENTORY" ||
      previousEnvelope?.artifactId !== artifact.artifactId
    ) {
      throw new TypeError(
        `Invalid retained archive envelope for ${artifact.artifactId}`,
      );
    }
    assertArchiveFactsUnchanged({
      previous: previousEnvelope.evidence,
      inventory,
      artifact,
    });
    const envelope = {
      ...previousEnvelope,
      evidence: {
        ...previousEnvelope.evidence,
        duplicateEntries: inventory.duplicateEntries,
        physicalEntryCount: inventory.physicalEntryCount,
      },
    };
    return {
      ...(await retainBlob(destinationCorpus, stableJson(envelope))),
      kind: "ARCHIVE_INVENTORY",
    };
  } finally {
    await rm(tarballPath, { force: true });
  }
};

const completeArchives = async ({ artifacts, ...options }) => {
  const completed = new Array(artifacts.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < artifacts.length) {
      const index = nextIndex;
      nextIndex += 1;
      completed[index] = await completeArtifactArchive({
        artifact: artifacts[index],
        ...options,
      });
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_PARALLEL_ARCHIVES, artifacts.length) },
      worker,
    ),
  );
  return completed;
};

/**
 * Complete the archive-occurrence layer without rerunning ScanCode. Every
 * tarball is re-downloaded through its locked SRI, independently hashed and
 * re-inspected; every previously retained archive fact must remain identical.
 */
export const completeArchiveEvidenceAggregate = async ({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  inputRoot,
  outputRoot,
  downloadTarball = downloadLockedRegistryTarball,
  fetchImpl = fetch,
  pacoteClient = pacote,
} = {}) => {
  if (typeof inputRoot !== "string" || inputRoot.length === 0) {
    throw new TypeError("Archive completion requires an input root");
  }
  if (typeof outputRoot !== "string" || outputRoot.length === 0) {
    throw new TypeError("Archive completion requires an output root");
  }
  const absoluteInput = resolve(repositoryRoot, inputRoot);
  const absoluteOutput = resolve(repositoryRoot, outputRoot);
  if (absoluteInput === absoluteOutput) {
    throw new TypeError("Archive completion input and output must differ");
  }
  if (await exists(absoluteOutput)) {
    throw new TypeError(
      `Archive completion output already exists: ${absoluteOutput}`,
    );
  }

  const sourceManifestBytes = await readFile(
    join(absoluteInput, MANIFEST_NAME),
  );
  const manifest = JSON.parse(sourceManifestBytes.toString("utf8"));
  const lockfileBytes = await readFile(
    join(repositoryRoot, "package-lock.json"),
  );
  const sourceCorpus = join(absoluteInput, "corpus");
  await verifyEvidenceManifest({
    manifest,
    lockfileBytes,
    blobRoot: sourceCorpus,
    allowLegacyArchiveInventory: true,
  });

  const pending = `${absoluteOutput}.pending`;
  const destinationCorpus = join(pending, "corpus");
  const workRoot = join(pending, "work");
  const cache = join(workRoot, "cache");
  await rm(pending, { recursive: true, force: true });
  await mkdir(destinationCorpus, { recursive: true });
  await mkdir(workRoot, { recursive: true });
  try {
    const blobs = [];
    for (const reference of manifest.blobs) {
      if (reference.kind === "ARCHIVE_INVENTORY") {
        continue;
      }
      const retained = {
        ...(await retainBlob(
          destinationCorpus,
          await readFile(join(sourceCorpus, reference.path)),
        )),
        kind: reference.kind,
      };
      if (referenceKey(retained) !== referenceKey(reference)) {
        throw new Error(`Unchanged evidence blob changed: ${reference.path}`);
      }
      blobs.push(retained);
    }

    const archiveReferences = await completeArchives({
      artifacts: manifest.artifacts,
      sourceCorpus,
      destinationCorpus,
      workRoot,
      cache,
      downloadTarball,
      fetchImpl,
      pacoteClient,
    });
    blobs.push(...archiveReferences);
    const artifacts = manifest.artifacts.map((artifact, index) => ({
      ...artifact,
      archive: {
        ...artifact.archive,
        evidence: archiveReferences[index],
      },
    }));
    const canonicalManifest = createEvidenceManifest({
      graph: normalizeLockedRegistryGraph(lockfileBytes),
      policy: manifest.policy,
      registryKeys: manifest.registryKeys,
      artifacts,
      blobs,
    });
    const summary = await verifyEvidenceManifest({
      manifest: canonicalManifest,
      lockfileBytes,
      blobRoot: destinationCorpus,
    });
    await rm(workRoot, { recursive: true, force: true });
    await writeFile(
      join(pending, MANIFEST_NAME),
      stableJson(canonicalManifest),
      {
        flag: "wx",
      },
    );
    await rename(pending, absoluteOutput);
    return {
      manifest: canonicalManifest,
      summary,
      source: {
        corpusRoot: manifest.corpusRoot,
        manifestSha256: sha256(sourceManifestBytes),
      },
      output: {
        corpusRoot: canonicalManifest.corpusRoot,
        manifestSha256: sha256(stableJson(canonicalManifest)),
      },
    };
  } catch (error) {
    await rm(pending, { recursive: true, force: true });
    throw error;
  }
};

export const parseArchiveCompletionArguments = (arguments_) => {
  if (!Array.isArray(arguments_)) {
    throw new TypeError("Archive completion arguments must be an array");
  }
  const values = new Map();
  for (const argument of arguments_) {
    const match = /^(--(?:input|output))=(.+)$/u.exec(argument);
    if (!match) {
      throw new TypeError(`Unknown archive completion argument: ${argument}`);
    }
    if (values.has(match[1])) {
      throw new TypeError(`Duplicate archive completion argument: ${match[1]}`);
    }
    values.set(match[1], match[2]);
  }
  const inputRoot = values.get("--input");
  const outputRoot = values.get("--output");
  if (!inputRoot || !outputRoot) {
    throw new TypeError("Archive completion requires --input and --output");
  }
  return { inputRoot, outputRoot };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const result = await completeArchiveEvidenceAggregate(
      parseArchiveCompletionArguments(process.argv.slice(2)),
    );
    process.stdout.write(
      stableJson({
        status: "ARCHIVE_EVIDENCE_COMPLETED",
        source: result.source,
        output: result.output,
        summary: result.summary,
      }),
    );
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
