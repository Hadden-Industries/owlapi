/** Checkout-local Python tools. Explicit `python` and `sync` operations install.
 * Environment isolation adapts HISEW runRepositoryUv.js at
 * 446ffa14c29fbcb18270ff32799fbe377c916426 (AGPL-3.0-only).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const uvVersion = "0.13.0";
// Exact official release assets, verified against GitHub's release asset digests.
const uvAssets = {
  win32: {
    file: "uv-x86_64-pc-windows-msvc.zip",
    sha256: "088962f9e7b7bd9ea740c04c650b2a21c8928c345bd99ac24350dc924dba656c",
  },
  linux: {
    file: "uv-x86_64-unknown-linux-gnu.tar.gz",
    sha256: "1468ebd5a5541121837c5a2817b9972ba6090fa6caa3d142620850a47fb75154",
  },
};

/** Resolve only this checkout's tools and remove inherited environment redirects. */
export function repositoryPythonTools({
  root = repositoryRoot,
  platform = process.platform,
  inherited = process.env,
} = {}) {
  root = resolve(root);
  const windows = platform === "win32";
  const environment = join(root, ".venv");
  const bin = join(environment, windows ? "Scripts" : "bin");
  return {
    root,
    python: join(bin, windows ? "python.exe" : "python"),
    uv: join(root, ".development-tools", "uv", windows ? "uv.exe" : "uv"),
    executable: (name) => join(bin, `${name}${windows ? ".exe" : ""}`),
    env: {
      ...Object.fromEntries(
        Object.entries(inherited).filter(
          ([name]) =>
            !/^(UV_|VIRTUAL_ENV$|PYTHONHOME$|PYTHONPATH$)/iu.test(name),
        ),
      ),
      UV_PROJECT_ENVIRONMENT: environment,
      UV_CACHE_DIR: join(root, ".development-tools", "uv-cache"),
      UV_PYTHON_DOWNLOADS: "never",
      UV_NO_CONFIG: "1",
      PYTHONUTF8: "1",
    },
  };
}

