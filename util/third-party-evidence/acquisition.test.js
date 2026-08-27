import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { once } from "node:events";
import { gzipSync } from "node:zlib";

import {
  AcquisitionError,
  acquireEvidence,
  fetchJsonWithRetry,
  parseAcquisitionArguments,
} from "../acquire-npm-package-evidence.mjs";
import {
  mergeEvidenceShardDirectories,
  parseMergeArguments,
} from "../merge-npm-package-evidence.mjs";
import {
  parseParityArguments,
  verifyEvidenceAggregateParity,
} from "../verify-npm-package-evidence-parity.mjs";
import {
  verifyEvidenceManifest,
  verifyEvidenceShard,
} from "./evidence-manifest.mjs";
import { computeCorpusRoot, retainBlob } from "./blob-store.mjs";
import { stableJson } from "./digests.mjs";
import {
  npmRegistryKeyId,
  registrySignaturePayload,
} from "./registry-signatures.mjs";

const BLOCK_BYTES = 512;
const temporaryRoots = [];
const servers = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise((resolveClose, rejectClose) =>
            server.close((error) =>
              error ? rejectClose(error) : resolveClose(),
            ),
          ),
      ),
  );
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

const writeString = (buffer, offset, length, value) => {
  Buffer.from(value).copy(buffer, offset, 0, length);
};

const writeOctal = (buffer, offset, length, value) => {
  writeString(
    buffer,
    offset,
    length,
    `${value.toString(8).padStart(length - 1, "0")}\0`,
  );
};

const makeTarball = (entries) => {
  const chunks = [];
  for (const { path, body } of entries) {
    const bytes = Buffer.from(body);
    const header = Buffer.alloc(BLOCK_BYTES);
    writeString(header, 0, 100, path);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, bytes.length);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = "0".charCodeAt(0);
    writeString(header, 257, 6, "ustar\0");
    writeString(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
    chunks.push(header, bytes);
    const padding = (BLOCK_BYTES - (bytes.length % BLOCK_BYTES)) % BLOCK_BYTES;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
    }
  }
  chunks.push(Buffer.alloc(BLOCK_BYTES * 2));
  return gzipSync(Buffer.concat(chunks), { mtime: 0 });
};

const integrity = (bytes) =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

const makeRegistryFixture = ({
  archiveRoot = "package",
  additionalEntries = [],
} = {}) => {
  const tarball = makeTarball([
    {
      path: `${archiveRoot}/package.json`,
      body: `${JSON.stringify({
        name: "alpha",
        version: "1.0.0",
        license: "MIT",
      })}\n`,
    },
    { path: `${archiveRoot}/LICENSE`, body: "MIT licence fixture\n" },
    { path: `${archiveRoot}/index.js`, body: "export default 1;\n" },
    ...additionalEntries,
  ]);
  const lockedIntegrity = integrity(tarball);
  const resolved = "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz";
  const publishedAt = "2024-01-01T00:00:00.000Z";
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const keyid = npmRegistryKeyId(publicDer);
  const signature = {
    keyid,
    sig: sign(
      "sha256",
      Buffer.from(registrySignaturePayload("alpha", "1.0.0", lockedIntegrity)),
      privateKey,
    ).toString("base64"),
  };
  const key = {
    expires: null,
    keyid,
    keytype: "ecdsa-sha2-nistp256",
    scheme: "ecdsa-sha2-nistp256",
    key: publicDer.toString("base64"),
  };
  const versionManifest = {
    name: "alpha",
    version: "1.0.0",
    license: "MIT",
    dist: {
      tarball: resolved,
      integrity: lockedIntegrity,
      signatures: [signature],
    },
  };
  const packument = {
    name: "alpha",
    versions: { "1.0.0": versionManifest },
    time: { "1.0.0": publishedAt },
  };
  const lockfileBytes = Buffer.from(
    `${JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "fixture", version: "1.0.0" },
        "node_modules/alpha": {
          version: "1.0.0",
          resolved,
          integrity: lockedIntegrity,
          license: "MIT",
        },
      },
    })}\n`,
  );
  return {
    tarball,
    lockedIntegrity,
    resolved,
    publishedAt,
    signature,
    key,
    packument,
    versionManifest,
    lockfileBytes,
  };
};

const startRegistryServer = async (fixture, overrides = {}) => {
  const attempts = new Map();
  const server = createServer((request, response) => {
    const count = (attempts.get(request.url) || 0) + 1;
    attempts.set(request.url, count);
    if (overrides.handle?.({ request, response, count })) {
      return;
    }
    if (request.url === "/-/npm/v1/keys") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [fixture.key] }));
      return;
    }
    if (request.url === "/alpha") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(fixture.packument));
      return;
    }
    if (request.url === "/alpha/-/alpha-1.0.0.tgz") {
      response.setHeader("content-type", "application/octet-stream");
      response.end(overrides.tarball || fixture.tarball);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  servers.push(server);
  const address = server.address();
  return {
    attempts,
    origin: `http://127.0.0.1:${address.port}`,
  };
};

