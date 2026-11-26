import { expect, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import {
  verifyReleaseCiPackage,
  readQualifiedZip,
} from "./release-ci-package.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PACKAGE_SBOM_PURL,
} from "./package-identity.mjs";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { QUALIFICATION_POLICY_SHA256 } from "./ci-qualification.mjs";
import {
  packProducerResolutions,
  producerResolutionFilename,
  producerResolutionUploadStep,
} from "./release-resolution-proof.mjs";
import {
  captureResolutionEvidence,
  verifyResolutionEvidence,
} from "./release-consumer-evidence.mjs";
import { installResolutionFixture } from "./fixtures/npm-consumer-resolution.mjs";
import {
  INSTALLED_TEST_SCRIPTS,
  productionInstallScriptPolicy,
} from "./installed-consumer-fixtures.mjs";
import { stableJson } from "./canonical-json.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stem = "hadden-industries-owlapi-" + PACKAGE_VERSION;
const time = "2026-11-12T11:00:00Z";
const expires = "2027-02-10T11:00:00Z";
const step = (name) => ({
  name,
  status: "completed",
  conclusion: "success",
  started_at: time,
  completed_at: "2026-11-12T11:00:03Z",
});
const packageFacts = { name: PACKAGE_NAME, version: PACKAGE_VERSION };

test("admission and storage observation load before installing OwlAPI dependencies", () => {
  const loader = `
    import { registerHooks } from "node:module";
    const dependencies = new URL("./node_modules/", import.meta.url).href;
    registerHooks({ resolve(specifier, context, resolve) {
      const result = resolve(specifier, context);
      if (result.url.startsWith(dependencies))
        throw new Error("Cold workflow imports a project dependency: " + specifier);
      return result;
    } });
    await import("./scripts/release-ci-qualification.mjs");
    await import("./scripts/release-retention.mjs");
  `;
  expect(() =>
    execFileSync(process.execPath, ["--input-type=module", "--eval", loader], {
      cwd: new URL("../", import.meta.url),
      timeout: 10000,
      stdio: "pipe",
    }),
  ).not.toThrow();
});

test("protected Mac recovery can reopen bounded ZIP bytes without native zlib CRC32", () => {
  const zip = zipArchive([{ path: "native.json", content: "{}" }]);
  const program = `
    import assert from "node:assert/strict";
    import { createRequire,syncBuiltinESMExports } from "node:module";
    const nodeZlib=createRequire(import.meta.url)("node:zlib");
    nodeZlib.crc32=undefined;
    syncBuiltinESMExports();
    await import("./scripts/macos-material-readmission.mjs");
    const {readQualifiedZip}=await import("./scripts/release-ci-package.mjs");
    const bytes=Buffer.from(${JSON.stringify(zip.toString("base64"))},"base64");
    const files=await readQualifiedZip(async()=>bytes,{id:1,size_in_bytes:bytes.length,digest:${JSON.stringify(`sha256:${sha(zip)}`)}},1024,["native.json"]);
    assert.equal(files.get("native.json").toString(),"{}");
  `;
  expect(() =>
    execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: new URL("../", import.meta.url),
      timeout: 10000,
      stdio: "pipe",
    }),
  ).not.toThrow();
});

