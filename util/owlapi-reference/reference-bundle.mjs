import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  delimiter,
  dirname,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { TextDecoder } from "node:util";

import Ajv from "ajv";

const schema = JSON.parse(
  readFileSync(
    new URL("./reference-bundle.schema.json", import.meta.url),
    "utf8",
  ),
);
const validate = new Ajv({ strict: true, allErrors: false }).compile(schema);
const digest = (data) => createHash("sha256").update(data).digest("hex");
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_PAYLOAD_BYTES = 128 * 1024 * 1024;
const fail = (message) => {
  throw new Error(`Reference bundle rejected: ${message}`);
};

// The caller owns a private, quiescent namespace. These checks reject payload
// links and aliases; they are not a sandbox against a concurrent local writer.
function plainPath(file) {
  const absolute = resolve(file);
  let current = parse(absolute).root;
  for (const component of absolute.slice(current.length).split(sep)) {
    current = join(current, component);
    if (lstatSync(current).isSymbolicLink()) fail("linked path");
  }
  const canonical = resolve(realpathSync.native(absolute));
  const comparable = (value) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  if (comparable(canonical) !== comparable(absolute)) {
    fail("aliased path");
  }
  return absolute;
}

function readRegular(file, limit) {
  plainPath(file);
  const before = lstatSync(file);
  if (!before.isFile() || before.nlink !== 1 || before.size > limit) {
    fail("nonregular, linked or oversized file");
  }
  // Native open flags are a bitmask; O_NOFOLLOW is supplementary on supported hosts.
  // eslint-disable-next-line no-bitwise
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > limit ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    )
      fail("changed file identity");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (
      bytes.length !== opened.size ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs
    )
      fail("file changed while reading");
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function boundedEntries(directory, limit, message) {
  const handle = opendirSync(directory);
  const entries = [];
  try {
    for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
      if (entries.length === limit) fail(message);
      entries.push(entry);
    }
    return entries;
  } finally {
    handle.closeSync();
  }
}

function expectations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("independent expectations missing");
  }
  const keys = [
    "manifestSha256",
    "inputRecordSha256",
    "inventorySha256",
    "sourceCommit",
    "sourceTree",
  ];
  if (Object.keys(value).sort().join() !== keys.sort().join())
    fail("unexpected expectation fields");
  for (const key of keys) {
    if (
      !new RegExp(
        `^[a-f0-9]{${key.startsWith("source") ? 40 : 64}}$`,
        "u",
      ).test(value[key])
    ) {
      fail("invalid independent expectation");
    }
  }
}

function admittedBundle(bundleDirectory, expected) {
  expectations(expected);
  const root = plainPath(bundleDirectory);
  if (!lstatSync(root).isDirectory()) fail("bundle is not a directory");
  const manifestBytes = readRegular(
    join(root, "manifest.json"),
    MAX_MANIFEST_BYTES,
  );
  if (digest(manifestBytes) !== expected.manifestSha256)
    fail("manifest digest mismatch");
  const manifest = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
  );
  if (!validate(manifest)) fail("invalid manifest schema");
  if (
    manifest.source.commit !== expected.sourceCommit ||
    manifest.source.tree !== expected.sourceTree ||
    manifest.inputRecordSha256 !== expected.inputRecordSha256 ||
    digest(JSON.stringify(manifest.inventory)) !== expected.inventorySha256
  )
    fail("independent input identity mismatch");
  const paths = manifest.inventory.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("duplicate inventory path");
  const jars = paths.filter((file) => file.startsWith("runtime/"));
  if (
    jars.length !== manifest.classpath.length ||
    jars.some((file, index) => file !== manifest.classpath[index]) ||
    jars.some(
      (file, index) => file !== `runtime/${String(index).padStart(3, "0")}.jar`,
    ) ||
    !paths.some((file) => file.startsWith("notices/"))
  )
    fail("incomplete or reordered runtime inventory");
  if (
    manifest.inventory.reduce((total, entry) => total + entry.bytes, 0) >
    MAX_PAYLOAD_BYTES
  ) {
    fail("payload size limit exceeded");
  }
  const actual = [];
  const entries = boundedEntries(root, 3, "extra or missing bundle entries");
  if (entries.length !== 3) fail("extra or missing bundle entries");
  for (const entry of entries) {
    if (entry.name === "manifest.json" && entry.isFile()) continue;
    if (!["runtime", "notices"].includes(entry.name) || !entry.isDirectory()) {
      fail("unexpected bundle entry");
    }
    const directory = plainPath(join(root, entry.name));
    const files = boundedEntries(
      directory,
      512,
      "directory entry limit exceeded",
    );
    for (const file of files) {
      if (!file.isFile()) fail("linked or nonregular payload");
      actual.push(`${entry.name}/${file.name}`);
    }
  }
  if (actual.sort().join("\n") !== [...paths].sort().join("\n"))
    fail("closed inventory mismatch");
  const payload = manifest.inventory.map((entry) => {
    const bytes = readRegular(join(root, entry.path), entry.bytes);
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256)
      fail("payload digest or size mismatch");
    return { ...entry, data: bytes };
  });
  return { root, manifest, manifestBytes, payload };
}

/** Local experiment only; independent identities do not authenticate a producer. */
export function verifyReferenceBundle({ bundleDirectory, expected }) {
  const { manifest } = admittedBundle(bundleDirectory, expected);
  return {
    purpose: manifest.purpose,
    source: manifest.source,
    jarCount: manifest.classpath.length,
    inventory: manifest.inventory,
  };
}

/** Copies the verified in-memory bytes into a new, caller-owned private directory. */
export function materializeReferenceBundle({
  bundleDirectory,
  destination,
  expected,
}) {
  const admitted = admittedBundle(bundleDirectory, expected);
  const target = resolve(destination);
  plainPath(dirname(target));
  const overlap = relative(admitted.root, target);
  if (
    overlap === "" ||
    (!overlap.startsWith(`..${sep}`) &&
      overlap !== ".." &&
      !parse(overlap).root)
  ) {
    fail("destination overlaps bundle");
  }
  // Exclusive creation refuses collisions. No cleanup deletes a caller's directory.
  mkdirSync(target, { mode: 0o700 });
  for (const directory of ["runtime", "notices"])
    mkdirSync(join(target, directory), { mode: 0o700 });
  for (const entry of admitted.payload) {
    writeFileSync(join(target, entry.path), entry.data, {
      flag: "wx",
      mode: 0o600,
    });
  }
  writeFileSync(join(target, "manifest.json"), admitted.manifestBytes, {
    flag: "wx",
    mode: 0o600,
  });
  const classpath = join(target, "owlapi-runtime-classpath.txt");
  writeFileSync(
    classpath,
    admitted.manifest.classpath
      .map((file) => join(target, file))
      .join(delimiter),
    { flag: "wx", mode: 0o600 },
  );
  return {
    purpose: admitted.manifest.purpose,
    classpath,
    jarCount: admitted.manifest.classpath.length,
  };
}
