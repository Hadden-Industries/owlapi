import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { verifyProfileAuthorityAmendments } from "./profile-authority-amendments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../..");
const fixture = join(here, "fixtures/profiles/canonical-vowl-inputs.json");
const expectationsPath = join(
  here,
  "fixtures/profiles/canonical-vowl-expectations.json",
);
const harness = join(here, "RunOWL2DLProfile.java");
const pinPath = join(here, "pinned-version.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fileEvidence = (path) => ({
  path: resolve(path),
  sha256: sha256(readFileSync(path)),
});

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repository,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16777216,
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    command +
      " failed (" +
      (result.signal ?? "no signal") +
      "): " +
      result.stderr,
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
    signal: result.signal,
  };
}
const run = (command, args, options) => execute(command, args, options).stdout;
const gitHead = (cwd) => run("git", ["rev-parse", "HEAD"], { cwd }).trim();
const gitStatus = (cwd) =>
  run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd });
const runtimeEvidence = () =>
  [
    ...new Set(
      run("git", [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
      ])
        .split("\0")
        .filter(
          (path) =>
            /\.(?:js|mjs)$/u.test(path) &&
            !/(?:^|\/)(?:test|tests|node_modules)\//u.test(path) &&
            !/\.(?:test|spec)\.(?:js|mjs)$/u.test(path) &&
            !path.startsWith("util/owlapi-reference/"),
        ),
    ),
  ]
    .sort()
    .map((path) => ({
      path,
      sha256: sha256(readFileSync(join(repository, path))),
    }));

const options = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  assert.ok(
    [
      "--java-root",
      "--java",
      "--javac",
      "--output",
      "--java-only",
      "--prior-runner",
    ].includes(key),
    "Unknown option: " + key,
  );
  assert.ok(!options.has(key), "Duplicate option: " + key);
  if (key === "--java-only") options.set(key, true);
  else {
    const value = process.argv[++i];
    assert.ok(value && !value.startsWith("--"), "Missing value: " + key);
    options.set(key, value);
  }
}
for (const key of ["--java-root", "--java", "--javac"]) {
  assert.ok(options.has(key), "Required option: " + key);
}
assert.ok(
  !(options.has("--java-only") && options.has("--output")),
  "Java-only observation cannot issue a comparison receipt",
);
const outputPath = options.has("--output")
  ? resolve(options.get("--output"))
  : null;
assert.ok(
  !outputPath || !existsSync(outputPath),
  "Receipt path must be new; no existing evidence may be overwritten",
);
const javaRoot = realpathSync(resolve(options.get("--java-root")));
const java = realpathSync(resolve(options.get("--java")));
const javac = realpathSync(resolve(options.get("--javac")));
const priorRunner = options.has("--prior-runner")
  ? fileEvidence(options.get("--prior-runner"))
  : null;
if (priorRunner) {
  assert.equal(
    priorRunner.sha256,
    "63c2cfe3bf8e9ba99056e726e5cc48f922e16bb4697ba2244bf1dec0ec6d868d",
    "Archived predecessor runner changed",
  );
}
const pin = readJson(pinPath);
const revision = gitHead(javaRoot);
assert.equal(
  revision,
  pin.sourceRevision,
  "Java reference source revision changed",
);
assert.equal(
  gitStatus(javaRoot),
  "",
  "Java reference sources must be clean, including nonignored untracked files",
);

const inputs = readJson(fixture);
assert.equal(inputs.length, 20, "This is the bounded 20-case comparison");
assert.equal(
  new Set(inputs.map(({ id }) => id)).size,
  inputs.length,
  "Case IDs must be unique",
);
for (const { id, documents } of inputs) {
  assert.ok(
    typeof id === "string" &&
      id.length > 0 &&
      Array.isArray(documents) &&
      documents.length > 0,
  );
  assert.ok(
    documents.every(
      (document) => typeof document === "string" && document.length > 0,
    ),
  );
}
const expected = readJson(expectationsPath);
assert.equal(
  expected.inputSha256,
  sha256(readFileSync(fixture)),
  "Input fixture changed",
);
assert.deepEqual(
  expected.javascript.map(({ id }) => id),
  inputs.map(({ id }) => id),
  "Every source case needs an independent JavaScript expectation",
);
assert.deepEqual(
  expected.rationales.map(({ id }) => id),
  inputs.map(({ id }) => id),
  "Every source case needs a rationale",
);
const authorityAmendments = expected.localAuthorities.flatMap((authority) =>
  verifyProfileAuthorityAmendments(
    authority,
    readFileSync(join(repository, authority.path)),
  ),
);

