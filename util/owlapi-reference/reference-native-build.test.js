import { afterEach, describe, expect, jest, test } from "@jest/globals";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  prepareReferenceBuild,
  referenceBuildEnvironment,
  referenceToolIdentity,
} from "./reference-native-build.mjs";
import { REFERENCE_RECIPE } from "./reference-inputs.mjs";

const roots = [];
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "reference-tools-"));
  roots.push(root);
  const tool = join(root, "tool");
  mkdirSync(join(tool, "bin"), { recursive: true });
  writeFileSync(join(tool, "bin/java"), "selected executable\n");
  writeFileSync(join(tool, "release"), "selected distribution\n");
  return { root, tool };
};
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("optional preparation timeout recovery", () => {
  test.each([false, true])(
    "an exhausted or expired key still attempts one required build; compilation failure=%s",
    async (compilationFails) => {
      // Native command responses and time are controlled; the collector's real
      // orchestration, filesystem records and failure boundaries execute. This
      // is a portable regression, not a claim of native Linux qualification.
      const originalPlatform = Object.getOwnPropertyDescriptor(
        process,
        "platform",
      );
      const { root } = fixture();
      const source = join(root, "source");
      const jdk = join(root, "jdk");
      const maven = join(root, "maven");
      const workspace = join(root, "workspace");
      for (const path of [source, jdk, maven]) mkdirSync(path);
      let now = 1_800_000_000_000;
      const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
      let packages = 0;
      const spawn = jest.fn((executable, args, options) => {
        expect(options.shell).toBe(false);
        expect(options.timeout).toBeGreaterThan(0);
        expect(options.timeout).toBeLessThanOrEqual(180_000);
        const success = (stdout = "") => ({ stdout, stderr: "", status: 0 });
        if (executable === "/usr/bin/git") {
          if (args.includes("--show-toplevel")) return success(source);
          if (args.includes("HEAD^{tree}"))
            return success(REFERENCE_RECIPE.sourceTree);
          if (args.includes("HEAD"))
            return success(REFERENCE_RECIPE.sourceCommit);
          return success();
        }
        if (args.includes("-v"))
          return success(
            "Apache Maven 3.10.0 (c43a36b8d67be7e0805a411bc0898af1a51f5472)",
          );
        if (executable.endsWith("java"))
          return success(
            JSON.stringify({
              "java.version": "25.0.4.1",
              "java.vendor": "Eclipse Adoptium",
              runtime: "25.0.4.1+1-LTS",
            }),
          );
        if (args.includes("package")) {
          packages++;
          if (compilationFails)
            return { stdout: "", stderr: "compile failed", status: 1 };
          mkdirSync(join(source, "distribution/target"), { recursive: true });
          writeFileSync(
            join(source, "distribution/target/owlapi-runtime-classpath.txt"),
            "fresh.jar\n",
          );
          return success();
        }
        now += 4 * 60_000 + 1;
        return {
          stdout: "",
          stderr: "timed out",
          status: null,
          error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
        };
      });
      try {
        Object.defineProperty(process, "platform", {
          value: "linux",
          configurable: true,
        });
        jest.resetModules();
        jest.unstable_mockModule("node:child_process", () => ({
          spawnSync: spawn,
        }));
        const { prepareReferenceBuild: collect } =
          await import("./reference-native-build.mjs");
        const options = {
          sourceDirectory: source,
          workspaceDirectory: workspace,
          jdkDirectory: jdk,
          mavenDirectory: maven,
          host: {},
        };
        const prepared = collect(options);
        expect(prepared.inputRecord).toBeNull();
        expect(prepared.reason).toBe("NATIVE_KEY_UNAVAILABLE");
        expect(
          JSON.parse(readFileSync(join(workspace, "preparation.json"), "utf8"))
            .deadline,
        ).toBeLessThan(now);
        // Resume the actual sealed local state after its optional key expired.
        const resumed = collect({ ...options, resume: true });
        expect(resumed.inputRecord).toBeNull();
        if (compilationFails)
          expect(() => resumed.buildFresh()).toThrow("native package failed");
        else
          expect(resumed.buildFresh()).toEqual({
            status: "UNQUALIFIED_INPUTS",
            reason: "NATIVE_BUILD_INPUTS_UNVERIFIABLE",
          });
        expect(packages).toBe(1);
        expect(() => resumed.buildFresh()).toThrow("already attempted");
        expect(packages).toBe(1);
      } finally {
        Object.defineProperty(process, "platform", originalPlatform);
        clock.mockRestore();
        jest.unstable_unmockModule("node:child_process");
        jest.resetModules();
      }
    },
  );
});

