/** A bounded Linux cost screen on PRs changing the reference controls while
 * reuse is inactive. This is observation, never qualification or a reused verdict. */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JAVA_REFERENCE_POLICY } from "../../scripts/java-reference-state.mjs";
import { referenceBuildRecipe, REFERENCE_RECIPE } from "./reference-inputs.mjs";
import { referenceBuildEnvironment } from "./reference-native-build.mjs";

const fact = (condition, message) => {
  if (!condition) throw new Error(`Reference cost observation: ${message}`);
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Native git archive at the selected b61ebe2d source pin. This cost screen
// does not grant source-notice publication rights or application acceptance.
const PINNED_SOURCE_ARCHIVE_SHA256 =
  "7708bf1f7dcdde68fc94087a04ee09069d13ad9710b9364db1f167145c00ce61";
const watched = [
  ".github/workflows/ci.yml",
  "scripts/java-reference-",
  "util/owlapi-reference/reference-",
  "util/owlapi-reference/ReferenceBuildEnvironment.java",
];
export const referenceCostControlChanged = (paths) =>
  Array.isArray(paths) &&
  paths.some(
    (path) =>
      typeof path === "string" &&
      watched.some((prefix) => path.startsWith(prefix)),
  );
export const referenceCostObservationRequested = (eventName, enabled) =>
  enabled === false && eventName === "pull_request";

export function observeFreshReferenceCost(env = process.env) {
  if (
    !referenceCostObservationRequested(
      env.GITHUB_EVENT_NAME,
      JAVA_REFERENCE_POLICY.enabled,
    )
  )
    return null;
  fact(
    process.platform === "linux" &&
      env.RUNNER_OS === "Linux" &&
      env.RUNNER_ARCH === "X64",
    "qualified Linux observation host required",
  );
  fact(
    !env.GH_TOKEN && !env.GITHUB_TOKEN,
    "no API credentials in native build observation",
  );
  const eventBytes = readFileSync(env.GITHUB_EVENT_PATH);
  fact(eventBytes.length <= 256 * 1024, "event context budget");
  const base = JSON.parse(eventBytes).pull_request?.base;
  fact(
    base?.repo?.id === JAVA_REFERENCE_POLICY.repositoryId &&
      base.repo.full_name === JAVA_REFERENCE_POLICY.repository &&
      /^[a-f0-9]{40}$/u.test(base.sha ?? ""),
    "captured main base required",
  );
  const diff = spawnSync(
    "/usr/bin/git",
    [
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--name-only",
      "-z",
      base.sha,
      "HEAD",
      "--",
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 10_000 },
  );
  fact(
    !diff.error &&
      diff.status === 0 &&
      (!diff.stdout || diff.stdout.endsWith("\0")),
    "complete native changed-path observation required",
  );
  if (
    !referenceCostControlChanged(
      diff.stdout ? diff.stdout.slice(0, -1).split("\0") : [],
    )
  )
    return null;
  const root = resolve(".release/java-reference-cost-baseline");
  fact(
    !existsSync(root) && realpathSync.native(dirname(root)) === dirname(root),
    "fresh owned observation destination required",
  );
  const original = realpathSync.native(resolve(".release/java-owlapi"));
  const jdk = realpathSync.native(env.JAVA_HOME);
  const maven = realpathSync.native(
    join(env.RUNNER_TEMP, "reference-maven-3.10.0/apache-maven-3.10.0"),
  );
  mkdirSync(root, { mode: 0o700 });
  for (const path of [
    "source",
    "repository",
    "home",
    "temporary",
    "reports",
    "checksums",
  ])
    mkdirSync(join(root, path), { mode: 0o700 });
  const buildEnv = referenceBuildEnvironment({
    jdkDirectory: jdk,
    mavenDirectory: maven,
    userHome: join(root, "home"),
    temporaryDirectory: join(root, "temporary"),
  });
  const run = (executable, args, cwd, label, timeout) => {
    const startedAt = Date.now();
    const result = spawnSync(executable, args, {
      cwd,
      env: buildEnv,
      shell: false,
      maxBuffer: 8 * 1024 * 1024,
      timeout,
      encoding: "utf8",
    });
    writeFileSync(
      join(root, "reports", `${label}.log`),
      `${result.stdout ?? ""}${result.stderr ?? ""}`,
      { flag: "wx", mode: 0o600 },
    );
    fact(
      !result.error && !result.signal && result.status === 0,
      "native observation failed; no retry",
    );
    return Date.now() - startedAt;
  };
  const archive = join(root, "source.tar");
  run(
    "/usr/bin/git",
    [
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "archive",
      "--format=tar",
      `--output=${archive}`,
      REFERENCE_RECIPE.sourceCommit,
    ],
    original,
    "archive",
    10_000,
  );
  fact(
    sha256(readFileSync(archive)) === PINNED_SOURCE_ARCHIVE_SHA256,
    "pinned exact archive differs",
  );
  run(
    "/usr/bin/tar",
    ["-xf", archive, "-C", join(root, "source")],
    root,
    "extract",
    10_000,
  );
  const recipe = referenceBuildRecipe({
    localRepository: join(root, "repository"),
    userHome: join(root, "home"),
    reportsDirectory: join(root, "reports"),
    summaryDirectory: join(root, "checksums"),
  });
  const elapsedMs = run(
    join(maven, "bin/mvn"),
    recipe.build,
    join(root, "source"),
    "package",
    180_000,
  );
  const record = {
    purpose: "HOSTED_NATIVE_COST_OBSERVATION",
    role: "FRESH_BASELINE",
    initialRepository: "EMPTY",
    initialReactorTargets: "ABSENT",
    sourceCommit: REFERENCE_RECIPE.sourceCommit,
    sourceArchiveSha256: PINNED_SOURCE_ARCHIVE_SHA256,
    elapsedMs,
    order: "BASELINE_BEFORE_KEY_PREPARATION",
    limits:
      "Single matched Linux observation; excludes shared checkout/tool selection, API and transport. Not an oracle verdict, compatibility equivalence or operating acceptance.",
  };
  writeFileSync(
    join(root, "observation.json"),
    `${JSON.stringify(record, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `Fresh native baseline cost: ${elapsedMs} ms, empty separate Maven repository; no application verdict reused.\n`,
    );
  process.stdout.write(`${JSON.stringify(record)}\n`);
  return record;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  observeFreshReferenceCost();
