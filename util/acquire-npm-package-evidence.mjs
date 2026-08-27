import { execFile } from "node:child_process";
import { createPublicKey, randomUUID } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify, TextDecoder } from "node:util";

import pacote from "pacote";

import {
  ARCHIVE_LIMITS,
  inspectPackageTarball,
  materializePackageForScan,
} from "./third-party-evidence/archive-evidence.mjs";
import { retainBlob } from "./third-party-evidence/blob-store.mjs";
import {
  compareCodeUnits,
  sha256,
  stableJson,
  verifySha512Sri,
} from "./third-party-evidence/digests.mjs";
import {
  createEvidenceManifest,
  verifyEvidenceShard,
  verifyEvidenceManifest,
} from "./third-party-evidence/evidence-manifest.mjs";
import {
  createEvidenceShard,
  selectShardArtifacts,
} from "./third-party-evidence/evidence-shards.mjs";
import { normalizeLockedRegistryGraph } from "./third-party-evidence/lock-graph.mjs";
import {
  npmRegistryKeyId,
  verifyRegistrySignature,
} from "./third-party-evidence/registry-signatures.mjs";
import {
  SCANCODE_EXECUTION_OPTIONS,
  SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
  SCANCODE_SEMANTIC_OPTIONS,
  SCANCODE_TOOL,
  buildScancodeArguments,
  normalizeScancodeReport,
} from "./third-party-evidence/scancode.mjs";

const executeFile = promisify(execFile);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const PUBLIC_REGISTRY_ORIGIN = "https://registry.npmjs.org";
const PUBLIC_REGISTRY = `${PUBLIC_REGISTRY_ORIGIN}/`;
const REGISTRY_KEYS_URL = `${PUBLIC_REGISTRY_ORIGIN}/-/npm/v1/keys`;
const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const SHARD_MANIFEST_NAME = "npm-package-evidence-shard.json";

export class AcquisitionError extends Error {
  constructor(classification, code, message, options = undefined) {
    // Error.stack omits `cause` in Node's plain string representation, which is
    // what GitHub Actions receives below. Carry the immediate cause into the
    // message while preserving the structured Error.cause chain for callers.
    const causeMessage = options?.cause?.message;
    super(
      typeof causeMessage === "string" && causeMessage.length > 0
        ? `${message}: ${causeMessage}`
        : message,
      options,
    );
    this.name = "AcquisitionError";
    this.classification = classification;
    this.code = code;
  }
}

const fail = (classification, code, message, cause) => {
  throw new AcquisitionError(classification, code, message, { cause });
};

const productFailure = (code, message, cause) =>
  fail("PRODUCT_FAILURE", code, message, cause);

const controlFailure = (code, message, cause) =>
  fail("CONTROL_FAILURE", code, message, cause);

const externalBlocked = (code, message, cause) =>
  fail("EXTERNAL_BLOCKED", code, message, cause);

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const readBoundedResponse = async (response, maximumBytes) => {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > maximumBytes)
  ) {
    productFailure(
      "REGISTRY_RESPONSE_TOO_LARGE",
      `Registry JSON response exceeds ${maximumBytes} bytes`,
    );
  }
  if (!response.body) {
    productFailure(
      "REGISTRY_RESPONSE_EMPTY",
      "Registry JSON response is empty",
    );
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > maximumBytes) {
      productFailure(
        "REGISTRY_RESPONSE_TOO_LARGE",
        `Registry JSON response exceeds ${maximumBytes} bytes`,
      );
    }
    chunks.push(bytes);
  }
  try {
    return JSON.parse(UTF8_DECODER.decode(Buffer.concat(chunks, total)));
  } catch (error) {
    productFailure(
      "REGISTRY_RESPONSE_INVALID_JSON",
      "Registry response is not valid UTF-8 JSON",
      error,
    );
  }
};

