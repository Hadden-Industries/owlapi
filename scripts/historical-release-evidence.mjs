import assert from "node:assert/strict";
import { sha256Buffer } from "./release-file-utils.mjs";

// These are the three immutable pre-staging releases. GitHub's signed release
// attestations cover the original evidence bytes, including their historical format.
const releases = new Map([
  [
    "0.1.0-rc.1",
    {
      schema: 1,
      id: 402217399,
      tag: "8b944e532430ebd3a10b834309b54fb0428f7eed",
      digest:
        "158e07b68c31365679149f7e54ba76ce704d4a5821fceac1789d8d33649909ed",
    },
  ],
  [
    "0.1.0-rc.2",
    {
      schema: 5,
      id: 408398239,
      tag: "79699c3816912084202551dc2e043a12e081a3ef",
      digest:
        "596bb25cd92ffd6e5b8b104754cac44d4247fcbe4a3726bba1f3d6dd24534fa3",
    },
  ],
  [
    "0.1.0-rc.3",
    {
      schema: 6,
      id: 428624178,
      tag: "ce92b4820910b079b98c402aa03032ff18a4b923",
      digest:
        "b8a24c9d20341d0921fcc52bfc1bbddad5c0a3bbbf858a16be725920d92b18af",
    },
  ],
]);

export const isHistoricalRelease = (version) => releases.has(version);
export const historicalEvidenceName = (version) =>
  "hadden-industries-owlapi-" + version + ".release-evidence.json";

export function readHistoricalRelease(version, bytes) {
  const pin = releases.get(version);
  assert.ok(pin, "Unknown historical release");
  assert.ok(
    bytes && sha256Buffer(bytes) === pin.digest,
    "Missing or altered historical release evidence",
  );
  const record = JSON.parse(bytes);
  assert.equal(record.schemaVersion, pin.schema);
  assert.equal(
    record.package.coordinate,
    "@hadden-industries/owlapi@" + version,
  );
  assert.equal(record.source.tag, "v" + version);
  assert.equal(record.githubRelease.id, pin.id);
  const retained =
    pin.schema === 1
      ? record.githubRelease.retainedAssets
      : record.githubRelease.assets;
  return {
    version,
    releaseId: pin.id,
    tagObject: pin.tag,
    source: record.source.commit,
    assets: [
      ...retained.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
      {
        name: historicalEvidenceName(version),
        bytes: bytes.length,
        sha256: pin.digest,
      },
    ],
  };
}
