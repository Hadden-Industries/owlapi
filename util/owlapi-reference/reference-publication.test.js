import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "@jest/globals";
import { createReferenceInputRecord } from "./reference-inputs.mjs";
import {
  materializePublishedReferenceBundle,
  verifyPublishedReferenceBundle,
} from "./reference-bundle.mjs";

// Synthetic integrity fixtures only. They contain no Java binary/source material
// and do not establish publication rights, service authentication or native proof.
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let root;
let bundle;
let manifest;
let input;
let expected;
function save() {
  const inputBytes = Buffer.from(`${JSON.stringify(input)}\n`);
  writeFileSync(join(bundle, "input-record.json"), inputBytes);
  manifest.inputRecordSha256 = hash(inputBytes);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  writeFileSync(join(bundle, "manifest.json"), manifestBytes);
  expected.manifestSha256 = hash(manifestBytes);
  expected.inventorySha256 = hash(JSON.stringify(manifest.inventory));
  expected.inputRecordSha256 = manifest.inputRecordSha256;
}
const verify = () =>
  verifyPublishedReferenceBundle({ bundleDirectory: bundle, expected });
const materialize = () =>
  materializePublishedReferenceBundle({
    bundleDirectory: bundle,
    destination: join(root, "restored"),
    expected,
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "reference-publication-"));
  bundle = join(root, "bundle");
  mkdirSync(bundle);
  for (const path of ["runtime", "notices", "sources"])
    mkdirSync(join(bundle, path));
  const native = Buffer.from(
    `${"a".repeat(128)}  org/example/1/example-1.jar\n`,
  );
  const graph = Buffer.from('{"fixture":"native runtime graph bytes"}\n');
  input = createReferenceInputRecord({
    sourceCommit: "d7e997a53b470e32700de89cc610d9daf01ea769",
    sourceTree: "8f871bacef5ab767afda979e60b1a1e0c98d6323",
    externalSha256: hash(native),
    runtimeGraphSha256: hash(graph),
    mavenDistributionSha256: "1".repeat(64),
    jdkDistributionSha256: "2".repeat(64),
    environment: {
      runtime: "25.0.4.1+1-LTS",
      "java.version": "25.0.4.1",
      "java.vendor": "Eclipse Adoptium",
      "java.vm.name": "OpenJDK 64-Bit Server VM",
      "java.vm.version": "25.0.4.1+1-LTS",
      "os.name": "Linux",
      "os.version": "6.8.0",
      "os.arch": "amd64",
      "file.encoding": "UTF-8",
      "native.encoding": "UTF-8",
      "stdout.encoding": "UTF-8",
      "stderr.encoding": "UTF-8",
      locale: "en-GB",
      timezone: "UTC",
    },
    host: {
      os: "Linux",
      architecture: "X64",
      image: "ubuntu24",
      imageVersion: "20261001.1.0",
    },
  });
  const files = Array.from({ length: 63 }, (_, index) => [
    `runtime/${String(index).padStart(3, "0")}.jar`,
    Buffer.from(`synthetic ordered entry ${index}`),
  ]);
  files.push(
    ["sources/reactor.tar", Buffer.from("synthetic source archive")],
    ["sources/build-inputs.txt", native],
    ["sources/runtime-graph.txt", graph],
    [
      "notices/fixture.txt",
      Buffer.from("Synthetic fixture; no rights clearance."),
    ],
  );
  for (const [path, bytes] of files) writeFileSync(join(bundle, path), bytes);
  manifest = {
    schemaVersion: 2,
    purpose: "CI_JAVA_REFERENCE_BUILD_PRODUCT",
    redistribution: "OWNER_CLEARED",
    source: {
      commit: input.semantic.sourceCommit,
      tree: input.semantic.sourceTree,
    },
    inputRecordSha256: "0".repeat(64),
    inputKeySha256: input.keySha256,
    runtimeGraphSha256: hash(graph),
    rightsSha256: "3".repeat(64),
    provenance: {
      repository: "Hadden-Industries/owlapi",
      repositoryId: 1347610640,
      workflow: ".github/workflows/ci.yml",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      runId: 100,
      runAttempt: 2,
      event: "push",
      ref: "refs/heads/main",
      createdAt: "2026-10-04T00:00:00Z",
    },
    inventory: files.map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: hash(bytes),
    })),
    classpath: files.slice(0, 63).map(([path]) => path),
  };
  expected = {
    sourceCommit: input.semantic.sourceCommit,
    sourceTree: input.semantic.sourceTree,
    inputKeySha256: input.keySha256,
    runtimeGraphSha256: hash(graph),
    rightsSha256: manifest.rightsSha256,
    provenanceSha256: hash(JSON.stringify(manifest.provenance)),
  };
  save();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("admits all closed bytes before materializing ordered runtime, sources and input record", () => {
  expect(verify().jarCount).toBe(63);
  const restored = materialize();
  expect(restored.jarCount).toBe(63);
  expect(readFileSync(join(root, "restored/input-record.json"))).toEqual(
    readFileSync(join(bundle, "input-record.json")),
  );
  for (const entry of manifest.inventory)
    expect(hash(readFileSync(join(root, "restored", entry.path)))).toBe(
      entry.sha256,
    );
});

test.each([
  "inputKeySha256",
  "runtimeGraphSha256",
  "rightsSha256",
  "provenanceSha256",
])("requires independently qualified %s", (field) => {
  expected[field] = "f".repeat(64);
  expect(materialize).toThrow();
  expect(existsSync(join(root, "restored"))).toBe(false);
});

test.each([
  "sources/reactor.tar",
  "sources/build-inputs.txt",
  "sources/runtime-graph.txt",
])(
  "refuses missing required source/input inventory %s even with updated manifest hashes",
  (path) => {
    rmSync(join(bundle, path));
    manifest.inventory = manifest.inventory.filter(
      (entry) => entry.path !== path,
    );
    save();
    expect(materialize).toThrow();
    expect(existsSync(join(root, "restored"))).toBe(false);
  },
);

test.each([
  "runtime/001.jar",
  "sources/reactor.tar",
  "notices/fixture.txt",
  "sources/build-inputs.txt",
])("refuses changed %s before creating executable output", (path) => {
  writeFileSync(join(bundle, path), "changed bytes");
  expect(materialize).toThrow();
  expect(existsSync(join(root, "restored"))).toBe(false);
});

test("does not accept a self-reported rights marker without complete independent expectations", () => {
  delete expected.rightsSha256;
  expect(materialize).toThrow("expectation fields");
});

test("reconstructs semantic inputs instead of accepting a self-reported matching key", () => {
  input.semantic.externalSha256 = "e".repeat(64);
  save();
  expect(materialize).toThrow();
  expect(existsSync(join(root, "restored"))).toBe(false);
});

test("rejects arbitrary environment or provenance fields in the input record", () => {
  input.semantic.environment.GH_TOKEN = "synthetic forbidden field";
  save();
  expect(materialize).toThrow();
});

test("requires producer provenance independent of its own revised inventory", () => {
  manifest.provenance.event = "pull_request";
  save();
  expect(materialize).toThrow();
});