export const fetchJsonWithRetry = async (
  url,
  {
    fetchImpl = fetch,
    sleep = delay,
    attempts = 3,
    maximumBytes = MAX_JSON_BYTES,
  } = {},
) => {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new TypeError("Registry retry attempts must be between one and five");
  }
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        externalBlocked(
          "REGISTRY_NETWORK_UNAVAILABLE",
          `Registry request could not complete after ${attempts} attempts: ${url}`,
          error,
        );
      }
      await sleep(attempt === 1 ? 250 : 1_000);
      continue;
    }
    if (response.status >= 500 && response.status <= 599) {
      lastError = new Error(`Registry HTTP ${response.status}`);
      if (attempt === attempts) {
        externalBlocked(
          "REGISTRY_SERVER_UNAVAILABLE",
          `Registry remained unavailable after ${attempts} attempts: ${url}`,
          lastError,
        );
      }
      await response.body?.cancel();
      await sleep(attempt === 1 ? 250 : 1_000);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      productFailure(
        "REGISTRY_RESPONSE_REJECTED",
        `Registry rejected ${url} with HTTP ${response.status}`,
      );
    }
    return readBoundedResponse(response, maximumBytes);
  }
  externalBlocked(
    "REGISTRY_NETWORK_UNAVAILABLE",
    `Registry request could not complete: ${url}`,
    lastError,
  );
};

const assertPublicRegistryUrl = (value, label) => {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    productFailure("REGISTRY_URL_INVALID", `${label} is not a URL`, error);
  }
  if (
    url.origin !== PUBLIC_REGISTRY_ORIGIN ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    productFailure(
      "REGISTRY_URL_INVALID",
      `${label} is outside the public npm registry`,
    );
  }
  return url.href;
};

const packumentUrl = (name) =>
  `${PUBLIC_REGISTRY_ORIGIN}/${name.replace("/", "%2f")}`;

const validateRegistryKey = (key) => {
  if (
    !key ||
    key.keytype !== "ecdsa-sha2-nistp256" ||
    key.scheme !== "ecdsa-sha2-nistp256" ||
    typeof key.key !== "string" ||
    typeof key.keyid !== "string" ||
    !(key.expires === null || typeof key.expires === "string")
  ) {
    productFailure("REGISTRY_KEY_INVALID", "Registry returned an invalid key");
  }
  const publicDer = Buffer.from(key.key, "base64");
  if (publicDer.length === 0 || publicDer.toString("base64") !== key.key) {
    productFailure(
      "REGISTRY_KEY_INVALID",
      `Registry key ${key.keyid} is not canonical Base64`,
    );
  }
  const expected = npmRegistryKeyId(publicDer);
  if (key.keyid !== expected) {
    productFailure(
      "REGISTRY_KEY_INVALID",
      `Registry key identifier does not match its bytes: ${key.keyid}`,
    );
  }
  try {
    const publicKey = createPublicKey({
      key: publicDer,
      format: "der",
      type: "spki",
    });
    if (publicKey.asymmetricKeyType !== "ec") {
      throw new TypeError("not an EC key");
    }
  } catch (error) {
    productFailure(
      "REGISTRY_KEY_INVALID",
      `Registry key is not a valid P-256 public key: ${key.keyid}`,
      error,
    );
  }
  return { ...key };
};

const registryKeysForPacote = (keys) =>
  keys.map((key) => ({
    ...key,
    pemkey: createPublicKey({
      key: Buffer.from(key.key, "base64"),
      format: "der",
      type: "spki",
    }).export({ format: "pem", type: "spki" }),
  }));

const defaultVerifyPackageMetadata = async ({
  identity,
  hasAttestations,
  registryKeys,
  cache,
  pacoteClient,
}) =>
  pacoteClient.manifest(`${identity.name}@${identity.version}`, {
    registry: PUBLIC_REGISTRY,
    cache,
    resolved: identity.resolved,
    integrity: identity.integrity,
    fullMetadata: true,
    preferOnline: true,
    verifySignatures: true,
    verifyAttestations: hasAttestations,
    "//registry.npmjs.org/:_keys": registryKeysForPacote(registryKeys),
  });

const defaultDownloadTarball = async ({
  identity,
  destination,
  cache,
  pacoteClient,
}) =>
  pacoteClient.tarball.file(
    `${identity.name}@${identity.version}`,
    destination,
    {
      registry: PUBLIC_REGISTRY,
      cache,
      resolved: identity.resolved,
      integrity: identity.integrity,
      preferOnline: true,
    },
  );

const defaultScanArtifact = async ({ scancode, inputRoot, outputPath }) => {
  if (typeof scancode !== "string" || scancode.length === 0) {
    controlFailure(
      "SCANCODE_COMMAND_REQUIRED",
      "A pinned ScanCode 32.5.0 command path is required",
    );
  }
  if (/\.(?:bat|cmd)$/iu.test(scancode)) {
    controlFailure(
      "SCANCODE_NATIVE_COMMAND_REQUIRED",
      "ScanCode must be invoked through a native executable without a command shell",
    );
  }
  const arguments_ = buildScancodeArguments({ outputPath, inputRoot });
  try {
    await executeFile(scancode, arguments_, {
      timeout: 60 * 60 * 1_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      shell: false,
    });
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    controlFailure(
      "SCANCODE_EXECUTION_FAILED",
      `Pinned ScanCode execution failed: ${error.message}`,
      error,
    );
  }
};

