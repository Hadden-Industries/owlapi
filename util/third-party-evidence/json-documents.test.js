import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  provideNpmEvidenceJson,
  provideArtifactToolEvidenceJson,
} from "./json-documents.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

// Independent frozen census from the original e113c3f5 provider, compared
// byte-for-byte before migration. Updating native evidence requires reviewing
// this expectation with its owner, rather than deriving it from this adapter.
for (const [provider, count, bytes, census] of [
  [
    provideNpmEvidenceJson,
    2748,
    "66139414",
    "cc666e0dc2f9caca742161b1a30f83ba58c5c2a31cdc4085701a606d8bc5df1d",
  ],
  [
    provideArtifactToolEvidenceJson,
    976,
    "32327222",
    "4341806e6b3ada1de54ae48532996baa9f8a253533ccc7f64a3aeb867475b395",
  ],
])
  test(`${provider.name} streams the complete original census and exact bodies`, async () => {
    const supplied = await provider({ root }),
      authorities = new Map(),
      inventory = new Map();
    for (const phase of ["authorities", "inventory", "documents"])
      assert.equal(typeof supplied[phase][Symbol.asyncIterator], "function");
    for await (const pin of supplied.authorities) {
      assert.equal(authorities.has(pin.path), false);
      authorities.set(pin.path, pin);
    }
    assert.equal(authorities.size, count + 3);
    for await (const member of supplied.inventory) {
      assert.equal(inventory.has(member.path), false);
      assert.equal(member.source.kind, "content-addressed");
      const authority = authorities.get(member.source.path);
      assert.ok(authority);
      assert.equal(member.source.sha256, authority.sha256);
      assert.equal(member.source.byteLength, authority.byteLength);
      inventory.set(member.path, member);
    }
    assert.equal(inventory.size, count);
    const fingerprint = createHash("sha256");
    for (const member of [...inventory.values()].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ))
      fingerprint.update(
        member.path + "\0" + member.sha256 + "\0" + member.byteLength + "\n",
      );
    assert.equal(fingerprint.digest("hex"), census);
    const seen = new Set();
    let total = 0n;
    for await (const document of supplied.documents) {
      assert.equal(seen.has(document.path), false);
      seen.add(document.path);
      const member = inventory.get(document.path),
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
    assert.equal(String(total), bytes);
  }, 30000);

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
});
