import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { computeCorpusRoot, retainBlob } from "./blob-store.mjs";
import { sha256, stableJson } from "./digests.mjs";
import {
  EvidenceVerificationError,
  createEvidenceManifest,
  verifyEvidenceManifest,
} from "./evidence-manifest.mjs";
import { normalizeLockedRegistryGraph } from "./lock-graph.mjs";
import {
  npmRegistryKeyId,
  registrySignaturePayload,
} from "./registry-signatures.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

const sri = (value) =>
  `sha512-${createHash("sha512").update(value).digest("base64")}`;

const makeLockfile = ({ bundled = false } = {}) => {
  const packages = {
    "": { name: "fixture", version: "1.0.0" },
  };
  for (const name of ["alpha", "beta"]) {
    packages[`node_modules/${name}`] = {
      version: "1.0.0",
      resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
      integrity: sri(`${name}-tarball`),
      license: "MIT",
      dev: name === "beta",
    };
  }
  if (bundled) {
    packages["node_modules/beta"].bundleDependencies = ["@scope/child"];
    packages["node_modules/beta/node_modules/@scope/child"] = {
      version: "2.0.0",
      inBundle: true,
      dev: true,
      license: "ISC",
    };
  }
  return Buffer.from(`${JSON.stringify({ lockfileVersion: 3, packages })}\n`);
};

const makeRegistryKey = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const npmKeyId = npmRegistryKeyId(publicDer);
  return {
    privateKey,
    key: {
      keyid: npmKeyId,
      keytype: "ecdsa-sha2-nistp256",
      scheme: "ecdsa-sha2-nistp256",
      key: publicDer.toString("base64"),
      expires: null,
    },
  };
};

const retainEvidence = async (root, kind, artifactId, evidence) => ({
  ...(await retainBlob(
    root,
    stableJson({ schemaVersion: 1, kind, artifactId, evidence }),
  )),
  kind,
});

