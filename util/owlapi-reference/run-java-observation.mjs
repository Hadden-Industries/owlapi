import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Native source-file execution shared by independent public API probes. */
export function runJavaObservation({
  classpath,
  sourcePath,
  arguments: programArguments = [],
  outputDirectory,
  java = "java",
  timeoutMilliseconds = 120_000,
}) {
  const argumentsFile = join(outputDirectory, "java-arguments.txt");
  writeFileSync(
    argumentsFile,
    [
      "-Duser.language=en",
      "-Duser.country=GB",
      "-Duser.timezone=UTC",
      "-Dfile.encoding=UTF-8",
      "-Dstdout.encoding=UTF-8",
      "-Dstderr.encoding=UTF-8",
      "-cp",
      classpath,
      sourcePath,
      ...programArguments,
    ]
      .map((value) => JSON.stringify(value))
      .join("\n"),
  );
  const result = spawnSync(java, [`@${argumentsFile}`], {
    encoding: "utf8",
    timeout: timeoutMilliseconds,
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
  return result;
}

// Keep individual investigations on the same JVM/environment contract as the
// complete replay. Raw output stays in the explicitly selected evidence space.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [classpathFile, sourcePath, outputDirectory, ...programArguments] =
    process.argv.slice(2);
  if (!classpathFile || !sourcePath || !outputDirectory)
    throw new TypeError(
      "Expected classpath file, Java source, output directory and optional program arguments",
    );
  mkdirSync(outputDirectory, { recursive: true });
  const result = runJavaObservation({
    classpath: readFileSync(classpathFile, "utf8").trim(),
    sourcePath: resolve(sourcePath),
    outputDirectory,
    arguments: programArguments,
  });
  writeFileSync(join(outputDirectory, "stdout.txt"), result.stdout ?? "");
  writeFileSync(join(outputDirectory, "stderr.txt"), result.stderr ?? "");
  process.stdout.write(
    JSON.stringify({
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message ?? null,
      stdoutBytes: Buffer.byteLength(result.stdout ?? ""),
    }) + "\n",
  );
  process.exitCode = result.status ?? 1;
}