function fixture() {
  const body = Buffer.from(JSON.stringify(packageFacts));
  const header = Buffer.alloc(512);
  header.write("package/package.json");
  header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write("0", 156);
  const tarball = gzipSync(
    Buffer.concat([header, body, Buffer.alloc(1536 - body.length)]),
  );
  const integrity =
    "sha512-" + createHash("sha512").update(tarball).digest("base64");
  const sbom = JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: { ...packageFacts, type: "library", purl: PACKAGE_SBOM_PURL },
    },
    components: [],
  });
  const checksum = `${sha(sbom)}  ${stem}.cdx.json\n${sha(tarball)}  ${stem}.tgz\n`;
  const files = {
    [stem + ".tgz"]: tarball,
    [stem + ".cdx.json"]: sbom,
    SHA256SUMS: checksum,
  };
  const audit = { metadata: { vulnerabilities: { high: 0, critical: 0 } } };
  const verifiedAudit = { commandExitStatus: 0, report: audit };
  const lockless = { version: "1.0.0", dependencies: { owlapi: packageFacts } };
  const evidence = {
    "candidate-manifest.json": {
      package: packageFacts,
      schemaVersion: 1,
      nodeVersion: "v" + CANONICAL_NODE,
      npmVersion: CI_RUNTIME.npm,
      tarball: {
        fileName: stem + ".tgz",
        sha256: sha(tarball),
        bytes: tarball.length,
      },
      sbom: {
        fileName: stem + ".cdx.json",
        sha256: sha(sbom),
        specVersion: "1.6",
        componentType: "library",
      },
      checksumFile: "SHA256SUMS",
      lockedAndLocklessGraphsEquivalent: true,
    },
    "locked-production-graph.json": packageFacts,
    "sbom-subject-production-graph.json": packageFacts,
    "lockless-consumer-production-graph.json": lockless,
    "lockless-consumer-package-lock.json": {
      lockfileVersion: 3,
      packages: { "node_modules/owlapi": { ...packageFacts, integrity } },
    },
    "transport-audit.json": audit,
    "npm-audit-full.json": verifiedAudit,
    "npm-audit-production.json": verifiedAudit,
    "normal-consumer-npm-audit-production.json": verifiedAudit,
    "inspection-consumer-production-graph.json": lockless,
  };
  const run = {
    id: 84,
    run_attempt: 1,
    head_sha: "a".repeat(40),
    repository: { id: 42 },
    head_repository: { id: 42 },
  };
  const job = {
    id: 87,
    name: "CI / retained candidate / Produce",
    run_id: 84,
    head_sha: run.head_sha,
    run_attempt: 1,
    runner_id: 86,
    labels: [UBUNTU.label],
    status: "completed",
    conclusion: "success",
    started_at: time,
    completed_at: "2026-11-12T11:00:03Z",
    steps: [
      step("Upload the exact same-run candidate"),
      step("Retain the producer's native audit and consumer inventories"),
    ],
  };
  const ref = (id, name, bytes) => ({
    id,
    name,
    size_in_bytes: bytes.length,
    workflow_run: {
      id: 84,
      repository_id: 42,
      head_repository_id: 42,
      head_sha: run.head_sha,
    },
    digest: "sha256:" + sha(bytes),
    created_at: time,
    expired: false,
    expires_at: expires,
  });
  const pack = (entries) =>
    zipArchive(
      Object.entries(entries).map(([path, content]) => ({
        path,
        content:
          typeof content === "string" || Buffer.isBuffer(content)
            ? content
            : JSON.stringify(content),
      })),
    );
  const admit = async (mutateProof = () => {}, options = {}) => {
    const candidateBytes = pack(files);
    const proofBytes = pack(evidence);
    const candidate = ref(90, stem + "-candidate-84-1", candidateBytes);
    const proof = ref(91, "package-proof-84-1", proofBytes);
    mutateProof(proof);
    return verifyReleaseCiPackage({
      source: {
        run,
        candidate,
        receipt: {
          packageProof: { id: 91, digest: "sha256:" + sha(proofBytes) },
          policySha256: QUALIFICATION_POLICY_SHA256,
        },
        observed: { jobs: [job] },
      },
      read: async (path) => {
        expect(path).toBe("/actions/artifacts/91");
        return proof;
      },
      download: async ({ id }) => (id === 90 ? candidateBytes : proofBytes),
      now: Date.parse(time),
      expectedProofVersion: 1,
      ...options,
    });
  };
  return { admit, evidence, files, integrity, job };
}

test("current CI admission refuses a correctly authenticated legacy proof", async () => {
  const f = fixture();
  f.job.steps[1].name = producerResolutionUploadStep;
  await expect(f.admit(undefined, { expectedProofVersion: 2 })).rejects.toThrow(
    /ZIP member count differs from its expected inventory/iu,
  );
});

