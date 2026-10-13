import { createHash } from "node:crypto";

const provenanceRows = new Set([
  "runtime",
  "owlapi-origin",
  "api-origin",
  "source",
  "selected",
  "processor",
]);
const digest = (text) => createHash("sha256").update(text).digest("hex");

/** Compare all behavioral rows, retaining provenance rows separately. A file
 * location can differ between Central and the source build; an outcome cannot.
 * This deliberately does not generalize exception, callback or numeric values.
 */
export function compareBehaviorObservations(central, rebuilt) {
  if (
    !central.observations.length ||
    central.observations.length !== rebuilt.observations.length
  )
    throw new Error("Oracle observation coverage differs or is empty");
  const rows = (observation) => {
    const lines = observation.stdout
      .split("\n")
      .filter((line) => !provenanceRows.has(line.split("\t", 1)[0]));
    // getSupportedSettings() returns a collection without a specified order.
    // These rows inventory setting names/values; they are not callback events.
    const settings = lines
      .filter((line) => line.startsWith("rio-setting\t"))
      .sort();
    const behavioralRows = [
      ...lines.filter((line) => !line.startsWith("rio-setting\t")),
      ...settings,
    ].join("\n");
    if (!behavioralRows.trim())
      throw new Error("Oracle emitted no behavioral rows");
    return behavioralRows;
  };
  return central.observations.map((observation, index) => {
    const counterpart = rebuilt.observations[index];
    if (
      observation.probeId !== counterpart.probeId ||
      observation.sourceSha256 !== counterpart.sourceSha256 ||
      JSON.stringify(observation.arguments) !==
        JSON.stringify(counterpart.arguments) ||
      observation.exitCode !== 0 ||
      counterpart.exitCode !== 0
    )
      throw new Error("Oracle subjects, inputs or execution status differ");
    const centralBehaviorSha256 = digest(rows(observation));
    const rebuiltBehaviorSha256 = digest(rows(counterpart));
    return {
      probeId: observation.probeId,
      arguments: observation.arguments,
      centralBehaviorSha256,
      rebuiltBehaviorSha256,
      areBehavioralObservationsIdentical:
        centralBehaviorSha256 === rebuiltBehaviorSha256,
    };
  });
}
