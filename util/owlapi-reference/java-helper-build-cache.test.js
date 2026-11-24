import { jest } from "@jest/globals";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  JAVA_HELPER_BUILD_CACHE_SCHEMA_VERSION,
  computeJavaHelperBuildKey,
  ensureCachedJavaHelperBuild,
  hashJavaSources,
  hashOrderedClasspathEntries,
  probeJavaCompilerIdentity,
  resolveJavaHelperBuildCacheDirectory,
  verifyCachedJavaHelperBuild,
} from "./java-helper-build-cache.mjs";

const execFileAsync = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

jest.setTimeout(120_000);

const tempRoots = [];
const makeTempRoot = async (prefix) => {
  const created = await mkdtemp(join(tmpdir(), prefix));
  const canonical = realpathSync.native(created);
  tempRoots.push(canonical);
  return canonical;
};

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("resolveJavaHelperBuildCacheDirectory", () => {
  it("resolves explicit directory, falls back to OWLAPI_JAVA_BUILD_CACHE, and otherwise returns null", () => {
    const explicit = join(tmpdir(), "explicit-cache");
    const ambient = join(tmpdir(), "ambient-cache");

    expect(
      resolveJavaHelperBuildCacheDirectory(explicit, {
        OWLAPI_JAVA_BUILD_CACHE: ambient,
      }),
    ).toBe(resolve(explicit));

    expect(
      resolveJavaHelperBuildCacheDirectory(undefined, {
        OWLAPI_JAVA_BUILD_CACHE: ambient,
      }),
    ).toBe(resolve(ambient));

    expect(resolveJavaHelperBuildCacheDirectory("   ", {})).toBeNull();
    expect(resolveJavaHelperBuildCacheDirectory(undefined, {})).toBeNull();
  });
});