const makeFixture = async ({ bundled = false } = {}) => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "owlapi-evidence-"));
  temporaryRoots.push(repositoryRoot);
  const blobRoot = join(repositoryRoot, "evidence");
  const lockfileBytes = makeLockfile({ bundled });
  const graph = normalizeLockedRegistryGraph(lockfileBytes);
  const { privateKey, key } = makeRegistryKey();
  const blobs = [];
  const artifacts = [];

  for (const [index, identity] of graph.artifacts.entries()) {
    const publishedAt = "2024-01-01T00:00:00.000Z";
    const tarballBytes = Buffer.from(`${identity.name}-tarball`);
    const tarball = {
      sha256: sha256(tarballBytes),
      bytes: tarballBytes.length,
    };
    const signature = {
      keyid: key.keyid,
      sig: sign(
        "sha256",
        Buffer.from(
          registrySignaturePayload(
            identity.name,
            identity.version,
            identity.integrity,
          ),
        ),
        privateKey,
      ).toString("base64"),
    };
    const legalEvidence =
      index === 0
        ? {
            ...(await retainBlob(
              blobRoot,
              Buffer.from("Permission is hereby granted...\n"),
            )),
            kind: "PACKAGE_EVIDENCE_FILE",
          }
        : null;
    const packageMetadata = {
      name: identity.name,
      version: identity.version,
    };
    const bundledPackages = [];
    if (bundled && identity.name === "beta") {
      packageMetadata.bundleDependencies = ["@scope/child"];
      const metadata = {
        name: "@scope/child",
        version: "2.0.0",
        license: "ISC",
      };
      const bytes = Buffer.from(JSON.stringify(metadata));
      const blob = {
        ...(await retainBlob(blobRoot, bytes)),
        kind: "PACKAGE_EVIDENCE_FILE",
      };
      blobs.push(blob);
      bundledPackages.push({
        path: "package/node_modules/@scope/child/package.json",
        size: bytes.length,
        sha256: sha256(bytes),
        packageMetadata: metadata,
        blob,
      });
    }
    const bundledEntries = bundledPackages.map(
      ({ path, size, sha256: digest }) => ({
        path,
        type: "FILE",
        size,
        sha256: digest,
      }),
    );
    const packageMetadataBytes = Buffer.from(
      `${JSON.stringify(packageMetadata)}\n`,
    );
    const packageEntry = {
      path: "package/package.json",
      type: "FILE",
      size: packageMetadataBytes.length,
      sha256: sha256(packageMetadataBytes),
    };
    const archive = await retainEvidence(
      blobRoot,
      "ARCHIVE_INVENTORY",
      identity.artifactId,
      {
        archiveRoot: "package",
        compressedBytes: tarball.bytes,
        duplicateEntries: [],
        packageIdentity: {
          name: identity.name,
          version: identity.version,
        },
        packageMetadata,
        tarball,
        entries: [
          packageEntry,
          ...(legalEvidence
            ? [
                {
                  path: "package/LICENSE",
                  type: "FILE",
                  size: legalEvidence.bytes,
                  sha256: legalEvidence.sha256,
                },
              ]
            : []),
          ...bundledEntries,
        ],
        evidenceFiles: legalEvidence
          ? [
              {
                path: "package/LICENSE",
                kind: "LICENCE",
                size: legalEvidence.bytes,
                sha256: legalEvidence.sha256,
                blob: legalEvidence,
              },
            ]
          : [],
        expandedBytes:
          packageEntry.size +
          (legalEvidence ? legalEvidence.bytes : 0) +
          bundledPackages.reduce((total, member) => total + member.size, 0),
        physicalEntryCount: (legalEvidence ? 2 : 1) + bundledPackages.length,
        ...(bundledPackages.length ? { bundledPackages } : {}),
      },
    );
    const signatureEvidence = await retainEvidence(
      blobRoot,
      "REGISTRY_SIGNATURE",
      identity.artifactId,
      { signatures: [signature], keyids: [key.keyid], publishedAt },
    );
    const provenanceState = index === 0 ? "VERIFIED" : "NOT_PUBLISHED";
    const provenance = await retainEvidence(
      blobRoot,
      "NPM_PROVENANCE",
      identity.artifactId,
      {
        state: provenanceState,
        attestations:
          provenanceState === "VERIFIED" ? [{ predicateType: "test" }] : [],
      },
    );
    const scan = await retainEvidence(
      blobRoot,
      "SCANCODE_FINDINGS",
      identity.artifactId,
      {
        scanner: {
          name: "scancode-toolkit",
          version: "32.5.0",
          outputFormatVersion: "4.1.0",
          normalizationVersion: 1,
        },
        files: [],
      },
    );
    if (legalEvidence) {
      blobs.push(legalEvidence);
    }
    blobs.push(archive, signatureEvidence, provenance, scan);
    artifacts.push({
      artifactId: identity.artifactId,
      tarball,
      archive: { state: "VERIFIED", evidence: archive },
      registrySignature: {
        state: "VERIFIED",
        publishedAt,
        signatures: [signature],
        evidence: signatureEvidence,
      },
      provenance: { state: provenanceState, evidence: provenance },
      scan: { state: "VERIFIED", evidence: scan },
    });
  }

  const manifest = createEvidenceManifest({
    graph,
    policy: {
      registryOrigin: "https://registry.npmjs.org",
      provenance: "VERIFY_WHEN_PUBLISHED",
      scanner: {
        name: "scancode-toolkit",
        version: "32.5.0",
        pythonVersion: "3.14",
        outputFormatVersion: "4.1.0",
        normalizationVersion: 1,
        semanticOptions: [
          "--copyright",
          "--generated",
          "--info",
          "--license",
          "--license-references",
          "--license-text",
          "--package",
          "--unknown-licenses",
        ],
        preScanExcludedFileSuffixes: [".node"],
        executionOptions: ["--processes", "1"],
      },
    },
    registryKeys: [key],
    artifacts,
    blobs,
  });
  return { repositoryRoot, blobRoot, lockfileBytes, manifest };
};

const expectClassifiedFailure = async (promise, classification) => {
  await expect(promise).rejects.toMatchObject({
    name: "EvidenceVerificationError",
    classification,
  });
};

