import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { provideMarkdownArchiveJson } from "./markdown-json-documents.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const producer = JSON.parse(
  readFileSync(join(root, "tooling/markdown/release-manifest.json")),
);
const sourceCommit = "5712d153079bfc840a918c7dd250afef820d9e07";
assert.equal(producer.source.head, sourceCommit);
assert.equal(producer.source.clean, true);
const expected = new Map();
for (const archive of producer.archives)
  for (const file of archive.files)
    if (/\.(?:json|jsonld|map|jsonc|json5|jsonl|ndjson)$/iu.test(file.path))
      expected.set(
        `tooling/markdown/archives/${archive.filename.slice(0, -4)}-${sourceCommit}.tgz!/package/${file.path}`,
        file,
      );

async function inventory(directory) {
  const supplied = await provideMarkdownArchiveJson({ root: directory });
  const entries = [];
  for await (const entry of supplied.inventory) entries.push(entry);
  return entries;
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-markdown-tuple-"));
  for (const path of [
    "tooling/markdown/package.json",
    "tooling/markdown/package-lock.json",
    "tooling/markdown/release-manifest.json",
    ...producer.archives.map(
      (archive) =>
        `tooling/markdown/archives/${archive.filename.slice(0, -4)}-${sourceCommit}.tgz`,
    ),
  ]) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    copyFileSync(join(root, path), join(directory, path));
  }
  return directory;
}

function closeFixture(directory) {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith("owlapi-markdown-tuple-"));
  rmSync(directory, { recursive: true, force: true });
}

test("the repaired clean-source tuple streams every independently inventoried JSON member from both platforms", async () => {
  const supplied = await provideMarkdownArchiveJson({ root });
  const entries = new Map(),
    authorities = new Set(),
    seen = new Set();
  for (const phase of ["authorities", "inventory", "documents"])
    assert.equal(typeof supplied[phase][Symbol.asyncIterator], "function");
  for await (const pin of supplied.authorities) {
    assert.equal(typeof pin.byteLength, "string");
    assert.equal(authorities.has(pin.path), false);
    authorities.add(pin.path);
  }
  assert.equal(authorities.size, 6);
  for await (const entry of supplied.inventory) {
    assert.equal(entries.has(entry.path), false);
    assert.equal(authorities.has(entry.source.path), true);
    const independent = expected.get(entry.path);
    assert.ok(independent, entry.path);
    assert.equal(entry.sha256, independent.sha256);
    assert.equal(entry.byteLength, String(independent.size));
    entries.set(entry.path, entry);
  }
  assert.equal(expected.size, 290);
  assert.deepEqual(new Set(entries.keys()), new Set(expected.keys()));
  assert.equal(
    new Set([...entries.values()].map((entry) => entry.source.path)).size,
    3,
  );
  for await (const document of supplied.documents) {
    assert.equal(seen.has(document.path), false);
    seen.add(document.path);
    const entry = entries.get(document.path),
      hash = createHash("sha256");
    let length = 0n;
    for await (const bytes of document.chunks) {
      assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 65536);
      hash.update(bytes);
      length += BigInt(bytes.length);
    }
    assert.equal(hash.digest("hex"), entry.sha256);
    assert.equal(String(length), entry.byteLength);
  }
  assert.deepEqual(seen, new Set(expected.keys()));
}, 30_000);

test.each([
  "locked version",
  "archive digest",
  "member path",
  "member digest",
  "source dirty",
])(
  "native tuple admission rejects changed %s",
  async (field) => {
    const directory = fixture();
    try {
      if (field === "locked version") {
        const path = join(directory, "tooling/markdown/package-lock.json"),
          lock = JSON.parse(readFileSync(path));
        lock.packages[
          "node_modules/@hadden-industries/markdown-quality"
        ].version = "999.0.0";
        writeFileSync(path, JSON.stringify(lock));
      } else {
        const path = join(directory, "tooling/markdown/release-manifest.json"),
          report = JSON.parse(readFileSync(path));
        if (field === "archive digest")
          report.archives[0].sha256 = "0".repeat(64);
        if (field === "member path")
          report.archives[0].files[0].path = "missing.json";
        if (field === "member digest")
          report.archives[0].files[0].sha256 = "0".repeat(64);
        if (field === "source dirty") report.source.clean = false;
        writeFileSync(path, JSON.stringify(report));
      }
      await assert.rejects(
        inventory(directory),
        /tuple|staged|source|member|archive|version/iu,
      );
    } finally {
      closeFixture(directory);
    }
  },
  30_000,
);

test("legacy report exclusions and unapproved archive selectors are not native parameters", async () => {
  for (const parameters of [{ temporaryReports: [] }, { archives: [] }])
    await assert.rejects(
      provideMarkdownArchiveJson({ root, parameters }),
      /Invalid native/u,
    );
});