const mappedFetch = (origin) => async (input, init) => {
  const requested = new URL(input);
  return fetch(
    new URL(`${requested.pathname}${requested.search}`, origin),
    init,
  );
};

const fixtureDownload = async ({ identity, destination, fetchImpl }) => {
  const response = await fetchImpl(identity.resolved, { redirect: "error" });
  if (!response.ok) {
    throw new Error(`tarball response ${response.status}`);
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return { resolved: identity.resolved, integrity: identity.integrity };
};

const fixtureMetadataVerification = async ({ identity, versionManifest }) => ({
  _resolved: identity.resolved,
  _integrity: identity.integrity,
  _signatures: versionManifest.dist.signatures,
  _attestationBundles: [],
});

const fixtureScan = async ({ artifactId, inputRoot, inventory }) => ({
  headers: [
    {
      tool_name: "scancode-toolkit",
      tool_version: "32.5.0",
      output_format_version: "4.1.0",
      options: {
        input: [inputRoot],
        "--license": true,
        "--copyright": true,
        "--package": true,
        "--info": true,
        "--generated": true,
        "--unknown-licenses": true,
        "--license-text": true,
        "--license-references": true,
        "--processes": 1,
      },
      errors: [],
      warnings: [],
      message: artifactId,
    },
  ],
  packages: [],
  dependencies: [],
  license_detections: [],
  // Real ScanCode 4.1 reports the scanned root and materialized directories even
  // when the authenticated tar header did not contain those directory entries.
  files: [
    {
      path: basename(inputRoot),
      type: "directory",
      name: basename(inputRoot),
      size: 0,
      scan_errors: [],
    },
    ...inventory.entries.map((entry) => ({
      path: `${basename(inputRoot)}/${entry.path}`,
      type: entry.type === "FILE" ? "file" : "directory",
      name: entry.path.split("/").at(-1),
      size: entry.size,
      sha256: entry.sha256,
      scan_errors: [],
    })),
  ],
});

const fixtureScanWithout =
  (...archivePaths) =>
  async (options) => {
    const report = await fixtureScan(options);
    const omittedPaths = new Set(
      archivePaths.map(
        (archivePath) => `${basename(options.inputRoot)}/${archivePath}`,
      ),
    );
    report.files = report.files.filter(({ path }) => !omittedPaths.has(path));
    return report;
  };

const fixtureScanWithoutDigest =
  (...archivePaths) =>
  async (options) => {
    const report = await fixtureScan(options);
    const selectedPaths = new Set(
      archivePaths.map(
        (archivePath) => `${basename(options.inputRoot)}/${archivePath}`,
      ),
    );
    for (const file of report.files) {
      if (selectedPaths.has(file.path)) {
        delete file.sha256;
      }
    }
    return report;
  };

describe("acquireEvidence", () => {
  it("acquires, authenticates, scans and writes a platform-neutral fixture corpus", async () => {
    const fixture = makeRegistryFixture({ archiveRoot: "alpha" });
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-acquire-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );

    const result = await acquireEvidence({
      repositoryRoot,
      fetchImpl: mappedFetch(registry.origin),
      downloadTarball: fixtureDownload,
      verifyPackageMetadata: fixtureMetadataVerification,
      scanArtifact: fixtureScan,
      write: true,
      sleep: async () => {},
    });

    expect(result.manifest).toMatchObject({
      package: { name: "fixture", version: "1.0.0" },
      summary: {
        occurrenceCount: 1,
        artifactCount: 1,
        registrySignatureVerifiedCount: 1,
        provenanceNotPublishedCount: 1,
        archiveVerifiedCount: 1,
        scanVerifiedCount: 1,
      },
    });
    const artifact = result.manifest.artifacts[0];
    expect(artifact).toMatchObject({
      name: "alpha",
      version: "1.0.0",
      resolved: fixture.resolved,
      integrity: fixture.lockedIntegrity,
      registrySignature: { publishedAt: fixture.publishedAt },
    });
    await expect(
      verifyEvidenceManifest({
        manifest: result.manifest,
        lockfileBytes: fixture.lockfileBytes,
        blobRoot: join(repositoryRoot, "docs", "provenance", "evidence", "npm"),
      }),
    ).resolves.toMatchObject({ artifactCount: 1 });
    const retainedLicence = result.manifest.blobs.find(
      ({ kind }) => kind === "PACKAGE_EVIDENCE_FILE",
    );
    const retainedArchive = result.manifest.blobs.find(
      ({ kind }) => kind === "ARCHIVE_INVENTORY",
    );
    const archiveEnvelope = JSON.parse(
      await readFile(
        join(
          repositoryRoot,
          "docs",
          "provenance",
          "evidence",
          "npm",
          retainedArchive.path,
        ),
        "utf8",
      ),
    );
    expect(archiveEnvelope.evidence.archiveRoot).toBe("alpha");
    expect(archiveEnvelope.evidence.physicalEntryCount).toBe(3);
    expect(archiveEnvelope.evidence.duplicateEntries).toEqual([]);
    await expect(
      readFile(
        join(
          repositoryRoot,
          "docs",
          "provenance",
          "evidence",
          "npm",
          retainedLicence.path,
        ),
        "utf8",
      ),
    ).resolves.toBe("MIT licence fixture\n");
    await expect(readdir(join(repositoryRoot, ".release"))).resolves.toEqual(
      [],
    );
  });

  it("uses one supplied, validated registry-key snapshot without refetching keys", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-registry-key-snapshot-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );

    const result = await acquireEvidence({
      repositoryRoot,
      fetchImpl: mappedFetch(registry.origin),
      registryKeySnapshot: {
        schemaVersion: 1,
        registryOrigin: "https://registry.npmjs.org",
        keys: [fixture.key],
      },
      downloadTarball: fixtureDownload,
      verifyPackageMetadata: fixtureMetadataVerification,
      scanArtifact: fixtureScan,
      sleep: async () => {},
      write: true,
    });

    expect(result.manifest.registryKeys).toEqual([fixture.key]);
    expect(registry.attempts.has("/-/npm/v1/keys")).toBe(false);
  });

  it("records authenticated zero-byte and hidden files that ScanCode does not report", async () => {
    const fixture = makeRegistryFixture({
      additionalEntries: [
        {
          path: "package/.gitattributes",
          body: "* text=auto\n",
        },
        { path: "package/docs/empty.md", body: "" },
      ],
    });
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-scan-coverage-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );

    const result = await acquireEvidence({
      repositoryRoot,
      fetchImpl: mappedFetch(registry.origin),
      downloadTarball: fixtureDownload,
      verifyPackageMetadata: fixtureMetadataVerification,
      scanArtifact: fixtureScanWithout(
        "package/.gitattributes",
        "package/docs/empty.md",
      ),
      write: true,
      sleep: async () => {},
    });
    const retainedScan = result.manifest.blobs.find(
      ({ kind }) => kind === "SCANCODE_FINDINGS",
    );
    const scanEnvelope = JSON.parse(
      await readFile(
        join(
          repositoryRoot,
          "docs",
          "provenance",
          "evidence",
          "npm",
          retainedScan.path,
        ),
        "utf8",
      ),
    );

    expect(scanEnvelope.evidence.archiveCoverage).toEqual({
      authenticatedFileCount: 5,
      reportedFileCount: 3,
      digestVerifiedFileCount: 3,
      incompleteIdentityFiles: [],
      omittedFiles: [
        {
          path: "package/.gitattributes",
          reason: "HIDDEN_PATH_NOT_REPORTED",
          size: 12,
          sha256: createHash("sha256").update("* text=auto\n").digest("hex"),
        },
        {
          path: "package/docs/empty.md",
          reason: "EMPTY_FILE_NOT_REPORTED",
          size: 0,
          sha256: createHash("sha256").update("").digest("hex"),
        },
      ],
    });
  });

  it("records a reported empty file whose ScanCode digest is absent", async () => {
    const fixture = makeRegistryFixture({
      additionalEntries: [{ path: "package/docs/empty.md", body: "" }],
    });
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-scan-coverage-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );

    const result = await acquireEvidence({
      repositoryRoot,
      fetchImpl: mappedFetch(registry.origin),
      downloadTarball: fixtureDownload,
      verifyPackageMetadata: fixtureMetadataVerification,
      scanArtifact: fixtureScanWithoutDigest("package/docs/empty.md"),
      write: true,
      sleep: async () => {},
    });
    const retainedScan = result.manifest.blobs.find(
      ({ kind }) => kind === "SCANCODE_FINDINGS",
    );
    const scanEnvelope = JSON.parse(
      await readFile(
        join(
          repositoryRoot,
          "docs",
          "provenance",
          "evidence",
          "npm",
          retainedScan.path,
        ),
        "utf8",
      ),
    );

    expect(scanEnvelope.evidence.archiveCoverage).toEqual({
      authenticatedFileCount: 4,
      reportedFileCount: 4,
      digestVerifiedFileCount: 3,
      incompleteIdentityFiles: [
        {
          path: "package/docs/empty.md",
          reason: "EMPTY_FILE_DIGEST_NOT_REPORTED",
          size: 0,
          sha256: createHash("sha256").update("").digest("hex"),
        },
      ],
      omittedFiles: [],
    });
  });

  it("records native Node binaries intentionally excluded from ScanCode", async () => {
    const fixture = makeRegistryFixture({
      additionalEntries: [
        { path: "package/native/addon.node", body: Buffer.from([0, 1, 2, 3]) },
      ],
    });
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-scan-coverage-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );

    const result = await acquireEvidence({
      repositoryRoot,
      fetchImpl: mappedFetch(registry.origin),
      downloadTarball: fixtureDownload,
      verifyPackageMetadata: fixtureMetadataVerification,
      scanArtifact: fixtureScanWithout("package/native/addon.node"),
      write: true,
      sleep: async () => {},
    });
    const retainedScan = result.manifest.blobs.find(
      ({ kind }) => kind === "SCANCODE_FINDINGS",
    );
    const scanEnvelope = JSON.parse(
      await readFile(
        join(
          repositoryRoot,
          "docs",
          "provenance",
          "evidence",
          "npm",
          retainedScan.path,
        ),
        "utf8",
      ),
    );

    expect(scanEnvelope.evidence.archiveCoverage).toEqual({
      authenticatedFileCount: 4,
      reportedFileCount: 3,
      digestVerifiedFileCount: 3,
      incompleteIdentityFiles: [],
      omittedFiles: [
        {
          path: "package/native/addon.node",
          reason: "NATIVE_NODE_BINARY_NOT_SCANNED",
          size: 4,
          sha256: createHash("sha256")
            .update(Buffer.from([0, 1, 2, 3]))
            .digest("hex"),
        },
      ],
    });
  });

  it("fails closed when ScanCode omits a digest for a non-empty file", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-scan-coverage-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );

    await expect(
      acquireEvidence({
        repositoryRoot,
        fetchImpl: mappedFetch(registry.origin),
        downloadTarball: fixtureDownload,
        verifyPackageMetadata: fixtureMetadataVerification,
        scanArtifact: fixtureScanWithoutDigest("package/index.js"),
        write: true,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({
      name: "AcquisitionError",
      classification: "PRODUCT_FAILURE",
      code: "SCANCODE_FINDINGS_INVALID",
    });
  });

  it.each(["package/LICENSE", "package/index.js"])(
    "fails closed when ScanCode omits required authenticated file %s",
    async (omittedPath) => {
      const fixture = makeRegistryFixture();
      const registry = await startRegistryServer(fixture);
      const repositoryRoot = await mkdtemp(
        join(tmpdir(), "owlapi-scan-coverage-test-"),
      );
      temporaryRoots.push(repositoryRoot);
      await writeFile(
        join(repositoryRoot, "package-lock.json"),
        fixture.lockfileBytes,
      );

      await expect(
        acquireEvidence({
          repositoryRoot,
          fetchImpl: mappedFetch(registry.origin),
          downloadTarball: fixtureDownload,
          verifyPackageMetadata: fixtureMetadataVerification,
          scanArtifact: fixtureScanWithout(omittedPath),
          write: true,
          sleep: async () => {},
        }),
      ).rejects.toMatchObject({
        name: "AcquisitionError",
        classification: "PRODUCT_FAILURE",
        code: "SCANCODE_FINDINGS_INVALID",
      });
    },
  );

  it("fails authentication when downloaded bytes do not match the locked SRI", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture, {
      tarball: Buffer.from("not the locked tarball"),
    });
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-acquire-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );

    await expect(
      acquireEvidence({
        repositoryRoot,
        fetchImpl: mappedFetch(registry.origin),
        downloadTarball: fixtureDownload,
        verifyPackageMetadata: fixtureMetadataVerification,
        scanArtifact: fixtureScan,
        write: true,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({
      name: "AcquisitionError",
      classification: "PRODUCT_FAILURE",
      code: "TARBALL_AUTHENTICATION_FAILED",
    });
  });

  it("classifies exhausted Pacote metadata transport as externally blocked", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-metadata-network-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );
    const unavailableMetadata = async () => {
      const error = new Error("registry timed out");
      error.code = "ETIMEDOUT";
      throw error;
    };

    await expect(
      acquireEvidence({
        repositoryRoot,
        fetchImpl: mappedFetch(registry.origin),
        downloadTarball: fixtureDownload,
        verifyPackageMetadata: unavailableMetadata,
        scanArtifact: fixtureScan,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({
      classification: "EXTERNAL_BLOCKED",
      code: "PACKAGE_METADATA_UNAVAILABLE",
    });
  });

  it("keeps Pacote cryptographic metadata rejection as a product failure", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-metadata-integrity-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );
    const invalidMetadata = async () => {
      const error = new Error("signature verification failed");
      error.code = "EINTEGRITY";
      throw error;
    };

    await expect(
      acquireEvidence({
        repositoryRoot,
        fetchImpl: mappedFetch(registry.origin),
        downloadTarball: fixtureDownload,
        verifyPackageMetadata: invalidMetadata,
        scanArtifact: fixtureScan,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({
      classification: "PRODUCT_FAILURE",
      code: "PACKAGE_METADATA_VERIFICATION_FAILED",
    });
  });

  it("writes a verifiable shard and reconstructs the same full corpus", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(join(tmpdir(), "owlapi-shard-test-"));
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );
    const shardSetRoot = join(repositoryRoot, "shards");
    const shardRoot = join(shardSetRoot, "shard-0");
    const aggregateRoot = join(repositoryRoot, "aggregate");

    const result = await acquireEvidence({
      repositoryRoot,
      fetchImpl: mappedFetch(registry.origin),
      downloadTarball: fixtureDownload,
      verifyPackageMetadata: fixtureMetadataVerification,
      scanArtifact: fixtureScan,
      shard: { count: 1, index: 0, outputRoot: shardRoot },
      sleep: async () => {},
    });

    expect(result).toMatchObject({
      wrote: false,
      shard: {
        shard: { count: 1, index: 0 },
        summary: { artifactCount: 1 },
      },
    });
    await expect(
      verifyEvidenceShard({
        shard: result.shard,
        lockfileBytes: fixture.lockfileBytes,
        blobRoot: shardRoot,
      }),
    ).resolves.toMatchObject({ artifactCount: 1 });

    const merged = await mergeEvidenceShardDirectories({
      repositoryRoot,
      inputRoot: shardSetRoot,
      outputRoot: aggregateRoot,
    });
    expect(merged.manifest.summary).toMatchObject({ artifactCount: 1 });
    await expect(
      verifyEvidenceManifest({
        manifest: merged.manifest,
        lockfileBytes: fixture.lockfileBytes,
        blobRoot: join(aggregateRoot, "corpus"),
      }),
    ).resolves.toMatchObject({ artifactCount: 1 });
    await expect(
      verifyEvidenceAggregateParity({
        repositoryRoot,
        leftRoot: aggregateRoot,
        rightRoot: aggregateRoot,
      }),
    ).resolves.toMatchObject({
      corpusRoot: merged.manifest.corpusRoot,
      summary: { artifactCount: 1 },
    });
  });

  it("recanonicalizes a verified legacy aggregate without registry or scanner access", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), "owlapi-recanonicalize-test-"),
    );
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );
    const shardSetRoot = join(repositoryRoot, "shards");
    const shardRoot = join(shardSetRoot, "shard-0");
    const aggregateRoot = join(repositoryRoot, "aggregate");
    const outputRoot = join(repositoryRoot, "recanonicalized");
    const completedRoot = join(repositoryRoot, "archive-complete");

    await acquireEvidence({
      repositoryRoot,
      fetchImpl: mappedFetch(registry.origin),
      downloadTarball: fixtureDownload,
      verifyPackageMetadata: fixtureMetadataVerification,
      scanArtifact: fixtureScan,
      shard: { count: 1, index: 0, outputRoot: shardRoot },
      sleep: async () => {},
    });
    await mergeEvidenceShardDirectories({
      repositoryRoot,
      inputRoot: shardSetRoot,
      outputRoot: aggregateRoot,
    });

    const manifestPath = join(aggregateRoot, "npm-package-evidence.json");
    const corpusRoot = join(aggregateRoot, "corpus");
    const legacy = JSON.parse(await readFile(manifestPath, "utf8"));
    const artifact = legacy.artifacts[0];
    const previousScan = artifact.scan.evidence;
    const envelope = JSON.parse(
      await readFile(join(corpusRoot, previousScan.path), "utf8"),
    );
    const packageUid =
      "pkg:npm/alpha@1.0.0?uuid=11111111-1111-4111-8111-111111111111";
    delete envelope.evidence.scanner.normalizationVersion;
    envelope.evidence.packages = [
      {
        name: "alpha",
        package_uid: packageUid,
        purl: "pkg:npm/alpha@1.0.0",
        type: "npm",
        version: "1.0.0",
      },
    ];
    envelope.evidence.dependencies = [
      {
        dependency_uid:
          "pkg:npm/beta@2.0.0?uuid=22222222-2222-4222-8222-222222222222",
        for_package_uid: packageUid,
        purl: "pkg:npm/beta@2.0.0",
      },
    ];
    envelope.evidence.files[0].date = "2026-08-27";
    envelope.evidence.files[0].for_packages = [packageUid];
    const replacement = {
      ...(await retainBlob(corpusRoot, stableJson(envelope))),
      kind: "SCANCODE_FINDINGS",
    };
    artifact.scan.evidence = replacement;
    const previousArchive = artifact.archive.evidence;
    const archiveEnvelope = JSON.parse(
      await readFile(join(corpusRoot, previousArchive.path), "utf8"),
    );
    delete archiveEnvelope.evidence.duplicateEntries;
    delete archiveEnvelope.evidence.physicalEntryCount;
    const legacyArchive = {
      ...(await retainBlob(corpusRoot, stableJson(archiveEnvelope))),
      kind: "ARCHIVE_INVENTORY",
    };
    artifact.archive.evidence = legacyArchive;
    legacy.blobs = legacy.blobs.map((reference) =>
      reference.kind === previousScan.kind &&
      reference.sha256 === previousScan.sha256
        ? replacement
        : reference.kind === previousArchive.kind &&
            reference.sha256 === previousArchive.sha256
          ? legacyArchive
          : reference,
    );
    delete legacy.policy.scanner.normalizationVersion;
    legacy.summary.retainedBytes = legacy.blobs.reduce(
      (total, reference) => total + reference.bytes,
      0,
    );
    legacy.corpusRoot = computeCorpusRoot(legacy.blobs);
    await writeFile(manifestPath, stableJson(legacy));

    const { recanonicalizeEvidenceAggregate } =
      await import("../recanonicalize-npm-package-evidence.mjs");
    const result = await recanonicalizeEvidenceAggregate({
      repositoryRoot,
      inputRoot: aggregateRoot,
      outputRoot,
    });

    expect(result.manifest.policy.scanner.normalizationVersion).toBe(1);
    const normalizedScan = result.manifest.artifacts[0].scan.evidence;
    const normalizedEnvelope = JSON.parse(
      await readFile(join(outputRoot, "corpus", normalizedScan.path), "utf8"),
    );
    expect(normalizedEnvelope.evidence.packages[0]).toMatchObject({
      purl: "pkg:npm/alpha@1.0.0",
    });
    expect(normalizedEnvelope.evidence.packages[0]).not.toHaveProperty(
      "package_uid",
    );
    expect(normalizedEnvelope.evidence.dependencies[0]).toMatchObject({
      for_package_purl: "pkg:npm/alpha@1.0.0",
      purl: "pkg:npm/beta@2.0.0",
    });
    expect(normalizedEnvelope.evidence.files[0]).not.toHaveProperty("date");
    await expect(
      verifyEvidenceManifest({
        manifest: result.manifest,
        lockfileBytes: fixture.lockfileBytes,
        blobRoot: join(outputRoot, "corpus"),
      }),
    ).rejects.toMatchObject({ code: "ARCHIVE_INVENTORY_INVALID" });
    expect(JSON.parse(await readFile(manifestPath, "utf8"))).toEqual(legacy);

    const { completeArchiveEvidenceAggregate } =
      await import("../complete-npm-archive-evidence.mjs");
    const completed = await completeArchiveEvidenceAggregate({
      repositoryRoot,
      inputRoot: outputRoot,
      outputRoot: completedRoot,
      downloadTarball: fixtureDownload,
      fetchImpl: mappedFetch(registry.origin),
    });
    const completedArchive = completed.manifest.artifacts[0].archive.evidence;
    const completedArchiveEnvelope = JSON.parse(
      await readFile(
        join(completedRoot, "corpus", completedArchive.path),
        "utf8",
      ),
    );
    expect(completedArchiveEnvelope.evidence).toMatchObject({
      duplicateEntries: [],
      physicalEntryCount: 3,
    });
    await expect(
      verifyEvidenceManifest({
        manifest: completed.manifest,
        lockfileBytes: fixture.lockfileBytes,
        blobRoot: join(completedRoot, "corpus"),
      }),
    ).resolves.toMatchObject({ artifactCount: 1 });

    const { promoteEvidenceAggregate } =
      await import("../promote-npm-package-evidence.mjs");
    const committedCorpusRoot = join(
      repositoryRoot,
      "docs",
      "provenance",
      "evidence",
      "npm",
    );
    await mkdir(committedCorpusRoot, { recursive: true });
    await writeFile(
      join(committedCorpusRoot, ".gitattributes"),
      "blobs/** -text !eol\n",
    );
    await expect(
      promoteEvidenceAggregate({ repositoryRoot, inputRoot: completedRoot }),
    ).resolves.toMatchObject({
      manifestSha256: completed.output.manifestSha256,
      summary: { artifactCount: 1 },
    });
    await expect(
      verifyEvidenceManifest({
        manifest: completed.manifest,
        lockfileBytes: fixture.lockfileBytes,
        blobRoot: committedCorpusRoot,
      }),
    ).resolves.toMatchObject({ artifactCount: 1 });
    await expect(
      readFile(join(committedCorpusRoot, ".gitattributes"), "utf8"),
    ).resolves.toBe("blobs/** -text !eol\n");
    await expect(
      promoteEvidenceAggregate({ repositoryRoot, inputRoot: completedRoot }),
    ).rejects.toThrow("Committed npm evidence already exists");
    await expect(
      promoteEvidenceAggregate({
        repositoryRoot,
        inputRoot: completedRoot,
        expectedCurrentManifestSha256: completed.output.manifestSha256,
      }),
    ).resolves.toMatchObject({
      manifestSha256: completed.output.manifestSha256,
      summary: { artifactCount: 1 },
    });
  });

  it("rejects a shard whose retained blob bytes were altered", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture);
    const repositoryRoot = await mkdtemp(join(tmpdir(), "owlapi-shard-test-"));
    temporaryRoots.push(repositoryRoot);
    await writeFile(
      join(repositoryRoot, "package-lock.json"),
      fixture.lockfileBytes,
    );
    const shardSetRoot = join(repositoryRoot, "shards");
    const shardRoot = join(shardSetRoot, "shard-0");

    const { shard } = await acquireEvidence({
      repositoryRoot,
      fetchImpl: mappedFetch(registry.origin),
      downloadTarball: fixtureDownload,
      verifyPackageMetadata: fixtureMetadataVerification,
      scanArtifact: fixtureScan,
      shard: { count: 1, index: 0, outputRoot: shardRoot },
      sleep: async () => {},
    });
    const retained = shard.blobs[0];
    await writeFile(join(shardRoot, retained.path), "altered evidence\n");

    await expect(
      mergeEvidenceShardDirectories({
        repositoryRoot,
        inputRoot: shardSetRoot,
        outputRoot: join(repositoryRoot, "aggregate"),
      }),
    ).rejects.toThrow(/blob.*verification|digest|byte length/iu);
  });
});

