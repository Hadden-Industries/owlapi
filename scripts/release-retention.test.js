import { createHash } from "node:crypto";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { checkpointPayloads } from "./release-history-checkpoint.mjs";
import {
  artifactStorage,
  selectRedundantArtifacts,
} from "./release-retention.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha = "a".repeat(40);
const now = Date.parse("2026-11-18T00:00:00Z");
const created_at = "2026-11-17T00:00:00Z";
const expires_at = "2027-02-15T00:00:00Z";
const artifact = (id) => ({
  id,
  digest: "sha256:" + hash(String(id)),
  name: physicalName({
    logical: "package-proof-" + id + "-1",
    run: id,
    attempt: 1,
    producer: "a".repeat(16),
    invocation: "b".repeat(32),
    ordinal: 0,
  }),
  size_in_bytes: 32,
  expired: false,
  created_at,
  expires_at,
  workflow_run: { id, repository_id: 14, head_repository_id: 14 },
});

test("only exact replayed redundant IDs qualify and the successor's inputs are protected", () => {
  const [old, candidate, packageProof, hold] = [1, 2, 3, 4].map(artifact);
  const inputs = {
    inventory: [old, candidate, packageProof, hold],
    successor: { commit: sha, candidate, packageProof, repositoryId: 14 },
    currentHead: sha,
    complete: true,
    now,
    decisions: {
      protectedIds: [hold.id],
      settledRuns: [],
      replayed: [old, candidate, hold].map(({ id, digest }) => ({
        id,
        digest,
        runId: id,
        result: "STAGE_SEAL_AND_RECOVERY_VERIFIED",
        actionsCopiesUnavailable: true,
        verifiedBackup: true,
        manifestSha256: hash("manifest"),
      })),
    },
  };
  expect(selectRedundantArtifacts(inputs).eligibleIds).toEqual([old.id]);
  for (const changed of [
    { complete: false },
    { currentHead: "b".repeat(40) },
    { activeConsumer: true },
    { openWriter: true },
    { inventory: [old, candidate] },
    { decisions: undefined },
    { decisions: { ...inputs.decisions, protectedIds: [String(hold.id)] } },
    { decisions: { ...inputs.decisions, settledRuns: "1" } },
    { now: Date.parse(expires_at) },
  ])
    expect(
      selectRedundantArtifacts({ ...inputs, ...changed }).eligibleIds,
    ).toEqual([]);
});

test("storage projection separates disposable and release-capable byte-days", () => {
  const maintenance = {
    ...artifact(77),
    name: "runtime-candidate-77-1",
    created_at: "2026-11-18T00:00:00Z",
    expires_at: "2026-11-19T00:00:00Z",
  };
  expect(
    artifactStorage(
      [artifact(1), maintenance, { ...artifact(2), expired: true }],
      now,
    ),
  ).toEqual({
    "Maintenance handoffs": { artifacts: 1, bytes: 32, projectedByteDays: 32 },
    "Qualified packages": { artifacts: 1, bytes: 32, projectedByteDays: 2880 },
  });
});

test("the signed payload reader validates all paths and reads only selected parts once", () => {
  const a = Buffer.from("a"),
    b = Buffer.from("b");
  const part = (name, bytes) => ({
    name,
    bytes: bytes.length,
    sha256: hash(bytes),
  });
  const combined = {
    ...part("selected.zip", Buffer.concat([a, b])),
    disclosure: "PUBLIC",
    parts: [part("selected-1", a), part("selected-2", b)],
  };
  const unrelated = {
    name: "unrelated.zip",
    bytes: 64 * 1024 * 1024,
    sha256: hash("unused"),
    disclosure: "PUBLIC",
  };
  const index = { schemaVersion: 2, files: [combined, unrelated] };
  const native = (letter) => ({ mode: "100644", oid: letter.repeat(40) });
  const inventory = new Map([
    ["checkpoint.json", native("d")],
    ["selected-1", native("a")],
    ["selected-2", native("b")],
    ["unrelated.zip", native("c")],
  ]);
  const attempted = [];
  const load = (oid) => {
    attempted.push(oid);
    return oid === sha ? a : b;
  };
  const reader = checkpointPayloads(index, inventory, load);
  expect(reader.has("unrelated.zip")).toBe(true);
  expect(reader.get("selected.zip").toString()).toBe("ab");
  expect(reader.get("selected.zip").toString()).toBe("ab");
  expect(attempted).toEqual([sha, "b".repeat(40)]);
  for (const mode of ["120000", "160000"]) {
    const linked = new Map(inventory);
    linked.set("unrelated.zip", { ...native("c"), mode });
    expect(() => checkpointPayloads(index, linked, load)).toThrow();
  }
  expect(() =>
    checkpointPayloads(
      {
        ...index,
        files: [...index.files, { ...unrelated, name: "Unrelated.ZIP" }],
      },
      inventory,
      load,
    ),
  ).toThrow("Duplicate checkpoint member");
  expect(() =>
    checkpointPayloads(
      {
        ...index,
        files: [combined, { ...unrelated, bytes: unrelated.bytes + 1 }],
      },
      inventory,
      load,
    ),
  ).toThrow("byte limit");
  expect(() =>
    checkpointPayloads(
      index,
      new Map([...inventory, ["scratch.bin", native("d")]]),
      load,
    ),
  ).toThrow("unexpected paths");
  expect(() =>
    checkpointPayloads(index, inventory, () => Buffer.from("x")).get(
      "selected.zip",
    ),
  ).toThrow();
});
