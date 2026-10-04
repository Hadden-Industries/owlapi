/** Producer-only assembly of the owner-approved source/notice closure.
 * Native Git, curl and jar own their formats; this does not resolve dependencies,
 * infer licenses, authenticate a producer, or qualify behavioral results. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceFingerprint } from "../../scripts/ci-check-coverage.mjs";
import { JAVA_REFERENCE_POLICY } from "../../scripts/java-reference-state.mjs";
import { referenceBuildEnvironment } from "./reference-native-build.mjs";
import {
  assertNativeBuildClosure,
  createReferenceInputRecord,
  REFERENCE_RECIPE,
} from "./reference-inputs.mjs";
import { verifyPublishedReferenceBundle } from "./reference-bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const catalogueBytes = readFileSync(
  join(here, "reference-publication-catalogue.json"),
);
export const REFERENCE_PUBLICATION_CATALOGUE = JSON.parse(catalogueBytes);
export const REFERENCE_PUBLICATION_CATALOGUE_SHA256 = createHash("sha256")
  .update(catalogueBytes)
  .digest("hex");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fact = (condition, message) => {
  if (!condition) throw new Error(`Reference publication: ${message}`);
};
const plainFile = (path, maximum = 64 * 1024 * 1024) => {
  const actual = resolve(path);
  const stat = lstatSync(actual);
  fact(
    stat.isFile() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= maximum &&
      realpathSync.native(actual) === actual,
    "invalid source file",
  );
  return readFileSync(actual);
};
const sameBytes = (path, entry) => {
  const bytes = plainFile(path);
  fact(
    bytes.length === entry.bytes && sha256(bytes) === entry.sha256,
    "source/notice bytes differ from owner disposition",
  );
  return bytes;
};

/** Check the exact ordered native classpath against the accepted closure before
 * source acquisition. Reactor JAR bytes may differ across native builds, while
 * the pinned source and external binaries/source/notice identities cannot. */
export function publicationRuntimePaths({
  sourceDirectory,
  repositoryDirectory,
  classpath,
  catalogue = REFERENCE_PUBLICATION_CATALOGUE,
}) {
  const paths = classpath.trim().split(delimiter);
  fact(
    catalogue.runtime.length === 63 && paths.length === 63,
    "runtime closure count changed",
  );
  for (const [index, entry] of catalogue.runtime.entries()) {
    fact(
      entry.path === `runtime/${String(index).padStart(3, "0")}.jar`,
      "runtime order is ambiguous",
    );
    const expected =
      entry.kind === "REACTOR"
        ? join(sourceDirectory, entry.module, "target", entry.filename)
        : join(repositoryDirectory, entry.repositoryPath);
    fact(
      resolve(paths[index]) === resolve(expected),
      "native runtime closure changed",
    );
    if (entry.kind === "EXTERNAL") sameBytes(expected, entry);
    else plainFile(expected);
  }
  return paths.map((path) => resolve(path));
}

/** Payload constructor for already acquired, exact approved materials. It always
 * verifies the completed publication-format bundle before returning identities.
 * Consumer admission still requires independent service/qualification bindings. */