test("native differences are admitted through the exact v2 producer ZIP while wrong edges are refused", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-v2-package-admit-"));
  expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
  try {
    const npmCli = process.env.npm_execpath;
    const decisionDirectory = join(root, "eligibility");
    mkdirSync(join(decisionDirectory, "decisions"), { recursive: true });
    const observations = {};
    let admittedTarball, platform;
    // The reader's test fixture has independently installed parents, a peer,
    // a hoisted transitive, and native omitted branches. All use the same archive.
    for (const [mode, name, version] of [
      ["producer", null, "26.6.10"],
      ["inspection", "owlapi", "26.6.10"],
      ["normal", "owlapi", "26.6.11"],
      ["scoped", PACKAGE_NAME, "26.6.12"],
    ]) {
      const directory = join(root, mode);
      mkdirSync(directory);
      const { tarball, first } = await installResolutionFixture(
        directory,
        npmCli,
        name ?? "owlapi",
        version,
      );
      admittedTarball ??= tarball;
      expect(tarball).toEqual(admittedTarball);
      const manifestPath = join(directory, "package.json");
      if (!name) {
        renameSync(
          join(directory, "node_modules", "owlapi"),
          join(directory, "unused-first-party"),
        );
        writeFileSync(manifestPath, JSON.stringify(first));
        const lockPath = join(directory, "package-lock.json");
        const lock = JSON.parse(readFileSync(lockPath));
        delete lock.packages["node_modules/owlapi"];
        lock.packages[""] = first;
        lock.name = first.name;
        lock.version = first.version;
        writeFileSync(lockPath, JSON.stringify(lock));
      } else if (mode === "normal") {
        const manifest = JSON.parse(readFileSync(manifestPath));
        manifest.allowScripts = productionInstallScriptPolicy();
        writeFileSync(manifestPath, stableJson(manifest));
      }
      const evidence = await captureResolutionEvidence(directory, {
        tarball,
        npmCli,
        dependencyName: name,
      });
      const resolution = evidence.resolution;
      platform ??= resolution.platform;
      const resolutionSha256 = sha(stableJson(resolution));
      const material = stableJson({
        status: "PASSED",
        subject: {
          resolutionSha256,
          lockSha256: resolution.lockSha256,
          tarballSha256: sha(tarball),
        },
        decisions: resolution.graph.nodes
          .filter((n) => n.location !== ".")
          .map((n) => ({ location: n.location, reasons: [] })),
      });
      const materialDirectory = join(
        decisionDirectory,
        "material",
        resolutionSha256,
      );
      mkdirSync(materialDirectory, { recursive: true });
      writeFileSync(
        join(materialDirectory, "recipient-material.json"),
        material,
      );
      const role = `candidate-${mode}`;
      const decision = stableJson({
        schemaVersion: 1,
        role,
        resolutionSha256,
        materialSha256: sha(material),
        result: "PASS",
        observedAt: time,
        subject: {
          manifestSha256: resolution.manifestSha256,
          lockSha256: resolution.lockSha256,
          tarballSha256: sha(tarball),
          graphSha256: sha(stableJson(resolution.graph)),
          role: name ? "candidate" : "producer",
          scope: "production",
          platform: { ...platform, npm: CI_RUNTIME.npm },
        },
      });
      writeFileSync(
        join(decisionDirectory, "decisions", `${sha(decision)}.json`),
        decision,
      );
      observations[mode] = {
        evidence,
        eligibility: {
          schemaVersion: 1,
          role,
          resolutionSha256,
          tarballSha256: sha(tarball),
          decisionSha256: sha(decision),
          result: "PASS",
        },
      };
    }
    const f = fixture();
    const component = (location, name, version) => ({
      "bom-ref": location,
      name,
      version,
      properties: [
        {
          name: "cdx:npm:package:path",
          value: location === "." ? "" : location,
        },
      ],
    });
    const declaredComponents = [
      ["host", "host", "1.0.0"],
      ["reader", "reader", "1.0.0"],
      ["alternative", "alternative", "2.0.0"],
      ["leaf", "leaf", "2.0.0"],
      ["node-types", "node-types", "26.6.10"],
      ["loose", "loose", "1.2.3"],
      ["older", "leaf", "1.0.0"],
      ["plugin", "plugin", "1.0.0"],
      ["prerelease", "prerelease", "1.2.3-beta.1"],
    ];
    const loc = (name) => `node_modules/${name}`;
    const sbom = stableJson({
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      metadata: {
        component: {
          ...component(".", PACKAGE_NAME, PACKAGE_VERSION),
          type: "library",
          purl: PACKAGE_SBOM_PURL,
        },
      },
      components: declaredComponents.map(([slot, name, version]) =>
        component(loc(slot), name, version),
      ),
      dependencies: [
        { ref: ".", dependsOn: [loc("host"), loc("reader")] },
        {
          ref: loc("reader"),
          dependsOn: [
            "host",
            "alternative",
            "node-types",
            "loose",
            "older",
            "plugin",
            "prerelease",
          ].map(loc),
        },
        { ref: loc("plugin"), dependsOn: [loc("leaf")] },
      ],
    });
    f.files[stem + ".tgz"] = admittedTarball;
    f.files[stem + ".cdx.json"] = sbom;
    f.files.SHA256SUMS = `${sha(sbom)}  ${stem}.cdx.json\n${sha(admittedTarball)}  ${stem}.tgz\n`;
    for (const key of Object.keys(f.evidence)) delete f.evidence[key];
    f.job.steps[1].name = producerResolutionUploadStep;
    const manifestFor = (packet) => ({
      schemaVersion: 2,
      package: packageFacts,
      nodeVersion: `v${platform.node}`,
      npmVersion: CI_RUNTIME.npm,
      tarball: {
        fileName: stem + ".tgz",
        sha256: sha(admittedTarball),
        bytes: admittedTarball.length,
      },
      sbom: {
        fileName: stem + ".cdx.json",
        sha256: sha(sbom),
        bytes: Buffer.byteLength(sbom),
        specVersion: "1.6",
        componentType: "library",
      },
      checksumFile: "SHA256SUMS",
      installedConsumerScripts: INSTALLED_TEST_SCRIPTS,
      fullGraphCheck: {
        result: "PASS",
        observedAt: new Date(time).toISOString(),
        subject: {
          ...JSON.parse(
            packet.originals[
              packet.subjects.producer.eligibility.decisionSha256
            ],
          ).subject,
          scope: "full",
          graphSha256: sha(
            stableJson(
              JSON.parse(packet.originals[packet.subjects.producer.lock])
                .packages,
            ),
          ),
        },
      },
      resolutionProof: {
        fileName: producerResolutionFilename,
        sha256: sha(stableJson(packet)),
      },
    });
    const packet = packProducerResolutions(observations, decisionDirectory);
    function retain(proof) {
      f.evidence[producerResolutionFilename] = stableJson(proof);
      f.evidence["candidate-manifest.json"] = manifestFor(proof);
    }
    retain(packet);
    const reopened = [];
    const admissionOptions = {
      expectedProofVersion: 2,
      expectedSourceLockSha256:
        observations.producer.evidence.resolution.lockSha256,
      npmCli,
      platform,
      // The native graph and ZIP readers stay real. The separate material owner
      // protocol has its own exact archive, signature and ScanCode fixtures.
      prepareMaterial: async () => ({
        verifyRetained: async ({
          recordBytes,
          recordSha256,
          resolution,
          lockfileBytes,
        }) => {
          const record = JSON.parse(recordBytes);
          expect(sha(lockfileBytes)).toBe(resolution.lockSha256);
          expect(record.subject.resolutionSha256).toBe(
            sha(stableJson(resolution)),
          );
          expect(sha(recordBytes)).toBe(recordSha256);
          reopened.push(resolution.lockSha256);
          return {
            record,
            verification: "AUTHENTICATED_COLLECTOR_METADATA",
            novelArtifactIds: [],
          };
        },
      }),
    };
    const result = await f.admit(undefined, admissionOptions);
    expect(reopened).toHaveLength(4);
    expect(result).toMatchObject({
      packageProofVersion: 2,
      advisorySubjects: {
        root: { role: "producer" },
        recipient: { role: "candidate" },
      },
    });
    for (const [role, version] of [
      ["normal", "26.6.11"],
      ["scoped", "26.6.12"],
    ]) {
      const [change] = result.differences[role].occurrences;
      expect(change).toMatchObject({
        before: { name: "node-types", version: "26.6.10" },
        after: { name: "node-types", version },
        requestedBy: { after: [{ from: loc("reader"), spec: "*" }] },
      });
    }
    f.evidence["candidate-manifest.json"].fullGraphCheck.subject.graphSha256 =
      "0".repeat(64);
    await expect(f.admit(undefined, admissionOptions)).rejects.toThrow(
      /full producer graph preflight does not cover/iu,
    );
    const substituted = structuredClone(packet);
    const subject = substituted.subjects.producer;
    function substituteOriginal(oldDigest, value) {
      const text = stableJson(value);
      const next = sha(text);
      substituted.originals[next] = text;
      delete substituted.originals[oldDigest];
      return next;
    }
    const unrelatedDev = JSON.parse(substituted.originals[subject.lock]);
    unrelatedDev.packages["node_modules/dev-audit-only"] = {
      ...unrelatedDev.packages["node_modules/node-types"],
      name: "node-types",
      dev: true,
    };
    subject.lock = substituteOriginal(subject.lock, unrelatedDev);
    const changedResolution = JSON.parse(
      substituted.originals[subject.resolution],
    );
    changedResolution.lockSha256 = subject.lock;
    subject.resolution = substituteOriginal(
      subject.resolution,
      changedResolution,
    );
    const changedDecision = JSON.parse(
      substituted.originals[subject.eligibility.decisionSha256],
    );
    changedDecision.resolutionSha256 = subject.eligibility.resolutionSha256 =
      subject.resolution;
    changedDecision.subject.lockSha256 = subject.lock;
    const changedMaterial = JSON.parse(
      substituted.originals[changedDecision.materialSha256],
    );
    changedMaterial.subject.lockSha256 = subject.lock;
    changedMaterial.subject.resolutionSha256 = subject.resolution;
    changedDecision.materialSha256 = substituteOriginal(
      changedDecision.materialSha256,
      changedMaterial,
    );
    subject.eligibility.decisionSha256 = substituteOriginal(
      subject.eligibility.decisionSha256,
      changedDecision,
    );
    await expect(
      verifyResolutionEvidence(
        {
          ...observations.producer.evidence,
          lock: substituted.originals[subject.lock],
          resolution: changedResolution,
        },
        {
          tarball: admittedTarball,
          npmCli,
          dependencyName: null,
          observedNpm: CI_RUNTIME.npm,
          platform,
        },
      ),
    ).resolves.toMatchObject({
      graph: observations.producer.evidence.resolution.graph,
    });
    retain(substituted);
    await expect(f.admit(undefined, admissionOptions)).rejects.toThrow(
      /producer lock differs from the authenticated source lock/iu,
    );
    const altered = structuredClone(packet);
    const previous = altered.subjects.producer.resolution;
    const forged = JSON.parse(altered.originals[previous]);
    forged.graph.edges.find(
      ({ from, name }) => from === "." && name === "reader",
    ).to = loc("host");
    const bytes = stableJson(forged);
    altered.subjects.producer.resolution = sha(bytes);
    altered.originals[sha(bytes)] = bytes;
    delete altered.originals[previous];
    retain(altered);
    await expect(
      f.admit(undefined, { expectedProofVersion: 2, npmCli, platform }),
    ).rejects.toThrow(/recorded graph differs from replayed native edges/iu);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a qualifying ZIP must match the native ZIP digest before extraction", async () => {
  const bytes = zipArchive([{ path: "verification.json", content: "{}" }]);
  await expect(
    readQualifiedZip(
      async () => bytes,
      {
        id: 1,
        size_in_bytes: bytes.length,
        digest: "sha256:" + "0".repeat(64),
      },
      64 * 1024,
      ["verification.json"],
    ),
  ).rejects.toThrow(/ZIP digest differs/u);
});

