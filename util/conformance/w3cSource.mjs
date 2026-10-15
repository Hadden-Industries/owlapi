import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const identities = new Map();
for (const [name, repository, prefix] of [
  ["rdf", "rdf-tests", "rdf/"],
  ["jsonld", "json-ld-api", "tests/"],
]) {
  const inventory = JSON.parse(
    readFileSync(
      new URL(
        `../../docs/conformance/upstream/w3c-${name}-source-identities.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (
    inventory.schemaVersion !== 1 ||
    inventory.repository !== `https://github.com/w3c/${repository}.git` ||
    !inventory.sources.length
  )
    throw new Error("Invalid pinned W3C RDF source inventory");
  for (const entry of inventory.sources) {
    if (
      !/^[a-f0-9]{40}$/u.test(entry.revision) ||
      !/^[a-f0-9]{40}$/u.test(entry.gitBlob) ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 0 ||
      !entry.path.startsWith(prefix) ||
      entry.path
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Invalid original W3C source identity");
    const key = `${repository}:${entry.revision}:${entry.path}`;
    if (identities.has(key))
      throw new Error("Duplicate original W3C source identity");
    identities.set(key, entry);
  }
}

/** Native fixture provenance: accept original pinned Git bytes, including any
 * intentional CRLF or BOM. Never infer original bytes from a converted checkout.
 */
export function assertW3cSource(bytes, sourceIRI, revision) {
  const url = new URL(sourceIRI);
  const reference = /^\/(rdf-tests\/rdf\/|json-ld-api\/tests\/)/u.exec(
    url.pathname,
  );
  if (
    url.origin !== "https://w3c.github.io" ||
    !reference ||
    url.search ||
    url.hash
  )
    throw new Error("Unsupported original W3C source reference");
  const repository = reference[1].split("/")[0];
  const path = decodeURIComponent(url.pathname.slice(repository.length + 2));
  const expected = identities.get(`${repository}:${revision}:${path}`);
  const blob = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  if (
    !expected ||
    bytes.length !== expected.byteLength ||
    blob !== expected.gitBlob ||
    createHash("sha256").update(bytes).digest("hex") !== expected.sha256
  )
    throw new Error(
      `W3C source does not match its pinned original Git bytes: ${revision}:${path}`,
    );
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    bytes,
  );
}

export async function readW3cSource(inputPath, sourceIRI, revision) {
  return assertW3cSource(await readFile(inputPath), sourceIRI, revision);
}
