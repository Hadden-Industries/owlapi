/** Freeze literal upload paths and verify recovery archives without extracting them. */
import {
  lstat,
  readdir,
  mkdir,
  open,
  writeFile,
  realpath,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { policy, hashBytes } from "./identity.mjs";
import { readZipArchiveFilesWith } from "../../scripts/release-zip-core.mjs";

const fact = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};
const within = (parent, child) => {
  const path = relative(parent, child);
  return (
    path !== "" &&
    !path.startsWith(`..${sep}`) &&
    path !== ".." &&
    !resolve(child).startsWith(`${sep}${sep}`) &&
    !path.includes(":")
  );
};
const portable = (path) => {
  fact(
    !/[<>:"|?*\\]/u.test(path) &&
      ![...path].some((character) => character.charCodeAt(0) < 32) &&
      !path.startsWith("/") &&
      path
        .split("/")
        .every(
          (part) =>
            part &&
            part !== "." &&
            part !== ".." &&
            !/[. ]$/u.test(part) &&
            !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part),
        ),
    "Unsafe artifact payload path",
  );
  fact(
    !path.split("/").some((part) => part.startsWith(".")),
    "Unexpected hidden artifact entry",
  );
  return path;
};

/** Check existing ancestors under a resolved workspace; never follow links. */
export async function assertWorkspacePath(
  base,
  path,
  { allowMissing = false } = {},
) {
  fact(within(base, path), "Artifact path escapes workspace");
  let ancestor = base;
  for (const part of relative(base, path).split(sep)) {
    ancestor = resolve(ancestor, part);
    let stats;
    try {
      stats = await lstat(ancestor);
    } catch (error) {
      if (allowMissing && error.code === "ENOENT") return;
      throw error;
    }
    fact(!stats.isSymbolicLink(), "Artifact path has a symlink ancestor");
  }
}

/** Symlinks and hidden descendants are never followed, including symlink ancestors. */
export async function freezePayload({
  paths,
  workspace,
  destination,
  signal,
  deadline = performance.now() + policy.deadlineMilliseconds,
}) {
  const guard = () => {
    signal?.throwIfAborted();
    fact(performance.now() < deadline, "Artifact snapshot deadline exceeded");
  };
  guard();
  const base = await realpath(workspace);
  const roots = [];
  const selected = new Map();
  let visited = 0;
  for (const input of paths
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)) {
    fact(!/[!*?[\]{}]/u.test(input), "Artifact input must be a literal path");
    const path = resolve(workspace, input);
    await assertWorkspacePath(base, path);
    const stats = await lstat(path);
    roots.push(stats.isDirectory() ? path : dirname(path));
    const visit = async (entry) => {
      guard();
      fact(
        ++visited <= policy.maximumVisitedEntries,
        "Artifact filesystem census exceeds policy",
      );
      const stat = await lstat(entry);
      fact(!stat.isSymbolicLink(), "Artifact payload contains a symlink");
      if (stat.isDirectory()) {
        for (const name of (await readdir(entry)).sort()) {
          if (!name.startsWith(".")) {
            await visit(resolve(entry, name));
          }
        }
      } else {
        fact(stat.isFile(), "Artifact payload contains a special file");
        selected.set(entry, stat);
        fact(
          selected.size <= policy.maximumFiles,
          "Artifact file count exceeds policy",
        );
      }
    };
    await visit(path);
  }
  fact(roots.length > 0 && selected.size > 0, "Artifact payload is empty");
  let root = roots[0];
  while (!roots.every((path) => path === root || within(root, path))) {
    root = dirname(root);
  }
  const manifest = [];
  const folded = new Set();
  let total = 0;
  for (const [source, initial] of [...selected].sort(([a], [b]) =>
    a.localeCompare(b, "en"),
  )) {
    guard();
    const path = portable(relative(root, source).split(sep).join("/"));
    fact(
      !folded.has(path.toLowerCase()),
      "Artifact payload has a path collision",
    );
    folded.add(path.toLowerCase());
    total += initial.size;
    fact(
      total <= policy.maximumPayloadBytes,
      "Artifact payload exceeds byte limit",
    );
    const file = await open(source, "r");
    let bytes;
    try {
      const before = await file.stat();
      fact(
        before.ino === initial.ino &&
          before.size === initial.size &&
          before.mtimeMs === initial.mtimeMs,
        "Artifact payload changed before snapshot",
      );
      // The bounded read prevents a growing source from escaping the declared size.
      bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        guard();
        const result = await file.read(
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        fact(result.bytesRead > 0, "Artifact payload changed during snapshot");
        offset += result.bytesRead;
      }
      const after = await file.stat();
      fact(
        after.size === before.size &&
          after.mtimeMs === before.mtimeMs &&
          after.ctimeMs === before.ctimeMs,
        "Artifact payload changed during snapshot",
      );
    } finally {
      await file.close();
    }
    await mkdir(dirname(resolve(destination, path)), { recursive: true });
    await writeFile(resolve(destination, path), bytes, { flag: "wx" });
    manifest.push({ path, bytes: bytes.length, sha256: hashBytes(bytes) });
  }
  manifest.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    root: destination,
    files: manifest.map((item) => resolve(destination, item.path)),
    manifest,
  };
}

/** Validate the ZIP centrally before writing any recovered payload bytes. */
export function inspectArchive(bytes, crc32) {
  fact(
    bytes.length <= policy.maximumArchiveBytes,
    "Artifact archive exceeds policy",
  );
  const files = readZipArchiveFilesWith(bytes, { crc32 });
  fact(
    files.length > 0 && files.length <= policy.maximumFiles,
    "Artifact archive file count exceeds policy",
  );
  let total = 0;
  const manifest = files
    .map((file) => {
      portable(file.path);
      total += file.bytes;
      fact(
        total <= policy.maximumPayloadBytes,
        "Expanded artifact exceeds policy",
      );
      return {
        path: file.path,
        bytes: file.bytes,
        sha256: hashBytes(file.content),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, manifest };
}

/** Recovery only adopts an exact frozen subject; names and sizes alone are insufficient. */
export function assertSameManifest(expected, actual) {
  fact(
    isDeepStrictEqual(expected, actual),
    "Conflicting artifact payload inventory or hashes",
  );
}

/** Destination must be an empty, newly owned directory so no symlink can redirect writes. */
export async function materializeArchive(
  files,
  destination,
  {
    signal,
    deadline = performance.now() + policy.collectionDeadlineMilliseconds,
  } = {},
) {
  const guard = () => {
    signal?.throwIfAborted();
    fact(performance.now() < deadline, "Artifact collection deadline exceeded");
  };
  guard();
  await mkdir(destination, { recursive: false });
  for (const file of files) {
    guard();
    portable(file.path);
    await mkdir(dirname(resolve(destination, file.path)), { recursive: true });
    await writeFile(resolve(destination, file.path), file.content, {
      flag: "wx",
    });
  }
  guard();
}