/** Execute a bounded native process, rejecting crashes/timeouts and unsafe fallback. */
function execute(
  command,
  args,
  { root, env, input, timeout = 60_000, spawn = spawnSync } = {},
) {
  const result = spawn(command, args, {
    cwd: root,
    env,
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status === null) {
    throw new Error(
      `Tool process failed (${command}): ${result.error?.code ?? result.signal ?? "no exit status"}`,
    );
  }
  return result;
}

function requireSuccess(result, label) {
  if (result.status !== 0)
    throw new Error(
      `${label} failed (exit ${result.status}): ${(result.stderr || result.stdout).slice(0, 4000)}`,
    );
  return result.stdout.trim();
}

/** Invoke an installed tool without changing its environment or consulting PATH. */
export function runPythonTool(
  name,
  args,
  { root = repositoryRoot, ...options } = {},
) {
  if (!["ruff"].includes(name))
    throw new Error(`Unsupported repository Python tool: ${name}`);
  const tools = repositoryPythonTools({ root });
  const executable = tools.executable(name);
  if (!existsSync(executable))
    throw new Error(
      `Missing ${name}; run npm run tools:sync -- --python <absolute Python path>.`,
    );
  return execute(executable, args, { ...tools, ...options });
}

function pythonVersion(python, tools) {
  const version = requireSuccess(
    execute(
      python,
      [
        "-I",
        "-X",
        "utf8",
        "-c",
        "import platform; print(platform.python_version())",
      ],
      tools,
    ),
    "Python version check",
  );
  const expected = readFileSync(
    join(tools.root, ".python-version"),
    "utf8",
  ).trim();
  if (version !== expected)
    throw new Error(`Python ${expected} is required; found ${version}.`);
}

function installedUvVersion(tools) {
  if (!existsSync(tools.uv)) return null;
  return requireSuccess(
    execute(tools.uv, ["--version"], tools),
    "uv version check",
  );
}

function checkUv(tools) {
  const version = installedUvVersion(tools);
  if (version === null)
    throw new Error(
      "Missing checkout uv; run npm run tools:sync -- --python <absolute Python path>.",
    );
  if (version.split(/\s/u)[1] !== uvVersion)
    throw new Error(
      `uv ${uvVersion} is required; found ${version}. Run tools:sync.`,
    );
}

const syncArguments = [
  "sync",
  "--locked",
  "--no-dev",
  "--group",
  "quality",
  "--no-build",
  "--no-python-downloads",
];

/** Native uv validation proves both lock freshness and an exactly synchronized environment. */
export function checkPythonTools({ root = repositoryRoot } = {}) {
  const tools = repositoryPythonTools({ root });
  checkUv(tools);
  if (!existsSync(tools.python))
    throw new Error(
      "Missing checkout Python environment; run npm run tools:sync.",
    );
  pythonVersion(tools.python, tools);
  requireSuccess(
    execute(
      tools.uv,
      [...syncArguments, "--check", "--offline", "--python", tools.python],
      tools,
    ),
    "Locked tool environment check",
  );
  return tools;
}

/** Download a hash-pinned uv release into an ignored, checkout-owned directory. */
async function installUv(tools) {
  const asset = uvAssets[process.platform];
  if (!asset || process.arch !== "x64")
    throw new Error(
      "Pinned tooling setup is qualified for Windows/Linux x64 only.",
    );
  const directory = join(tools.root, ".development-tools", "uv");
  mkdirSync(directory, { recursive: true });
  const response = await fetch(
    `https://github.com/astral-sh/uv/releases/download/${uvVersion}/${asset.file}`,
    { signal: AbortSignal.timeout(60_000) },
  );
  if (!response.ok)
    throw new Error(`uv download failed: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 80 * 1024 * 1024)
      throw new Error("uv archive exceeded the download limit.");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    throw new Error("uv archive integrity mismatch; refusing extraction.");
  const archive = join(directory, asset.file);
  writeFileSync(archive, bytes);
  // Select one exact member of the authenticated archive. The system archive
  // reader lets CI install the selected Python without an older Python bootstrap.
  const archiveReader =
    process.platform === "win32"
      ? join(
          process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "",
          "System32",
          "tar.exe",
        )
      : "tar";
  if (process.platform === "win32" && !isAbsolute(archiveReader))
    throw new Error(
      "Windows system archive reader requires an absolute SystemRoot.",
    );
  const extraction =
    process.platform === "win32"
      ? ["-xf", archive, "-C", directory, "uv.exe"]
      : [
          "-xzf",
          archive,
          "--strip-components=1",
          "-C",
          directory,
          "uv-x86_64-unknown-linux-gnu/uv",
        ];
  requireSuccess(execute(archiveReader, extraction, tools), "uv extraction");
  if (process.platform !== "win32") chmodSync(tools.uv, 0o755);
  checkUv(tools);
}

/** Install only the pinned resolver; an explicit interpreter must match the repository pin. */
export async function ensureRepositoryUv({
  root = repositoryRoot,
  python,
} = {}) {
  const tools = repositoryPythonTools({ root });
  if (python !== undefined) {
    if (!isAbsolute(python) || !existsSync(python))
      throw new Error(
        "Supply --python with the absolute path to the installed pinned CPython interpreter.",
      );
    pythonVersion(python, tools);
  }
  if (installedUvVersion(tools)?.split(/\s/u)[1] !== uvVersion)
    await installUv(tools);
  checkUv(tools);
  return tools;
}

/** Explicit setup synchronizes the exact quality lock without resolving new versions. */
export async function synchronizePythonTools({
  root = repositoryRoot,
  python,
} = {}) {
  const tools = await ensureRepositoryUv({ root, python });
  python ??= tools.python;
  if (!isAbsolute(python) || !existsSync(python))
    throw new Error(
      "Supply --python with the absolute path to the installed pinned CPython interpreter.",
    );
  pythonVersion(python, tools);
  requireSuccess(
    execute(tools.uv, [...syncArguments, "--python", python], {
      ...tools,
      timeout: 120_000,
    }),
    "Locked tool synchronization",
  );
  checkPythonTools({ root });
}

/** Resolve the native catalogue key for Windows or the glibc Linux CI runners. */
export function workflowPythonRequest(version, platform = process.platform) {
  if (!["win32", "linux"].includes(platform))
    throw new Error(
      "Pinned Python setup is qualified for Windows/Linux x64 only.",
    );
  // uv distinguishes Linux libc builds; `none` exists only for Windows here.
  return `cpython-${version}-${platform === "win32" ? "windows-x86_64-none" : "linux-x86_64-gnu"}`;
}

/** Explicit CI bootstrap installs pinned CPython locally, without PATH or registry registration. */
export async function prepareWorkflowPython({ root = repositoryRoot } = {}) {
  if (!["win32", "linux"].includes(process.platform) || process.arch !== "x64")
    throw new Error(
      "Pinned Python setup is qualified for Windows/Linux x64 only.",
    );
  const tools = await ensureRepositoryUv({ root });
  const version = readFileSync(
    join(tools.root, ".python-version"),
    "utf8",
  ).trim();
  const request = workflowPythonRequest(version);
  const options = {
    ...tools,
    env: {
      ...tools.env,
      UV_PYTHON_INSTALL_DIR: join(tools.root, ".development-tools", "python"),
      // Download authority exists only in this explicit setup operation.
      UV_PYTHON_DOWNLOADS: "automatic",
    },
    timeout: 10 * 60_000,
  };
  requireSuccess(
    execute(
      tools.uv,
      ["python", "install", request, "--no-bin", "--no-registry"],
      options,
    ),
    "Pinned Python installation",
  );
  const python = requireSuccess(
    execute(
      tools.uv,
      ["python", "find", request, "--managed-python", "--no-python-downloads"],
      options,
    ),
    "Pinned Python location",
  );
  if (!isAbsolute(python) || !existsSync(python) || /[\r\n]/u.test(python))
    throw new Error("uv did not return an installed absolute Python path.");
  pythonVersion(python, tools);
  return python;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { python: { type: "string" }, "python-env": { type: "string" } },
      strict: false,
    });
    const [mode, ...args] = positionals;
    if (mode === "python") {
      const python = await prepareWorkflowPython();
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `python-path=${python}\n`,
          "utf8",
        );
      process.stdout.write(`Prepared checkout CPython: ${python}\n`);
    } else if (mode === "sync") {
      if (values.python && values["python-env"])
        throw new Error("Choose one Python input.");
      const python = values["python-env"]
        ? process.env[values["python-env"]]
        : values.python;
      if (values["python-env"] && !python)
        throw new Error("The requested Python environment input is absent.");
      await synchronizePythonTools({ python });
      process.stdout.write("Synchronized checkout Python quality tools.\n");
    } else if (mode === "check") {
      checkPythonTools();
      process.stdout.write("Locked Python quality tools are current.\n");
    } else if (mode === "ruff") {
      checkPythonTools();
      // Preserve Ruff flags verbatim; parseArgs is only for setup's --python.
      const result = runPythonTool("ruff", process.argv.slice(3));
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exitCode = result.status;
    } else {
      throw new Error(
        `Choose python, sync, check, or ruff; received ${[mode, ...args].join(" ")}.`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
