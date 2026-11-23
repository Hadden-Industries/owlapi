import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const javaLauncherOptions = new Set([
  "JAVA_TOOL_OPTIONS",
  "JDK_JAVA_OPTIONS",
  "_JAVA_OPTIONS",
  "CLASSPATH",
]);

export function javaProcessEnvironment(environment = process.env) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) => !javaLauncherOptions.has(name.toUpperCase()),
    ),
  );
}

const fileDigest = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

/** Current execution policy. Historical oracle receipts and timings keep their
 * original identities and cannot be admitted by changing this declaration.
 */
export function javaToolchainSelection(selection) {
  const setupJavaVersion = selection.trim();
  const match =
    /^(?<base>[1-9]\d*\.\d+\.\d+)\+(?:(?<legacyBuild>[1-9]\d{0,3})\.0\.LTS|(?<patch>[1-9]\d*)\.(?<patchBuild>[1-9]\d{0,3}))$/u.exec(
      setupJavaVersion,
    );
  if (!match)
    throw new Error(
      ".java-version must select an exact Temurin LTS patch and build",
    );
  const { base, legacyBuild, patch, patchBuild } = match.groups;
  const build = legacyBuild ?? patchBuild;
  const version = patch ? `${base}.${patch}` : base;
  const feature = base.split(".")[0];
  // Temurin's Windows package places the JEP 322 patch ahead of a four-digit build.
  const windowsBuild = patch ? `${patch}${build.padStart(4, "0")}` : build;
  return Object.freeze({
    vendor: "Eclipse Adoptium",
    distribution: "temurin",
    version,
    runtime: `${version}+${build}-LTS`,
    setupJavaVersion,
    windowsPackage: `EclipseAdoptium.Temurin.${feature}.JDK`,
    windowsVersion: `${base}.${windowsBuild}`,
  });
}

export const JAVA_TOOLCHAIN = javaToolchainSelection(
  readFileSync(new URL("../.java-version", import.meta.url), "utf8"),
);

export function isCurrentJavaEnvironment(
  environment,
  selection = JAVA_TOOLCHAIN,
) {
  return (
    environment?.["java.version"] === selection.version &&
    environment["java.vendor"] === selection.vendor &&
    environment.runtime === selection.runtime &&
    environment["java.vm.version"] === selection.runtime
  );
}

/** Parse native properties, retaining exact build and provider admission. */
export function currentJavaProperties(output, selection = JAVA_TOOLCHAIN) {
  const properties = Object.fromEntries(
    [...output.matchAll(/^\s+(java\.[\w.]+) = (.+)\r?$/gmu)].map(
      ([, key, value]) => [key, value.trim()],
    ),
  );
  if (
    !isCurrentJavaEnvironment(
      { ...properties, runtime: properties["java.runtime.version"] },
      selection,
    ) ||
    !properties["java.home"]
  )
    throw new Error(
      `Java execution requires Eclipse Temurin ${selection.runtime}`,
    );
  return properties;
}

/** Observe the executable before a new semantic replay; the returned identity
 * prevents unchanged probes from being reused across a JDK change.
 */
export function observeCurrentJavaToolchain(
  java = "java",
  selection = JAVA_TOOLCHAIN,
) {
  const result = spawnSync(java, ["-XshowSettings:properties", "-version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: javaProcessEnvironment(),
  });
  if (result.error || result.status !== 0)
    throw new Error("Could not observe the selected Java executable", {
      cause: result.error,
    });
  const properties = currentJavaProperties(
    result.stdout + result.stderr,
    selection,
  );
  const directory = realpathSync(properties["java.home"]);
  return {
    vendor: properties["java.vendor"],
    version: properties["java.version"],
    runtime: properties["java.runtime.version"],
    executableSha256: fileDigest(
      join(
        directory,
        "bin",
        process.platform === "win32" ? "java.exe" : "java",
      ),
    ),
    releaseSha256: fileDigest(join(directory, "release")),
  };
}

/** Admit both executables from one exact development or release JDK. */
export function observeSelectedJavaJdk(javaHome, selection = JAVA_TOOLCHAIN) {
  if (typeof javaHome !== "string" || !isAbsolute(javaHome)) {
    throw new Error("An absolute Java JDK directory is required");
  }
  const directory = realpathSync(javaHome);
  const suffix = process.platform === "win32" ? ".exe" : "";
  const javaPath = join(directory, "bin", `java${suffix}`);
  const javacPath = join(directory, "bin", `javac${suffix}`);
  const runtime = observeCurrentJavaToolchain(javaPath, selection);
  if (
    fileDigest(javaPath) !== runtime.executableSha256 ||
    fileDigest(join(directory, "release")) !== runtime.releaseSha256
  ) {
    throw new Error("Selected Java executable reported a different JDK");
  }
  const compiler = spawnSync(javacPath, ["-version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
    env: javaProcessEnvironment(),
  });
  if (
    compiler.status !== 0 ||
    `${compiler.stdout ?? ""}${compiler.stderr ?? ""}`.trim() !==
      `javac ${selection.version}`
  ) {
    throw new Error(
      `Java execution requires javac ${selection.version} from the selected JDK`,
      {
        cause: compiler.error,
      },
    );
  }
  return {
    javaPath,
    javacPath,
    identity: {
      ...runtime,
      setupJavaVersion: selection.setupJavaVersion,
      compilerSha256: fileDigest(javacPath),
    },
  };
}
