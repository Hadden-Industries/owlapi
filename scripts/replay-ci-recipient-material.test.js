import { readScopedScannerMaterial } from "./replay-ci-recipient-material.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

const expected = {
  role: "portability-alias",
  originalSha256: "a".repeat(64),
  resolutionSha256: "b".repeat(64),
  origin: { runId: 10, attempt: 2, commit: "c".repeat(40) },
};
const material = '{"status":"PASSED"}\n';
const proof = {
  schemaVersion: 1,
  ...expected,
  material,
  materialSha256: sha256Buffer(Buffer.from(material)),
};
test("reopens the exact scoped measurement bytes", () => {
  expect(readScopedScannerMaterial(proof, expected)).toEqual(
    Buffer.from(material),
  );
});

test.each([
  [{ role: "portability-scoped" }, /another install role/iu],
  [{ originalSha256: "d".repeat(64) }, /another original observation/iu],
  [{ resolutionSha256: "d".repeat(64) }, /another native graph/iu],
  [{ origin: { ...expected.origin, attempt: 1 } }, /another native job/iu],
  [
    { material: '{"status":"REQUIRES_HUMAN_REVIEW"}' },
    /result bytes changed/iu,
  ],
])("refuses a substituted measurement before replay", (change, diagnostic) => {
  expect(() =>
    readScopedScannerMaterial({ ...proof, ...change }, expected),
  ).toThrow(diagnostic);
});