const retainEnvelope = async (corpusRoot, kind, artifactId, evidence) => ({
  ...(await retainBlob(
    corpusRoot,
    stableJson({ schemaVersion: 1, kind, artifactId, evidence }),
  )),
  kind,
});

const bindScanCoverage = (scan, inventory, artifactId) => {
  if (!Array.isArray(scan.files)) {
    productFailure(
      "SCANCODE_FILE_INVENTORY_MISSING",
      `ScanCode returned no file inventory for ${artifactId}`,
    );
  }
  const files = new Map();
  for (const file of scan.files) {
    if (files.has(file.path)) {
      productFailure(
        "SCANCODE_FILE_INVENTORY_INVALID",
        `ScanCode returned duplicate path ${file.path}`,
      );
    }
    files.set(file.path, file);
  }
  const expectedFiles = inventory.entries.filter(({ type }) => type === "FILE");
  const expectedByPath = new Map(
    expectedFiles.map((entry) => [entry.path, entry]),
  );
  const incompleteIdentityFiles = [];
  let digestVerifiedFileCount = 0;
  for (const file of files.values()) {
    const entry = expectedByPath.get(file.path);
    if (!entry || file.type !== "file" || file.size !== entry.size) {
      productFailure(
        "SCANCODE_FILE_INVENTORY_INVALID",
        `ScanCode reported an unauthenticated or changed archive path ${file.path}`,
      );
    }
    if (file.sha256 === entry.sha256) {
      digestVerifiedFileCount += 1;
      continue;
    }
    if (
      entry.size === 0 &&
      (file.sha256 === null || file.sha256 === undefined)
    ) {
      // ScanCode 32.5.0 can inventory an empty file without emitting a digest.
      // Preserve that narrower fact explicitly; the authenticated tar digest
      // remains authoritative, but the scanner is not credited with verifying it.
      incompleteIdentityFiles.push({
        path: entry.path,
        reason: "EMPTY_FILE_DIGEST_NOT_REPORTED",
        size: entry.size,
        sha256: entry.sha256,
      });
      continue;
    }
    productFailure(
      "SCANCODE_FILE_INVENTORY_INVALID",
      `ScanCode reported an unauthenticated or changed archive path ${file.path}`,
    );
  }

  const retainedEvidencePaths = new Set(
    inventory.evidenceFiles.map(({ path }) => path),
  );
  const omittedFiles = [];
  for (const entry of expectedFiles) {
    if (files.has(entry.path)) {
      continue;
    }
    const hiddenPath = entry.path
      .split("/")
      .some((segment) => segment.startsWith("."));
    let reason;
    if (
      entry.path.toLowerCase().endsWith(".node") &&
      !retainedEvidencePaths.has(entry.path)
    ) {
      // The authenticated scan materializer deliberately omits native Node
      // add-ons on every host. Their immutable tar bytes remain reviewable.
      reason = "NATIVE_NODE_BINARY_NOT_SCANNED";
    } else if (entry.size === 0) {
      // A zero-byte file has no semantic content for ScanCode to inspect, but
      // the authenticated archive inventory still binds its path and digest.
      reason = "EMPTY_FILE_NOT_REPORTED";
    } else if (hiddenPath && !retainedEvidencePaths.has(entry.path)) {
      // ScanCode 32.5.0 can omit hidden resources from its JSON file report.
      // Permit that observed representation gap only for files that the
      // independent archive classifier did not select as legal evidence.
      reason = "HIDDEN_PATH_NOT_REPORTED";
    } else {
      productFailure(
        "SCANCODE_FILE_INVENTORY_INVALID",
        `ScanCode did not cover required authenticated archive path ${entry.path}`,
      );
    }
    omittedFiles.push({
      path: entry.path,
      reason,
      size: entry.size,
      sha256: entry.sha256,
    });
  }
  if (Object.hasOwn(scan, "archiveCoverage")) {
    productFailure(
      "SCANCODE_FILE_INVENTORY_INVALID",
      `ScanCode returned the reserved archiveCoverage field for ${artifactId}`,
    );
  }
  // Keep the archive inventory authoritative for byte-for-byte closure and bind
  // ScanCode's actual reporting coverage into the retained findings envelope.
  // This makes scanner omissions reviewable without treating them as scanned.
  return {
    ...scan,
    archiveCoverage: {
      authenticatedFileCount: expectedFiles.length,
      reportedFileCount: files.size,
      digestVerifiedFileCount,
      incompleteIdentityFiles: incompleteIdentityFiles.sort((left, right) =>
        compareCodeUnits(left.path, right.path),
      ),
      omittedFiles,
    },
  };
};