test("a small deflated receipt cannot expand past the receipt limit", async () => {
  const bytes = zipArchive([
    {
      path: "verification.json",
      content: "x".repeat(65537),
      compression: "deflated",
    },
  ]);
  await expect(
    readQualifiedZip(
      async () => bytes,
      { id: 1, size_in_bytes: bytes.length, digest: "sha256:" + sha(bytes) },
      64 * 1024,
      ["verification.json"],
    ),
  ).rejects.toThrow(/uncompressed-size/u);
});

test("links the original pair of uploads and validates the actual three-member candidate", async () => {
  const f = fixture();
  expect(await f.admit()).toMatchObject({
    candidate: { id: 90 },
    proof: { id: 91 },
    producerJob: 87,
    attempt: 1,
    integrity: f.integrity,
    package: packageFacts,
    assets: { checksums: { sha256: sha(f.files.SHA256SUMS) } },
  });
});

// Reduced from the November 26 retained observations. This is a synthetic ZIP with the
// original two parent paths, not an authenticated historical release or new qualification.
test("the legacy producer proof still rejects the reported Node-types drift", async () => {
  const f = fixture();
  const graph = (version) => ({
    ...packageFacts,
    dependencies: {
      "rdfxml-streaming-parser": {
        version: "3.3.0",
        dependencies: {
          "@types/readable-stream": {
            version: "4.0.25",
            dependencies: { "@types/node": { version } },
          },
          "rdf-data-factory": {
            version: "2.1.0",
            dependencies: {
              "@rdfjs/types": {
                version: "2.0.1",
                dependencies: { "@types/node": { version } },
              },
            },
          },
        },
      },
    },
  });
  const locked = graph("26.6.10");
  f.evidence["locked-production-graph.json"] = locked;
  f.evidence["sbom-subject-production-graph.json"] = locked;
  f.evidence["lockless-consumer-production-graph.json"].dependencies.owlapi =
    locked;
  const sbomName = stem + ".cdx.json";
  const sbom = JSON.parse(f.files[sbomName]);
  sbom.components = [
    { name: "rdfxml-streaming-parser", version: "3.3.0" },
    { name: "rdf-data-factory", version: "2.1.0" },
    { group: "@rdfjs", name: "types", version: "2.0.1" },
    { group: "@types", name: "readable-stream", version: "4.0.25" },
    { group: "@types", name: "node", version: "26.6.10" },
  ];
  f.files[sbomName] = JSON.stringify(sbom);
  Object.assign(f.evidence["candidate-manifest.json"].sbom, {
    sha256: sha(f.files[sbomName]),
    bytes: Buffer.byteLength(f.files[sbomName]),
  });
  f.files.SHA256SUMS =
    sha(f.files[sbomName]) +
    "  " +
    sbomName +
    "\n" +
    sha(f.files[stem + ".tgz"]) +
    "  " +
    stem +
    ".tgz\n";
  expect((await f.admit()).package).toEqual(packageFacts);
  f.evidence["lockless-consumer-production-graph.json"].dependencies.owlapi =
    graph("26.6.11");
  await expect(f.admit()).rejects.toThrow(/Lockless consumer graph differs/);
});

test("a successful producer job cannot cover a consumer tree with native npm problems", async () => {
  const f = fixture();
  f.evidence["lockless-consumer-production-graph.json"].problems = [
    "extraneous: undeclared dependency",
  ];
  await expect(f.admit()).rejects.toThrow(/npm.*problem/i);
});

test("a later artifact with the expected logical name cannot impersonate the original proof", async () => {
  await expect(
    fixture().admit((proof) => {
      proof.created_at = "2026-11-12T11:01:00Z";
    }),
  ).rejects.toThrow(/original successful upload/u);
});

test("the consumer lock must describe these exact bytes even when every ZIP digest agrees", async () => {
  const f = fixture();
  f.evidence["lockless-consumer-package-lock.json"].packages[
    "node_modules/owlapi"
  ].integrity = "sha512-another-tarball";
  await expect(f.admit()).rejects.toThrow(/different tarball bytes/u);
});