describe("verified Java helper build cache", () => {
  const createBuildFixture = async () => {
    const root = await makeTempRoot("owlapi-java-cache-fixture-");
    const sourcesDir = join(root, "sources");
    const jarsDir = join(root, "jars");
    const cacheDir = join(root, "cache");
    await mkdir(sourcesDir, { recursive: true });
    await mkdir(jarsDir, { recursive: true });

    const launcherSource = join(sourcesDir, "Launcher.java");
    const oracleA = join(sourcesDir, "OracleA.java");
    const oracleB = join(sourcesDir, "OracleB.java");
    await writeFile(launcherSource, "class Launcher {}\n", "utf8");
    await writeFile(oracleA, "class OracleA {}\n", "utf8");
    await writeFile(oracleB, "class OracleB {}\n", "utf8");

    const jarA = join(jarsDir, "000.jar");
    const jarB = join(jarsDir, "001.jar");
    await writeFile(jarA, Buffer.from("synthetic-jar-alpha-bytes"));
    await writeFile(jarB, Buffer.from("synthetic-jar-beta-bytes"));

    const classpathFile = join(root, "classpath.txt");
    await writeFile(classpathFile, [jarA, jarB].join(delimiter), "utf8");

    const compilerIdentity = {
      vendor: "Eclipse Adoptium",
      version: "25.0.5.1",
      runtime: "25.0.5.1+2-LTS",
      compilerSha256: "a".repeat(64),
      executableSha256: "b".repeat(64),
      releaseSha256: "c".repeat(64),
    };
    const compilerOptions = ["-encoding", "UTF-8"];

    const buildParameters = () => ({
      cacheDirectory: cacheDir,
      compilerIdentity,
      compilerOptions,
      launcherSource,
      oracleSources: [oracleA, oracleB],
      classpathEntries: [jarA, jarB],
      requiredOutputs: ["Launcher.class", "OracleA.class"],
      compileIntoDirectory: async (stagingClasses) => {
        await mkdir(join(stagingClasses, "nested"), { recursive: true });
        await writeFile(
          join(stagingClasses, "Launcher.class"),
          Buffer.from("CAFEBABE-Launcher"),
        );
        await writeFile(
          join(stagingClasses, "OracleA.class"),
          Buffer.from("CAFEBABE-OracleA"),
        );
        await writeFile(
          join(stagingClasses, "nested", "OracleB.class"),
          Buffer.from("CAFEBABE-OracleB"),
        );
        return { stderr: "compiled ok\n" };
      },
    });

    return {
      root,
      cacheDir,
      launcherSource,
      oracleA,
      oracleB,
      jarA,
      jarB,
      classpathFile,
      compilerIdentity,
      compilerOptions,
      buildParameters,
    };
  };

  it("compiles once and reuses the same verified build across repeated invocations", async () => {
    const fixture = await createBuildFixture();
    let compileCount = 0;
    const base = fixture.buildParameters();
    const compileIntoDirectory = async (stagingClasses) => {
      compileCount += 1;
      return base.compileIntoDirectory(stagingClasses);
    };

    const first = await ensureCachedJavaHelperBuild({
      ...base,
      compileIntoDirectory,
    });
    const second = await ensureCachedJavaHelperBuild({
      ...base,
      classpathFile: fixture.classpathFile,
      classpathEntries: undefined,
      compileIntoDirectory,
    });

    expect(compileCount).toBe(1);
    expect(first.cacheStatus).toBe("miss");
    expect(second.cacheStatus).toBe("hit");
    expect(second.compiledOracleDirectory).toBe(first.compiledOracleDirectory);
    expect(second.buildKey).toBe(first.buildKey);
    expect(second.manifestSha256).toBe(first.manifestSha256);
    expect(await readdir(join(fixture.cacheDir, "staging"))).toEqual([]);
  });

  it("invalidates the build key when Java sources, compiler identity/options, or ordered JARs change", async () => {
    const fixture = await createBuildFixture();
    const compute = async (overrides = {}) => {
      const descriptor = {
        schemaVersion: JAVA_HELPER_BUILD_CACHE_SCHEMA_VERSION,
        compilerIdentity:
          overrides.compilerIdentity ?? fixture.compilerIdentity,
        compilerOptions: overrides.compilerOptions ?? fixture.compilerOptions,
        sources: await hashJavaSources({
          launcherSource: overrides.launcherSource ?? fixture.launcherSource,
          oracleSources: overrides.oracleSources ?? [
            fixture.oracleA,
            fixture.oracleB,
          ],
        }),
        classpath: await hashOrderedClasspathEntries(
          overrides.classpathEntries ?? [fixture.jarA, fixture.jarB],
        ),
      };
      return {
        descriptor,
        buildKey: computeJavaHelperBuildKey(descriptor),
      };
    };

    const initial = await compute();

    // Mutate Java source byte
    await writeFile(fixture.oracleA, "class OracleA { int x; }\n", "utf8");
    const afterSourceChange = await compute();
    expect(afterSourceChange.buildKey).not.toBe(initial.buildKey);
    await writeFile(fixture.oracleA, "class OracleA {}\n", "utf8");

    // Mutate compiler identity
    const afterCompilerIdentity = await compute({
      compilerIdentity: {
        ...fixture.compilerIdentity,
        compilerSha256: "d".repeat(64),
      },
    });
    expect(afterCompilerIdentity.buildKey).not.toBe(initial.buildKey);

    // Mutate compiler options
    const afterCompilerOptions = await compute({
      compilerOptions: [...fixture.compilerOptions, "-g:none"],
    });
    expect(afterCompilerOptions.buildKey).not.toBe(initial.buildKey);

    // Mutate classpath JAR order
    const afterReorderedJars = await compute({
      classpathEntries: [fixture.jarB, fixture.jarA],
    });
    expect(afterReorderedJars.buildKey).not.toBe(initial.buildKey);

    // Mutate 1 byte of a classpath JAR
    await writeFile(fixture.jarB, Buffer.from("synthetic-jar-beta-bytez"));
    const afterMutatedJar = await compute();
    expect(afterMutatedJar.buildKey).not.toBe(initial.buildKey);
  });

  it("detects and rebuilds corrupt, truncated, missing, extra-file, or bad-manifest cache entries", async () => {
    const fixture = await createBuildFixture();
    let compileCount = 0;
    const base = fixture.buildParameters();
    const runBuild = () =>
      ensureCachedJavaHelperBuild({
        ...base,
        compileIntoDirectory: async (stagingClasses) => {
          compileCount += 1;
          return base.compileIntoDirectory(stagingClasses);
        },
      });

    const initial = await runBuild();
    expect(compileCount).toBe(1);
    const entryDir = join(fixture.cacheDir, "builds", initial.buildKey);

    // 1. Corrupt .class bytes
    await writeFile(
      join(initial.compiledOracleDirectory, "OracleA.class"),
      Buffer.from("CORRUPT"),
    );
    const rebuiltCorruptClass = await runBuild();
    expect(rebuiltCorruptClass.cacheStatus).toBe("rebuilt-corrupt");
    expect(compileCount).toBe(2);
    expect(
      (
        await readFile(join(initial.compiledOracleDirectory, "OracleA.class"))
      ).toString("utf8"),
    ).toBe("CAFEBABE-OracleA");

    // 2. Delete a cached .class file
    await unlink(
      join(initial.compiledOracleDirectory, "nested", "OracleB.class"),
    );
    const rebuiltMissingClass = await runBuild();
    expect(rebuiltMissingClass.cacheStatus).toBe("rebuilt-corrupt");
    expect(compileCount).toBe(3);

    // 3. Inject an unexpected extra file into classes/
    await writeFile(
      join(initial.compiledOracleDirectory, "Sneaky.class"),
      Buffer.from("EXTRA"),
    );
    const rebuiltExtraFile = await runBuild();
    expect(rebuiltExtraFile.cacheStatus).toBe("rebuilt-corrupt");
    expect(compileCount).toBe(4);
    expect(await readdir(initial.compiledOracleDirectory)).not.toContain(
      "Sneaky.class",
    );

    // 4. Corrupt manifest.json (invalid JSON)
    await writeFile(join(entryDir, "manifest.json"), "{not-valid-json", "utf8");
    const rebuiltBadJson = await runBuild();
    expect(rebuiltBadJson.cacheStatus).toBe("rebuilt-corrupt");
    expect(compileCount).toBe(5);

    // 5. Corrupt manifest buildKey
    const validManifest = JSON.parse(
      await readFile(join(entryDir, "manifest.json"), "utf8"),
    );
    await writeFile(
      join(entryDir, "manifest.json"),
      JSON.stringify({ ...validManifest, buildKey: "0".repeat(64) }),
      "utf8",
    );
    const rebuiltBadKey = await runBuild();
    expect(rebuiltBadKey.cacheStatus).toBe("rebuilt-corrupt");
    expect(compileCount).toBe(6);

    // Next read hits cleanly
    const hitAgain = await runBuild();
    expect(hitAgain.cacheStatus).toBe("hit");
    expect(compileCount).toBe(6);
  });

  it("leaves no partial cache entry and cleans staging when compilation fails", async () => {
    const fixture = await createBuildFixture();
    const base = fixture.buildParameters();

    await expect(
      ensureCachedJavaHelperBuild({
        ...base,
        compileIntoDirectory: async (stagingClasses) => {
          await mkdir(stagingClasses, { recursive: true });
          await writeFile(
            join(stagingClasses, "Partial.class"),
            Buffer.from("partial"),
          );
          throw new Error("Simulated javac failure");
        },
      }),
    ).rejects.toThrow("Simulated javac failure");

    expect(await readdir(join(fixture.cacheDir, "builds"))).toEqual([]);
    expect(await readdir(join(fixture.cacheDir, "staging"))).toEqual([]);
  });

  it("handles competing concurrent writers on the same cache key without corruption", async () => {
    const fixture = await createBuildFixture();
    const base = fixture.buildParameters();
    let startedCompiles = 0;

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        ensureCachedJavaHelperBuild({
          ...base,
          compileIntoDirectory: async (stagingClasses) => {
            startedCompiles += 1;
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
            return base.compileIntoDirectory(stagingClasses);
          },
        }),
      ),
    );

    expect(startedCompiles).toBeGreaterThanOrEqual(1);
    const first = results[0];
    for (const outcome of results) {
      expect(outcome.buildKey).toBe(first.buildKey);
      expect(outcome.compiledOracleDirectory).toBe(
        first.compiledOracleDirectory,
      );
      expect(outcome.manifestSha256).toBe(first.manifestSha256);
      expect(["miss", "hit", "hit-after-race"]).toContain(outcome.cacheStatus);
    }
    expect(await readdir(join(fixture.cacheDir, "staging"))).toEqual([]);
  });

  it("probes compiler identity and fails closed on non-zero exit", async () => {
    const failing = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "javac missing",
    });
    await expect(
      probeJavaCompilerIdentity({ executeProcess: failing }),
    ).rejects.toThrow(/javac/u);
  });

  it("reports verifyCachedJavaHelperBuild rejection on invalid descriptor", async () => {
    const fixture = await createBuildFixture();
    const first = await ensureCachedJavaHelperBuild(fixture.buildParameters());
    const entryDir = join(fixture.cacheDir, "builds", first.buildKey);
    const descriptor = {
      schemaVersion: JAVA_HELPER_BUILD_CACHE_SCHEMA_VERSION,
      compilerIdentity: { ...fixture.compilerIdentity, version: "99.0.0" },
      compilerOptions: fixture.compilerOptions,
      sources: await hashJavaSources({
        launcherSource: fixture.launcherSource,
        oracleSources: [fixture.oracleA, fixture.oracleB],
      }),
      classpath: await hashOrderedClasspathEntries([
        fixture.jarA,
        fixture.jarB,
      ]),
    };

    const check = await verifyCachedJavaHelperBuild(
      entryDir,
      descriptor,
      first.buildKey,
    );
    expect(check.valid).toBe(false);
    expect(typeof sha256(Buffer.from("x"))).toBe("string");
  });
});

