import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { provideJsonLdLogicalJson } from "./jsonldJsonDocuments.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const corpusPath = "docs/conformance/generated/w3c-jsonld.json";
const manifestPath =
  "docs/conformance/upstream/w3c-json-ld-api/tests/toRdf-manifest.jsonld";
const identitiesPath =
  "docs/conformance/upstream/w3c-jsonld-source-identities.json";

test("the native owner supplies all original resource/source views with actual pointers", async () => {
  const supplied = await provideJsonLdLogicalJson({ root });
  assert.equal(supplied.logicalInventory.length, 961);
  assert.equal(supplied.logicalDocuments.length, 961);
  assert.equal(
    new Set(supplied.logicalInventory.map((entry) => entry.path)).size,
    961,
  );
  const corpus = JSON.parse(readFileSync(join(root, corpusPath)));
  for (const entry of supplied.logicalInventory) {
    let value = corpus;
    for (const token of entry.pointer.slice(1).split("/"))
      value = value[token.replaceAll("~1", "/").replaceAll("~0", "~")];
    assert.ok(
      supplied.logicalDocuments
        .find((document) => document.path === entry.path)
        .bytes.equals(Buffer.from(value)),
    );
  }
});

test.each([
  "omitted resource",
  "changed source",
  "reordered fixtures",
  "converted manifest",
])(
  "native source admission rejects %s before shared analysis",
  async (mutation) => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "owlapi-original-jsonld-"));
    try {
      for (const path of [corpusPath, manifestPath, identitiesPath]) {
        mkdirSync(dirname(join(fixtureRoot, path)), { recursive: true });
        writeFileSync(join(fixtureRoot, path), readFileSync(join(root, path)));
      }
      if (mutation === "converted manifest") {
        writeFileSync(
          join(fixtureRoot, manifestPath),
          readFileSync(join(root, manifestPath), "utf8").replaceAll(
            "\n",
            "\r\n",
          ),
        );
      } else {
        const corpus = JSON.parse(readFileSync(join(fixtureRoot, corpusPath)));
        if (mutation === "omitted resource")
          delete corpus.resources[Object.keys(corpus.resources)[0]];
        if (mutation === "changed source") corpus.tests[0].source += " ";
        if (mutation === "reordered fixtures")
          [corpus.tests[0], corpus.tests[1]] = [
            corpus.tests[1],
            corpus.tests[0],
          ];
        writeFileSync(join(fixtureRoot, corpusPath), JSON.stringify(corpus));
      }
      await assert.rejects(
        provideJsonLdLogicalJson({ root: fixtureRoot }),
        /original|provenance|pinned/u,
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true });
    }
  },
);
