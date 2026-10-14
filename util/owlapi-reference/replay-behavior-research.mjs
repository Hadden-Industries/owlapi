import { createHash } from "node:crypto";
import { jsonEquals } from "../../scripts/canonical-json.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runJavaObservation } from "./run-java-observation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const researchDirectory = join(
  root,
  "docs/compatibility/research/java-api-behavior",
);
const researchFiles = [
  "2026-10-13-owlapi-api-behavior-evidence.json",
  "2026-10-13-owlapi-api-behavior-gap-closure-evidence.json",
];
const additionalProbeFiles = [
  "ObserveBehaviorContracts.java",
  "ObserveMutationContracts.java",
  "ObserveLoadingContracts.java",
  "ObserveStorageContracts.java",
  "ObserveQueryTiming.java",
  "ObserveJsonLdProvider.java",
  "ObserveXmlContracts.java",
  "ObserveParserSelection.java",
  "ObserveLanguageProfileSemantics.java",
  "ObserveNetworkContracts.java",
  "ObserveCompressionContracts.java",
  "ObserveJsonLdTransport.java",
  "ObserveResourceContracts.java",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Replay the retained black-box Java probes without an implementation overlay.
 * The caller chooses an acquired release classpath or an unmodified source build.
 * Historical expectations stay untouched; this produces new observations.
 * reuseUnchangedProbes is only for the same qualified JVM/runtime: classpath,
 * probe inputs, source and invocation arguments are rechecked before reuse.
 */
export function replayBehaviorResearch({
  classpathFile,
  outputDirectory,
  java = "java",
  reuseUnchangedProbes = false,
}) {
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  const classpath = readFileSync(classpathFile, "utf8").trim();
  const classpathEntries = classpath.split(delimiter).map((path) => ({
    name: basename(path),
    sha256: sha256(readFileSync(path)),
  }));
  const observations = [];
  const retained = reuseUnchangedProbes
    ? JSON.parse(readFileSync(join(output, "observations.json"), "utf8"))
    : undefined;
  if (retained && !jsonEquals(retained.classpathEntries, classpathEntries))
    throw new Error("Cannot reuse Java observations from a changed classpath");
  const inputs = [
    ...researchFiles.map((file) => {
      const bytes = readFileSync(join(researchDirectory, file));
      return {
        path: `../../research/java-api-behavior/${file}`,
        bytes,
        probes: JSON.parse(bytes).probes,
      };
    }),
    ...additionalProbeFiles.map((file) => {
      const bytes = readFileSync(join(root, "util/owlapi-reference", file));
      return {
        path: `../../../../util/owlapi-reference/${file}`,
        bytes,
        probes: [
          {
            id: basename(file, ".java"),
            language: "Java",
            source: bytes.toString("utf8"),
          },
        ],
      };
    }),
  ];
  for (const input of inputs) {
    for (const probe of input.probes) {
      const source =
        typeof probe.source === "string" ? probe.source : probe.source.text;
      if (probe.language !== "Java" && !source.startsWith("import java"))
        continue;
      const className = /(?:public )?class (\w+)/u.exec(source)[1];
      const sourcePath = join(output, `${className}.java`);
      writeFileSync(sourcePath, source);
      const argumentSets =
        probe.id === "GAP-P06"
          ? [1, 2, 5, 10, 11, 12, 20, 25].map((length) => [String(length)])
          : [
              [
                "GAP-P01",
                "ObserveLoadingContracts",
                "ObserveNetworkContracts",
                "ObserveJsonLdTransport",
              ].includes(probe.id)
                ? [output]
                : [],
            ];
      for (const arguments_ of argumentSets) {
        const identity = {
          probeId: probe.id,
          arguments: arguments_.map((argument) =>
            argument === output ? "${PROBE_WORKSPACE}" : argument,
          ),
          inputPath: input.path,
          inputSha256: sha256(input.bytes),
          sourceSha256: sha256(source),
        };
        const matches =
          retained?.observations.filter((observation) =>
            Object.entries(identity).every(
              ([key, value]) =>
                observation[key] !== undefined &&
                jsonEquals(observation[key], value),
            ),
          ) ?? [];
        if (matches.length > 1)
          throw new Error(`Duplicate retained Java observations: ${probe.id}`);
        const previous = matches[0];
        if (
          previous?.exitCode === 0 &&
          previous.signal === null &&
          previous.error === null
        ) {
          observations.push(previous);
          process.stderr.write(
            `${probe.id} ${arguments_.join(" ")}: unchanged capture reused\n`,
          );
          continue;
        }
        const result = runJavaObservation({
          java,
          classpath,
          sourcePath,
          arguments: arguments_,
          outputDirectory: output,
          // The released Turtle JavaCharStream expands/copies buffers in 2048
          // character steps. The 33 MiB stress probe needs a separate harness
          // budget; its earlier two-minute timeouts remain operator evidence.
          timeoutMilliseconds:
            probe.id === "ObserveResourceContracts" ? 600_000 : 120_000,
        });
        const normalize = (text = "") =>
          text
            .replaceAll("\r\n", "\n")
            .replaceAll(output, "${PROBE_WORKSPACE}")
            .replaceAll(output.replaceAll("\\", "/"), "${PROBE_WORKSPACE}");
        const observation = {
          ...identity,
          exitCode: result.status,
          signal: result.signal,
          error: result.error?.message ?? null,
          stdout: normalize(result.stdout),
          stderr: normalize(result.stderr),
        };
        observations.push(observation);
        writeFileSync(
          join(output, "incomplete-observations.json"),
          JSON.stringify(
            {
              schemaVersion: 1,
              classpathEntries,
              observations,
            },
            null,
            2,
          ) + "\n",
        );
        if (result.status !== 0)
          throw new Error(
            `Java probe ${probe.id} failed: ${result.error?.message ?? result.stderr}`,
          );
        process.stderr.write(`${probe.id} ${arguments_.join(" ")}: captured\n`);
      }
    }
  }
  const captured = { schemaVersion: 1, classpathEntries, observations };
  writeFileSync(
    join(output, "observations.json"),
    JSON.stringify(captured, null, 2) + "\n",
  );
  return captured;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [classpathFile, outputDirectory, option] = process.argv.slice(2);
  if (!classpathFile || !outputDirectory)
    throw new Error(
      "Usage: replay-behavior-research.mjs CLASSPATH_FILE OUTPUT_DIRECTORY [--reuse-unchanged]",
    );
  if (option && option !== "--reuse-unchanged")
    throw new Error(`Unknown replay option: ${option}`);
  replayBehaviorResearch({
    classpathFile,
    outputDirectory,
    reuseUnchangedProbes: option === "--reuse-unchanged",
  });
}
