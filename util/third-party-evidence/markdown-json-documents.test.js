import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { provideMarkdownArchiveJson } from "./markdown-json-documents.mjs";
import { sha256 } from "./digests.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const policy = JSON.parse(
  readFileSync(new URL("../../.json-quality.json", import.meta.url)),
);
const parameters = policy.nativeSources.find(
  (source) => source.id === "markdown-archives",
).parameters;

test("both platform archives remain fully inventoried regardless of installed platform", async () => {
  const supplied = await provideMarkdownArchiveJson({ root, parameters });
  assert.equal(supplied.inventory.length, 24);
  assert.equal(supplied.documents.length, 24);
  assert.equal(supplied.authorities.length, 2);
  const sourcePaths = new Set(
    supplied.inventory.map((entry) => entry.source.path),
  );
  assert.equal(sourcePaths.size, 3);
  for (const entry of supplied.inventory) {
    const bytes = supplied.documents.find(
      (document) => document.path === entry.path,
    ).bytes;
    assert.equal(sha256(bytes), entry.sha256);
    assert.equal(bytes.length, entry.byteLength);
  }
});

test.each(["version", "sha256", "memberPath"])(
  "temporary original-report boundaries reject changed %s",
  async (field) => {
    const changed = structuredClone(parameters);
    changed.temporaryReports[0][field] =
      field === "sha256" ? "0".repeat(64) : "changed";
    await assert.rejects(
      provideMarkdownArchiveJson({ root, parameters: changed }),
      /Remove the temporary/u,
    );
  },
);

test("native parameters cannot silently change archive selection", async () => {
  await assert.rejects(
    provideMarkdownArchiveJson({
      root,
      parameters: { ...parameters, archives: [] },
    }),
    /Invalid native/u,
  );
});
