import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  assertNativeBuildClosure,
  createReferenceInputRecord,
  readNativeChecksums,
  referenceBuildRecipe,
  REFERENCE_RECIPE,
  REFERENCE_JVM_OPTIONS,
} from "./reference-inputs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  throw new Error(`Native reference build rejected: ${message}`);
};
const within = (root, path) => {
  const part = relative(root, path);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};
const plainDirectory = (path) => {
  const absolute = resolve(path);
  const canonical = realpathSync.native(absolute);
  const same =
    process.platform === "win32"
      ? canonical.toLowerCase() === absolute.toLowerCase()
      : canonical === absolute;
  if (!same || !lstatSync(absolute).isDirectory())
    fail("aliased or non-directory root");
  return absolute;
};

/** Fingerprint the actual selected tool distribution bytes, including internal
 * links and executable modes. Location and mtimes are not semantic inputs.
 * This is file hashing, not Maven resolution or archive interpretation. */
export function referenceToolIdentity(directory) {
  const root = plainDirectory(directory);
  const identity = createHash("sha256");
  let entries = 0;
  let bytes = 0;
  const deadline = Date.now() + 30_000;
  const visit = (path) => {
    if (++entries > 10_000 || Date.now() >= deadline)
      fail("tool inventory budget");
    const name = relative(root, path).split(sep).join("/");
    if (name && !/^[A-Za-z0-9_ .+/-]{1,512}$/u.test(name))
      fail("unsupported tool path");
    const before = lstatSync(path);
    const mode = process.platform === "win32" ? 0 : before.mode % 512;
    if (before.isSymbolicLink()) {
      const target = readlinkSync(path);
      if (!within(root, realpathSync.native(path)) || isAbsolute(target))
        fail("tool link leaves selected distribution");
      identity.update(JSON.stringify([name, "link", mode, target]));
      return;
    }
    if (before.isDirectory()) {
      identity.update(JSON.stringify([name, "directory", mode]));
      for (const child of readdirSync(path).sort()) visit(join(path, child));
      return;
    }
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size > 512 * 1024 * 1024
    )
      fail("unsupported tool file");
    bytes += before.size;
    if (bytes > 1024 * 1024 * 1024) fail("tool byte budget");
    const fd = openSync(path, "r");
    try {
      const opened = fstatSync(fd);
      if (
        opened.dev !== before.dev ||
        opened.ino !== before.ino ||
        opened.size !== before.size
      )
        fail("tool file changed before reading");
      const fileHash = createHash("sha256");
      const buffer = Buffer.alloc(1024 * 1024);
      let offset = 0;
      for (
        let count = readSync(fd, buffer, 0, buffer.length, null);
        count;
        count = readSync(fd, buffer, 0, buffer.length, null)
      ) {
        if (Date.now() >= deadline) fail("tool inventory deadline");
        offset += count;
        fileHash.update(buffer.subarray(0, count));
      }
      const after = fstatSync(fd);
      if (
        offset !== before.size ||
        after.size !== opened.size ||
        after.ctimeMs !== opened.ctimeMs ||
        after.mtimeMs !== opened.mtimeMs
      )
        fail("tool file changed while reading");
      identity.update(
        JSON.stringify([
          name,
          "file",
          mode,
          before.size,
          fileHash.digest("hex"),
        ]),
      );
    } finally {
      closeSync(fd);
    }
  };
  visit(root);
  return { sha256: identity.digest("hex"), entries, bytes };
}

/** Build processes receive a closed environment. API credentials and inherited
 * JVM/Maven/loader/rc/proxy injection never reach the selected toolchain. */