const classpathFile = join(
  javaRoot,
  "distribution/target/owlapi-runtime-classpath.txt",
);
const classpath = readFileSync(classpathFile, "utf8").trim();
assert.ok(
  classpath,
  "The existing pinned reference runtime classpath must be present",
);
const referencePaths = classpath
  .split(delimiter)
  .map((path) => realpathSync(path));
const referenceArtifacts = referencePaths.map(fileEvidence);
const pinnedPaths = [
  fixture,
  expectationsPath,
  harness,
  pinPath,
  fileURLToPath(import.meta.url),
  join(here, "profile-authority-amendments.mjs"),
  join(here, "fixtures/profiles/README.md"),
  classpathFile,
  java,
  javac,
  process.execPath,
  ...(priorRunner ? [priorRunner.path] : []),
  ...expected.localAuthorities.map(({ path }) => join(repository, path)),
  ...["package.json", "package-lock.json"]
    .map((path) => join(repository, path))
    .filter(existsSync),
];
const pinnedFiles = [...new Set(pinnedPaths)].map(fileEvidence);
const candidateHead = gitHead(repository);
const runtime = runtimeEvidence();
const javaVersion = execute(java, ["-version"]);
const javacVersion = execute(javac, ["-version"]);
assert.ok(
  javaVersion.stdout.trim() || javaVersion.stderr.trim(),
  "Java version output was not captured",
);
assert.ok(
  javacVersion.stdout.trim() || javacVersion.stderr.trim(),
  "Compiler version output was not captured",
);

// Only the project-owned probe is compiled. Existing reference JARs are not rebuilt.
const buildDirectory = mkdtempSync(join(tmpdir(), "owlapi-profile-contract-"));
const environment = {
  ...process.env,
  CLASSPATH: buildDirectory + delimiter + classpath,
};
const compilation = execute(javac, ["-d", buildDirectory, harness], {
  env: environment,
});
const javaExecution = execute(
  java,
  ["-Xlog:class+load=info:stderr", "RunOWL2DLProfile", fixture],
  { env: environment },
);
const javaOutput = JSON.parse(javaExecution.stdout);
assert.equal(javaOutput.version, pin.owlapiVersionLine);
assert.deepEqual(
  javaOutput.observations.map(({ id }) => id),
  inputs.map(({ id }) => id),
);
const loadedPaths = [
  ...new Set(
    [
      ...javaExecution.stderr.matchAll(
        /\[class,load\].*? source: (file:\S+\.jar)\s*$/gmu,
      ),
    ].map((match) => realpathSync(fileURLToPath(match[1]))),
  ),
].sort();
assert.ok(loadedPaths.length > 0, "No actual loaded JAR origins were captured");
for (const path of loadedPaths)
  assert.ok(
    referencePaths.includes(path),
    "Loaded JAR outside the pinned classpath: " + path,
  );
for (const origin of [javaOutput.profileOrigin, javaOutput.managerOrigin]) {
  const path = realpathSync(fileURLToPath(origin));
  const local = relative(javaRoot, path);
  assert.ok(
    local &&
      local !== ".." &&
      !local.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) &&
      !isAbsolute(local),
    "Java OWLAPI classes must originate in the pinned reference worktree",
  );
  assert.ok(
    loadedPaths.includes(path),
    "Reported OWLAPI origin must be confirmed by the JVM class-load log",
  );
}
const loadedArtifacts = loadedPaths.map(fileEvidence);