const selectPackumentVersion = (packument, identity) => {
  const versionManifest = packument?.versions?.[identity.version];
  const publishedAt = packument?.time?.[identity.version];
  if (
    packument?.name !== identity.name ||
    versionManifest?.name !== identity.name ||
    versionManifest?.version !== identity.version ||
    versionManifest?.dist?.tarball !== identity.resolved ||
    versionManifest?.dist?.integrity !== identity.integrity ||
    !Array.isArray(versionManifest?.dist?.signatures) ||
    versionManifest.dist.signatures.length === 0 ||
    typeof publishedAt !== "string" ||
    !Number.isFinite(Date.parse(publishedAt))
  ) {
    productFailure(
      "PACKUMENT_IDENTITY_MISMATCH",
      `Packument does not match ${identity.name}@${identity.version}`,
    );
  }
  if (versionManifest.dist.attestations) {
    assertPublicRegistryUrl(
      versionManifest.dist.attestations.url,
      "npm attestation URL",
    );
  }
  return { versionManifest, publishedAt };
};

const authenticatePackument = ({
  identity,
  versionManifest,
  publishedAt,
  keyById,
}) => {
  for (const signature of versionManifest.dist.signatures) {
    const key = keyById.get(signature.keyid);
    if (!key) {
      productFailure(
        "REGISTRY_SIGNATURE_KEY_MISSING",
        `No registry key matches ${signature.keyid}`,
      );
    }
    try {
      verifyRegistrySignature({
        identity: { ...identity, publishedAt },
        signature,
        key,
      });
    } catch (error) {
      productFailure(
        "REGISTRY_SIGNATURE_INVALID",
        `Registry signature failed for ${identity.name}@${identity.version}`,
        error,
      );
    }
  }
};

const validatePacoteVerification = ({
  metadata,
  identity,
  versionManifest,
}) => {
  if (
    metadata?._resolved !== identity.resolved ||
    metadata?._integrity !== identity.integrity ||
    stableJson(metadata?._signatures) !==
      stableJson(versionManifest.dist.signatures)
  ) {
    productFailure(
      "PACOTE_VERIFICATION_MISMATCH",
      `Pacote did not verify the exact locked identity for ${identity.artifactId}`,
    );
  }
  const hasAttestations = Boolean(versionManifest.dist.attestations);
  if (
    hasAttestations &&
    (!Array.isArray(metadata._attestationBundles) ||
      metadata._attestationBundles.length === 0)
  ) {
    productFailure(
      "PROVENANCE_VERIFICATION_FAILED",
      `Published provenance was not verified for ${identity.artifactId}`,
    );
  }
};