const detectTestJavaHome = () => {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    process.env.JAVA_HOME,
    "C:/Program Files/Eclipse Adoptium/jdk-25.0.5.10002-hotspot",
  ].filter(Boolean);
  return (
    candidates.find(
      (candidate) =>
        existsSync(join(candidate, "bin", `javac${suffix}`)) &&
        existsSync(join(candidate, "bin", `jar${suffix}`)),
    ) ?? null
  );
};

const describeLiveJdk = detectTestJavaHome() ? describe : describe.skip;

describeLiveJdk("cross-process real JDK cache reuse", () => {
  it("compiles once with real javac and runs separate fresh JVMs across two processes and output directories", async () => {
    const javaHome = detectTestJavaHome();
    const suffix = process.platform === "win32" ? ".exe" : "";
    const javacPath = join(javaHome, "bin", `javac${suffix}`);
    const javaPath = join(javaHome, "bin", `java${suffix}`);
    const jarPath = join(javaHome, "bin", `jar${suffix}`);

    const root = await makeTempRoot("owlapi-live-cache-test-");
    const depSrcDir = join(root, "dep-src", "demo");
    const depClassesDir = join(root, "dep-classes");
    const cacheDir = join(root, "cache");
    const outA = join(root, "outA");
    const outB = join(root, "outB");
    await mkdir(depSrcDir, { recursive: true });
    await mkdir(depClassesDir, { recursive: true });
    await mkdir(outA, { recursive: true });
    await mkdir(outB, { recursive: true });

    const depJava = join(depSrcDir, "DepGreeting.java");
    await writeFile(
      depJava,
      'package demo;\npublic final class DepGreeting {\n  public static String text() { return "hello-from-jar"; }\n}\n',
      "utf8",
    );
    await execFileAsync(javacPath, ["-d", depClassesDir, depJava], {
      windowsHide: true,
    });
    const depJar = join(root, "dep.jar");
    await execFileAsync(
      jarPath,
      ["--create", "--file", depJar, "-C", depClassesDir, "."],
      { windowsHide: true },
    );

    const probeJava = join(root, "ProbeEcho.java");
    await writeFile(
      probeJava,
      [
        "import demo.DepGreeting;",
        "import java.nio.file.Files;",
        "import java.nio.file.Path;",
        "public final class ProbeEcho {",
        "  public static void main(String[] args) throws Exception {",
        '    String json = "{\\"greeting\\":\\"" + DepGreeting.text() + "\\",\\"pid\\":" + ProcessHandle.current().pid() + "}";',
        "    Files.writeString(Path.of(args[0]), json);",
        "  }",
        "}",
      ].join("\n"),
      "utf8",
    );

    const moduleUrl = pathToFileURL(
      fileURLToPath(new URL("./java-helper-build-cache.mjs", import.meta.url)),
    ).href;
    const workerScript = join(root, "worker.mjs");
    await writeFile(
      workerScript,
      [
        'import { execFile } from "node:child_process";',
        'import { mkdir, writeFile } from "node:fs/promises";',
        'import { delimiter, join } from "node:path";',
        'import { promisify } from "node:util";',
        `import { ensureCachedJavaHelperBuild, probeJavaCompilerIdentity } from ${JSON.stringify(moduleUrl)};`,
        "const execFileAsync = promisify(execFile);",
        "const [javacPath, javaPath, cacheDir, depJar, probeJava, outDir] = process.argv.slice(2);",
        "const executeProcess = async (program, args) => {",
        '  const exe = program === "javac" ? javacPath : javaPath;',
        "  try {",
        "    const r = await execFileAsync(exe, args, { windowsHide: true, encoding: 'utf8' });",
        "    return { exitCode: 0, stdout: r.stdout, stderr: r.stderr };",
        "  } catch (e) {",
        "    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };",
        "  }",
        "};",
        "let compiled = false;",
        "const compilerIdentity = await probeJavaCompilerIdentity({ executeProcess });",
        "const cached = await ensureCachedJavaHelperBuild({",
        "  cacheDirectory: cacheDir,",
        "  compilerIdentity,",
        "  compilerOptions: ['-encoding', 'UTF-8'],",
        "  oracleSources: [probeJava],",
        "  classpathEntries: [depJar],",
        "  requiredOutputs: ['ProbeEcho.class'],",
        "  compileIntoDirectory: async (stagingClasses) => {",
        "    compiled = true;",
        "    await mkdir(stagingClasses, { recursive: true });",
        "    const r = await executeProcess('javac', ['-encoding', 'UTF-8', '-cp', depJar, '-d', stagingClasses, probeJava]);",
        "    if (r.exitCode !== 0) { throw new Error(r.stderr); }",
        "    return r;",
        "  },",
        "});",
        "const outJson = join(outDir, 'jvm.json');",
        "await execFileAsync(javaPath, ['-cp', [cached.compiledOracleDirectory, depJar].join(delimiter), 'ProbeEcho', outJson], { windowsHide: true });",
        "await writeFile(join(outDir, 'worker.json'), JSON.stringify({ cacheStatus: cached.cacheStatus, compiled, buildKey: cached.buildKey, manifestSha256: cached.manifestSha256 }), 'utf8');",
      ].join("\n"),
      "utf8",
    );

    await execFileAsync(
      process.execPath,
      [workerScript, javacPath, javaPath, cacheDir, depJar, probeJava, outA],
      { windowsHide: true },
    );
    const outABeforeSecond = await readFile(join(outA, "jvm.json"));

    await execFileAsync(
      process.execPath,
      [workerScript, javacPath, javaPath, cacheDir, depJar, probeJava, outB],
      { windowsHide: true },
    );
    const outAAfterSecond = await readFile(join(outA, "jvm.json"));

    const workerA = JSON.parse(
      await readFile(join(outA, "worker.json"), "utf8"),
    );
    const workerB = JSON.parse(
      await readFile(join(outB, "worker.json"), "utf8"),
    );
    const jvmA = JSON.parse(outABeforeSecond.toString("utf8"));
    const jvmB = JSON.parse(await readFile(join(outB, "jvm.json"), "utf8"));

    expect(outAAfterSecond.equals(outABeforeSecond)).toBe(true);
    expect(workerA.cacheStatus).toBe("miss");
    expect(workerA.compiled).toBe(true);
    expect(workerB.cacheStatus).toBe("hit");
    expect(workerB.compiled).toBe(false);
    expect(workerB.buildKey).toBe(workerA.buildKey);
    expect(workerB.manifestSha256).toBe(workerA.manifestSha256);
    expect(jvmA.greeting).toBe("hello-from-jar");
    expect(jvmB.greeting).toBe("hello-from-jar");
    expect(jvmA.pid).not.toBe(jvmB.pid);
  });
});
