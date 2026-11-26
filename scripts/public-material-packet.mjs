/** Share byte-identical measurements across the material decisions of a public run. */
import assert from "node:assert/strict";
import {
  createMaterialRecordInterner,
  createMaterialRecordReconstructor,
} from "./material-record-interning.mjs";
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
    used = new Set();
  const material = createMaterialRecordInterner();
  for (const lane of Object.values(lanes)) {
    for (const key of Object.values(lane.decisions)) {
      const decision = original(originals, key);
      decisions[key] = decision;
      const { materialSha256 } = JSON.parse(decision);
      used.add(key);
      used.add(materialSha256);
      if (!Object.hasOwn(material.tables.materials, materialSha256))
        material.add(materialSha256, original(originals, materialSha256));
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
    ...material.tables,
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
  const decisions = new Set();
  const material = createMaterialRecordReconstructor(packet, {
    expansionLimit,
    label: "Public material",
  });
  for (const lane of Object.values(packet.lanes)) {
    for (const key of Object.values(lane.decisions)) {
      if (decisions.has(key)) continue;
      const decision = original(packet.decisions, key);
      material.accountOriginal(decision);
      originals[key] = decision;
      decisions.add(key);
      const { materialSha256 } = JSON.parse(decision);
      originals[materialSha256] = material.open(materialSha256);
    }
  }
  material.assertClosed();
  assert.deepEqual(
    [...decisions].sort(),
    keys(packet.decisions),
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
