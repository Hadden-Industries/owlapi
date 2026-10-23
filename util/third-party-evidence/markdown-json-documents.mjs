import { open, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { inspectPackageTarball, ARCHIVE_LIMITS } from "./archive-evidence.mjs";
import { sha256, verifySha512Digest } from "./digests.mjs";
import { jsonEquals } from "../../scripts/canonical-json.mjs";

const tooling = "tooling/markdown";
const jsonFamily = /\.(?:json|jsonld|map|jsonc|json5|jsonl|ndjson)$/iu;

/** Finite native-owner control metadata, distinct from shared JSON capacities.
 * The current complete producer report is 658,511 bytes. Refuse growth before
 * an unbounded read; same-descriptor observations and later core authority pins
 * retain freshness through capture, inventory and delivery.
 */
async function readControl(path, signal) {
  const handle = await open(path, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > 1048576)
      throw new Error(
        "Markdown tuple control metadata exceeds its 1 MiB bound",
      );
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      signal?.throwIfAborted();
      const part = await handle.read(
        bytes,
        length,
        Math.min(65536, bytes.length - length),
        null,
      );
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    const after = await handle.stat();
    if (
      length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new Error(
        "Markdown tuple control metadata changed during admission",
      );
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

/** Hash a bounded archive incrementally; no whole archive buffer crosses the
 * supplier boundary or survives alongside the native owner's retained members.
 */
async function archiveIdentity(path, integrity, signal) {
  const handle = await open(path, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > ARCHIVE_LIMITS.compressedBytes)
      throw new Error("Markdown archive exceeds compressed byte limit");
    const strong = createHash("sha256"),
      sri = createHash("sha512"),
      fragment = Buffer.alloc(65536);
    let length = 0;
    while (true) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(
        fragment,
        0,
        fragment.length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
      if (length > ARCHIVE_LIMITS.compressedBytes)
        throw new Error("Markdown archive exceeds compressed byte limit");
      strong.update(fragment.subarray(0, bytesRead));
      sri.update(fragment.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    if (
      length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw new Error("Markdown archive changed during admission");
    verifySha512Digest(sri.digest(), integrity);
    return { sha256: strong.digest("hex"), byteLength: String(length) };
  } finally {
    await handle.close();
  }
}

/** Reconcile every actual member against the actual producer's staged inventory,
 * including ordinary bundled dependency JSON and the repaired native reports.
 */
function reconcileStagedMembers(inspection, artifact) {
  if (
    !Array.isArray(artifact.files) ||
    !artifact.files.length ||
    artifact.files.length > ARCHIVE_LIMITS.entries ||
    inspection.duplicateEntries.length
  )
    throw new Error("Invalid Markdown tuple staged member inventory");
  const expected = new Map();
  for (const entry of artifact.files) {
    if (
      typeof entry.path !== "string" ||
      !entry.path ||
      entry.path.includes("\\") ||
      entry.path.startsWith("/") ||
      entry.path
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      expected.has(entry.path)
    )
      throw new Error("Invalid Markdown tuple staged member identity");
    expected.set(entry.path, entry);
  }
  let count = 0;
  for (const entry of inspection.entries) {
    if (entry.type !== "FILE") continue;
    const pin =
      entry.path.startsWith("package/") &&
      expected.get(entry.path.slice("package/".length));
    if (!pin || pin.sha256 !== entry.sha256 || pin.size !== entry.size)
      throw new Error(`Markdown tuple staged member mismatch: ${entry.path}`);
    count++;
  }
  if (count !== expected.size)
    throw new Error("Markdown tuple staged member census is incomplete");
}

/** The existing finite archive owner retains one admitted archive at a time.
 * Shared transport streams three separately closed provenance/census/body phases;
 * it never collects every archive's decoded JSON in one growing document array.
 */
export async function provideMarkdownArchiveJson({
  root,
  parameters = {},
  signal,
}) {
  if (Object.keys(parameters).length)
    throw new Error("Invalid native Markdown report parameters");
  const snapshots = await Promise.all(
    ["package.json", "package-lock.json", "release-manifest.json"].map(
      async (file) => ({
        path: `${tooling}/${file}`,
        bytes: await readControl(join(root, tooling, file), signal),
      }),
    ),
  );
  const [manifest, lock, release] = snapshots.map(({ bytes }) =>
    JSON.parse(bytes),
  );
  const selectors = {
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  };
  const lockedSelectors = {
    ...lock.packages?.[""].devDependencies,
    ...lock.packages?.[""].optionalDependencies,
  };
  if (!jsonEquals(selectors, lockedSelectors))
    throw new Error("Markdown archive selectors differ from frozen lock");
  if (
    release.schemaVersion !== 1 ||
    release.source?.clean !== true ||
    !/^[a-f0-9]{40}$/u.test(release.source.head) ||
    !/^[a-f0-9]{40}$/u.test(release.source.tree) ||
    !/^[a-f0-9]{64}$/u.test(release.source.lockSha256) ||
    !Array.isArray(release.archives) ||
    release.archives.length !== 3
  )
    throw new Error("Markdown tuple requires a clean complete producer source");
  const artifacts = new Map(
    release.archives.map((artifact) => [artifact.package, artifact]),
  );
  if (
    artifacts.size !== 3 ||
    !jsonEquals(release.archives.map((artifact) => artifact.name).sort(), [
      "core",
      "linux-x64",
      "win32-x64",
    ]) ||
    Object.keys(selectors).length !== 3
  )
    throw new Error("Markdown tuple is incomplete or duplicated");
  const plans = [],
    owned = new Set();
  for (const [name, selector] of Object.entries(selectors)) {
    signal?.throwIfAborted();
    if (
      typeof selector !== "string" ||
      !/^file:archives\/[a-z0-9]+(?:[.-][a-z0-9]+)*\.tgz$/u.test(selector)
    )
      throw new Error(`Unadmitted Markdown archive selector: ${name}`);
    const path = `${tooling}/${selector.slice("file:".length)}`;
    if (owned.has(path)) throw new Error("Duplicate Markdown archive selector");
    owned.add(path);
    const locked = lock.packages[`node_modules/${name}`];
    const artifact = artifacts.get(name);
    if (
      !locked ||
      locked.resolved !== selector ||
      typeof locked.version !== "string" ||
      !artifact ||
      locked.version !== artifact.version ||
      artifact.version !== release.version ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.tgz$/u.test(artifact.filename) ||
      selector !==
        `file:archives/${artifact.filename.slice(0, -4)}-${release.source.head}.tgz` ||
      !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
      locked.integrity !== artifact.integrity
    )
      throw new Error(`Missing locked Markdown archive identity: ${name}`);
    const identity = await archiveIdentity(
      join(root, path),
      locked.integrity,
      signal,
    );
    if (identity.sha256 !== artifact.sha256)
      throw new Error(`Markdown tuple archive digest mismatch: ${name}`);
    plans.push({
      name,
      path,
      locked,
      artifact,
      source: {
        kind: "archive-member",
        path,
        ...identity,
      },
    });
  }

  async function fresh() {
    signal?.throwIfAborted();
    const files = await readdir(join(root, tooling, "archives"));
    if (
      files
        .filter((file) => file.endsWith(".tgz"))
        .some((file) => !owned.has(`${tooling}/archives/${file}`))
    )
      throw new Error("Unaccounted owned Markdown archive");
    for (const snapshot of snapshots)
      if (
        !snapshot.bytes.equals(
          await readControl(join(root, snapshot.path), signal),
        )
      )
        throw new Error(`Markdown JSON authority changed: ${snapshot.path}`);
  }

  async function* admittedMembers() {
    for (const plan of plans) {
      signal?.throwIfAborted();
      const { name, path, locked, artifact, source } = plan;
      const original = await archiveIdentity(
        join(root, path),
        locked.integrity,
        signal,
      );
      if (
        original.sha256 !== source.sha256 ||
        original.byteLength !== source.byteLength
      )
        throw new Error(`Markdown archive changed: ${path}`);
      const expected = { name, version: locked.version };
      const first = await inspectPackageTarball(join(root, path), expected);
      reconcileStagedMembers(first, artifact);
      const retained = await inspectPackageTarball(join(root, path), expected, {
        retainMembers: first.entries
          .filter(
            (entry) => entry.type === "FILE" && jsonFamily.test(entry.path),
          )
          .map((entry) => entry.path),
      });
      if (!jsonEquals(first.entries, retained.entries))
        throw new Error(`Markdown archive census changed: ${path}`);
      const after = await archiveIdentity(
        join(root, path),
        locked.integrity,
        signal,
      );
      if (!jsonEquals(original, after))
        throw new Error(`Markdown archive changed during admission: ${path}`);
      for (const member of retained.retainedMembers) {
        signal?.throwIfAborted();
        yield {
          path: `${path}!/${member.path}`,
          member,
          source: { ...source, memberPath: member.path },
        };
      }
    }
    await fresh();
  }
  await fresh();
  return {
    authorities: (async function* () {
      for (const { path, bytes } of snapshots)
        yield { path, sha256: sha256(bytes), byteLength: String(bytes.length) };
      for (const { source } of plans) {
        const { path, sha256: digest, byteLength } = source;
        yield { path, sha256: digest, byteLength };
      }
      await fresh();
    })(),
    inventory: (async function* () {
      for await (const { path, member, source } of admittedMembers())
        yield {
          path,
          source,
          sha256: member.sha256,
          byteLength: String(member.size),
        };
    })(),
    documents: (async function* () {
      for await (const { path, member } of admittedMembers())
        yield {
          path,
          chunks: (async function* () {
            for (
              let offset = 0;
              offset < member.bytes.length;
              offset += 65536
            ) {
              signal?.throwIfAborted();
              yield member.bytes.subarray(offset, offset + 65536);
            }
          })(),
        };
    })(),
  };
}