let observations = null;
if (!options.has("--java-only")) {
  assert.deepEqual(
    javaOutput.observations,
    expected.java,
    "Pinned Java observations changed",
  );
  // Expectations above are authored from the contract; only the public API is executed here.
  const { OWL2DLProfile, OWLManager, StringDocumentSource } = await import(
    pathToFileURL(join(repository, "index.js"))
  );
  observations = [];
  for (const { id, documents } of inputs) {
    const manager = OWLManager.createOWLOntologyManager();
    let root;
    for (const document of documents)
      root = await manager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(document, { format: "functional" }),
        { parsingMode: "preserve" },
      );
    const report = await new OWL2DLProfile().checkOntology(root, {
      sourceAssessment: true,
    });
    const codes = (items) => [...new Set(items.map(({ code }) => code))].sort();
    observations.push({
      id,
      status: report.status,
      sourceStatus: report.sourceAssessment.status,
      closureSize: report.closure.length,
      violations: codes(report.violations),
      sourceViolations: codes(report.sourceAssessment.violations),
    });
  }
  assert.deepEqual(
    observations,
    expected.javascript,
    "Independent normative/source assessment expectations changed",
  );
}
assert.deepEqual(
  runtimeEvidence(),
  runtime,
  "Candidate JavaScript inventory changed during comparison",
);
assert.equal(
  gitHead(repository),
  candidateHead,
  "Candidate HEAD changed during comparison",
);
assert.deepEqual(
  [...new Set(pinnedPaths)].map(fileEvidence),
  pinnedFiles,
  "Inputs, authorities, tools or runner changed during comparison",
);
assert.deepEqual(
  referencePaths.map(fileEvidence),
  referenceArtifacts,
  "Reference classpath JARs changed during comparison",
);
assert.deepEqual(
  loadedPaths.map(fileEvidence),
  loadedArtifacts,
  "Executed JARs changed during comparison",
);
assert.equal(
  gitHead(javaRoot),
  revision,
  "Java reference HEAD changed during comparison",
);
assert.equal(
  gitStatus(javaRoot),
  "",
  "Java reference worktree changed during comparison",
);

if (options.has("--java-only")) {
  process.stdout.write(
    JSON.stringify(
      {
        mode: "java-only-observation",
        java: javaOutput,
        javaVersion,
        javacVersion,
        loadedArtifactCount: loadedArtifacts.length,
        classpathArtifactCount: referenceArtifacts.length,
        referenceBuildPerformed: false,
        endStateRechecked: true,
      },
      null,
      2,
    ) + "\n",
  );
} else if (outputPath) {
  const evidence = {
    schemaVersion: 3,
    status: "passed",
    recordedAt: new Date().toISOString(),
    scope:
      "Exactly the 20 pinned source cases; JavaScript formal/source expectations are independently derived. Java behavior is a separate observed comparison.",
    limitations: [
      "Existing Java reference JARs were hashed and executed, not rebuilt; a clean source pin does not establish their build provenance.",
      "Candidate source inventory is conservative and excludes tests/reference harnesses; it is not a transitive installed-dependency or release qualification.",
      "Per-case unique violation classes/codes and closure size are compared; multiplicity, messages, order and all other profile inputs are outside this evidence.",
    ],
    referenceBuildPerformed: false,
    endStateRechecked: true,
    node: {
      version: process.version,
      executable: process.execPath,
      platform: process.platform,
      architecture: process.arch,
    },
    javaVersion,
    javacVersion,
    compilation,
    buildDirectory,
    candidate: {
      repository,
      head: candidateHead,
      javascriptInventory: runtime,
    },
    reference: {
      root: javaRoot,
      revision,
      cleanIncludingUntracked: true,
      classpath: fileEvidence(classpathFile),
      classpathArtifacts: referenceArtifacts,
      loadedArtifacts,
      classLoadLog: javaExecution.stderr,
      classLoadLogSha256: sha256(javaExecution.stderr),
    },
    pinnedFiles,
    authorityAmendments,
    priorRunner,
    java: javaOutput,
    javascript: observations,
  };
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n", {
    flag: "wx",
  });
  process.stdout.write(
    "Profile comparison passed: " +
      observations.length +
      " cases; immutable receipt " +
      outputPath +
      "\n",
  );
} else {
  process.stdout.write(
    "Profile comparison passed: " +
      observations.length +
      " cases; " +
      loadedArtifacts.length +
      " loaded JARs hashed; end state unchanged; no receipt written\n",
  );
}
