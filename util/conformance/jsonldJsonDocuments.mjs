import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertW3cSource } from "./w3cSource.mjs";
import { sha256 } from "../third-party-evidence/digests.mjs";

const containerPath = "docs/conformance/generated/w3c-jsonld.json";
const manifestPath =
  "docs/conformance/upstream/w3c-json-ld-api/tests/toRdf-manifest.jsonld";
const identitiesPath =
  "docs/conformance/upstream/w3c-jsonld-source-identities.json";
const originalManifestSha256 =
  "2b8b602eef56b0c307422bcf644477c11a299b3d0188be265e097ad64eb843af";
const revision = "ffdb326121ea89b7b8280e76a5caea923834bcef";
const base = "https://w3c.github.io/json-ld-api/tests/";
const pointerToken = (value) =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");

/** Native conformance provenance supplies the independent source census.
 * The shared engine reconciles each buffer with its actual container pointer.
 */
export async function provideJsonLdLogicalJson({ root }) {
  const snapshots = await Promise.all(
    [containerPath, manifestPath, identitiesPath].map(async (path) => ({
      path,
      bytes: await readFile(join(root, path)),
    })),
  );
  if (sha256(snapshots[1].bytes) !== originalManifestSha256)
    throw new Error("JSON-LD original manifest identity changed");
  const [corpus, manifest, identities] = snapshots.map(({ bytes }) =>
    JSON.parse(bytes),
  );
  if (
    corpus.revision !== revision ||
    corpus.tests.length !== manifest.sequence.length
  )
    throw new Error("JSON-LD test census differs from original manifest");
  const expectedResources = new Set(
    identities.sources
      .filter(
        (entry) =>
          /\.json(?:ld)?$/u.test(entry.path) &&
          (entry.path.startsWith("tests/toRdf/") ||
            ["tests/context.jsonld", "tests/vocab_context.jsonld"].includes(
              entry.path,
            )),
      )
      .map((entry) => new URL(entry.path.slice("tests/".length), base).href),
  );
  if (
    Object.keys(corpus.resources).length !== expectedResources.size ||
    Object.keys(corpus.resources).some((url) => !expectedResources.has(url))
  )
    throw new Error(
      "JSON-LD resource census differs from original source inventory",
    );
  const logicalInventory = [],
    logicalDocuments = [];
  const add = (path, pointer, source, url) => {
    if (typeof source !== "string")
      throw new Error(`Missing original JSON-LD source: ${path}`);
    const bytes = Buffer.from(source);
    assertW3cSource(bytes, url, revision);
    logicalInventory.push({
      path,
      sha256: sha256(bytes),
      byteLength: bytes.length,
      containerPath,
      pointer,
      encoding: "utf8",
    });
    logicalDocuments.push({ path, bytes });
  };
  for (const url of [...expectedResources].sort()) {
    const relative = new URL(url).pathname.slice("/json-ld-api/tests/".length);
    add(
      `logical/w3c-jsonld/resources/${relative}`,
      `/resources/${pointerToken(url)}`,
      corpus.resources[url],
      url,
    );
  }
  for (const [index, entry] of manifest.sequence.entries()) {
    const fixture = corpus.tests[index];
    const id = entry["@id"].replace(/^#t/u, "");
    if (
      fixture.id !== id ||
      fixture.action !== entry.input ||
      fixture.result !== entry.expect
    )
      throw new Error(
        `JSON-LD fixture provenance differs from original manifest: ${id}`,
      );
    add(
      `logical/w3c-jsonld/tests/${id}/source.jsonld`,
      `/tests/${index}/source`,
      fixture.source,
      new URL(entry.input, base).href,
    );
    if (entry.expect)
      assertW3cSource(
        Buffer.from(fixture.expected),
        new URL(entry.expect, base).href,
        revision,
      );
  }
  for (const snapshot of snapshots)
    if (!snapshot.bytes.equals(await readFile(join(root, snapshot.path))))
      throw new Error(`JSON-LD source authority changed: ${snapshot.path}`);
  return { logicalInventory, logicalDocuments };
}
