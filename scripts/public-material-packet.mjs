/** Share byte-identical measurements across the material decisions of a public run. */
import assert from "node:assert/strict";
import { stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

const hex = /^[a-f0-9]{64}$/u;
const keys = (value) => Object.keys(value).sort();
const digest = (value) => sha256Buffer(Buffer.from(value));
const bodyLimit = 16 * 1024 * 1024;
const expansionLimit = 96 * 1024 * 1024;

function original(digests, key) {
  assert.match(key, hex);
  const text = digests[key];
  assert.ok(
    typeof text === "string" && Buffer.byteLength(text) <= bodyLimit,
    "Missing or oversized public material original",
  );
  assert.equal(digest(text), key, "Public material original digest changed");
  return text;
}

export function packPublicMaterial({ input, origin, lanes, originals }) {
  const decisions = {},
    materials = {},
    artifacts = {},
    dispositions = {},
    used = new Set();
  const index = (row, dictionary) => {
    const key = digest(stableJson(row));
    dictionary[key] = row;
    return key;
  };
  for (const lane of Object.values(lanes)) {
    for (const key of Object.values(lane.decisions)) {
      const decision = original(originals, key);
      decisions[key] = decision;
      const { materialSha256 } = JSON.parse(decision);
      used.add(key);
      used.add(materialSha256);
      if (Object.hasOwn(materials, materialSha256)) continue;
      const text = original(originals, materialSha256);
      const record = JSON.parse(text);
      assert.equal(
        stableJson(record),
        text,
        "Public material decisions must retain a canonical original",
      );
      const {
        artifacts: archiveRows,
        decisions: locationRows,
        ...header
      } = record;
      assert.ok(Array.isArray(archiveRows) && Array.isArray(locationRows));
      materials[materialSha256] = {
        header,
        artifacts: archiveRows.map((row) => index(row, artifacts)),
        dispositions: locationRows.map((row) => index(row, dispositions)),
      };
    }
  }
  assert.deepEqual(
    [...used].sort(),
    keys(originals),
    "Unrequested public material original",
  );
  return {
    schemaVersion: 3,
    input,
    origin,
    lanes,
    decisions,
    materials,
    artifacts,
    dispositions,
  };
}

/** Reconstruct the original source bytes for existing digest and rights readers. */
export function unpackPublicMaterial(packet) {
  if (packet.schemaVersion === 2) return packet;
  assert.deepEqual(keys(packet), [
    "artifacts",
    "decisions",
    "dispositions",
    "input",
    "lanes",
    "materials",
    "origin",
    "schemaVersion",
  ]);
  assert.equal(packet.schemaVersion, 3);
  const originals = {};
  const decisions = new Set(),
    materials = new Set(),
    artifacts = new Map(),
    dispositions = new Map();
  let size = 0;
  const retain = (key, bytes) => {
    size += Buffer.byteLength(bytes);
    assert.ok(
      size <= expansionLimit && Buffer.byteLength(bytes) <= bodyLimit,
      "Public material expansion exceeds its bound",
    );
    assert.equal(
      digest(bytes),
      key,
      "Could not reconstruct exact public material original",
    );
    originals[key] = bytes;
  };
  const row = (key, dictionary, seen, include) => {
    assert.match(key, hex);
    assert.ok(Object.hasOwn(dictionary, key), "Missing public material row");
    const value = dictionary[key];
    if (!seen.has(key)) {
      const bytes = stableJson(value);
      assert.equal(digest(bytes), key, "Public material row digest changed");
      seen.set(key, Buffer.byteLength(bytes));
    }
    include(seen.get(key));
    return value;
  };
  for (const lane of Object.values(packet.lanes)) {
    for (const key of Object.values(lane.decisions)) {
      if (decisions.has(key)) continue;
      const decision = original(packet.decisions, key);
      retain(key, decision);
      decisions.add(key);
      const { materialSha256 } = JSON.parse(decision);
      if (materials.has(materialSha256)) continue;
      assert.match(materialSha256, hex);
      const recipe = packet.materials[materialSha256];
      assert.deepEqual(keys(recipe), ["artifacts", "dispositions", "header"]);
      assert.ok(
        !Object.hasOwn(recipe.header, "artifacts") &&
          !Object.hasOwn(recipe.header, "decisions"),
      );
      assert.ok(
        Array.isArray(recipe.artifacts) && Array.isArray(recipe.dispositions),
      );
      let recordSize = Buffer.byteLength(stableJson(recipe.header));
      const include = (rowSize) => {
        recordSize += rowSize;
        assert.ok(
          recordSize <= bodyLimit && size + recordSize <= expansionLimit,
          "Public material expansion exceeds its bound",
        );
      };
      retain(
        materialSha256,
        stableJson({
          ...recipe.header,
          artifacts: recipe.artifacts.map((key) =>
            row(key, packet.artifacts, artifacts, include),
          ),
          decisions: recipe.dispositions.map((key) =>
            row(key, packet.dispositions, dispositions, include),
          ),
        }),
      );
      materials.add(materialSha256);
    }
  }
  for (const [used, declared] of [
    [decisions, packet.decisions],
    [materials, packet.materials],
    [artifacts, packet.artifacts],
    [dispositions, packet.dispositions],
  ])
    assert.deepEqual(
      [...used.keys()].sort(),
      keys(declared),
      "Unrequested rows in the public material proof",
    );
  return {
    schemaVersion: 2,
    input: packet.input,
    origin: packet.origin,
    lanes: packet.lanes,
    originals,
  };
}
