import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  opendirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(readFileSync(join(here, "pinned-version.json"), "utf8"));
const settings = join(here, "reference-build-settings.xml");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const reports = [
  "maven-version.txt",
  "java-version.txt",
  "effective-pom.xml",
  "active-profiles.txt",
  "runtime-tree.json",
  "runtime-classpath.txt",
  "plugins.txt",
];
const fail = (message) => {
  throw new Error(`Native reference observation rejected: ${message}`);
};
const comparablePath = (value) =>
  process.platform === "win32" ? value.toLowerCase() : value;

function plainPath(path) {
  const absolute = resolve(path);
  const canonical = realpathSync.native(absolute);
  if (comparablePath(absolute) !== comparablePath(canonical))
    fail("aliased path");
  return absolute;
}

/** Fixed native goals only. Callers execute argv through their native launcher.
 * This module neither executes Maven nor implements its model/resolver semantics.
 */
export function nativeReferenceRecipe({
  localRepository,
  userHome,
  reportsDirectory,
}) {
  const output = resolve(reportsDirectory);
  const common = [
    "-B",
    "-ntp",
    "-o",
    "-s",
    settings,
    "-gs",
    settings,
    `-Dmaven.repo.local=${resolve(localRepository)}`,
    `-Duser.home=${resolve(userHome)}`,
    "-pl",
    "distribution",
    "-am",
    "-Dmaven.test.skip=true",
    "-Dno-javadoc=true",
  ];
  const help = "org.apache.maven.plugins:maven-help-plugin:3.5.2";
  const dependency = "org.apache.maven.plugins:maven-dependency-plugin:3.11.0";
  return {
    purpose: "LOCAL_INPUT_OBSERVATION_ONLY",
    settings,
    effectivePom: [
      ...common,
      `${help}:effective-pom`,
      "-Dverbose=true",
      `-Doutput=${join(output, "effective-pom.xml")}`,
    ],
    activeProfiles: [...common, `${help}:active-profiles`],
    runtimeTree: [
      ...common,
      `${dependency}:tree`,
      "-Dscope=runtime",
      "-DoutputType=json",
      "-DappendOutput=true",
      `-DoutputFile=${join(output, "runtime-tree.json")}`,
    ],
    build: [
      ...common,
      "package",
      `${dependency}:build-classpath`,
      "-DincludeScope=runtime",
      "-Dmdep.outputFile=target/owlapi-runtime-classpath.txt",
    ],
    pluginSuperset: [
      ...common,
      `${dependency}:resolve-plugins`,
      "-DappendOutput=true",
      "-DoutputAbsoluteArtifactFilename=true",
      `-DoutputFile=${join(output, "plugins.txt")}`,
    ],
  };
}

function sourceIdentity(sourceDirectory, expectedRevision) {
  if (!/^[a-f0-9]{40}$/u.test(expectedRevision))
    fail("invalid expected revision");
  const root = plainPath(sourceDirectory);
  const git = (...arguments_) => {
    const result = spawnSync("git", arguments_, {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    if (result.error || result.signal || result.status !== 0)
      fail("Git observation failed");
    return result.stdout.trim();
  };
  const commit = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  if (
    comparablePath(plainPath(git("rev-parse", "--show-toplevel"))) !==
    comparablePath(root)
  )
    fail("source must be the checkout root");
  if (commit !== expectedRevision || !/^[a-f0-9]{40}$/u.test(tree))
    fail("source revision mismatch");
  if (git("status", "--porcelain=v1", "--untracked-files=all"))
    fail("dirty source checkout");
  return { commit, tree };
}

function reportIdentity(path) {
  plainPath(path);
  const before = lstatSync(path);
  if (
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size === 0 ||
    before.size > 8 * 1024 * 1024
  )
    fail("nonregular, empty, linked or oversized report");
  const fd = openSync(path, "r");
  try {
    const opened = fstatSync(fd);
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size
    )
      fail("changed report identity");
    const data = readFileSync(fd);
    const after = fstatSync(fd);
    if (
      data.length !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      after.size !== opened.size
    )
      fail("report changed while reading");
    return {
      file: path.split(/[\\/]/u).at(-1),
      bytes: data.length,
      sha256: digest(data),
    };
  } finally {
    closeSync(fd);
  }
}

/** Seal raw files in a private, quiescent local namespace. Report origin and
 * successful command execution remain caller evidence, not authenticated here.
 * A seal is deliberately neither a semantic build key nor a reuse verdict.
 */
export function captureNativeReferenceObservation({
  sourceDirectory,
  reportsDirectory,
  outputPath,
  localRepository,
  userHome,
  expectedRevision = pin.sourceRevision,
}) {
  const source = sourceIdentity(sourceDirectory, expectedRevision);
  const root = plainPath(reportsDirectory);
  const entries = [];
  const handle = opendirSync(root);
  try {
    for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
      if (entries.length === reports.length) fail("extra report");
      entries.push(entry.name);
    }
  } finally {
    handle.closeSync();
  }
  if (entries.sort().join() !== [...reports].sort().join())
    fail("missing or unexpected report");
  const nativeReports = reports.map((file) => reportIdentity(join(root, file)));
  if (
    nativeReports.reduce((sum, item) => sum + item.bytes, 0) >
    32 * 1024 * 1024
  )
    fail("total report limit exceeded");
  const after = sourceIdentity(sourceDirectory, expectedRevision);
  if (after.commit !== source.commit || after.tree !== source.tree)
    fail("source changed while observing");
  const observation = {
    schemaVersion: 1,
    purpose: "LOCAL_INPUT_OBSERVATION_ONLY",
    redistribution: "NOT_CLEARED",
    sharedReuse: "DISABLED",
    semanticCompatibilityKey: null,
    source,
    recipeSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
    settingsSha256: digest(readFileSync(settings)),
    declaredRecipe: nativeReferenceRecipe({
      localRepository,
      userHome,
      reportsDirectory,
    }),
    recipeExecution: "CALLER_DECLARATION_NOT_VALIDATED",
    nativeReports,
    reportOrigin: "CALLER_SUPPLIED_NOT_AUTHENTICATED",
    recipeReportAssociation: "NOT_ESTABLISHED",
    pluginScope:
      "PROJECT_AND_REPORT_PLUGIN_SUPERSET_NOT_PACKAGE_EXECUTED_CLOSURE",
    unresolved: [
      "Per-report origin and correspondence to the declared recipe",
      "Git-ignored inputs and retained build outputs are not bound by source identity",
      "Package-executed plugin and extension byte closure",
      "Resolved dependency byte inventory and repository/settings identity",
      "Exact JDK distribution/build identity and semantic environment policy",
      "Hosted recipe/toolchain pinning and environment qualification",
      "Public Java rights, producer, transport and activation gates",
    ],
  };
  const output = resolve(outputPath);
  plainPath(dirname(output));
  if (comparablePath(dirname(output)) === comparablePath(root))
    fail("output must be outside reports directory");
  const bytes = Buffer.from(`${JSON.stringify(observation, null, 2)}\n`);
  writeFileSync(output, bytes, { flag: "wx", mode: 0o600 });
  return { observation, observationSha256: digest(bytes) };
}
