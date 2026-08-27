import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { stableJson } from "./third-party-evidence/digests.mjs";
import { SCANCODE_TOOL } from "./third-party-evidence/scancode.mjs";

const executeFile = promisify(execFile);
const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MAXIMUM_ARCHIVE_BYTES = 512 * 1024 * 1024;

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export const downloadPinnedAsset = async ({
  asset,
  destination,
  fetchImpl = fetch,
  sleep = delay,
}) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await rm(destination, { force: true });
    try {
      const response = await fetchImpl(asset.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(10 * 60 * 1_000),
      });
      if (!response.ok || !response.body) {
        throw new Error(`ScanCode download returned HTTP ${response.status}`);
      }
      const advertisedLength = response.headers.get("content-length");
      if (
        advertisedLength !== null &&
        (!/^\d+$/u.test(advertisedLength) ||
          Number(advertisedLength) > MAXIMUM_ARCHIVE_BYTES)
      ) {
        throw new Error("ScanCode archive exceeds the download size limit");
      }
      const hash = createHash("sha256");
      let bytes = 0;
      const digestingStream = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > MAXIMUM_ARCHIVE_BYTES) {
            callback(
              new Error("ScanCode archive exceeds the download size limit"),
            );
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(
        response.body,
        digestingStream,
        createWriteStream(destination, { flags: "wx" }),
      );
      const actual = hash.digest("hex");
      if (actual !== asset.sha256) {
        throw new Error(
          `ScanCode archive SHA-256 mismatch: expected ${asset.sha256}, received ${actual}`,
        );
      }
      return { bytes, sha256: actual };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(attempt === 1 ? 1_000 : 4_000);
      }
    }
  }
  await rm(destination, { force: true });
  throw new Error(`Pinned ScanCode download failed: ${lastError.message}`, {
    cause: lastError,
  });
};

export const resolveScancodeBootstrap = ({
  platform,
  outputRoot,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
} = {}) => {
  if (!new Set(["linux", "windows"]).has(platform)) {
    throw new TypeError("ScanCode platform must be linux or windows");
  }
  if (typeof outputRoot !== "string" || outputRoot.length === 0) {
    throw new TypeError("ScanCode bootstrap requires an output root");
  }
  const absoluteOutput = resolve(repositoryRoot, outputRoot);
  const toolkitRoot = join(
    absoluteOutput,
    `scancode-toolkit-v${SCANCODE_TOOL.version}`,
  );
  return {
    platform,
    asset: SCANCODE_TOOL.assets[platform],
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

const assertPython314 = async (python) => {
  const result = await executeFile(python, ["--version"], {
    timeout: 30_000,
    windowsHide: true,
    shell: false,
  });
  const version = `${result.stdout}${result.stderr}`.trim();
  if (!/^Python 3\.14\.\d+$/u.test(version)) {
    throw new Error(
      `ScanCode requires a selected Python 3.14 runtime; received ${version}`,
    );
  }
  return version.slice("Python ".length);
};

const extractArchive = async ({ platform, archive, destination }) => {
  const command = platform === "windows" ? "tar.exe" : "tar";
  const arguments_ =
    platform === "windows"
      ? ["-xf", archive, "-C", destination]
      : ["-xzf", archive, "-C", destination];
  await executeFile(command, arguments_, {
    timeout: 10 * 60 * 1_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    shell: false,
  });
};

const configureToolkit = async ({ platform, python, toolkitRoot }) => {
  const environment = {
    ...process.env,
    CFG_QUIET: "-qq",
    PYTHON_EXECUTABLE: python,
  };
  // The Windows release's checksum-authenticated configure.bat is invoked via
  // an explicit cmd.exe process with fixed arguments. No registry or package
  // data is interpolated into the command shell.
  const command = platform === "windows" ? "cmd.exe" : "bash";
  const arguments_ =
    platform === "windows"
      ? ["/d", "/s", "/c", "configure.bat"]
      : ["./configure"];
  await executeFile(command, arguments_, {
    cwd: toolkitRoot,
    env: environment,
    timeout: 30 * 60 * 1_000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    shell: false,
  });
};

export const prepareScancode = async ({
  platform,
  outputRoot,
  python,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  fetchImpl = fetch,
  sleep = delay,
} = {}) => {
  if (typeof python !== "string" || python.length === 0) {
    throw new TypeError("ScanCode bootstrap requires a Python executable");
  }
  const resolved = resolveScancodeBootstrap({
    platform,
    outputRoot,
    repositoryRoot,
  });
  if (await exists(resolved.outputRoot)) {
    throw new TypeError(
      `ScanCode output already exists: ${resolved.outputRoot}`,
    );
  }
  const pending = `${resolved.outputRoot}.${randomUUID()}.pending`;
  const archive = join(pending, basename(new URL(resolved.asset.url).pathname));
  await mkdir(pending, { recursive: true });
  let installed = false;
  try {
    const pythonVersion = await assertPython314(python);
    const download = await downloadPinnedAsset({
      asset: resolved.asset,
      destination: archive,
      fetchImpl,
      sleep,
    });
    await extractArchive({ platform, archive, destination: pending });
    await access(join(pending, `scancode-toolkit-v${SCANCODE_TOOL.version}`));
    await rm(archive, { force: true });
    await rename(pending, resolved.outputRoot);
    installed = true;
    await configureToolkit({
      platform,
      python,
      toolkitRoot: resolved.toolkitRoot,
    });
    await access(resolved.command);
    const versionCheck = await executeFile(resolved.command, ["--version"], {
      timeout: 2 * 60 * 1_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      shell: false,
    });
    if (
      !`${versionCheck.stdout}${versionCheck.stderr}`.includes(
        SCANCODE_TOOL.version,
      )
    ) {
      throw new Error(
        "Configured ScanCode command reports an unexpected version",
      );
    }
    return { ...resolved, download, pythonVersion };
  } catch (error) {
    await rm(pending, { recursive: true, force: true });
    if (installed) {
      await rm(resolved.outputRoot, { recursive: true, force: true });
    }
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
    const options = parseScancodeBootstrapArguments(process.argv.slice(2));
    const result = await prepareScancode(options);
    process.stdout.write(
      stableJson({
        status: "PREPARED",
        command: result.command,
        archiveSha256: result.download.sha256,
        pythonVersion: result.pythonVersion,
        scancodeVersion: SCANCODE_TOOL.version,
      }),
    );
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
