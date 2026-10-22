import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyRepositoryEvidence } from "../verify-npm-package-evidence.mjs";
import { readVerifiedBlob } from "./blob-store.mjs";
import { sha256 } from "./digests.mjs";
import { jsonEquals } from "../../scripts/canonical-json.mjs";

const evidenceRoot = "docs/provenance/evidence/npm";

/** Native ownership ends at an independently verified census and byte views.
 * JSON Quality owns checking, policy, budgets, reporting and write protection.
 */
async function provideEvidenceNamespace({ root, namespace = "" }) {
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
  const inventory = [],
    documents = [];
  for (const reference of references.values()) {
    const path = prefix(`${evidenceRoot}/${reference.path}`);
    const identity = {
      path,
      sha256: reference.sha256,
      byteLength: reference.bytes,
    };
    inventory.push({
      ...identity,
      source: { ...identity, kind: "content-addressed" },
    });
    documents.push({
      path,
      bytes: await readVerifiedBlob(join(sourceRoot, evidenceRoot), reference),
    });
  }
  for (const authority of authorities)
    if (!authority.bytes.equals(await readFile(join(root, authority.path))))
      throw new Error(
        `Native npm JSON authority changed during admission: ${authority.path}`,
      );
  return {
    inventory,
    documents,
    authorities: authorities.map(({ path, bytes }) => ({
      path,
      sha256: sha256(bytes),
      byteLength: bytes.length,
    })),
  };
}

/** The product and isolated tools use one schema, verifier and byte-view owner. */
export async function provideNpmEvidenceJson({ root }) {
  return provideEvidenceNamespace({ root });
}

/** The isolated artifact SDK graph uses the same verifier and JSON admission;
 * only its repository-relative namespace differs from the product graph.
 */
export async function provideArtifactToolEvidenceJson({ root }) {
  return provideEvidenceNamespace({
    root,
    namespace: "tooling/artifact-transport",
  });
}
