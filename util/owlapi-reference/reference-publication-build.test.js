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
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "@jest/globals";
import { JAVA_REFERENCE_POLICY } from "../../scripts/java-reference-state.mjs";
import { createReferenceInputRecord } from "./reference-inputs.mjs";
import {
  assembleReferencePublication,
  publicationRuntimePaths,
  REFERENCE_PUBLICATION_CATALOGUE,
  REFERENCE_PUBLICATION_CATALOGUE_SHA256,
} from "./reference-publication-build.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let root;
let fixture;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "publication-constructor-"));
  const source = join(root, "source");
  const repository = join(root, "repository");
  const materials = join(root, "materials");
  for (const path of [
    source,
    repository,
    materials,
    join(materials, "sources"),
    join(materials, "notices"),
  ])
    mkdirSync(path);
  const runtimePaths = Array.from({ length: 63 }, (_, index) => {
    const path = join(repository, `entry-${index}.jar`);
    writeFileSync(path, `synthetic runtime ${index}`);
    return path;
  });
  const runtime = runtimePaths.map((path, index) => ({
    path: `runtime/${String(index).padStart(3, "0")}.jar`,
    kind: "EXTERNAL",
    repositoryPath: `entry-${index}.jar`,
    filename: `entry-${index}.jar`,
    bytes: readFileSync(path).length,
    sha256: hash(readFileSync(path)),
  }));
  const descriptor = (path, bytes) => {
    writeFileSync(join(materials, path), bytes);
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  };
  const catalogue = {
    sourceCommit: "d7e997a53b470e32700de89cc610d9daf01ea769",
    sourceTree: "8f871bacef5ab767afda979e60b1a1e0c98d6323",
    rightsSha256: JAVA_REFERENCE_POLICY.rightsSha256,
    runtime,
    sources: [
      descriptor("sources/000.jar", Buffer.from("synthetic source classifier")),
    ],
    static: [
      descriptor(
        "notices/fixture.txt",
        Buffer.from(
          "Synthetic constructor fixture, no real rights or provenance",
        ),
      ),
    ],
    reactorArchive: descriptor(
      "sources/reactor.tar",
      Buffer.from("synthetic reactor source"),
    ),
    noticeIndex: [],
    licenseRoutes: {},
    uncombinedClasses: [],
  };
  writeFileSync(
    join(materials, "sources/jfact-uncombined.jar"),
    "synthetic uncombined classes",
  );
  const buildInputs = Buffer.from(
    `${"a".repeat(128)}  org/example/1/example-1.jar\n`,
  );
  const runtimeGraph = Buffer.from('{"synthetic":"native graph bytes"}\n');
  const input = createReferenceInputRecord({
    sourceCommit: catalogue.sourceCommit,
    sourceTree: catalogue.sourceTree,
    externalSha256: hash(buildInputs),
    runtimeGraphSha256: hash(runtimeGraph),
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
  fixture = {
    source,
    repository,
    destination: join(root, "payload"),
    runtimePaths,
    sourceMaterialsDirectory: materials,
    inputRecordBytes: Buffer.from(`${JSON.stringify(input)}\n`),
    buildInputs,
    runtimeGraph,
    provenance: {
      repository: "Hadden-Industries/owlapi",
      repositoryId: 1347610640,
      workflow: ".github/workflows/ci.yml",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      runId: 100,
      runAttempt: 1,
      event: "push",
      ref: "refs/heads/main",
      createdAt: "2026-10-04T00:00:00Z",
    },
    catalogue,
  };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("binds the actual approved catalogue and every preserved source/notice asset", () => {
  expect(REFERENCE_PUBLICATION_CATALOGUE_SHA256).toBe(
    JAVA_REFERENCE_POLICY.catalogueSha256,
  );
  expect(REFERENCE_PUBLICATION_CATALOGUE.rightsSha256).toBe(
    JAVA_REFERENCE_POLICY.rightsSha256,
  );
  expect(REFERENCE_PUBLICATION_CATALOGUE.runtime).toHaveLength(63);
  expect(REFERENCE_PUBLICATION_CATALOGUE.sources).toHaveLength(63);
  for (const entry of REFERENCE_PUBLICATION_CATALOGUE.static) {
    const bytes = readFileSync(
      new URL(`./publication-assets/${entry.path}`, import.meta.url),
    );
    expect(bytes.length).toBe(entry.bytes);
    expect(hash(bytes)).toBe(entry.sha256);
  }
});
test("assembles and fully verifies a closed payload with source mappings before returning publishable identities", () => {
  const result = assembleReferencePublication(fixture);
  expect(result.entryCount).toBe(70);
  expect(result.expected.rightsSha256).toBe(JAVA_REFERENCE_POLICY.rightsSha256);
  const mapping = JSON.parse(
    readFileSync(join(fixture.destination, "sources/component-inventory.txt")),
  );
  expect(mapping.runtime).toEqual(fixture.catalogue.runtime);
  expect(mapping.sources).toEqual(fixture.catalogue.sources);
  expect(mapping.sourceAttestation).toBe("NOT_CLAIMED");
});
test.each(["notices/fixture.txt", "sources/000.jar", "sources/reactor.tar"])(
  "a changed approved %s prevents publication even if local files remain readable",
  (path) => {
    writeFileSync(join(fixture.sourceMaterialsDirectory, path), "changed");
    expect(() => assembleReferencePublication(fixture)).toThrow(/disposition/u);
    expect(existsSync(join(fixture.destination, "manifest.json"))).toBe(false);
  },
);
test("a new source closure cannot borrow the existing owner rights marker", () => {
  fixture.catalogue.sourceCommit = "f".repeat(40);
  expect(() => assembleReferencePublication(fixture)).toThrow(/disposition/u);
  expect(existsSync(fixture.destination)).toBe(false);
});
test.each([
  (value) => {
    value.runtimePaths.reverse();
  },
  (value) => {
    value.runtimePaths.pop();
  },
  (value) => {
    writeFileSync(value.runtimePaths[0], "changed dependency");
  },
])(
  "closed native classpath refuses order, completeness and external-byte changes",
  (change) => {
    change(fixture);
    expect(() =>
      publicationRuntimePaths({
        sourceDirectory: fixture.source,
        repositoryDirectory: fixture.repository,
        classpath: fixture.runtimePaths.join(delimiter),
        catalogue: fixture.catalogue,
      }),
    ).toThrow();
  },
);
test("private source paths cannot substitute a different ordered runtime entry", () => {
  const alien = join(root, "alien.jar");
  writeFileSync(alien, readFileSync(fixture.runtimePaths[0]));
  fixture.runtimePaths[0] = alien;
  expect(() =>
    publicationRuntimePaths({
      sourceDirectory: fixture.source,
      repositoryDirectory: fixture.repository,
      classpath: fixture.runtimePaths.join(delimiter),
      catalogue: fixture.catalogue,
    }),
  ).toThrow(/closure/u);
});
