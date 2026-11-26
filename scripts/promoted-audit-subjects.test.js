import { projectPromotedCi } from "./promoted-release-proof.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";

test("promotion carries the measured v2 audit subjects without an npm report or a claimed historical pass", () => {
  const record = {
    run: { id: 10, run_attempt: 1, event: "push", head_sha: "a".repeat(40) },
    artifact: { id: 12 },
    receipt: { snapshot: {}, checks: {}, policySha256: "b".repeat(64) },
  };
  const subjects = {
    root: { role: "producer" },
    recipient: { role: "candidate" },
    inspection: { role: "candidate" },
    scoped: { role: "candidate" },
  };
  const projected = projectPromotedCi(
    {
      landed: {},
      main: record,
      source: { ...record, run: { ...record.run, repository: { id: 42 } } },
      qualifiedPackage: {
        packageProofVersion: 2,
        advisorySubjects: subjects,
        attempt: 1,
        producerJob: 3,
        candidate: { id: 14 },
        proof: { id: 15 },
        package: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
      },
    },
    "c".repeat(64),
  );
  expect(projected.schemaVersion).toBe(2);
  expect(projected.advisorySubjects).toEqual(subjects);
  expect(projected).not.toHaveProperty("advisoryObservations");
});