describe("native tool/environment boundary", () => {
  test("tool identity excludes location and mtimes while binding every file byte", () => {
    const { root, tool } = fixture();
    const copy = join(root, "relocated");
    cpSync(tool, copy, { recursive: true });
    const original = referenceToolIdentity(tool);
    utimesSync(join(copy, "release"), new Date(0), new Date(0));
    expect(referenceToolIdentity(copy)).toEqual(original);
    writeFileSync(join(copy, "release"), "different distribution\n");
    expect(referenceToolIdentity(copy).sha256).not.toBe(original.sha256);
    writeFileSync(
      join(tool, "bin/additional-plugin"),
      "unclassified tool input\n",
    );
    expect(referenceToolIdentity(tool).sha256).not.toBe(original.sha256);
  });

  test("tool path identity prevents delimiter ambiguity", () => {
    const { tool } = fixture();
    const original = referenceToolIdentity(tool).sha256;
    writeFileSync(join(tool, "other"), "selected distribution\n");
    expect(referenceToolIdentity(tool).sha256).not.toBe(original);
  });

  test("only explicit build variables reach the native process", () => {
    const environment = referenceBuildEnvironment({
      jdkDirectory: "/selected/jdk",
      mavenDirectory: "/selected/maven",
      userHome: "/private/home",
      temporaryDirectory: "/private/tmp",
    });
    expect(Object.keys(environment).sort()).toEqual([
      "HOME",
      "JAVA_HOME",
      "LANG",
      "LC_ALL",
      "M2_HOME",
      "MAVEN_HOME",
      "MAVEN_OPTS",
      "MAVEN_SKIP_RC",
      "PATH",
      "TERM",
      "TMPDIR",
      "TZ",
    ]);
    expect(environment).toMatchObject({
      HOME: resolve("/private/home"),
      LC_ALL: "C.UTF-8",
      MAVEN_SKIP_RC: "1",
      TZ: "UTC",
    });
    expect(environment.MAVEN_OPTS).toContain(
      `-Duser.home=${resolve("/private/home")}`,
    );
    expect(environment.PATH).toBe(
      `${join(resolve("/selected/jdk"), "bin")}:${join(resolve("/selected/maven"), "bin")}:/usr/bin:/bin`,
    );
    expect(environment.GH_TOKEN).toBeUndefined();
    expect(environment.JAVA_TOOL_OPTIONS).toBeUndefined();
    expect(environment.LD_PRELOAD).toBeUndefined();
  });

  test.each(["/private/a b", "/private/a\nb", "/private/a'", "/private/a`b"])(
    "rejects paths that Maven shell startup would reinterpret",
    (path) => {
      expect(() =>
        referenceBuildEnvironment({
          jdkDirectory: path,
          mavenDirectory: "/maven",
          userHome: "/home",
          temporaryDirectory: "/tmp",
        }),
      ).toThrow("launcher path");
    },
  );

  const posixTest = process.platform === "win32" ? test.skip : test;
  posixTest(
    "binds executable permissions and refuses links outside the selected distribution",
    () => {
      const { root, tool } = fixture();
      const original = referenceToolIdentity(tool).sha256;
      chmodSync(join(tool, "bin/java"), 0o700);
      expect(referenceToolIdentity(tool).sha256).not.toBe(original);
      writeFileSync(join(root, "outside"), "foreign input\n");
      symlinkSync(join(root, "outside"), join(tool, "outside-link"));
      expect(() => referenceToolIdentity(tool)).toThrow("link leaves");
    },
  );
  if (process.platform !== "linux") {
    test("native execution rejects an unqualified host before filesystem mutation", () => {
      expect(() => prepareReferenceBuild({})).toThrow("qualified Linux host");
    });
  }
});
