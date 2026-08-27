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

import { retainBlob } from "./third-party-evidence/blob-store.mjs";
import { sha256, stableJson } from "./third-party-evidence/digests.mjs";
import {
  createEvidenceManifest,
  verifyEvidenceManifest,
} from "./third-party-evidence/evidence-manifest.mjs";
import { normalizeLockedRegistryGraph } from "./third-party-evidence/lock-graph.mjs";
import {
  SCANCODE_NORMALIZATION_VERSION,
  canonicalizeScancodeFindings,
} from "./third-party-evidence/scancode.mjs";

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

const referenceKey = ({ kind, sha256: digest }) => `${kind}:${digest}`;

const rewriteEvidenceReference = (reference, rewritten) => {
  const replacement = rewritten.get(referenceKey(reference));
  if (replacement === undefined) {
    throw new Error(
      `Recanonicalization did not retain ${referenceKey(reference)}`,
    );
  }
  return replacement;
};

const recanonicalizeBlob = async ({
  sourceCorpus,
  destinationCorpus,
  reference,
}) => {
  const sourceBytes = await readFile(join(sourceCorpus, reference.path));
  let retainedBytes = sourceBytes;
  if (reference.kind === "SCANCODE_FINDINGS") {
    let envelope;
    try {
      envelope = JSON.parse(sourceBytes.toString("utf8"));
    } catch (error) {
      throw new Error(
        `ScanCode evidence is not valid JSON: ${reference.path}`,
        { cause: error },
      );
    }
    if (
      envelope?.schemaVersion !== 1 ||
      envelope?.kind !== "SCANCODE_FINDINGS" ||
      typeof envelope?.artifactId !== "string" ||
      envelope.artifactId.length === 0 ||
      !Object.hasOwn(envelope, "evidence")
    ) {
      throw new Error(`Invalid ScanCode evidence envelope: ${reference.path}`);
    }
    retainedBytes = Buffer.from(
      stableJson({
        ...envelope,
        evidence: canonicalizeScancodeFindings(envelope.evidence, {
          artifactId: envelope.artifactId,
        }),
      }),
    );
  }
  return {
    ...(await retainBlob(destinationCorpus, retainedBytes)),
    kind: reference.kind,
  };
};

/**
 * Rebuild a verified aggregate through the current pure ScanCode normalizer.
 * This path performs no network or scanner work: the authenticated source
 * corpus is checked first, every unchanged blob is copied by content digest,
 * and the complete result is verified again before its atomic publication.
 */
export const recanonicalizeEvidenceAggregate = async ({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  inputRoot,
  outputRoot,
} = {}) => {
  if (typeof inputRoot !== "string" || inputRoot.length === 0) {
    throw new TypeError("Recanonicalization requires an input root");
  }
  if (typeof outputRoot !== "string" || outputRoot.length === 0) {
    throw new TypeError("Recanonicalization requires an output root");
  }
  const absoluteInput = resolve(repositoryRoot, inputRoot);
  const absoluteOutput = resolve(repositoryRoot, outputRoot);
  if (absoluteInput === absoluteOutput) {
    throw new TypeError("Recanonicalization input and output must differ");
  }
  if (await exists(absoluteOutput)) {
    throw new TypeError(
      `Recanonicalization output already exists: ${absoluteOutput}`,
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
    allowLegacyScancodeNormalization: true,
  });

  const pending = `${absoluteOutput}.pending`;
  const destinationCorpus = join(pending, "corpus");
  await rm(pending, { recursive: true, force: true });
  await mkdir(destinationCorpus, { recursive: true });
  try {
    const rewritten = new Map();
    const blobs = [];
    for (const reference of manifest.blobs) {
      const replacement = await recanonicalizeBlob({
        sourceCorpus,
        destinationCorpus,
        reference,
      });
      rewritten.set(referenceKey(reference), replacement);
      blobs.push(replacement);
    }

    const artifacts = manifest.artifacts.map((artifact) => ({
      ...artifact,
      archive: {
        ...artifact.archive,
        evidence: rewriteEvidenceReference(
          artifact.archive.evidence,
          rewritten,
        ),
      },
      registrySignature: {
        ...artifact.registrySignature,
        evidence: rewriteEvidenceReference(
          artifact.registrySignature.evidence,
          rewritten,
        ),
      },
      provenance: {
        ...artifact.provenance,
        evidence: rewriteEvidenceReference(
          artifact.provenance.evidence,
          rewritten,
        ),
      },
      scan: {
        ...artifact.scan,
        evidence: rewriteEvidenceReference(artifact.scan.evidence, rewritten),
      },
    }));
    const policy = structuredClone(manifest.policy);
    policy.scanner.normalizationVersion = SCANCODE_NORMALIZATION_VERSION;
    const graph = normalizeLockedRegistryGraph(lockfileBytes);
    const canonicalManifest = createEvidenceManifest({
      graph,
      policy,
      registryKeys: manifest.registryKeys,
      artifacts,
      blobs,
    });
    const summary = await verifyEvidenceManifest({
      manifest: canonicalManifest,
      lockfileBytes,
      blobRoot: destinationCorpus,
      allowLegacyArchiveInventory: true,
    });
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

export const parseRecanonicalizeArguments = (arguments_) => {
  if (!Array.isArray(arguments_)) {
    throw new TypeError("Recanonicalization arguments must be an array");
  }
  const values = new Map();
  for (const argument of arguments_) {
    const match = /^(--(?:input|output))=(.+)$/u.exec(argument);
    if (!match) {
      throw new TypeError(`Unknown recanonicalization argument: ${argument}`);
    }
    const [, key, value] = match;
    if (values.has(key)) {
      throw new TypeError(`Duplicate recanonicalization argument: ${key}`);
    }
    values.set(key, value);
  }
  const inputRoot = values.get("--input");
  const outputRoot = values.get("--output");
  if (!inputRoot || !outputRoot) {
    throw new TypeError("Recanonicalization requires --input and --output");
  }
  return { inputRoot, outputRoot };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const options = parseRecanonicalizeArguments(process.argv.slice(2));
    const result = await recanonicalizeEvidenceAggregate(options);
    process.stdout.write(
      stableJson({
        status: "RECANONICALIZED",
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
