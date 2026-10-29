import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

/** Current execution policy. Historical oracle receipts and timings keep their
 * original identities and cannot be admitted by changing this declaration.
 */
export const JAVA_TOOLCHAIN = Object.freeze({
  vendor: "Eclipse Adoptium",
  distribution: "temurin",
  version: "25.0.5",
  runtime: "25.0.5+8-LTS",
  setupJavaVersion: "25.0.5+8.0.LTS",
  windowsPackage: "EclipseAdoptium.Temurin.25.JDK",
  windowsVersion: "25.0.5.8",
});

export function isCurrentJavaEnvironment(environment) {
  return (
    environment?.["java.version"] === JAVA_TOOLCHAIN.version &&
    environment["java.vendor"] === JAVA_TOOLCHAIN.vendor &&
    environment.runtime === JAVA_TOOLCHAIN.runtime &&
    environment["java.vm.version"] === JAVA_TOOLCHAIN.runtime
  );
}

/** Parse native properties, retaining exact build and provider admission. */
export function currentJavaProperties(output) {
  const properties = Object.fromEntries(
    [...output.matchAll(/^\s+(java\.[\w.]+) = (.+)\r?$/gmu)].map(
      ([, key, value]) => [key, value.trim()],
    ),
  );
  if (
    !isCurrentJavaEnvironment({
      ...properties,
      runtime: properties["java.runtime.version"],
    }) ||
    !properties["java.home"]
  )
    throw new Error(
      `Java execution requires Eclipse Temurin ${JAVA_TOOLCHAIN.runtime}`,
    );
  return properties;
}

/** Observe the executable before a new semantic replay; the returned identity
 * prevents unchanged probes from being reused across a JDK change.
 */
export function observeCurrentJavaToolchain(java = "java") {
  const result = spawnSync(java, ["-XshowSettings:properties", "-version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
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
  if (result.error || result.status !== 0)
    throw new Error("Could not observe the selected Java executable", {
      cause: result.error,
    });
  const properties = currentJavaProperties(result.stdout + result.stderr);
  const directory = realpathSync(properties["java.home"]);
  const hash = (path) =>
    createHash("sha256").update(readFileSync(path)).digest("hex");
  return {
    vendor: properties["java.vendor"],
    version: properties["java.version"],
    runtime: properties["java.runtime.version"],
    executableSha256: hash(
      join(
        directory,
        "bin",
        process.platform === "win32" ? "java.exe" : "java",
      ),
    ),
    releaseSha256: hash(join(directory, "release")),
  };
}