describe("fetchJsonWithRetry", () => {
  it("retries transient 5xx responses with a fixed bound", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture, {
      handle: ({ request, response, count }) => {
        if (request.url !== "/flaky") {
          return false;
        }
        if (count < 3) {
          response.statusCode = 503;
          response.end("try later");
        } else {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ ok: true }));
        }
        return true;
      },
    });

    await expect(
      fetchJsonWithRetry(`${registry.origin}/flaky`, {
        fetchImpl: fetch,
        sleep: async () => {},
      }),
    ).resolves.toEqual({ ok: true });
    expect(registry.attempts.get("/flaky")).toBe(3);
  });

  it("retries 429 and 408 responses while honoring a capped Retry-After", async () => {
    const fixture = makeRegistryFixture();
    const delays = [];
    const registry = await startRegistryServer(fixture, {
      handle: ({ request, response, count }) => {
        if (request.url !== "/rate-limited") {
          return false;
        }
        if (count === 1) {
          response.statusCode = 429;
          response.setHeader("retry-after", "2");
          response.end("slow down");
        } else if (count === 2) {
          response.statusCode = 408;
          response.end("request timed out");
        } else {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ ok: true }));
        }
        return true;
      },
    });

    await expect(
      fetchJsonWithRetry(`${registry.origin}/rate-limited`, {
        fetchImpl: fetch,
        random: () => 0,
        sleep: async (milliseconds) => delays.push(milliseconds),
      }),
    ).resolves.toEqual({ ok: true });
    expect(delays).toEqual([2_000, 60_000]);
  });

  it("caps an HTTP-date Retry-After and never retries invalid JSON", async () => {
    const fixture = makeRegistryFixture();
    const delays = [];
    const now = Date.parse("2026-08-27T12:00:00.000Z");
    const registry = await startRegistryServer(fixture, {
      handle: ({ request, response, count }) => {
        if (request.url === "/dated" && count === 1) {
          response.statusCode = 503;
          response.setHeader("retry-after", "Wed, 27 Aug 2026 12:05:00 GMT");
          response.end("later");
          return true;
        }
        if (request.url === "/dated") {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ ok: true }));
          return true;
        }
        if (request.url === "/invalid-json") {
          response.setHeader("content-type", "application/json");
          response.end("not json");
          return true;
        }
        return false;
      },
    });

    await expect(
      fetchJsonWithRetry(`${registry.origin}/dated`, {
        fetchImpl: fetch,
        now: () => now,
        random: () => 0,
        sleep: async (milliseconds) => delays.push(milliseconds),
      }),
    ).resolves.toEqual({ ok: true });
    expect(delays).toEqual([60_000]);
    await expect(
      fetchJsonWithRetry(`${registry.origin}/invalid-json`, {
        fetchImpl: fetch,
        sleep: async () => {
          throw new Error("invalid JSON must not be retried");
        },
      }),
    ).rejects.toMatchObject({ classification: "PRODUCT_FAILURE" });
    expect(registry.attempts.get("/invalid-json")).toBe(1);
  });

  it("classifies persistent 5xx but never retries a 4xx response", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture, {
      handle: ({ request, response }) => {
        if (request.url === "/blocked") {
          response.statusCode = 503;
          response.end("unavailable");
          return true;
        }
        if (request.url === "/missing") {
          response.statusCode = 404;
          response.end("missing");
          return true;
        }
        return false;
      },
    });

    await expect(
      fetchJsonWithRetry(`${registry.origin}/blocked`, {
        fetchImpl: fetch,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ classification: "EXTERNAL_BLOCKED" });
    expect(registry.attempts.get("/blocked")).toBe(3);
    await expect(
      fetchJsonWithRetry(`${registry.origin}/missing`, {
        fetchImpl: fetch,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ classification: "PRODUCT_FAILURE" });
    expect(registry.attempts.get("/missing")).toBe(1);
  });
});

