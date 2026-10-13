import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Replay the retained black-box Java probes without an implementation overlay.
 * The caller chooses an acquired release classpath or an unmodified source build.
 * Historical expectations stay untouched; this produces new observations.
 */
export function replayBehaviorResearch({
  classpathFile,
  outputDirectory,
  java = "java",
}) {
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  const classpath = readFileSync(classpathFile, "utf8").trim();
  const classpathEntries = classpath.split(delimiter).map((path) => ({
    name: basename(path),
    sha256: sha256(readFileSync(path)),
  }));
  const observations = [];
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
          : [probe.id === "GAP-P01" ? [output] : []];
      for (const arguments_ of argumentSets) {
        const argv = [
          "-Duser.language=en",
          "-Duser.country=GB",
          "-Duser.timezone=UTC",
          "-Dfile.encoding=UTF-8",
          "-Dstdout.encoding=UTF-8",
          "-Dstderr.encoding=UTF-8",
          "-cp",
          classpath,
          sourcePath,
          ...arguments_,
        ];
        // Java's native argument-file format also avoids Windows command limits.
        const argumentFile = join(output, "java-arguments.txt");
        writeFileSync(
          argumentFile,
          argv.map((value) => JSON.stringify(value)).join("\n"),
        );
        const result = spawnSync(java, [`@${argumentFile}`], {
          encoding: "utf8",
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              ([name]) =>
                ![
                  "JAVA_TOOL_OPTIONS",
                  "JDK_JAVA_OPTIONS",
                  "_JAVA_OPTIONS",
                  "CLASSPATH",
                ].includes(name.toUpperCase()),
            ),
          ),
        });
        const normalize = (text = "") =>
          text
            .replaceAll("\r\n", "\n")
            .replaceAll(output, "${PROBE_WORKSPACE}")
            .replaceAll(output.replaceAll("\\", "/"), "${PROBE_WORKSPACE}");
        const observation = {
          probeId: probe.id,
          arguments: arguments_.map((arg) =>
            arg === output ? "${PROBE_WORKSPACE}" : arg,
          ),
          inputPath: input.path,
          inputSha256: sha256(input.bytes),
          sourceSha256: sha256(source),
          exitCode: result.status,
          signal: result.signal,
          error: result.error?.message ?? null,
          stdout: normalize(result.stdout),
          stderr: normalize(result.stderr),
        };
        observations.push(observation);
        writeFileSync(
          join(output, "observations.json"),
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
  return { schemaVersion: 1, classpathEntries, observations };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [classpathFile, outputDirectory] = process.argv.slice(2);
  if (!classpathFile || !outputDirectory)
    throw new Error(
      "Usage: replay-behavior-research.mjs CLASSPATH_FILE OUTPUT_DIRECTORY",
    );
  replayBehaviorResearch({ classpathFile, outputDirectory });
}
