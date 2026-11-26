/** Native advisory output belongs to a preapproved private evidence store. */
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { repositoryRuntimePolicy } from "./ubuntu-runner.mjs";
import { NPM_REGISTRY } from "./release-identity.mjs";
import { RELEASE_AUDIT_ARGS } from "./release-audit-policy.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";

const maxOutput = 4 * 1024 * 1024;
const maxPrivateOriginal = 40 * 1024 * 1024;
export const isAuditEvidenceId = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
    value,
  );

/** Use a configured persistent POSIX store. A Windows caller needs an ACL-aware store. */
export function openPrivateAuditStore(root) {
  if (typeof process.getuid !== "function")
    throw new Error("An ACL-verified private audit store is required");

  function checkRoot() {
    if (typeof root !== "string" || !isAbsolute(root))
      throw new Error("Private audit storage is unavailable");
    let stat;
    try {
      stat = lstatSync(root);
    } catch {
      throw new Error("Private audit storage is unavailable");
    }
    if (
      !stat.isDirectory() ||
      stat.uid !== process.getuid() ||
      stat.mode % 0o100 !== 0 ||
      realpathSync(root) !== resolve(root)
    )
      throw new Error("Private audit storage requires an owner-only root");
    return resolve(root);
  }

  checkRoot();
  const pathFor = (id) => {
    if (!isAuditEvidenceId(id)) throw new Error("Invalid audit evidence ID");
    return join(checkRoot(), `${id}.json`);
  };

  return {
    retain(id, bytes) {
      if (!Buffer.isBuffer(bytes) || bytes.length > maxPrivateOriginal)
        throw new Error("Invalid private audit original");
      const path = pathFor(id);
      const fd = openSync(path, "wx", 0o600);
      try {
        writeFileSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      const directory = openSync(dirname(path), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    },
    read(id) {
      const fd = openSync(
        pathFor(id),
        // O_NOFOLLOW prevents replacing an admitted evidence ID with a link.
        constants.O_NOFOLLOW + constants.O_RDONLY,
      );
      try {
        const stat = fstatSync(fd);
        if (
          !stat.isFile() ||
          stat.nlink !== 1 ||
          stat.uid !== process.getuid() ||
          stat.mode % 0o100 !== 0 ||
          stat.size > maxPrivateOriginal
        )
          throw new Error("Private audit original is not a restricted file");
        return readFileSync(fd);
      } finally {
        closeSync(fd);
      }
    },
  };
}

export function assertAuditNpm(npmCli, npm = repositoryRuntimePolicy.npm) {
  if (
    typeof npmCli !== "string" ||
    !isAbsolute(npmCli) ||
    ![
      repositoryRuntimePolicy.npm,
      repositoryRuntimePolicy.consumerNpm,
    ].includes(npm)
  )
    throw new Error("Trusted audit runtime is unavailable");
  const cli = realpathSync(npmCli);
  const npmManifest = JSON.parse(
    readFileSync(resolve(dirname(cli), "../package.json"), "utf8"),
  );
  if (npmManifest.name !== "npm" || npmManifest.version !== npm)
    throw new Error("Trusted audit runtime is unavailable");
  return cli;
}

/** Run reviewed npm in a fresh directory, with the original inputs and no inherited npm configuration. */
export function observeLockedReleaseAudit(
  { manifestBytes, lockBytes, scope },
  { npmCli, npm = repositoryRuntimePolicy.npm } = {},
) {
  if (!["full", "production"].includes(scope))
    throw new Error("Invalid scope for native audit");
  const cli = assertAuditNpm(npmCli, npm);
  const temp = realpathSync(tmpdir());
  const directory = mkdtempSync(join(temp, "owlapi-private-audit-"));
  try {
    const manifest = join(directory, "package.json");
    const lock = join(directory, "package-lock.json");
    const userConfig = join(directory, "empty-user-npmrc");
    const globalConfig = join(directory, "empty-global-npmrc");
    const flags = { flag: "wx", mode: 0o600 };
    writeFileSync(manifest, manifestBytes, flags);
    writeFileSync(lock, lockBytes, flags);
    writeFileSync(userConfig, "", flags);
    writeFileSync(globalConfig, "", flags);

    const env = {
      CI: "true",
      HOME: directory,
      USERPROFILE: directory,
      APPDATA: directory,
      LOCALAPPDATA: directory,
      TMPDIR: directory,
      TEMP: directory,
      TMP: directory,
    };
    if (process.platform === "win32" && process.env.SystemRoot)
      env.SystemRoot = process.env.SystemRoot;
    const args =
      scope === "production"
        ? [...RELEASE_AUDIT_ARGS, "--omit=dev"]
        : ["audit", "--include=dev"];
    const result = spawnSync(
      process.execPath,
      [
        cli,
        ...args,
        "--json",
        "--package-lock-only",
        "--ignore-scripts",
        "--registry=" + NPM_REGISTRY,
        "--prefix=" + directory,
        "--userconfig=" + userConfig,
        "--globalconfig=" + globalConfig,
        "--cache=" + join(directory, "cache"),
        "--fetch-retries=0",
        "--logs-max=0",
        "--no-update-notifier",
      ],
      {
        cwd: directory,
        env,
        maxBuffer: maxOutput,
        timeout: 45_000,
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const intact = () =>
      readFileSync(manifest).equals(manifestBytes) &&
      readFileSync(lock).equals(lockBytes);
    const stdout = result.stdout ?? Buffer.alloc(0);
    const stderr = result.stderr ?? Buffer.alloc(0);
    let complete = false;
    try {
      complete =
        !result.error &&
        !result.signal &&
        stdout.length <= maxOutput &&
        stderr.length <= maxOutput &&
        intact();
    } catch {
      // A missing input after npm also makes the kept observation ineligible.
    }
    return {
      status: result.status,
      stdout: stdout.subarray(0, maxOutput),
      stderr: stderr.subarray(0, maxOutput),
      signal: result.signal,
      complete,
      runtime: { node: process.versions.node, npm },
    };
  } finally {
    if (isStrictDescendantPath(temp, realpathSync(directory)))
      rmSync(directory, { recursive: true, force: true });
  }
}