describe("registry-key snapshot CLI", () => {
  it("writes one canonical, exclusive same-run registry-key snapshot", async () => {
    const fixture = makeRegistryFixture();
    const registry = await startRegistryServer(fixture);
    const directory = await mkdtemp(
      join(tmpdir(), "owlapi-registry-key-writer-test-"),
    );
    temporaryRoots.push(directory);
    const outputPath = join(directory, "keys", "npm-registry-keys.json");
    const { snapshotRegistryKeys } =
      await import("../snapshot-npm-registry-keys.mjs");

    const snapshot = await snapshotRegistryKeys({
      outputPath,
      fetchImpl: mappedFetch(registry.origin),
      sleep: async () => {},
    });

    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(snapshot);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      registryOrigin: "https://registry.npmjs.org",
      keys: [fixture.key],
    });
    await expect(
      snapshotRegistryKeys({
        outputPath,
        fetchImpl: mappedFetch(registry.origin),
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });
});

describe("acquisition CLI", () => {
  it("requires an explicit write switch to replace committed evidence", () => {
    expect(parseAcquisitionArguments([])).toEqual({
      write: false,
      scancode: null,
      shard: null,
      registryKeysPath: null,
    });
    expect(
      parseAcquisitionArguments([
        "--write",
        "--scancode=C:/tools/scancode.exe",
      ]),
    ).toEqual({
      write: true,
      scancode: "C:/tools/scancode.exe",
      shard: null,
      registryKeysPath: null,
    });
    expect(
      parseAcquisitionArguments([
        "--shard-count=32",
        "--shard-index=7",
        "--output=.release/evidence-shard",
        "--scancode=C:/tools/scancode.exe",
      ]),
    ).toEqual({
      write: false,
      scancode: "C:/tools/scancode.exe",
      registryKeysPath: null,
      shard: {
        count: 32,
        index: 7,
        outputRoot: ".release/evidence-shard",
      },
    });
    expect(
      parseAcquisitionArguments(
        [
          "--shard-count=32",
          "--shard-index-env=EVIDENCE_SHARD_INDEX",
          "--output=.release/evidence-shard",
          "--scancode-env=SCANCODE_COMMAND",
        ],
        {
          EVIDENCE_SHARD_INDEX: "7",
          SCANCODE_COMMAND: ".release/tools/scancode/venv/bin/scancode",
        },
      ),
    ).toEqual({
      write: false,
      scancode: ".release/tools/scancode/venv/bin/scancode",
      registryKeysPath: null,
      shard: {
        count: 32,
        index: 7,
        outputRoot: ".release/evidence-shard",
      },
    });
    expect(
      parseAcquisitionArguments([
        "--shard-count=32",
        "--shard-index=7",
        "--output=.release/evidence-shard",
        "--registry-keys=.release/registry-keys/npm-registry-keys.json",
      ]),
    ).toEqual({
      write: false,
      scancode: null,
      registryKeysPath: ".release/registry-keys/npm-registry-keys.json",
      shard: {
        count: 32,
        index: 7,
        outputRoot: ".release/evidence-shard",
      },
    });
  });

  it("rejects unknown or duplicate arguments", () => {
    expect(() => parseAcquisitionArguments(["--unknown"])).toThrow(
      /unknown acquisition argument/iu,
    );
    expect(() => parseAcquisitionArguments(["--write", "--write"])).toThrow(
      /duplicate acquisition argument/iu,
    );
    expect(() =>
      parseAcquisitionArguments(["--scancode=C:/tools/scancode.bat"]),
    ).toThrow(/native executable/iu);
    expect(() =>
      parseAcquisitionArguments(["--shard-count=32", "--shard-index=7"]),
    ).toThrow(/output/iu);
    expect(() =>
      parseAcquisitionArguments([
        "--write",
        "--shard-count=32",
        "--shard-index=7",
        "--output=.release/evidence-shard",
      ]),
    ).toThrow(/write.*shard|shard.*write/iu);
    expect(() =>
      parseAcquisitionArguments(
        [
          "--shard-count=32",
          "--shard-index-env=EVIDENCE_SHARD_INDEX",
          "--output=.release/evidence-shard",
          "--scancode-env=SCANCODE_COMMAND",
        ],
        { EVIDENCE_SHARD_INDEX: "7" },
      ),
    ).toThrow(/SCANCODE_COMMAND/iu);
  });

  it("exposes stable failure classifications", () => {
    expect(
      new AcquisitionError("EXTERNAL_BLOCKED", "NETWORK", "example"),
    ).toMatchObject({
      name: "AcquisitionError",
      classification: "EXTERNAL_BLOCKED",
      code: "NETWORK",
    });
  });

  it("preserves the immediate cause in command-line diagnostics", () => {
    const cause = new Error(
      "Archive entries do not share a single package root",
    );
    const error = new AcquisitionError(
      "PRODUCT_FAILURE",
      "ARCHIVE_INSPECTION_FAILED",
      "Archive inspection failed for artifact-id",
      { cause },
    );

    expect(error.message).toBe(
      "Archive inspection failed for artifact-id: Archive entries do not share a single package root",
    );
    expect(error.cause).toBe(cause);
  });
});

describe("shard aggregation CLIs", () => {
  it("parses closed merge and parity argument surfaces", () => {
    expect(
      parseMergeArguments([
        "--input=.release/shards",
        "--output=.release/aggregate",
        "--verify-committed",
      ]),
    ).toEqual({
      inputRoot: ".release/shards",
      outputRoot: ".release/aggregate",
      verifyCommitted: true,
      write: false,
    });
    expect(
      parseParityArguments([
        "--left=.release/ubuntu",
        "--right=.release/windows",
      ]),
    ).toEqual({
      allowLegacyScancodeNormalization: false,
      leftRoot: ".release/ubuntu",
      rightRoot: ".release/windows",
    });
    expect(
      parseParityArguments([
        "--left=.release/ubuntu",
        "--right=.release/windows",
        "--allow-legacy-scancode-normalization",
      ]),
    ).toEqual({
      allowLegacyScancodeNormalization: true,
      leftRoot: ".release/ubuntu",
      rightRoot: ".release/windows",
    });
  });

  it("rejects incomplete, duplicate, and mutating merge combinations", () => {
    expect(() => parseMergeArguments(["--input=.release/shards"])).toThrow(
      /input and --output/iu,
    );
    expect(() =>
      parseMergeArguments([
        "--input=.release/shards",
        "--output=.release/aggregate",
        "--write",
        "--verify-committed",
      ]),
    ).toThrow(/mutually exclusive/iu);
    expect(() =>
      parseParityArguments([
        "--left=.release/ubuntu",
        "--left=.release/windows",
      ]),
    ).toThrow(/duplicate|right/iu);
  });
});
