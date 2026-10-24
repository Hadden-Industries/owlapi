import assert from "node:assert/strict";
import {
  w3cSourceIdentity,
  w3cSourceIdentities,
  w3cInventoryIdentity,
} from "./w3cSource.mjs";

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
const isResource = (entry) =>
  /\.json(?:ld)?$/u.test(entry.path) &&
  (entry.path.startsWith("tests/toRdf/") ||
    ["tests/context.jsonld", "tests/vocab_context.jsonld"].includes(
      entry.path,
    ));

async function scalar(access, value) {
  const range = await access.read(value, "decoded-utf8", "0", "4096");
  assert.equal(
    range.totalByteLength,
    String(range.bytes.length),
    "Oversized provenance metadata",
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(range.bytes);
}

function sourcePin(sourceIRI) {
  const pin = w3cSourceIdentity(sourceIRI, revision);
  return { sha256: pin.sha256, byteLength: String(pin.byteLength) };
}

function assertOriginal(value, sourceIRI) {
  const pin = sourcePin(sourceIRI);
  assert.equal(value.valueKind, "string", "Missing original JSON-LD source");
  assert.equal(
    value.sha256,
    pin.sha256,
    "Changed pinned original source bytes",
  );
  assert.equal(
    value.byteLength,
    pin.byteLength,
    "Changed pinned original source length",
  );
  return pin;
}

/** This finite control is independently pinned before conversion. The native
 * owner validates every consumed field; the original hash admits the complete
 * unchanged W3C manifest, including fields unused by this projection.
 */
function admitManifest(manifest) {
  assert.ok(
    manifest && typeof manifest === "object" && !Array.isArray(manifest),
  );
  assert.ok(Array.isArray(manifest.sequence) && manifest.sequence.length > 0);
  for (const entry of manifest.sequence) {
    assert.match(entry["@id"], /^#t[A-Za-z0-9_-]+$/u);
    for (const key of [
      "input",
      ...(entry.expect === undefined ? [] : ["expect"]),
    ]) {
      assert.equal(typeof entry[key], "string");
      assert.ok(
        entry[key].length <= 4096 &&
          !entry[key].split("/").some((part) => part === ".."),
      );
      w3cSourceIdentity(new URL(entry[key], base).href, revision);
    }
  }
  return true;
}

/** Inspect immutable captured sources. The existing W3C owner supplies original
 * pins; native linked-source admission checks their actual decoded bytes.
 * Immediate-child iteration detects extra resources/tests without a whole corpus
 * object, sorted body map or growing duplicate census in JavaScript.
 */
export async function* capturedJsonLdInventory(access) {
  const corpus = await access.capturedSource(containerPath);
  const manifestSource = await access.capturedSource(manifestPath);
  const identities = await access.capturedSource(identitiesPath);
  assert.equal(
    manifestSource.sha256,
    originalManifestSha256,
    "Original manifest identity changed",
  );
  const inventoryPin = w3cInventoryIdentity("json-ld-api");
  assert.equal(
    identities.sha256,
    inventoryPin.sha256,
    "Pinned original source inventory changed",
  );
  assert.equal(identities.byteLength, inventoryPin.byteLength);
  assert.equal(
    await scalar(access, await access.select(corpus, "/revision")),
    revision,
  );
  let expectedResources = 0,
    actualResources = 0;
  for (const entry of w3cSourceIdentities("json-ld-api", revision))
    if (isResource(entry)) expectedResources++;
  assert.ok(expectedResources > 0);
  for await (const child of access.children(
    await access.select(corpus, "/resources"),
  )) {
    access.signal?.throwIfAborted();
    const url = await scalar(access, child.name);
    const original = w3cSourceIdentity(url, revision);
    assert.ok(isResource(original), "Unexpected JSON-LD resource provenance");
    assert.equal(
      url,
      new URL(original.path.slice("tests/".length), base).href,
      "Noncanonical JSON-LD resource provenance identity",
    );
    const pin = assertOriginal(child.value, url);
    actualResources++;
    const relative = new URL(url).pathname.slice("/json-ld-api/tests/".length);
    yield {
      path: `logical/w3c-jsonld/resources/${relative}`,
      containerPath,
      pointer: `/resources/${pointerToken(url)}`,
      encoding: "utf8",
      ...pin,
    };
  }
  assert.equal(
    actualResources,
    expectedResources,
    "JSON-LD resource census differs from original source inventory",
  );
  const lease = await access.materializeControl(
    await access.select(manifestSource),
    "262144",
    admitManifest,
  );
  try {
    let count = 0;
    for await (const child of access.children(
      await access.select(corpus, "/tests"),
    )) {
      access.signal?.throwIfAborted();
      const index = count++,
        entry = lease.value.sequence[index];
      assert.ok(entry, "Extra JSON-LD fixture absent from original manifest");
      const prefix = `/tests/${index}`,
        id = entry["@id"].replace(/^#t/u, "");
      assert.equal(
        await scalar(access, await access.select(corpus, `${prefix}/id`)),
        id,
        "Fixture provenance differs from original manifest",
      );
      assert.equal(
        await scalar(access, await access.select(corpus, `${prefix}/action`)),
        entry.input,
        "Fixture action provenance differs from original manifest",
      );
      assert.equal(child.ordinal, String(index));
      let result;
      try {
        result = await scalar(
          access,
          await access.select(corpus, `${prefix}/result`),
        );
      } catch (error) {
        if (!/pointer-not-found/u.test(error.message)) throw error;
      }
      assert.equal(
        result,
        entry.expect,
        "Fixture result provenance differs from original manifest",
      );
      const pin = assertOriginal(
        await access.select(corpus, `${prefix}/source`),
        new URL(entry.input, base).href,
      );
      if (entry.expect)
        assertOriginal(
          await access.select(corpus, `${prefix}/expected`),
          new URL(entry.expect, base).href,
        );
      yield {
        path: `logical/w3c-jsonld/tests/${id}/source.jsonld`,
        containerPath,
        pointer: `${prefix}/source`,
        encoding: "utf8",
        ...pin,
      };
    }
    assert.equal(
      count,
      lease.value.sequence.length,
      "Missing original JSON-LD fixture",
    );
  } finally {
    await lease.release();
  }
}

export const jsonLdContainerPaths = Object.freeze([
  containerPath,
  manifestPath,
  identitiesPath,
]);