const acquireArtifact = async ({
  identity,
  stagingRoot,
  corpusRoot,
  cache,
  fetchImpl,
  sleep,
  registryKeys,
  keyById,
  downloadTarball,
  verifyPackageMetadata,
  scanArtifact,
  pacoteClient,
  scancode,
}) => {
  const packument = await fetchJsonWithRetry(packumentUrl(identity.name), {
    fetchImpl,
    sleep,
  });
  const { versionManifest, publishedAt } = selectPackumentVersion(
    packument,
    identity,
  );
  authenticatePackument({
    identity,
    versionManifest,
    publishedAt,
    keyById,
  });
  let metadata;
  try {
    metadata = await verifyPackageMetadata({
      identity,
      versionManifest,
      hasAttestations: Boolean(versionManifest.dist.attestations),
      registryKeys,
      cache,
      pacoteClient,
    });
  } catch (error) {
    productFailure(
      "PACKAGE_METADATA_VERIFICATION_FAILED",
      `Pacote metadata verification failed for ${identity.artifactId}`,
      error,
    );
  }
  validatePacoteVerification({ metadata, identity, versionManifest });

  const tarballPath = join(
    stagingRoot,
    "tarballs",
    `${identity.artifactId}.tgz`,
  );
  const scanRoot = join(stagingRoot, "scan", identity.artifactId);
  const reportPath = join(
    stagingRoot,
    "reports",
    `${identity.artifactId}.json`,
  );
  await mkdir(dirname(tarballPath), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  try {
    let downloadResult;
    try {
      downloadResult = await downloadTarball({
        identity,
        destination: tarballPath,
        cache,
        pacoteClient,
        fetchImpl,
      });
    } catch (error) {
      if (new Set(["EAI_AGAIN", "ECONNRESET", "ETIMEDOUT"]).has(error?.code)) {
        externalBlocked(
          "TARBALL_DOWNLOAD_UNAVAILABLE",
          `Tarball download was externally blocked for ${identity.artifactId}`,
          error,
        );
      }
      productFailure(
        "TARBALL_DOWNLOAD_FAILED",
        `Tarball download failed for ${identity.artifactId}`,
        error,
      );
    }
    if (
      downloadResult?.resolved !== identity.resolved ||
      String(downloadResult?.integrity) !== identity.integrity
    ) {
      productFailure(
        "TARBALL_DOWNLOAD_IDENTITY_MISMATCH",
        `Downloaded tarball identity changed for ${identity.artifactId}`,
      );
    }
    const compressed = await stat(tarballPath);
    if (compressed.size > ARCHIVE_LIMITS.compressedBytes) {
      productFailure(
        "TARBALL_LIMIT_EXCEEDED",
        `Tarball exceeds the compressed-byte safety limit for ${identity.artifactId}`,
      );
    }
    const tarballBytes = await readFile(tarballPath);
    try {
      verifySha512Sri(tarballBytes, identity.integrity);
    } catch (error) {
      productFailure(
        "TARBALL_AUTHENTICATION_FAILED",
        `Tarball SRI mismatch for ${identity.artifactId}`,
        error,
      );
    }
    const tarball = {
      sha256: sha256(tarballBytes),
      bytes: tarballBytes.length,
    };
    let inventory;
    try {
      inventory = await inspectPackageTarball(tarballPath, identity);
    } catch (error) {
      productFailure(
        "ARCHIVE_INSPECTION_FAILED",
        `Archive inspection failed for ${identity.artifactId}`,
        error,
      );
    }

    const blobs = [];
    const evidenceFiles = [];
    for (const evidenceFile of inventory.evidenceFiles) {
      const { bytes, ...facts } = evidenceFile;
      const blob = {
        ...(await retainBlob(corpusRoot, bytes)),
        kind: "PACKAGE_EVIDENCE_FILE",
      };
      blobs.push(blob);
      evidenceFiles.push({ ...facts, blob });
    }
    const archiveEvidence = {
      archiveRoot: inventory.archiveRoot,
      compressedBytes: inventory.compressedBytes,
      expandedBytes: inventory.expandedBytes,
      packageIdentity: inventory.packageIdentity,
      packageMetadata: inventory.packageMetadata,
      tarball,
      entries: inventory.entries,
      evidenceFiles,
    };
    const archiveBlob = await retainEnvelope(
      corpusRoot,
      "ARCHIVE_INVENTORY",
      identity.artifactId,
      archiveEvidence,
    );
    blobs.push(archiveBlob);

    const signatures = versionManifest.dist.signatures;
    const signatureBlob = await retainEnvelope(
      corpusRoot,
      "REGISTRY_SIGNATURE",
      identity.artifactId,
      {
        publishedAt,
        signatures,
        keyids: signatures.map(({ keyid }) => keyid),
      },
    );
    blobs.push(signatureBlob);

    const attestations = metadata._attestationBundles || [];
    const provenanceState = versionManifest.dist.attestations
      ? "VERIFIED"
      : "NOT_PUBLISHED";
    const provenanceBlob = await retainEnvelope(
      corpusRoot,
      "NPM_PROVENANCE",
      identity.artifactId,
      {
        state: provenanceState,
        advertisement: versionManifest.dist.attestations || null,
        attestations,
      },
    );
    blobs.push(provenanceBlob);

    try {
      await mkdir(dirname(scanRoot), { recursive: true });
      await materializePackageForScan(tarballPath, inventory, scanRoot, {
        excludedFileSuffixes: SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
      });
    } catch (error) {
      controlFailure(
        "SCAN_MATERIALIZATION_FAILED",
        `Authenticated package could not be materialized for ${identity.artifactId}`,
        error,
      );
    }
    let rawScan;
    try {
      rawScan = await scanArtifact({
        artifactId: identity.artifactId,
        inputRoot: scanRoot,
        outputPath: reportPath,
        inventory,
        scancode,
      });
    } catch (error) {
      if (error instanceof AcquisitionError) {
        throw error;
      }
      controlFailure(
        "SCANCODE_EXECUTION_FAILED",
        `ScanCode execution failed for ${identity.artifactId}`,
        error,
      );
    }
    let normalizedScan;
    try {
      normalizedScan = normalizeScancodeReport(rawScan, {
        artifactId: identity.artifactId,
        inputRoot: scanRoot,
      });
      normalizedScan = bindScanCoverage(
        normalizedScan,
        inventory,
        identity.artifactId,
      );
    } catch (error) {
      productFailure(
        "SCANCODE_FINDINGS_INVALID",
        `ScanCode findings are incomplete for ${identity.artifactId}`,
        error,
      );
    }
    const scanBlob = await retainEnvelope(
      corpusRoot,
      "SCANCODE_FINDINGS",
      identity.artifactId,
      normalizedScan,
    );
    blobs.push(scanBlob);

    return {
      evidence: {
        artifactId: identity.artifactId,
        tarball,
        archive: { state: "VERIFIED", evidence: archiveBlob },
        registrySignature: {
          state: "VERIFIED",
          publishedAt,
          signatures,
          evidence: signatureBlob,
        },
        provenance: { state: provenanceState, evidence: provenanceBlob },
        scan: { state: "VERIFIED", evidence: scanBlob },
      },
      blobs,
      keyids: signatures.map(({ keyid }) => keyid),
    };
  } finally {
    await rm(tarballPath, { force: true });
    await rm(scanRoot, { recursive: true, force: true });
    await rm(reportPath, { force: true });
  }
};

export const publishEvidence = async ({
  repositoryRoot,
  stagingCorpus,
  manifest,
}) => {
  const provenanceRoot = join(repositoryRoot, "docs", "provenance");
  const evidenceParent = join(provenanceRoot, "evidence");
  const destinationCorpus = join(evidenceParent, "npm");
  const destinationManifest = join(provenanceRoot, "npm-package-evidence.json");
  const operation = randomUUID();
  const pendingCorpus = join(evidenceParent, `.npm.${operation}.pending`);
  const backupCorpus = join(evidenceParent, `.npm.${operation}.backup`);
  const pendingManifest = join(
    provenanceRoot,
    `.npm-package-evidence.${operation}.pending.json`,
  );
  const backupManifest = join(
    provenanceRoot,
    `.npm-package-evidence.${operation}.backup.json`,
  );
  await mkdir(evidenceParent, { recursive: true });
  await cp(stagingCorpus, pendingCorpus, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await writeFile(pendingManifest, stableJson(manifest), { flag: "wx" });
  const hadCorpus = await exists(destinationCorpus);
  const hadManifest = await exists(destinationManifest);
  let installedCorpus = false;
  let installedManifest = false;
  try {
    if (hadCorpus) {
      await rename(destinationCorpus, backupCorpus);
    }
    if (hadManifest) {
      await rename(destinationManifest, backupManifest);
    }
    await rename(pendingCorpus, destinationCorpus);
    installedCorpus = true;
    await rename(pendingManifest, destinationManifest);
    installedManifest = true;
    await rm(backupCorpus, { recursive: true, force: true });
    await rm(backupManifest, { force: true });
  } catch (error) {
    if (installedManifest) {
      await rm(destinationManifest, { force: true });
    }
    if (installedCorpus) {
      await rm(destinationCorpus, { recursive: true, force: true });
    }
    if (hadManifest && (await exists(backupManifest))) {
      await rename(backupManifest, destinationManifest);
    }
    if (hadCorpus && (await exists(backupCorpus))) {
      await rename(backupCorpus, destinationCorpus);
    }
    throw error;
  } finally {
    await rm(pendingCorpus, { recursive: true, force: true });
    await rm(pendingManifest, { force: true });
  }
};

const publishEvidenceShard = async ({
  repositoryRoot,
  outputRoot,
  stagingCorpus,
  shard,
}) => {
  const destination = resolve(repositoryRoot, outputRoot);
  if (await exists(destination)) {
    controlFailure(
      "SHARD_OUTPUT_EXISTS",
      `Evidence shard output already exists: ${destination}`,
    );
  }
  const pending = `${destination}.${randomUUID()}.pending`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(stagingCorpus, pending, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await writeFile(join(pending, SHARD_MANIFEST_NAME), stableJson(shard), {
      flag: "wx",
    });
    await rename(pending, destination);
  } finally {
    await rm(pending, { recursive: true, force: true });
  }
};

const evidencePolicy = () => ({
  registryOrigin: PUBLIC_REGISTRY_ORIGIN,
  provenance: "VERIFY_WHEN_PUBLISHED",
  scanner: {
    name: SCANCODE_TOOL.name,
    version: SCANCODE_TOOL.version,
    pythonVersion: SCANCODE_TOOL.pythonVersion,
    outputFormatVersion: SCANCODE_TOOL.outputFormatVersion,
    semanticOptions: SCANCODE_SEMANTIC_OPTIONS,
    preScanExcludedFileSuffixes: SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
    executionOptions: SCANCODE_EXECUTION_OPTIONS,
  },
});

export const compareCommittedEvidence = async ({
  repositoryRoot,
  manifest,
  lockfileBytes,
}) => {
  const provenanceRoot = join(repositoryRoot, "docs", "provenance");
  let committed;
  try {
    committed = JSON.parse(
      await readFile(join(provenanceRoot, "npm-package-evidence.json"), "utf8"),
    );
  } catch (error) {
    controlFailure(
      "COMMITTED_EVIDENCE_UNAVAILABLE",
      "Verify-only acquisition requires committed npm package evidence",
      error,
    );
  }
  if (stableJson(committed) !== stableJson(manifest)) {
    controlFailure(
      "COMMITTED_EVIDENCE_DIFFERENT",
      "Fresh npm package evidence differs from the committed corpus",
    );
  }
  return verifyEvidenceManifest({
    manifest: committed,
    lockfileBytes,
    blobRoot: join(provenanceRoot, "evidence", "npm"),
  });
};

export const acquireEvidence = async ({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  fetchImpl = fetch,
  sleep = delay,
  downloadTarball = defaultDownloadTarball,
  verifyPackageMetadata = defaultVerifyPackageMetadata,
  scanArtifact = defaultScanArtifact,
  pacoteClient = pacote,
  scancode = null,
  write = false,
  shard = null,
} = {}) => {
  const lockfileBytes = await readFile(
    join(repositoryRoot, "package-lock.json"),
  );
  const graph = normalizeLockedRegistryGraph(lockfileBytes);
  const releaseRoot = join(repositoryRoot, ".release");
  const stagingRoot = join(releaseRoot, `npm-evidence-${randomUUID()}`);
  const corpusRoot = join(stagingRoot, "corpus");
  const cache = join(stagingRoot, "cache");
  await mkdir(corpusRoot, { recursive: true });
  try {
    const keyResponse = await fetchJsonWithRetry(REGISTRY_KEYS_URL, {
      fetchImpl,
      sleep,
      maximumBytes: 2 * 1024 * 1024,
    });
    if (!Array.isArray(keyResponse?.keys) || keyResponse.keys.length === 0) {
      productFailure(
        "REGISTRY_KEYS_MISSING",
        "npm registry returned no signing keys",
      );
    }
    const registryKeys = keyResponse.keys.map(validateRegistryKey);
    const keyById = new Map();
    for (const key of registryKeys) {
      if (keyById.has(key.keyid)) {
        productFailure(
          "REGISTRY_KEY_DUPLICATE",
          `npm registry returned duplicate key ${key.keyid}`,
        );
      }
      keyById.set(key.keyid, key);
    }

    const artifacts = [];
    const blobs = [];
    const usedKeyids = new Set();
    const selectedArtifacts = shard
      ? selectShardArtifacts(graph.artifacts, shard)
      : graph.artifacts;
    for (const identity of selectedArtifacts) {
      const acquired = await acquireArtifact({
        identity,
        stagingRoot,
        corpusRoot,
        cache,
        fetchImpl,
        sleep,
        registryKeys,
        keyById,
        downloadTarball,
        verifyPackageMetadata,
        scanArtifact,
        pacoteClient,
        scancode,
      });
      artifacts.push(acquired.evidence);
      blobs.push(...acquired.blobs);
      acquired.keyids.forEach((keyid) => usedKeyids.add(keyid));
    }
    const retainedKeys = [...usedKeyids].map((keyid) => keyById.get(keyid));
    const policy = evidencePolicy();
    if (shard) {
      const shardDocument = createEvidenceShard({
        graph,
        policy,
        registryKeys: retainedKeys,
        artifacts,
        blobs,
        shard,
      });
      const summary = await verifyEvidenceShard({
        shard: shardDocument,
        lockfileBytes,
        blobRoot: corpusRoot,
      });
      await publishEvidenceShard({
        repositoryRoot,
        outputRoot: shard.outputRoot,
        stagingCorpus: corpusRoot,
        shard: shardDocument,
      });
      return { shard: shardDocument, summary, wrote: false };
    }

    const manifest = createEvidenceManifest({
      graph,
      policy,
      registryKeys: retainedKeys,
      artifacts,
      blobs,
    });
    const summary = await verifyEvidenceManifest({
      manifest,
      lockfileBytes,
      blobRoot: corpusRoot,
    });

    if (write) {
      await publishEvidence({
        repositoryRoot,
        stagingCorpus: corpusRoot,
        manifest,
      });
    } else {
      await compareCommittedEvidence({
        repositoryRoot,
        manifest,
        lockfileBytes,
      });
    }
    return { manifest, summary, wrote: write };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
};

export const parseAcquisitionArguments = (
  arguments_,
  environment = process.env,
) => {
  if (!Array.isArray(arguments_)) {
    throw new TypeError("Acquisition arguments must be an array");
  }
  let write = false;
  let scancode = null;
  let shardCount = null;
  let shardIndex = null;
  let outputRoot = null;
  const seen = new Set();
  for (const argument of arguments_) {
    const key = argument === "--write" ? "--write" : argument.split("=", 1)[0];
    const semanticKey = key.replace(/-env$/u, "");
    if (seen.has(semanticKey)) {
      throw new TypeError(`Duplicate acquisition argument: ${semanticKey}`);
    }
    seen.add(semanticKey);
    if (argument === "--write") {
      write = true;
    } else if (argument.startsWith("--scancode=") && argument.length > 11) {
      scancode = argument.slice(11);
    } else if (argument.startsWith("--scancode-env=") && argument.length > 15) {
      const name = argument.slice(15);
      if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) {
        throw new TypeError(`Invalid environment variable name: ${name}`);
      }
      scancode = environment[name];
      if (typeof scancode !== "string" || scancode.length === 0) {
        throw new TypeError(
          `Acquisition environment variable ${name} is not set`,
        );
      }
    } else if (argument.startsWith("--shard-count=") && argument.length > 14) {
      shardCount = argument.slice(14);
    } else if (argument.startsWith("--shard-index=") && argument.length > 14) {
      shardIndex = argument.slice(14);
    } else if (
      argument.startsWith("--shard-index-env=") &&
      argument.length > 18
    ) {
      const name = argument.slice(18);
      if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) {
        throw new TypeError(`Invalid environment variable name: ${name}`);
      }
      shardIndex = environment[name];
      if (typeof shardIndex !== "string" || shardIndex.length === 0) {
        throw new TypeError(
          `Acquisition environment variable ${name} is not set`,
        );
      }
    } else if (argument.startsWith("--output=") && argument.length > 9) {
      outputRoot = argument.slice(9);
    } else {
      throw new TypeError(`Unknown acquisition argument: ${argument}`);
    }
  }
  if (scancode !== null && /\.(?:bat|cmd)$/iu.test(scancode)) {
    throw new TypeError(
      "ScanCode must be a native executable, not a batch or command script",
    );
  }
  const shardArguments = [shardCount, shardIndex, outputRoot];
  const hasShardArgument = shardArguments.some((value) => value !== null);
  if (hasShardArgument && shardArguments.some((value) => value === null)) {
    throw new TypeError(
      "Shard acquisition requires --shard-count, --shard-index, and --output",
    );
  }
  let shard = null;
  if (hasShardArgument) {
    if (!/^\d+$/u.test(shardCount) || !/^\d+$/u.test(shardIndex)) {
      throw new TypeError("Shard count and index must be decimal integers");
    }
    shard = {
      count: Number(shardCount),
      index: Number(shardIndex),
      outputRoot,
    };
    // Validate the coordinate before any network or filesystem work begins.
    selectShardArtifacts([], shard);
    if (write) {
      throw new TypeError("--write cannot be combined with shard acquisition");
    }
  }
  return { write, scancode, shard };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const options = parseAcquisitionArguments(process.argv.slice(2));
    const result = await acquireEvidence(options);
    process.stdout.write(
      stableJson({
        status: options.shard
          ? "SHARD_WRITTEN"
          : options.write
            ? "WRITTEN"
            : "VERIFIED",
        summary: result.summary,
      }),
    );
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