export function assembleReferencePublication({
  destination,
  runtimePaths,
  sourceMaterialsDirectory,
  inputRecordBytes,
  buildInputs,
  runtimeGraph,
  provenance,
  catalogue = REFERENCE_PUBLICATION_CATALOGUE,
}) {
  fact(!existsSync(destination), "fresh exclusive payload directory required");
  fact(
    catalogue.rightsSha256 === JAVA_REFERENCE_POLICY.rightsSha256 &&
      catalogue.sourceCommit === "d7e997a53b470e32700de89cc610d9daf01ea769" &&
      catalogue.sourceTree === "8f871bacef5ab767afda979e60b1a1e0c98d6323",
    "owner disposition does not cover this catalogue",
  );
  const inputRecord = JSON.parse(inputRecordBytes.toString("utf8"));
  const { recipeSha256, ...semantic } = inputRecord.semantic ?? {};
  const current = createReferenceInputRecord(semantic);
  fact(
    JSON.stringify(current) === JSON.stringify(inputRecord) &&
      recipeSha256 === current.semantic.recipeSha256 &&
      current.scope === "HOSTED_EXACT_IMAGE",
    "unqualified current native inputs",
  );
  fact(
    runtimePaths.length === 63 && catalogue.runtime.length === 63,
    "incomplete runtime",
  );
  mkdirSync(destination, { mode: 0o700 });
  for (const directory of ["runtime", "sources", "notices"])
    mkdirSync(join(destination, directory), { mode: 0o700 });
  const inventory = [];
  let bytesWritten = inputRecordBytes.length;
  const put = (path, bytes) => {
    fact(
      /^(runtime\/[0-9]{3}\.jar|notices\/[a-z0-9][a-z0-9._-]{0,100}\.txt|sources\/[a-z0-9][a-z0-9._-]{0,100}\.(jar|tar|txt))$/u.test(
        path,
      ) &&
        bytes.length > 0 &&
        bytes.length <= 64 * 1024 * 1024,
      "unbounded payload entry",
    );
    bytesWritten += bytes.length;
    fact(
      bytesWritten <= JAVA_REFERENCE_POLICY.payloadLimit &&
        inventory.length < 512 &&
        !inventory.some((entry) => entry.path === path),
      "payload budget or duplicate entry",
    );
    writeFileSync(join(destination, path), bytes, { flag: "wx", mode: 0o600 });
    inventory.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
  };
  for (const [index, path] of runtimePaths.entries()) {
    const entry = catalogue.runtime[index];
    const bytes = plainFile(path);
    if (entry.kind === "EXTERNAL")
      fact(
        bytes.length === entry.bytes && sha256(bytes) === entry.sha256,
        "runtime dependency changed",
      );
    put(entry.path, bytes);
  }
  for (const entry of [
    ...catalogue.sources,
    ...catalogue.static,
    catalogue.reactorArchive,
  ])
    put(
      entry.path,
      sameBytes(join(sourceMaterialsDirectory, entry.path), entry),
    );
  put(
    "sources/jfact-uncombined.jar",
    plainFile(join(sourceMaterialsDirectory, "sources/jfact-uncombined.jar")),
  );
  put("sources/build-inputs.txt", buildInputs);
  put("sources/runtime-graph.txt", runtimeGraph);
  put(
    "sources/component-inventory.txt",
    Buffer.from(
      `${JSON.stringify(
        {
          sourceCommit: catalogue.sourceCommit,
          sourceTree: catalogue.sourceTree,
          runtime: catalogue.runtime,
          sources: catalogue.sources,
          static: catalogue.static,
          noticeIndex: catalogue.noticeIndex,
          licenseRoutes: catalogue.licenseRoutes,
          uncombinedClasses: catalogue.uncombinedClasses,
          sourceAttestation: "NOT_CLAIMED",
        },
        null,
        2,
      )}\n`,
    ),
  );
  const manifest = {
    schemaVersion: 2,
    purpose: "CI_JAVA_REFERENCE_BUILD_PRODUCT",
    redistribution: "OWNER_CLEARED",
    source: { commit: catalogue.sourceCommit, tree: catalogue.sourceTree },
    inputRecordSha256: sha256(inputRecordBytes),
    inputKeySha256: inputRecord.keySha256,
    runtimeGraphSha256: inputRecord.semantic.runtimeGraphSha256,
    rightsSha256: catalogue.rightsSha256,
    provenance,
    inventory,
    classpath: catalogue.runtime.map((entry) => entry.path),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  fact(
    bytesWritten + manifestBytes.length <= JAVA_REFERENCE_POLICY.payloadLimit,
    "complete payload byte budget",
  );
  writeFileSync(join(destination, "input-record.json"), inputRecordBytes, {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(join(destination, "manifest.json"), manifestBytes, {
    flag: "wx",
    mode: 0o600,
  });
  const expected = {
    sourceCommit: catalogue.sourceCommit,
    sourceTree: catalogue.sourceTree,
    inputKeySha256: inputRecord.keySha256,
    inputRecordSha256: manifest.inputRecordSha256,
    runtimeGraphSha256: manifest.runtimeGraphSha256,
    rightsSha256: manifest.rightsSha256,
    manifestSha256: sha256(manifestBytes),
    inventorySha256: evidenceFingerprint(inventory),
    provenanceSha256: evidenceFingerprint(provenance),
  };
  verifyPublishedReferenceBundle({ bundleDirectory: destination, expected });
  return {
    expected,
    provenance,
    payloadBytes: bytesWritten + manifestBytes.length,
    entryCount: inventory.length,
  };
}

/** Native, finite source acquisition and class-supplement generation. Only a
 * freshly executed approved main build may call this producer entry point. */
export function buildReferencePublication({
  sourceDirectory,
  nativeWorkspace,
  jdkDirectory,
  mavenDirectory,
  destination,
  provenance,
}) {
  fact(process.platform === "linux", "qualified Linux producer required");
  const catalogue = REFERENCE_PUBLICATION_CATALOGUE;
  fact(
    REFERENCE_PUBLICATION_CATALOGUE_SHA256 ===
      JAVA_REFERENCE_POLICY.catalogueSha256,
    "accepted catalogue bytes changed",
  );
  const source = realpathSync.native(sourceDirectory);
  const native = realpathSync.native(nativeWorkspace);
  const preparedInputs = plainFile(
    join(native, "build-inputs.txt"),
    1024 * 1024,
  );
  const executedInputs = plainFile(
    join(native, "built", REFERENCE_RECIPE.nativeSummary),
    1024 * 1024,
  );
  const closure = assertNativeBuildClosure(preparedInputs, executedInputs);
  const actualClosure = JSON.parse(
    plainFile(join(native, "build-closure.json"), 4096),
  );
  fact(
    evidenceFingerprint(actualClosure) ===
      evidenceFingerprint({ status: "QUALIFIED_INPUTS", ...closure }),
    "fresh build has no qualified native input closure",
  );
  const materials = join(native, "publication-materials");
  fact(!existsSync(materials), "source acquisition already attempted");
  fact(
    catalogue.sources.length === 63 && catalogue.static.length <= 128,
    "source inventory budget",
  );
  mkdirSync(materials, { mode: 0o700 });
  for (const directory of ["sources", "notices"])
    mkdirSync(join(materials, directory), { mode: 0o700 });
  const env = referenceBuildEnvironment({
    jdkDirectory,
    mavenDirectory,
    userHome: join(native, "home"),
    temporaryDirectory: join(native, "temporary"),
  });
  const deadline = Date.now() + 240_000;
  let commands = 0;
  const run = (executable, args, maximumMs = 30_000) => {
    const remaining = deadline - Date.now();
    fact(remaining > 0 && ++commands <= 80, "native source acquisition budget");
    const result = spawnSync(executable, args, {
      cwd: source,
      env,
      shell: false,
      maxBuffer: 256 * 1024,
      timeout: Math.min(maximumMs, remaining),
    });
    fact(
      !result.error && !result.signal && result.status === 0,
      "native source acquisition failed; no retry",
    );
  };
  const runtimePaths = publicationRuntimePaths({
    sourceDirectory: source,
    repositoryDirectory: join(native, "repository"),
    classpath: plainFile(
      join(source, "distribution/target/owlapi-runtime-classpath.txt"),
      64 * 1024,
    ).toString("utf8"),
  });
  for (const entry of catalogue.static)
    writeFileSync(
      join(materials, entry.path),
      sameBytes(join(here, "publication-assets", entry.path), entry),
      { flag: "wx", mode: 0o600 },
    );
  for (const entry of catalogue.sources) {
    fact(
      /^https:\/\/repo\.maven\.apache\.org\/maven2\/[A-Za-z0-9_./-]+-sources\.jar$/u.test(
        entry.url,
      ) &&
        !entry.url.includes("..") &&
        /^sources\/[0-9]{3}\.jar$/u.test(entry.path),
      "unapproved source location",
    );
    run("/usr/bin/curl", [
      "--disable",
      "--fail",
      "--silent",
      "--show-error",
      "--proto",
      "=https",
      "--tlsv1.2",
      "--connect-timeout",
      "10",
      "--max-time",
      "30",
      "--max-filesize",
      String(entry.bytes),
      "--output",
      join(materials, entry.path),
      entry.url,
    ]);
    sameBytes(join(materials, entry.path), entry);
  }
  run("/usr/bin/git", [
    "--no-optional-locks",
    "-c",
    "core.fsmonitor=false",
    "archive",
    "--format=tar",
    `--output=${join(materials, "sources/reactor.tar")}`,
    catalogue.sourceCommit,
  ]);
  sameBytes(join(materials, "sources/reactor.tar"), catalogue.reactorArchive);
  const classes = join(source, "tools/target/classes");
  for (const entry of catalogue.uncombinedClasses)
    sameBytes(join(classes, entry.path), entry);
  run(join(jdkDirectory, "bin/jar"), [
    "--create",
    "--file",
    join(materials, "sources/jfact-uncombined.jar"),
    "--no-manifest",
    ...catalogue.uncombinedClasses.flatMap((entry) => [
      "-C",
      classes,
      entry.path,
    ]),
  ]);
  return assembleReferencePublication({
    destination,
    runtimePaths,
    sourceMaterialsDirectory: materials,
    inputRecordBytes: plainFile(join(native, "input-record.json"), 64 * 1024),
    buildInputs: plainFile(join(native, "build-inputs.txt"), 1024 * 1024),
    runtimeGraph: plainFile(join(native, "runtime-graph.txt"), 1024 * 1024),
    provenance,
  });
}
