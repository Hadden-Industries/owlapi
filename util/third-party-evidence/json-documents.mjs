import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { verifyRepositoryEvidence } from "../verify-npm-package-evidence.mjs";
import { readVerifiedBlob } from "./blob-store.mjs";
import { sha256 } from "./digests.mjs";
import { jsonEquals } from "../../scripts/canonical-json.mjs";

const evidenceRoot = "docs/provenance/evidence/npm";

/** Native ownership ends at an independently verified census and byte views.
 * JSON Quality owns checking, policy, budgets, reporting and write protection.
 */
async function provideEvidenceNamespace({ root, namespace = "", signal }) {
  const prefix = (path) => (namespace ? `${namespace}/${path}` : path);
  const sourceRoot = join(root, namespace);
  const authorityPaths = [
    prefix("docs/provenance/npm-package-evidence.json"),
    "docs/provenance/npm-package-evidence.schema.json",
    prefix("package-lock.json"),
  ];
  const authorities = await Promise.all(
    authorityPaths.map(async (path) => ({
      path,
      bytes: await readFile(join(root, path)),
    })),
  );
  await verifyRepositoryEvidence({
    repositoryRoot: sourceRoot,
    schemaPath: join(root, "docs/provenance/npm-package-evidence.schema.json"),
  });
  const manifest = JSON.parse(authorities[0].bytes);
  const references = new Map();
  const add = (reference) => {
    const prior = references.get(reference.path);
    if (prior && !jsonEquals(prior, reference))
      throw new Error(`Conflicting native JSON reference: ${reference.path}`);
    references.set(reference.path, reference);
  };
  for (const artifact of manifest.artifacts) {
    for (const section of [
      "archive",
      "provenance",
      "registrySignature",
      "scan",
    ])
      add(artifact[section].evidence);
    const archive = JSON.parse(
      await readVerifiedBlob(
        join(sourceRoot, evidenceRoot),
        artifact.archive.evidence,
      ),
    );
    for (const file of archive.evidence.evidenceFiles)
      if (file.path.endsWith(".map")) add(file.blob);
  }
  for (const authority of authorities)
    if (!authority.bytes.equals(await readFile(join(root, authority.path))))
      throw new Error(
        `Native npm JSON authority changed during admission: ${authority.path}`,
      );
  const memberIdentity = (reference) => ({
    path: prefix(`${evidenceRoot}/${reference.path}`),
    sha256: reference.sha256,
    byteLength: String(reference.bytes),
  });
  // The existing finite domain verifier owns manifest/reference metadata. Body
  // buffers no longer accumulate here; the core captures and reconciles each
  // independently pinned authority before consuming its bounded member stream.
  return {
    authorities: (async function* () {
      for (const { path, bytes } of authorities) {
        signal?.throwIfAborted();
        yield { path, sha256: sha256(bytes), byteLength: String(bytes.length) };
      }
      for (const reference of references.values()) {
        signal?.throwIfAborted();
        yield memberIdentity(reference);
      }
    })(),
    inventory: (async function* () {
      for (const reference of references.values()) {
        signal?.throwIfAborted();
        const identity = memberIdentity(reference);
        yield {
          ...identity,
          source: { ...identity, kind: "content-addressed" },
        };
      }
    })(),
    documents: (async function* () {
      for (const reference of references.values()) {
        signal?.throwIfAborted();
        yield {
          path: memberIdentity(reference).path,
          chunks: (async function* () {
            const stream = createReadStream(
              join(sourceRoot, evidenceRoot, reference.path),
              { highWaterMark: 65536, signal },
            );
            try {
              yield* stream;
            } finally {
              stream.destroy();
            }
          })(),
        };
      }
    })(),
  };
}

/** The product and isolated tools use one schema, verifier and byte-view owner. */
export async function provideNpmEvidenceJson({ root, signal }) {
  return provideEvidenceNamespace({ root, signal });
}

/** The isolated artifact SDK graph uses the same verifier and JSON admission;
 * only its repository-relative namespace differs from the product graph.
 */
export async function provideArtifactToolEvidenceJson({ root, signal }) {
  return provideEvidenceNamespace({
    root,
    namespace: "tooling/artifact-transport",
    signal,
  });
}
