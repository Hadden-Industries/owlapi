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
import { isDeepStrictEqual } from "node:util";
import {
  createReferenceInputRecord,
  readNativeChecksums,
} from "./reference-inputs.mjs";

import Ajv from "ajv";

const schema = JSON.parse(
  readFileSync(
    new URL("./reference-bundle.schema.json", import.meta.url),
    "utf8",
  ),
);
const validate = new Ajv({ strict: true, allErrors: false }).compile(schema);
const publicationSchema = JSON.parse(
  readFileSync(
    new URL("./reference-publication.schema.json", import.meta.url),
    "utf8",
  ),
);
const validatePublication = new Ajv({ strict: true, allErrors: false }).compile(
  publicationSchema,
);
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

function expectations(value, published = false) {
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
  if (published)
    keys.push(
      "inputKeySha256",
      "runtimeGraphSha256",
      "rightsSha256",
      "provenanceSha256",
    );
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

function admittedBundle(
  bundleDirectory,
  expected,
  published = false,
  materialized = false,
) {
  expectations(expected, published);
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
  if (!(published ? validatePublication(manifest) : validate(manifest)))
    fail("invalid manifest schema");
  if (
    manifest.source.commit !== expected.sourceCommit ||
    manifest.source.tree !== expected.sourceTree ||
    manifest.inputRecordSha256 !== expected.inputRecordSha256 ||
    digest(JSON.stringify(manifest.inventory)) !== expected.inventorySha256
  )
    fail("independent input identity mismatch");
  if (
    published &&
    (manifest.inputKeySha256 !== expected.inputKeySha256 ||
      manifest.runtimeGraphSha256 !== expected.runtimeGraphSha256 ||
      manifest.rightsSha256 !== expected.rightsSha256 ||
      digest(JSON.stringify(manifest.provenance)) !==
        expected.provenanceSha256 ||
      !Number.isFinite(Date.parse(manifest.provenance.createdAt)))
  )
    fail("independent publication identity mismatch");
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
    published &&
    (!paths.includes("sources/reactor.tar") ||
      !paths.includes("sources/build-inputs.txt") ||
      !paths.includes("sources/runtime-graph.txt"))
  )
    fail("required publication source/input materials missing");
  if (
    manifest.inventory.reduce((total, entry) => total + entry.bytes, 0) >
    MAX_PAYLOAD_BYTES
  ) {
    fail("payload size limit exceeded");
  }
  const actual = [];
  const rootCount = (published ? 5 : 3) + (materialized ? 1 : 0);
  const entries = boundedEntries(
    root,
    rootCount,
    "extra or missing bundle entries",
  );
  if (entries.length !== rootCount) fail("extra or missing bundle entries");
  for (const entry of entries) {
    if (entry.name === "manifest.json" && entry.isFile()) continue;
    if (
      materialized &&
      entry.name === "owlapi-runtime-classpath.txt" &&
      entry.isFile()
    )
      continue;
    if (published && entry.name === "input-record.json" && entry.isFile())
      continue;
    if (
      !(
        published ? ["runtime", "notices", "sources"] : ["runtime", "notices"]
      ).includes(entry.name) ||
      !entry.isDirectory()
    ) {
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
  let inputRecordBytes = null;
  if (published) {
    inputRecordBytes = readRegular(join(root, "input-record.json"), 64 * 1024);
    if (digest(inputRecordBytes) !== expected.inputRecordSha256)
      fail("input record digest mismatch");
    const inputRecord = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(inputRecordBytes),
    );
    if (!inputRecord?.semantic || typeof inputRecord.semantic !== "object")
      fail("missing semantic inputs");
    const { recipeSha256, ...inputs } = inputRecord.semantic;
    const reconstructed = createReferenceInputRecord(inputs);
    if (
      reconstructed.scope !== "HOSTED_EXACT_IMAGE" ||
      !isDeepStrictEqual(reconstructed, inputRecord) ||
      reconstructed.keySha256 !== expected.inputKeySha256 ||
      recipeSha256 !== reconstructed.semantic.recipeSha256
    )
      fail("semantic input record mismatch");
    const external = payload.find(
      (entry) => entry.path === "sources/build-inputs.txt",
    ).data;
    readNativeChecksums(external);
    if (
      digest(external) !== reconstructed.semantic.externalSha256 ||
      digest(
        payload.find((entry) => entry.path === "sources/runtime-graph.txt")
          .data,
      ) !== expected.runtimeGraphSha256
    )
      fail("native input/graph record mismatch");
  }
  if (
    materialized &&
    readRegular(join(root, "owlapi-runtime-classpath.txt"), 64 * 1024).toString(
      "utf8",
    ) !== manifest.classpath.map((entry) => join(root, entry)).join(delimiter)
  )
    fail("materialized native classpath changed");
  return { root, manifest, manifestBytes, payload, inputRecordBytes };
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
  return materializeAdmitted(admitted, destination);
}

/** Publication provenance and expected identities must first be admitted through
 * the bounded service/qualification verifier. A local schema marker grants no rights
 * or producer authority. These APIs neither enable upload nor execute classes.
 */
export function verifyPublishedReferenceBundle({ bundleDirectory, expected }) {
  const { manifest } = admittedBundle(bundleDirectory, expected, true);
  return {
    purpose: manifest.purpose,
    source: manifest.source,
    jarCount: manifest.classpath.length,
    inventory: manifest.inventory,
    inputKeySha256: manifest.inputKeySha256,
  };
}

/** Same-job quiescent handoff only. The one additional native classpath file
 * must equal the already admitted ordered manifest, with no grammar fallback. */
export function verifyMaterializedPublishedReferenceBundle({
  bundleDirectory,
  expected,
}) {
  admittedBundle(bundleDirectory, expected, true, true);
  return {
    classpath: join(resolve(bundleDirectory), "owlapi-runtime-classpath.txt"),
  };
}

export function materializePublishedReferenceBundle({
  bundleDirectory,
  destination,
  expected,
}) {
  return materializeAdmitted(
    admittedBundle(bundleDirectory, expected, true),
    destination,
  );
}

function materializeAdmitted(admitted, destination) {
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
  for (const directory of admitted.inputRecordBytes
    ? ["runtime", "notices", "sources"]
    : ["runtime", "notices"])
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
  if (admitted.inputRecordBytes)
    writeFileSync(
      join(target, "input-record.json"),
      admitted.inputRecordBytes,
      { flag: "wx", mode: 0o600 },
    );
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