describe("npm package evidence manifest", () => {
  it.each([0, -1, 601, 1.5, null, "600"])(
    "rejects invalid recorded scan resource observation %s",
    async (perFileTimeoutSeconds) => {
      const fixture = await makeFixture();
      fixture.manifest.artifacts[0].scan.execution = { perFileTimeoutSeconds };
      await expect(verifyEvidenceManifest(fixture)).rejects.toMatchObject({
        code: "SCANCODE_EXECUTION_OBSERVATION_INVALID",
      });
    },
  );
  it("verifies bundled original manifest blobs and schema while retaining one owning registry artifact", async () => {
    const fixture = await makeFixture({ bundled: true });
    await expect(verifyEvidenceManifest(fixture)).resolves.toMatchObject({
      occurrenceCount: 3,
      artifactCount: 2,
    });
    const schema = JSON.parse(
      await readFile(
        new URL(
          "../../docs/provenance/npm-package-evidence.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(fixture.manifest)).toBe(true);
    const bundled = fixture.manifest.occurrences.find((entry) => entry.bundled);
    bundled.bundled.packageJsonPath = "../outside/package.json";
    expect(validate(fixture.manifest)).toBe(false);
  });

  it.each([
    [
      "lock identity mismatch",
      (archive) => {
        archive.bundledPackages[0].packageMetadata.version = "9.0.0";
      },
    ],
    [
      "missing physical manifest",
      (archive) => {
        archive.entries = archive.entries.filter(
          ({ path }) => !path.includes("node_modules"),
        );
      },
    ],
    [
      "missing original blob",
      (archive) => {
        archive.bundledPackages[0].blob.sha256 = "0".repeat(64);
      },
    ],
    [
      "false bundle declaration",
      (archive) => {
        delete archive.packageMetadata.bundleDependencies;
      },
    ],
    [
      "omitted bundle metadata",
      (archive) => {
        delete archive.bundledPackages;
      },
    ],
  ])("refuses %s under offline bundle admission", async (_name, mutate) => {
    const fixture = await makeFixture({ bundled: true });
    const artifact = fixture.manifest.artifacts.find(
      ({ name }) => name === "beta",
    );
    const previous = artifact.archive.evidence;
    const envelope = JSON.parse(
      await readFile(join(fixture.blobRoot, previous.path), "utf8"),
    );
    mutate(envelope.evidence);
    const reference = await retainEvidence(
      fixture.blobRoot,
      "ARCHIVE_INVENTORY",
      artifact.artifactId,
      envelope.evidence,
    );
    artifact.archive.evidence = reference;
    fixture.manifest = createEvidenceManifest({
      graph: normalizeLockedRegistryGraph(fixture.lockfileBytes),
      policy: fixture.manifest.policy,
      registryKeys: fixture.manifest.registryKeys,
      artifacts: fixture.manifest.artifacts,
      blobs: [
        ...fixture.manifest.blobs.filter(({ path }) => path !== previous.path),
        reference,
      ],
    });
    await expect(verifyEvidenceManifest(fixture)).rejects.toMatchObject({
      classification: "CONTROL_FAILURE",
    });
  });

  it("creates a closed schema-valid two-artifact corpus and verifies it offline", async () => {
    const fixture = await makeFixture();
    const schema = JSON.parse(
      await readFile(
        new URL(
          "../../docs/provenance/npm-package-evidence.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate(fixture.manifest)).toBe(true);
    expect(validate.errors).toBeNull();
    await expect(verifyEvidenceManifest(fixture)).resolves.toMatchObject({
      occurrenceCount: 2,
      artifactCount: 2,
      blobCount: 9,
      registrySignatureVerifiedCount: 2,
      provenanceVerifiedCount: 1,
      provenanceNotPublishedCount: 1,
      archiveVerifiedCount: 2,
      scanVerifiedCount: 2,
    });
  });

  it.each([
    [
      "lockfile binding",
      ({ lockfileBytes }) => Buffer.concat([lockfileBytes, Buffer.from(" ")]),
      "CONTROL_FAILURE",
    ],
    [
      "corpus root",
      ({ manifest }) => {
        manifest.corpusRoot = "0".repeat(64);
      },
      "CONTROL_FAILURE",
    ],
    [
      "blob closure",
      ({ manifest }) => {
        manifest.blobs.pop();
      },
      "CONTROL_FAILURE",
    ],
    [
      "registry signature",
      ({ manifest }) => {
        manifest.artifacts[0].registrySignature.signatures[0].sig = Buffer.from(
          "not a valid signature",
        ).toString("base64");
      },
      "CONTROL_FAILURE",
    ],
    [
      "archive completion",
      ({ manifest }) => {
        manifest.artifacts[0].archive.state = "FAILED";
      },
      "PRODUCT_FAILURE",
    ],
    [
      "scan completion",
      ({ manifest }) => {
        manifest.artifacts[0].scan.state = "FAILED";
      },
      "PRODUCT_FAILURE",
    ],
    [
      "present-invalid provenance",
      ({ manifest }) => {
        manifest.artifacts[0].provenance.state = "INVALID";
      },
      "PRODUCT_FAILURE",
    ],
  ])("classifies a mutated %s", async (_label, mutate, classification) => {
    const fixture = await makeFixture();
    const mutable = {
      ...fixture,
      manifest: structuredClone(fixture.manifest),
    };
    const result = mutate(mutable);
    if (Buffer.isBuffer(result)) {
      mutable.lockfileBytes = result;
    }
    await expectClassifiedFailure(
      verifyEvidenceManifest(mutable),
      classification,
    );
  });

  it("fails when a retained blob is modified after acquisition", async () => {
    const fixture = await makeFixture();
    const reference = fixture.manifest.blobs[0];
    await writeFile(join(fixture.blobRoot, reference.path), "corrupt");

    await expectClassifiedFailure(
      verifyEvidenceManifest(fixture),
      "CONTROL_FAILURE",
    );
  });

  it("classifies a self-consistent but cryptographically invalid signature as a product failure", async () => {
    const fixture = await makeFixture();
    const manifest = structuredClone(fixture.manifest);
    const artifact = manifest.artifacts[0];
    const previous = artifact.registrySignature.evidence;
    artifact.registrySignature.signatures[0].sig = Buffer.from(
      "not a valid signature",
    ).toString("base64");
    const replacement = await retainEvidence(
      fixture.blobRoot,
      "REGISTRY_SIGNATURE",
      artifact.artifactId,
      {
        signatures: artifact.registrySignature.signatures,
        keyids: artifact.registrySignature.signatures.map(({ keyid }) => keyid),
        publishedAt: artifact.registrySignature.publishedAt,
      },
    );
    artifact.registrySignature.evidence = replacement;
    manifest.blobs = manifest.blobs.map((reference) =>
      reference.kind === previous.kind && reference.sha256 === previous.sha256
        ? replacement
        : reference,
    );
    manifest.summary.retainedBytes = manifest.blobs.reduce(
      (total, reference) => total + reference.bytes,
      0,
    );
    manifest.corpusRoot = computeCorpusRoot(manifest.blobs);

    await expectClassifiedFailure(
      verifyEvidenceManifest({ ...fixture, manifest }),
      "PRODUCT_FAILURE",
    );
  });

  it("rejects a digest-consistent archive root that does not own the inventory paths", async () => {
    const fixture = await makeFixture();
    const manifest = structuredClone(fixture.manifest);
    const artifact = manifest.artifacts[0];
    const previous = artifact.archive.evidence;
    const envelope = JSON.parse(
      await readFile(join(fixture.blobRoot, previous.path), "utf8"),
    );
    envelope.evidence.archiveRoot = "other";
    const replacement = {
      ...(await retainBlob(fixture.blobRoot, stableJson(envelope))),
      kind: "ARCHIVE_INVENTORY",
    };
    artifact.archive.evidence = replacement;
    manifest.blobs = manifest.blobs.map((reference) =>
      reference.kind === previous.kind && reference.sha256 === previous.sha256
        ? replacement
        : reference,
    );
    manifest.summary.retainedBytes = manifest.blobs.reduce(
      (total, reference) => total + reference.bytes,
      0,
    );
    manifest.corpusRoot = computeCorpusRoot(manifest.blobs);

    await expectClassifiedFailure(
      verifyEvidenceManifest({ ...fixture, manifest }),
      "CONTROL_FAILURE",
    );
  });

  it("rejects a digest-consistent archive inventory that omits physical occurrences", async () => {
    const fixture = await makeFixture();
    const manifest = structuredClone(fixture.manifest);
    const artifact = manifest.artifacts[0];
    const previous = artifact.archive.evidence;
    const envelope = JSON.parse(
      await readFile(join(fixture.blobRoot, previous.path), "utf8"),
    );
    delete envelope.evidence.physicalEntryCount;
    const replacement = {
      ...(await retainBlob(fixture.blobRoot, stableJson(envelope))),
      kind: "ARCHIVE_INVENTORY",
    };
    artifact.archive.evidence = replacement;
    manifest.blobs = manifest.blobs.map((reference) =>
      reference.kind === previous.kind && reference.sha256 === previous.sha256
        ? replacement
        : reference,
    );
    manifest.summary.retainedBytes = manifest.blobs.reduce(
      (total, reference) => total + reference.bytes,
      0,
    );
    manifest.corpusRoot = computeCorpusRoot(manifest.blobs);

    await expectClassifiedFailure(
      verifyEvidenceManifest({ ...fixture, manifest }),
      "CONTROL_FAILURE",
    );
  });

  it("exposes a stable typed failure rather than an unclassified exception", () => {
    const error = new EvidenceVerificationError(
      "PRODUCT_FAILURE",
      "SIGNATURE_INVALID",
      "example",
    );
    expect(error).toMatchObject({
      name: "EvidenceVerificationError",
      classification: "PRODUCT_FAILURE",
      code: "SIGNATURE_INVALID",
      message: "example",
    });
  });
});
