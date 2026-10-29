import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeKnownBuildComment } from "./compare-behavior-observations.mjs";

const digest = (text) => createHash("sha256").update(text).digest("hex");
// JSON object members are unordered. Array order is retained unless the harness
// row itself identifies a separately invoked operation, rather than an event.
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const canonicalJson = (value) => JSON.stringify(canonical(value));
const invocationKey = (row) =>
  canonicalJson({
    method: row.method,
    argument: row.argument,
    repeated: row.repeated,
    filtered: row.filtered,
  });

/** Compare selected API results without sorting callbacks or result streams. */
export function compareSelectedParity(
  central,
  source,
  { sameRelease = false } = {},
) {
  if (typeof sameRelease !== "boolean")
    throw new TypeError("sameRelease must be a boolean");
  if (
    sameRelease &&
    (!Array.isArray(central.classpathEntries) ||
      central.classpathEntries.length === 0 ||
      canonicalJson(central.classpathEntries) !==
        canonicalJson(source.classpathEntries))
  )
    throw new Error(
      "Same-release comparison requires the same nonempty ordered classpath",
    );
  if (
    central.observations.length !== source.observations.length ||
    central.ontologyInputSha256 !== source.ontologyInputSha256
  )
    throw new Error("Selected oracle coverage or input differs");
  return central.observations.map((left, index) => {
    const right = source.observations[index];
    if (
      left.probeId !== right.probeId ||
      left.sourceSha256 !== right.sourceSha256 ||
      canonicalJson(left.arguments) !== canonicalJson(right.arguments) ||
      !left.matchesExpectedCompletion ||
      !right.matchesExpectedCompletion ||
      left.exitCode !== right.exitCode
    )
      throw new Error("Selected oracle identity or completion differs");
    const normalize = (observation, build) => {
      const stdout =
        observation.probeId === "RunRC2Renderer"
          ? canonicalJson(JSON.parse(observation.stdout))
          : observation.stdout;
      const outputs = observation.outputs.map(({ name, content }) => {
        if (name.endsWith(".json")) {
          const parsed = JSON.parse(content);
          if (
            ["RunRC2Search", "RunRC2QueryMatrix"].includes(observation.probeId)
          ) {
            const keys = parsed.observations.map(invocationKey);
            if (keys.length !== new Set(keys).size)
              throw new Error("Ambiguous native observation identity");
            parsed.observations.sort((a, b) =>
              invocationKey(a).localeCompare(invocationKey(b)),
            );
          }
          return { name, content: canonicalJson(parsed) };
        }
        // Cross-build reconstruction admits only its recorded build comments.
        // A JDK replay of the same released bytes must preserve those comments.
        if (observation.probeId === "RunRC2Storage" && !sameRelease)
          return { name, content: normalizeKnownBuildComment(content, build) };
        return { name, content };
      });
      return canonicalJson({ stdout, outputs });
    };
    const centralResultSha256 = digest(normalize(left, 0));
    const sourceResultSha256 = digest(normalize(right, 1));
    return {
      probeId: left.probeId,
      arguments: left.arguments,
      centralResultSha256,
      sourceResultSha256,
      areSelectedResultsEquivalent: centralResultSha256 === sourceResultSha256,
    };
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [centralPath, sourcePath, outputPath, mode, ...extra] =
    process.argv.slice(2);
  if (
    !centralPath ||
    !sourcePath ||
    !outputPath ||
    extra.length ||
    (mode !== undefined && mode !== "--same-release")
  )
    throw new Error(
      "Expected Central/source observations and output paths, optionally --same-release",
    );
  const rows = compareSelectedParity(
    JSON.parse(readFileSync(centralPath)),
    JSON.parse(readFileSync(sourcePath)),
    { sameRelease: mode === "--same-release" },
  );
  writeFileSync(outputPath, JSON.stringify(rows, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify({
      observationCount: rows.length,
      differingCount: rows.filter(
        ({ areSelectedResultsEquivalent }) => !areSelectedResultsEquivalent,
      ).length,
    }) + "\n",
  );
}
