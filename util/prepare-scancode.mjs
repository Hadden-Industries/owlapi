/** Prepare an isolated, hash-locked ScanCode source build for the selected CPython. */
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ensureRepositoryUv } from "../scripts/repository-python-tools.mjs";
import { stableJson } from "./third-party-evidence/digests.mjs";
import { SCANCODE_TOOL } from "./third-party-evidence/scancode.mjs";

const executeFile = promisify(execFile);
const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Resolve the native command; platform selection must be explicit. */
export const resolveScancodeBootstrap = ({
  platform,
  outputRoot,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) => {
  if (!["linux", "windows"].includes(platform))
    throw new TypeError("ScanCode platform must be linux or windows");
  if (typeof outputRoot !== "string" || outputRoot.length === 0)
    throw new TypeError("ScanCode bootstrap requires an output root");
  const absoluteOutput = resolve(repositoryRoot, outputRoot);
  const toolkitRoot = join(
    absoluteOutput,
    `scancode-toolkit-v${SCANCODE_TOOL.version}`,
  );
  return {
    platform,
    outputRoot: absoluteOutput,
    toolkitRoot,
    command: join(
      toolkitRoot,
      "venv",
      platform === "windows" ? "Scripts" : "bin",
      platform === "windows" ? "scancode.exe" : "scancode",
    ),
  };
};

/** Install frozen build tools first, then build the frozen scanner without hidden build resolution. */
export const prepareScancode = async ({
  platform,
  outputRoot,
  python,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) => {
  if (typeof python !== "string" || python.length === 0)
    throw new TypeError("ScanCode bootstrap requires a Python executable");
  if (
    platform !== (process.platform === "win32" ? "windows" : "linux") ||
    process.arch !== "x64"
  )
    throw new TypeError(
      "ScanCode bootstrap requires the current Windows/Linux x64 platform",
    );
  const resolved = resolveScancodeBootstrap({
    platform,
    outputRoot,
    repositoryRoot,
  });
  try {
    await access(resolved.outputRoot);
    throw new TypeError(
      `ScanCode output already exists: ${resolved.outputRoot}`,
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // Validation precedes installation and never accepts an ambient PATH interpreter.
  const tools = await ensureRepositoryUv({ root: repositoryRoot, python });
  const project = join(repositoryRoot, "util", "scancode-runtime");
  const lockBytes = await readFile(join(project, "uv.lock"));
  const lockSha256 = createHash("sha256").update(lockBytes).digest("hex");
  const pending = `${resolved.outputRoot}.${randomUUID()}.pending`;
  await mkdir(pending, { recursive: true });
  // Venv launchers record their installation paths. Install at the final path,
  // and remove that task-owned destination on a known failed preparation.
  await rename(pending, resolved.outputRoot);
  const environment = join(resolved.toolkitRoot, "venv");
  const options = {
    cwd: repositoryRoot,
    env: { ...tools.env, UV_PROJECT_ENVIRONMENT: environment },
    timeout: 30 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    shell: false,
  };
  const common = [
    "sync",
    "--project",
    project,
    "--locked",
    "--python",
    python,
    "--no-python-downloads",
  ];
  try {
    await executeFile(
      tools.uv,
      [...common, "--only-group", "build", "--no-build"],
      options,
    );
    await executeFile(
      tools.uv,
      [...common, "--group", "build", "--no-build-isolation"],
      options,
    );
    await executeFile(
      tools.uv,
      [
        ...common,
        "--group",
        "build",
        "--no-build-isolation",
        "--check",
        "--offline",
      ],
      options,
    );
    const scannerPython = join(
      environment,
      platform === "windows" ? "Scripts/python.exe" : "bin/python",
    );
    const identity = await executeFile(
      scannerPython,
      [
        "-I",
        "-c",
        "import importlib.metadata as m, json, platform; print(json.dumps({'pythonVersion': platform.python_version(), 'scancodeVersion': m.version('scancode-toolkit'), 'beartypeVersion': m.version('beartype')}))",
      ],
      options,
    );
    const versions = JSON.parse(identity.stdout);
    if (
      versions.pythonVersion !==
        (
          await readFile(join(repositoryRoot, ".python-version"), "utf8")
        ).trim() ||
      versions.scancodeVersion !== SCANCODE_TOOL.version ||
      versions.beartypeVersion !== "0.23.0rc2"
    )
      throw new Error(
        "Configured ScanCode runtime does not match the approved locked identities",
      );
    await executeFile(resolved.command, ["--version"], options);
    if (!lockBytes.equals(await readFile(join(project, "uv.lock"))))
      throw new Error("Scanner lock changed during preparation");
    return { ...resolved, ...versions, lockSha256 };
  } catch (error) {
    await rm(resolved.outputRoot, { recursive: true, force: true });
    throw error;
  }
};

export const parseScancodeBootstrapArguments = (
  arguments_,
  environment = process.env,
) => {
  if (!Array.isArray(arguments_)) {
    throw new TypeError("ScanCode bootstrap arguments must be an array");
  }
  const values = new Map();
  for (const argument of arguments_) {
    const match = /^(--(?:platform|output|python)(?:-env)?)=(.+)$/u.exec(
      argument,
    );
    if (!match) {
      throw new TypeError(`Unknown ScanCode bootstrap argument: ${argument}`);
    }
    const [, key, value] = match;
    const semanticKey = key.replace(/-env$/u, "");
    if (values.has(semanticKey)) {
      throw new TypeError(
        `Duplicate ScanCode bootstrap argument: ${semanticKey}`,
      );
    }
    if (key.endsWith("-env")) {
      if (!/^[A-Z][A-Z0-9_]*$/u.test(value)) {
        throw new TypeError(`Invalid environment variable name: ${value}`);
      }
      const resolved = environment[value];
      if (typeof resolved !== "string" || resolved.length === 0) {
        throw new TypeError(
          `ScanCode bootstrap environment variable ${value} is not set`,
        );
      }
      values.set(semanticKey, resolved);
    } else {
      values.set(semanticKey, value);
    }
  }
  const platform = values.get("--platform");
  const outputRoot = values.get("--output");
  const python = values.get("--python");
  if (!platform || !outputRoot || !python) {
    throw new TypeError(
      "ScanCode bootstrap requires --platform, --output, and --python",
    );
  }
  resolveScancodeBootstrap({ platform, outputRoot });
  return { platform, outputRoot, python };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = await prepareScancode(
      parseScancodeBootstrapArguments(process.argv.slice(2)),
    );
    process.stdout.write(
      stableJson({
        status: "PREPARED",
        command: result.command,
        lockSha256: result.lockSha256,
        pythonVersion: result.pythonVersion,
        scancodeVersion: result.scancodeVersion,
        beartypeVersion: result.beartypeVersion,
      }),
    );
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
