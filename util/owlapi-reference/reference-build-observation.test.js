import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  captureNativeReferenceObservation,
  nativeReferenceRecipe,
} from "./reference-build-observation.mjs";

let root;
let options;
const reportNames = [
  "maven-version.txt",
  "java-version.txt",
  "effective-pom.xml",
  "active-profiles.txt",
  "runtime-tree.json",
  "runtime-classpath.txt",
  "plugins.txt",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function git(...args) {
  const result = spawnSync("git", args, {
    cwd: options.sourceDirectory,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "owlapi-native-observation-"));
  options = {
    sourceDirectory: join(root, "source"),
    reportsDirectory: join(root, "reports"),
    localRepository: join(root, "cache"),
    userHome: join(root, "home"),
    outputPath: join(root, "observation.json"),
  };
  for (const directory of [
    options.sourceDirectory,
    options.reportsDirectory,
    options.localRepository,
    options.userHome,
    join(root, "hooks"),
  ])
    mkdirSync(directory);
  git("init", "--quiet", `--template=${join(root, "hooks")}`);
  writeFileSync(join(options.sourceDirectory, "pom.xml"), "fixture project\n");
  git("add", "pom.xml");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "-c",
    "commit.gpgsign=false",
    "-c",
    `core.hooksPath=${join(root, "hooks")}`,
    "commit",
    "--quiet",
    "-m",
    "fixture",
  );
  options.expectedRevision = git("rev-parse", "HEAD");
  // Synthetic raw reports exercise sealing, not native Maven execution evidence.
  for (const name of reportNames)
    writeFileSync(join(options.reportsDirectory, name), `fixture:${name}\n`);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("binds actual Git identity and raw report bytes without claiming reuse or authenticating fixture reports", () => {
  const result = captureNativeReferenceObservation(options);
  expect(result.observation.source).toEqual({
    commit: options.expectedRevision,
    tree: git("rev-parse", "HEAD^{tree}"),
  });
  expect(result.observation.nativeReports).toHaveLength(7);
  expect(
    result.observation.nativeReports.find((x) => x.file === "plugins.txt")
      .sha256,
  ).toBe(sha256(readFileSync(join(options.reportsDirectory, "plugins.txt"))));
  expect(result.observation.semanticCompatibilityKey).toBeNull();
  expect(result.observation.sharedReuse).toBe("DISABLED");
  expect(result.observation.reportOrigin).toBe(
    "CALLER_SUPPLIED_NOT_AUTHENTICATED",
  );
  expect(result.observation.recipeExecution).toBe(
    "CALLER_DECLARATION_NOT_VALIDATED",
  );
  expect(result.observation.recipeReportAssociation).toBe("NOT_ESTABLISHED");
  expect(result.observationSha256).toBe(
    sha256(readFileSync(options.outputPath)),
  );
});

test("records report contents only as digests", () => {
  writeFileSync(
    join(options.reportsDirectory, "maven-version.txt"),
    "private fixture marker",
  );
  captureNativeReferenceObservation(options);
  expect(readFileSync(options.outputPath, "utf8")).not.toContain(
    "private fixture marker",
  );
});

test("fixed native recipe uses exact plugin goals and both controlled settings scopes", () => {
  const recipe = nativeReferenceRecipe(options);
  expect(recipe.effectivePom).toContain(
    "org.apache.maven.plugins:maven-help-plugin:3.5.2:effective-pom",
  );
  expect(recipe.build).toContain(
    "org.apache.maven.plugins:maven-dependency-plugin:3.11.0:build-classpath",
  );
  expect(recipe.build).not.toContain("dependency:build-classpath");
  expect(recipe.build[recipe.build.indexOf("-s") + 1]).toBe(recipe.settings);
  expect(recipe.build[recipe.build.indexOf("-gs") + 1]).toBe(recipe.settings);
  expect(recipe.build).toContain("-o");
});

test.each(["effective-settings.xml", "environment.txt"])(
  "rejects undeclared report %s before writing output",
  (file) => {
    writeFileSync(join(options.reportsDirectory, file), "unapproved metadata");
    expect(() => captureNativeReferenceObservation(options)).toThrow(
      /extra report/,
    );
    expect(existsSync(options.outputPath)).toBe(false);
  },
);

test("refuses dirty source bytes and a mismatched source revision", () => {
  expect(() =>
    captureNativeReferenceObservation({
      ...options,
      expectedRevision: "0".repeat(40),
    }),
  ).toThrow(/revision mismatch/);
  writeFileSync(join(options.sourceDirectory, "pom.xml"), "changed fixture\n");
  expect(() => captureNativeReferenceObservation(options)).toThrow(
    /dirty source/,
  );
  expect(existsSync(options.outputPath)).toBe(false);
});

test("requires the actual checkout root", () => {
  mkdirSync(join(options.sourceDirectory, "nested"));
  expect(() =>
    captureNativeReferenceObservation({
      ...options,
      sourceDirectory: join(options.sourceDirectory, "nested"),
    }),
  ).toThrow(/checkout root/);
});

test("refuses missing and empty native reports", () => {
  rmSync(join(options.reportsDirectory, "runtime-tree.json"));
  expect(() => captureNativeReferenceObservation(options)).toThrow(/missing/);
  writeFileSync(join(options.reportsDirectory, "runtime-tree.json"), "");
  expect(() => captureNativeReferenceObservation(options)).toThrow(/empty/);
});

test("refuses report hardlinks", () => {
  linkSync(
    join(options.reportsDirectory, "plugins.txt"),
    join(root, "linked.txt"),
  );
  expect(() => captureNativeReferenceObservation(options)).toThrow(/linked/);
});

test("refuses aliased report directories", () => {
  const alias = join(root, "alias");
  symlinkSync(
    options.reportsDirectory,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  expect(() =>
    captureNativeReferenceObservation({ ...options, reportsDirectory: alias }),
  ).toThrow(/aliased/);
});

test("refuses per-report and total bounds", () => {
  writeFileSync(
    join(options.reportsDirectory, "plugins.txt"),
    Buffer.alloc(8 * 1024 * 1024 + 1),
  );
  expect(() => captureNativeReferenceObservation(options)).toThrow(/oversized/);
  for (const file of reportNames)
    writeFileSync(
      join(options.reportsDirectory, file),
      Buffer.alloc(5 * 1024 * 1024),
    );
  expect(() => captureNativeReferenceObservation(options)).toThrow(
    /total report limit/,
  );
});

test("preserves an existing destination and refuses output within raw reports", () => {
  writeFileSync(options.outputPath, "existing unrelated bytes");
  expect(() => captureNativeReferenceObservation(options)).toThrow();
  expect(readFileSync(options.outputPath, "utf8")).toBe(
    "existing unrelated bytes",
  );
  expect(() =>
    captureNativeReferenceObservation({
      ...options,
      outputPath: join(options.reportsDirectory, "observation.json"),
    }),
  ).toThrow(/outside reports/);
});

(process.platform === "win32" ? test : test.skip)(
  "accepts Windows checkout casing and rejects output inside differently cased reports",
  () => {
    const result = captureNativeReferenceObservation({
      ...options,
      sourceDirectory: options.sourceDirectory.toUpperCase(),
    });
    expect(result.observation.source.commit).toBe(options.expectedRevision);
    expect(() =>
      captureNativeReferenceObservation({
        ...options,
        outputPath: join(options.reportsDirectory.toUpperCase(), "inside.json"),
      }),
    ).toThrow(/outside reports/);
    expect(existsSync(join(options.reportsDirectory, "inside.json"))).toBe(
      false,
    );
  },
);
