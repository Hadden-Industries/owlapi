import { readFileSync } from "node:fs";
import { compareBehaviorObservations } from "./compare-behavior-observations.mjs";

const readObservation = (name) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../docs/compatibility/profiles/java-owlapi-5.5.1/${name}-observations.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );

test("Central and unmodified release build agree on every retained behavioral observation", () => {
  const result = compareBehaviorObservations(
    readObservation("central"),
    readObservation("source"),
  );
  expect(result).toHaveLength(17);
  expect(result.every((row) => row.areBehavioralObservationsIdentical)).toBe(
    true,
  );
});

test("a changed callback, outcome or missing probe cannot be admitted as equivalent", () => {
  const central = readObservation("central");
  const rebuilt = readObservation("source");
  const stateProbe = rebuilt.observations.find(
    (row) => row.probeId === "GAP-P01",
  );
  expect(stateProbe.stdout).toContain("begin:3:0");
  stateProbe.stdout = stateProbe.stdout.replace("begin:3:0", "begin:2:0");
  expect(
    compareBehaviorObservations(central, rebuilt).find(
      (row) => row.probeId === "GAP-P01",
    ).areBehavioralObservationsIdentical,
  ).toBe(false);
  rebuilt.observations.pop();
  expect(() => compareBehaviorObservations(central, rebuilt)).toThrow(
    /coverage/,
  );
});

test("provenance-only or empty outputs do not prove behavioral equivalence", () => {
  const central = readObservation("central");
  const rebuilt = readObservation("source");
  central.observations[0].stdout = "runtime\t25\n";
  rebuilt.observations[0].stdout = "runtime\t25\n";
  expect(() => compareBehaviorObservations(central, rebuilt)).toThrow(
    /behavioral rows/,
  );
});
