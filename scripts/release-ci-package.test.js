import { expect, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
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
  const admit = async (mutateProof = () => {}) => {
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
        },
        observed: { jobs: [job] },
      },
      read: async (path) => {
        expect(path).toBe("/actions/artifacts/91");
        return proof;
      },
      download: async ({ id }) => (id === 90 ? candidateBytes : proofBytes),
      now: Date.parse(time),
    });
  };
  return { admit, evidence, files, integrity, job };
}

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
