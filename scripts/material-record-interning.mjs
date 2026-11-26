/** Intern archive and per-location rows while preserving exact material originals. */
import assert from "node:assert/strict";
import { stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

const hex = /^[a-f0-9]{64}$/u;
const hash = (text) => sha256Buffer(Buffer.from(text));
const bodyLimit = 16 * 1024 * 1024;

/** Add canonical originals to a shared table whose recipes carry their raw-byte hashes. */
export function createMaterialRecordInterner() {
  const tables = { materials: {}, artifacts: {}, dispositions: {} };
  function intern(row, dictionary) {
    const key = hash(stableJson(row));
    dictionary[key] = row;
    return key;
  }
  return {
    tables,
    add(key, text) {
      assert.match(key, hex);
      assert.ok(
        typeof text === "string" && Buffer.byteLength(text) <= bodyLimit,
      );
      assert.equal(hash(text), key, "Material original digest changed");
      if (Object.hasOwn(tables.materials, key)) return;
      const record = JSON.parse(text);
      assert.equal(
        stableJson(record),
        text,
        "Material requires canonical original bytes",
      );
      const { artifacts, decisions, ...header } = record;
      assert.ok(Array.isArray(artifacts) && Array.isArray(decisions));
      tables.materials[key] = {
        header,
        artifacts: artifacts.map((row) => intern(row, tables.artifacts)),
        dispositions: decisions.map((row) => intern(row, tables.dispositions)),
      };
    },
  };
}

/** Reconstruct exact bytes, controlling expansion before retaining an original. */
export function createMaterialRecordReconstructor(
  tables,
  { expansionLimit, label },
) {
  const originals = new Map(),
    artifacts = new Map(),
    dispositions = new Map();
  const limit = Math.min(bodyLimit, expansionLimit);
  let total = 0;
  function accountOriginal(text) {
    const size = Buffer.byteLength(text);
    total += size;
    assert.ok(
      size <= limit && total <= expansionLimit,
      `${label} expansion exceeds its bound`,
    );
  }
  function row(key, dictionary, seen, include) {
    assert.match(key, hex);
    assert.ok(
      Object.hasOwn(dictionary, key),
      `Missing ${label.toLowerCase()} row`,
    );
    const value = dictionary[key];
    if (!seen.has(key)) {
      const bytes = stableJson(value);
      assert.equal(hash(bytes), key, `${label} row digest changed`);
      seen.set(key, Buffer.byteLength(bytes));
    }
    include(seen.get(key));
    return value;
  }
  function open(key) {
    assert.match(key, hex);
    if (originals.has(key)) return originals.get(key);
    assert.ok(
      Object.hasOwn(tables.materials, key),
      `Missing ${label.toLowerCase()} recipe`,
    );
    const recipe = tables.materials[key];
    assert.deepEqual(Object.keys(recipe).sort(), [
      "artifacts",
      "dispositions",
      "header",
    ]);
    assert.ok(
      !Object.hasOwn(recipe.header, "artifacts") &&
        !Object.hasOwn(recipe.header, "decisions"),
    );
    assert.ok(
      Array.isArray(recipe.artifacts) && Array.isArray(recipe.dispositions),
    );
    let recordSize = Buffer.byteLength(stableJson(recipe.header));
    const include = (size) => {
      recordSize += size;
      assert.ok(
        recordSize <= limit && total + recordSize <= expansionLimit,
        `${label} expansion exceeds its bound`,
      );
    };
    const text = stableJson({
      ...recipe.header,
      artifacts: recipe.artifacts.map((key) =>
        row(key, tables.artifacts, artifacts, include),
      ),
      decisions: recipe.dispositions.map((key) =>
        row(key, tables.dispositions, dispositions, include),
      ),
    });
    accountOriginal(text);
    assert.equal(
      hash(text),
      key,
      `Could not reconstruct exact ${label.toLowerCase()} original`,
    );
    originals.set(key, text);
    return text;
  }
  function assertClosed() {
    for (const [used, declared] of [
      [originals, tables.materials],
      [artifacts, tables.artifacts],
      [dispositions, tables.dispositions],
    ]) {
      assert.deepEqual(
        [...used.keys()].sort(),
        Object.keys(declared).sort(),
        `Unrequested rows in the ${label.toLowerCase()} proof`,
      );
    }
  }
  return { open, accountOriginal, assertClosed };
}