export function referenceBuildEnvironment({
  jdkDirectory,
  mavenDirectory,
  userHome,
  temporaryDirectory,
}) {
  const jdk = resolve(jdkDirectory);
  const maven = resolve(mavenDirectory);
  const home = resolve(userHome);
  for (const path of [jdk, maven, home, resolve(temporaryDirectory)])
    if (/[\s"'`\r\n]/u.test(path)) fail("unsupported launcher path");
  return {
    PATH: `${join(jdk, "bin")}:${join(maven, "bin")}:/usr/bin:/bin`,
    JAVA_HOME: jdk,
    MAVEN_HOME: maven,
    M2_HOME: maven,
    HOME: home,
    TMPDIR: resolve(temporaryDirectory),
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC",
    TERM: "dumb",
    MAVEN_SKIP_RC: "1",
    MAVEN_OPTS: [...REFERENCE_JVM_OPTIONS, `-Duser.home=${home}`].join(" "),
  };
}

function boundedFile(path, maximum) {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    stat.size < 1 ||
    stat.size > maximum ||
    realpathSync.native(path) !== resolve(path)
  )
    fail("unsupported native output");
  const bytes = readFileSync(path);
  if (bytes.length !== stat.size) fail("native output changed");
  return bytes;
}

/** Linux hosted execution only. Native Git/Maven/JDK own their formats and
 * behavior. A private fresh workspace and source checkout are required; this
 * function never cleans someone else's checkout or catches compilation failures. */
export function prepareReferenceBuild({
  sourceDirectory,
  workspaceDirectory,
  jdkDirectory,
  mavenDirectory,
  host,
  resume = false,
}) {
  if (process.platform !== "linux")
    fail("native collector requires qualified Linux host");
  const source = plainDirectory(sourceDirectory);
  const workspace = resolve(workspaceDirectory);
  const jdk = plainDirectory(jdkDirectory);
  const maven = plainDirectory(mavenDirectory);
  if (
    (!resume && existsSync(workspace)) ||
    [source, jdk, maven].some(
      (root) => within(root, workspace) || within(workspace, root),
    )
  )
    fail("workspace must be fresh and disjoint");
  if (resume) plainDirectory(workspace);
  else mkdirSync(workspace, { mode: 0o700 });
  const locations = Object.fromEntries(
    ["repository", "home", "temporary", "reports", "prepared", "built"].map(
      (name) => {
        const path = join(workspace, name);
        if (resume) plainDirectory(path);
        else mkdirSync(path, { mode: 0o700 });
        return [name, path];
      },
    ),
  );
  const env = referenceBuildEnvironment({
    jdkDirectory: jdk,
    mavenDirectory: maven,
    userHome: locations.home,
    temporaryDirectory: locations.temporary,
  });
  const preparationState = resume
    ? JSON.parse(boundedFile(join(workspace, "preparation.json"), 4096))
    : null;
  const context = { source, workspace, jdk, maven };
  if (
    resume &&
    (!isDeepStrictEqual(Object.keys(preparationState).sort(), [
      "context",
      "deadline",
      "inputRecordSha256",
      "purpose",
      "reason",
      "schemaVersion",
    ]) ||
      preparationState.schemaVersion !== 1 ||
      preparationState.purpose !== "LOCAL_NATIVE_REFERENCE_PREPARATION" ||
      !(preparationState.inputRecordSha256 === null
        ? preparationState.reason === "NATIVE_KEY_UNAVAILABLE"
        : /^[a-f0-9]{64}$/u.test(preparationState.inputRecordSha256 ?? "") &&
          preparationState.reason === null) ||
      !isDeepStrictEqual(preparationState.context, context) ||
      !Number.isSafeInteger(preparationState.deadline) ||
      preparationState.deadline <= 0 ||
      preparationState.deadline > Date.now() + 10 * 60_000)
  )
    fail("invalid local preparation");
  // Leave room for post-preparation source/tool admission inside the workflow's
  // ten-minute preparation step, even when an optional command times out.
  const deadline = preparationState?.deadline ?? Date.now() + 4 * 60_000;
  // Key validity belongs to the original optional preparation. A resumed
  // required build receives its own finite execution budget, even if that key
  // expired while evidence was being transported or admitted.
  let executionDeadline = resume ? Date.now() + 10 * 60_000 : deadline;
  const execution = resume
    ? JSON.parse(boundedFile(join(workspace, "execution.json"), 64 * 1024))
    : [];
  if (!Array.isArray(execution) || execution.length > 80)
    fail("native command count budget");
  let failedCommand = null;
  const run = (executable, args, label, maximumMs = 180_000) => {
    const remaining = executionDeadline - Date.now();
    if (remaining <= 0 || execution.length >= 80)
      fail("native execution deadline or command budget");
    const started = Date.now();
    const result = spawnSync(executable, args, {
      cwd: source,
      env,
      encoding: "utf8",
      shell: false,
      maxBuffer: 8 * 1024 * 1024,
      timeout: Math.min(maximumMs, remaining),
    });
    writeFileSync(
      join(locations.reports, `${label}.log`),
      `${result.stdout ?? ""}${result.stderr ?? ""}`,
      { flag: "wx", mode: 0o600 },
    );
    execution.push({
      label,
      elapsedMs: Date.now() - started,
      exitCode: result.status,
    });
    writeFileSync(
      join(workspace, "execution.json"),
      `${JSON.stringify(execution, null, 2)}\n`,
      { mode: 0o600 },
    );
    if (result.error || result.signal || result.status !== 0) {
      // Only the closed, credential-free native process contributes these
      // bounded error lines; never capture the inherited environment.
      failedCommand = {
        label,
        exitCode: result.status,
        errors: `${result.stdout ?? ""}\n${result.stderr ?? ""}`
          .slice(-8192)
          .split(/\r?\n/u)
          .filter((line) => line.startsWith("[ERROR]"))
          .slice(-4)
          .map((line) => line.slice(0, 240)),
      };
      fail(`native ${label} failed`);
    }
    return result.stdout.trim();
  };
  const git = (...args) =>
    run(
      "/usr/bin/git",
      ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args],
      `git-${execution.length}`,
      10_000,
    );
  const sourceIdentity = () => {
    if (
      git("rev-parse", "--show-toplevel") !== source ||
      git("rev-parse", "HEAD") !== REFERENCE_RECIPE.sourceCommit ||
      git("rev-parse", "HEAD^{tree}") !== REFERENCE_RECIPE.sourceTree ||
      git("status", "--porcelain=v1", "--untracked-files=all")
    )
      fail("source identity changed or dirty");
  };
  sourceIdentity();
  if (
    (!resume &&
      git("ls-files", "--others", "--ignored", "--exclude-standard", "-z")) ||
    existsSync(join(source, ".mvn"))
  )
    fail("foreign generated inputs or Maven extensions");
  const tools = {
    maven: referenceToolIdentity(maven),
    jdk: referenceToolIdentity(jdk),
  };
  const mavenVersion = run(
    join(maven, "bin/mvn"),
    ["-B", "-ntp", "-Dstyle.color=never", "-v"],
    `maven-version-${execution.length}`,
    10_000,
  );
  if (
    !mavenVersion.startsWith(
      "Apache Maven 3.10.0 (c43a36b8d67be7e0805a411bc0898af1a51f5472)",
    )
  )
    fail("unqualified Maven version");
  const environment = JSON.parse(
    run(
      join(jdk, "bin/java"),
      [
        ...REFERENCE_JVM_OPTIONS,
        `-Duser.home=${locations.home}`,
        join(here, "ReferenceBuildEnvironment.java"),
        jdk,
      ],
      `environment-${execution.length}`,
      30_000,
    ),
  );
  if (
    environment["java.version"] !== "25.0.4.1" ||
    environment["java.vendor"] !== "Eclipse Adoptium" ||
    environment.runtime !== "25.0.4.1+1-LTS"
  )
    fail("unqualified JDK version");
  const recipeOptions = {
    localRepository: locations.repository,
    userHome: locations.home,
    reportsDirectory: locations.reports,
    summaryDirectory: locations.prepared,
  };
  const recipe = referenceBuildRecipe(recipeOptions);
  let prepared = null;
  let runtimeGraph = null;
  let inputRecord = null;
  let inputRecordBytes;
  let reason = null;
  let phase = "key-deadline";
  try {
    if (Date.now() >= deadline) fail("local preparation expired");
    if (resume && preparationState.inputRecordSha256 === null)
      fail("previous native key was unavailable");
    if (!resume)
      for (const [index, args] of recipe.preparation.entries()) {
        phase = `preparation-${index}`;
        run(join(maven, "bin/mvn"), args, `prepare-${index}`);
      }
    if (Date.now() >= deadline) fail("native key preparation expired");
    phase = "native-checksums";
    prepared = boundedFile(
      join(locations.prepared, REFERENCE_RECIPE.nativeSummary),
      1024 * 1024,
    );
    readNativeChecksums(prepared);
    phase = "runtime-graph";
    runtimeGraph = boundedFile(
      join(source, "distribution/target/reference-runtime-tree.json"),
      1024 * 1024,
    );
    // Native JSON output is preserved as bytes; no substitute dependency resolver.
    const graph = JSON.parse(runtimeGraph.toString("utf8"));
    if (
      graph.groupId !== "net.sourceforge.owlapi" ||
      graph.artifactId !== "owlapi-distribution" ||
      graph.version !== "5.5.1" ||
      !Array.isArray(graph.children)
    )
      fail("wrong native runtime graph");
    phase = "input-record";
    inputRecord = createReferenceInputRecord({
      sourceCommit: REFERENCE_RECIPE.sourceCommit,
      sourceTree: REFERENCE_RECIPE.sourceTree,
      externalSha256: sha256(prepared),
      runtimeGraphSha256: sha256(runtimeGraph),
      mavenDistributionSha256: tools.maven.sha256,
      jdkDistributionSha256: tools.jdk.sha256,
      environment,
      host,
    });
    inputRecordBytes = Buffer.from(`${JSON.stringify(inputRecord, null, 2)}\n`);
    if (resume) {
      phase = "saved-record";
      const original = boundedFile(
        join(workspace, "input-record.json"),
        64 * 1024,
      );
      if (
        sha256(original) !== preparationState.inputRecordSha256 ||
        !original.equals(inputRecordBytes) ||
        !boundedFile(join(workspace, "build-inputs.txt"), 1024 * 1024).equals(
          prepared,
        ) ||
        !boundedFile(join(workspace, "runtime-graph.txt"), 1024 * 1024).equals(
          runtimeGraph,
        )
      )
        fail("native preparation bytes or environment changed");
    }
  } catch (error) {
    // Only pre-compilation key preparation is optional. Source/tool admission,
    // package compilation and every behavioral check remain outside this catch.
    inputRecord = null;
    inputRecordBytes = null;
    reason = "NATIVE_KEY_UNAVAILABLE";
    if (!resume)
      process.stderr.write(
        `${JSON.stringify({
          purpose: "NATIVE_PREPARATION_DIAGNOSTIC",
          phase,
          error: String(
            error?.message ?? "Optional preparation rejected",
          ).slice(0, 240),
          command: failedCommand,
        })}\n`,
      );
  }
  // Exactly one phase transition: optional work cannot spend the mandatory
  // source admission and fresh compilation budget. Commands remain individually
  // bounded and the shared 80-command limit and one build attempt still apply.
  executionDeadline = Date.now() + 10 * 60_000;
  sourceIdentity();
  if (!resume) {
    if (inputRecord !== null) {
      writeFileSync(join(workspace, "input-record.json"), inputRecordBytes, {
        flag: "wx",
        mode: 0o600,
      });
      writeFileSync(join(workspace, "build-inputs.txt"), prepared, {
        flag: "wx",
        mode: 0o600,
      });
      writeFileSync(join(workspace, "runtime-graph.txt"), runtimeGraph, {
        flag: "wx",
        mode: 0o600,
      });
    }
    writeFileSync(
      join(workspace, "preparation.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          purpose: "LOCAL_NATIVE_REFERENCE_PREPARATION",
          context,
          deadline,
          inputRecordSha256:
            inputRecordBytes === null ? null : sha256(inputRecordBytes),
          reason,
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );
  }
  const verifyTools = () => {
    if (
      referenceToolIdentity(maven).sha256 !== tools.maven.sha256 ||
      referenceToolIdentity(jdk).sha256 !== tools.jdk.sha256
    )
      fail("selected tool bytes changed");
  };
  verifyTools();
  let built = false;
  return {
    get inputRecord() {
      return inputRecord;
    },
    get reason() {
      return reason;
    },
    sourceDirectory: source,
    workspaceDirectory: workspace,
    /** Only an authenticated product may replace this build. Current oracle
     * compilation/execution remains mandatory after either branch. */
    buildFresh() {
      if (built) fail("fresh build already attempted");
      built = true;
      writeFileSync(join(workspace, "build-attempt.json"), '{"attempt":1}\n', {
        flag: "wx",
        mode: 0o600,
      });
      sourceIdentity();
      verifyTools();
      run(
        join(maven, "bin/mvn"),
        referenceBuildRecipe({
          ...recipeOptions,
          summaryDirectory: locations.built,
        }).build,
        "package",
      );
      let closure;
      try {
        if (inputRecord === null) fail("no qualified prepared inputs");
        closure = {
          status: "QUALIFIED_INPUTS",
          ...assertNativeBuildClosure(
            prepared,
            boundedFile(
              join(locations.built, REFERENCE_RECIPE.nativeSummary),
              1024 * 1024,
            ),
          ),
        };
      } catch {
        // Compilation has already succeeded. An unavailable/changed key prevents
        // publication/reuse; it cannot erase the freshly executed build or tests.
        inputRecord = null;
        reason = "NATIVE_BUILD_INPUTS_UNVERIFIABLE";
        closure = { status: "UNQUALIFIED_INPUTS", reason };
      }
      sourceIdentity();
      verifyTools();
      boundedFile(
        join(source, "distribution/target/owlapi-runtime-classpath.txt"),
        64 * 1024,
      );
      writeFileSync(
        join(workspace, "build-closure.json"),
        `${JSON.stringify(closure, null, 2)}\n`,
        { flag: "wx", mode: 0o600 },
      );
      return closure;
    },
  };
}
