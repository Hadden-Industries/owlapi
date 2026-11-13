import { maintenanceTarget } from "./maintenance-published-health.mjs";
const tags = { latest: "0.2.0-rc.1", next: null, pilot: "0.2.0-rc.1" };
const stable = {
  schemaVersion: 1,
  stable: "0.1.0",
  supportedRc: null,
  releaseId: 12,
  tags,
};
test("an RC on latest retains the completed stable support designation", () => {
  expect(maintenanceTarget(stable, tags)).toMatchObject({
    version: "0.1.0",
    releaseId: 12,
  });
});
test("pre-stable support follows the verified next RC and detects label drift", () => {
  const before = { ...tags, next: "0.1.0-rc.3" };
  const designation = {
    ...stable,
    stable: null,
    supportedRc: before.next,
    tags: before,
  };
  expect(maintenanceTarget(designation, before).version).toBe(before.next);
  expect(() => maintenanceTarget(designation, tags)).toThrow(/next/);
});
