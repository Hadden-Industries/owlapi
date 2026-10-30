import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  provideNpmEvidenceJson,
  provideArtifactToolEvidenceJson,
} from "./json-documents.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

// Use the native blob registry as an independent membership oracle. The adapter
// traverses artifact references instead; no hand-maintained aggregate hash is needed.
const expectedCorpus = async (namespace) => {
  const prefix = (path) => (namespace ? `${namespace}/${path}` : path);
  const manifestPath = prefix("docs/provenance/npm-package-evidence.json");
  const manifestBytes = await readFile(join(root, manifestPath));
  const manifest = JSON.parse(manifestBytes);
  const blobs = new Map(manifest.blobs.map((blob) => [blob.path, blob]));
  assert.equal(blobs.size, manifest.blobs.length);
  const envelopeKinds = new Set([
    "ARCHIVE_INVENTORY",
    "NPM_PROVENANCE",
    "REGISTRY_SIGNATURE",
    "SCANCODE_FINDINGS",
  ]);
  const selected = new Map(
    [...blobs].filter(([, blob]) => envelopeKinds.has(blob.kind)),
  );
  const evidenceRoot = prefix("docs/provenance/evidence/npm");
  for (const blob of blobs.values()) {
    if (blob.kind !== "ARCHIVE_INVENTORY") continue;
    const archive = JSON.parse(
      await readFile(join(root, evidenceRoot, blob.path)),
    );
    for (const file of archive.evidence.evidenceFiles) {
      if (!file.path.endsWith(".map")) continue;
      assert.deepEqual(file.blob, blobs.get(file.blob.path));
      selected.set(file.blob.path, file.blob);
    }
  }
  const members = new Map(
    [...selected.values()].map((blob) => {
      const path = `${evidenceRoot}/${blob.path}`;
      return [
        path,
        { path, sha256: blob.sha256, byteLength: String(blob.bytes) },
      ];
    }),
  );
  const authorities = new Map(members);
  for (const path of [
    manifestPath,
    "docs/provenance/npm-package-evidence.schema.json",
    prefix("package-lock.json"),
  ]) {
    const bytes =
      path === manifestPath ? manifestBytes : await readFile(join(root, path));
    authorities.set(path, {
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: String(bytes.length),
    });
  }
  return { members, authorities };
};

for (const [provider, namespace] of [
  [provideNpmEvidenceJson, ""],
  [provideArtifactToolEvidenceJson, "tooling/artifact-transport"],
])
  test(`${provider.name} streams the complete reviewed census and exact bodies`, async () => {
    const expected = await expectedCorpus(namespace);
    const supplied = await provider({ root }),
      authorities = new Map(),
      inventory = new Map();
    for (const phase of ["authorities", "inventory", "documents"])
      assert.equal(typeof supplied[phase][Symbol.asyncIterator], "function");
    for await (const pin of supplied.authorities) {
      assert.equal(authorities.has(pin.path), false);
      authorities.set(pin.path, pin);
    }
    assert.deepEqual(authorities, expected.authorities);
    for await (const member of supplied.inventory) {
      assert.equal(inventory.has(member.path), false);
      assert.equal(member.source.kind, "content-addressed");
      const authority = authorities.get(member.source.path);
      assert.ok(authority);
      assert.equal(member.source.sha256, authority.sha256);
      assert.equal(member.source.byteLength, authority.byteLength);
      const expectedMember = expected.members.get(member.path);
      assert.ok(expectedMember);
      assert.deepEqual(member, {
        ...expectedMember,
        source: { ...expectedMember, kind: "content-addressed" },
      });
      inventory.set(member.path, member);
    }
    assert.deepEqual(
      new Set(inventory.keys()),
      new Set(expected.members.keys()),
    );
    const seen = new Set();
    let total = 0n;
    for await (const document of supplied.documents) {
      assert.equal(seen.has(document.path), false);
      seen.add(document.path);
      const member = expected.members.get(document.path),
        hash = createHash("sha256");
      assert.ok(member);
      let length = 0n;
      for await (const chunk of document.chunks) {
        assert.ok(Buffer.isBuffer(chunk) && chunk.length <= 65536);
        hash.update(chunk);
        length += BigInt(chunk.length);
      }
      assert.equal(hash.digest("hex"), member.sha256);
      assert.equal(String(length), member.byteLength);
      total += length;
    }
    assert.deepEqual(seen, new Set(inventory.keys()));
    assert.equal(
      total,
      [...expected.members.values()].reduce(
        (sum, member) => sum + BigInt(member.byteLength),
        0n,
      ),
    );
  }, 120000);

// Admission verifies the same full corpus as the census tests above.
test("cancelled native evidence delivery cannot yield an authority", async () => {
  const controller = new AbortController();
  const supplied = await provideNpmEvidenceJson({
    root,
    signal: controller.signal,
  });
  controller.abort(new Error("Stopped native delivery"));
  await assert.rejects(async () => {
    for await (const pin of supplied.authorities) assert.fail(pin.path);
  }, /Stopped native delivery/);
}, 120000);
