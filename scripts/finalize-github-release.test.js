import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  finalizationEvidencePin,
  readFinalizationEvidence,
} from "./finalize-github-release.mjs";

test("a requested evidence pin cannot silently disappear", () => {
  expect(finalizationEvidencePin([])).toBeUndefined();
  expect(() => finalizationEvidencePin(["--evidence-sha256"])).toThrow(
    "requires a valid digest",
  );
  expect(() =>
    finalizationEvidencePin(["--evidence-sha256", "--output"]),
  ).toThrow("requires a valid digest");
  expect(finalizationEvidencePin(["--evidence-sha256", "a".repeat(64)])).toBe(
    "a".repeat(64),
  );
});

test("pins the exact evidence buffer before asynchronous publication checks", () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-finalization-evidence-"));
  try {
    const path = join(root, "evidence.json");
    writeFileSync(path, '{"result":"PASS"}\n');
    const original = readFileSync(path);
    const sha256 = createHash("sha256").update(original).digest("hex");
    const input = readFinalizationEvidence(path, sha256);
    writeFileSync(path, '{"result":"FORGED"}\n');
    expect(input.bytes).toEqual(original);
    expect(input.sha256).toBe(sha256);
    expect(() => readFinalizationEvidence(path, sha256)).toThrow(
      "approved byte digest",
    );
    expect(() => readFinalizationEvidence(path, "invalid")).toThrow(
      "approved byte digest",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
