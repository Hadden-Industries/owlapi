import {
  PUBLIC_REGISTRY_ORIGIN,
  EVIDENCE_SHARD_NAME as SHARD_MANIFEST_NAME,
  EVIDENCE_MANIFEST_NAME,
} from "./third-party-evidence/format.mjs";
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
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

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
  SCANCODE_NORMALIZATION_VERSION,
  SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
  SCANCODE_SEMANTIC_OPTIONS,
  SCANCODE_TOOL,
  buildScancodeArguments,
  normalizeScancodeReport,
} from "./third-party-evidence/scancode.mjs";

const executeFile = promisify(execFile);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

const PUBLIC_REGISTRY = `${PUBLIC_REGISTRY_ORIGIN}/`;
const REGISTRY_KEYS_URL = `${PUBLIC_REGISTRY_ORIGIN}/-/npm/v1/keys`;
const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MAX_JSON_BYTES = 64 * 1024 * 1024;

const REGISTRY_RETRY_MINIMUM_MS = 10_000;
const REGISTRY_RETRY_MAXIMUM_MS = 60_000;
const REGISTRY_RETRY_FACTOR = 10;
const PACOTE_NETWORK_OPTIONS = Object.freeze({
  fetchRetries: 2,
  fetchRetryFactor: REGISTRY_RETRY_FACTOR,
  fetchRetryMintimeout: REGISTRY_RETRY_MINIMUM_MS,
  fetchRetryMaxtimeout: REGISTRY_RETRY_MAXIMUM_MS,
  fetchTimeout: 300_000,
});
let defaultPacoteClientPromise = null;

// Pacote is needed only for live registry operations. Keeping it behind that
// boundary lets pure helpers and injected transports load under every supported
// Node/Jest combination without evaluating Pacote's mixed CJS/ESM dependency tree.
const resolvePacoteClient = (pacoteClient) => {
  if (pacoteClient !== null && pacoteClient !== undefined) {
    return Promise.resolve(pacoteClient);
  }
  defaultPacoteClientPromise ??= import("pacote").then(
    ({ default: importedPacoteClient }) => importedPacoteClient,
  );
  return defaultPacoteClientPromise;
};
const TRANSIENT_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "FETCH_ERROR",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

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

const retryAfterMilliseconds = (response, now) => {
  const value = response?.headers?.get("retry-after")?.trim();
  if (!value) {
    return null;
  }
  if (/^\d+$/u.test(value)) {
    return Number(value) * 1_000;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now()) : null;
};

const registryRetryDelay = ({ attempt, response, now, random }) => {
  const requested = retryAfterMilliseconds(response, now);
  if (requested !== null) {
    return Math.min(requested, REGISTRY_RETRY_MAXIMUM_MS);
  }
  const base = Math.min(
    REGISTRY_RETRY_MINIMUM_MS * REGISTRY_RETRY_FACTOR ** (attempt - 1),
    REGISTRY_RETRY_MAXIMUM_MS,
  );
  const jitterCeiling = Math.min(1_000, REGISTRY_RETRY_MAXIMUM_MS - base);
  return base + Math.floor(random() * (jitterCeiling + 1));
};

const retryableRegistryStatus = (status) =>
  status === 408 || status === 429 || (status >= 500 && status <= 599);

const isTransientRegistryError = (error) => {
  const visited = new Set();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if (
      TRANSIENT_NETWORK_CODES.has(current.code) ||
      retryableRegistryStatus(current.statusCode ?? current.status ?? 0)
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
};

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
    now = Date.now,
    random = Math.random,
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
      await sleep(registryRetryDelay({ attempt, now, random }));
      continue;
    }
    if (retryableRegistryStatus(response.status)) {
      lastError = new Error(`Registry HTTP ${response.status}`);
      if (attempt === attempts) {
        externalBlocked(
          response.status === 429
            ? "REGISTRY_RATE_LIMITED"
            : response.status === 408
              ? "REGISTRY_REQUEST_TIMEOUT"
              : "REGISTRY_SERVER_UNAVAILABLE",
          `Registry remained unavailable after ${attempts} attempts: ${url}`,
          lastError,
        );
      }
      await response.body?.cancel();
      await sleep(registryRetryDelay({ attempt, response, now, random }));
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

const packumentUrl = (name) => {
  let url;
  try {
    // The complete package identity, including an npm alias's underlying name,
    // is one path component. Delimiters must never become URL structure.
    url = new URL(`${PUBLIC_REGISTRY_ORIGIN}/${encodeURIComponent(name)}`);
  } catch (error) {
    productFailure(
      "REGISTRY_PACKAGE_NAME_INVALID",
      "Package name cannot be encoded as a registry URL component",
      error,
    );
  }
  // WHATWG URL parsing normalizes dot segments even after percent encoding.
  // Reject an identity that cannot survive the actual consumer unchanged.
  if (
    url.origin !== PUBLIC_REGISTRY_ORIGIN ||
    url.search ||
    url.hash ||
    decodeURIComponent(url.pathname.slice(1)) !== name
  ) {
    productFailure(
      "REGISTRY_PACKAGE_NAME_INVALID",
      "Registry URL would change the package identity",
    );
  }
  return url.href;
};

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

export const validateRegistryKeySnapshot = (snapshot) => {
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    snapshot.registryOrigin !== PUBLIC_REGISTRY_ORIGIN ||
    !Array.isArray(snapshot.keys) ||
    snapshot.keys.length === 0 ||
    stableJson(Object.keys(snapshot).sort(compareCodeUnits)) !==
      stableJson(["keys", "registryOrigin", "schemaVersion"])
  ) {
    productFailure(
      "REGISTRY_KEYS_MISSING",
      "npm registry key snapshot is invalid or empty",
    );
  }
  const keys = snapshot.keys.map(validateRegistryKey);
  const keyids = new Set();
  for (const key of keys) {
    if (keyids.has(key.keyid)) {
      productFailure(
        "REGISTRY_KEY_DUPLICATE",
        `npm registry key snapshot contains duplicate key ${key.keyid}`,
      );
    }
    keyids.add(key.keyid);
  }
  return keys;
};

export const createRegistryKeySnapshot = async ({
  fetchImpl = fetch,
  sleep = delay,
} = {}) => {
  const response = await fetchJsonWithRetry(REGISTRY_KEYS_URL, {
    fetchImpl,
    sleep,
    maximumBytes: 2 * 1024 * 1024,
  });
  const snapshot = {
    schemaVersion: 1,
    registryOrigin: PUBLIC_REGISTRY_ORIGIN,
    keys: response?.keys,
  };
  return {
    ...snapshot,
    keys: validateRegistryKeySnapshot(snapshot),
  };
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
}) => {
  const resolvedPacoteClient = await resolvePacoteClient(pacoteClient);
  return resolvedPacoteClient.manifest(`${identity.name}@${identity.version}`, {
    registry: PUBLIC_REGISTRY,
    cache,
    resolved: identity.resolved,
    integrity: identity.integrity,
    fullMetadata: true,
    preferOnline: true,
    verifySignatures: true,
    verifyAttestations: hasAttestations,
    "//registry.npmjs.org/:_keys": registryKeysForPacote(registryKeys),
    ...PACOTE_NETWORK_OPTIONS,
  });
};

export const downloadLockedRegistryTarball = async ({
  identity,
  destination,
  cache,
  pacoteClient,
}) => {
  const resolvedPacoteClient = await resolvePacoteClient(pacoteClient);
  return resolvedPacoteClient.tarball.file(
    `${identity.name}@${identity.version}`,
    destination,
    {
      registry: PUBLIC_REGISTRY,
      cache,
      resolved: identity.resolved,
      integrity: identity.integrity,
      preferOnline: true,
      ...PACOTE_NETWORK_OPTIONS,
    },
  );
};

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
    if (isTransientRegistryError(error)) {
      externalBlocked(
        "PACKAGE_METADATA_UNAVAILABLE",
        `Pacote metadata transport remained unavailable for ${identity.artifactId}`,
        error,
      );
    }
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
      if (isTransientRegistryError(error)) {
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
      duplicateEntries: inventory.duplicateEntries,
      expandedBytes: inventory.expandedBytes,
      physicalEntryCount: inventory.physicalEntryCount,
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
  const destinationManifest = join(provenanceRoot, EVIDENCE_MANIFEST_NAME);
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
  for (const filename of [".gitattributes", "README.md"]) {
    const repositoryOwnedPath = join(destinationCorpus, filename);
    if (await exists(repositoryOwnedPath)) {
      // Repository policy and documentation are not acquired evidence. Preserve
      // them across the atomic corpus swap without admitting them to the CAS.
      await writeFile(
        join(pendingCorpus, filename),
        await readFile(repositoryOwnedPath),
        { flag: "wx" },
      );
    }
  }
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
    normalizationVersion: SCANCODE_NORMALIZATION_VERSION,
    semanticOptions: SCANCODE_SEMANTIC_OPTIONS,
    preScanExcludedFileSuffixes: SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
    executionOptions: SCANCODE_EXECUTION_OPTIONS,
  },
});

// Reuse is explicit and offline-verified against its own original lockfile.
// Current graph identity, policy, and final closure are still checked afresh.
const readReusableEvidence = async (repositoryRoot) => {
  const provenanceRoot = join(repositoryRoot, "docs", "provenance");
  const [manifest, lockfileBytes, schema] = await Promise.all([
    readFile(join(provenanceRoot, EVIDENCE_MANIFEST_NAME), "utf8").then(
      JSON.parse,
    ),
    readFile(join(repositoryRoot, "package-lock.json")),
    readFile(
      join(
        DEFAULT_REPOSITORY_ROOT,
        "docs/provenance/npm-package-evidence.schema.json",
      ),
      "utf8",
    ).then(JSON.parse),
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    controlFailure(
      "REUSE_MANIFEST_INVALID",
      `Reusable evidence violates its schema: ${stableJson(validate.errors)}`,
    );
  }
  const blobRoot = join(provenanceRoot, "evidence", "npm");
  await verifyEvidenceManifest({ manifest, lockfileBytes, blobRoot });
  if (stableJson(manifest.policy) !== stableJson(evidencePolicy())) {
    controlFailure(
      "REUSE_POLICY_MISMATCH",
      "Reusable evidence was acquired under a different policy",
    );
  }
  return {
    manifest,
    blobRoot,
    byArtifact: new Map(
      manifest.artifacts.map((artifact) => [artifact.artifactId, artifact]),
    ),
  };
};

const retainReusableArtifact = async (
  artifact,
  sourceRoot,
  destinationRoot,
) => {
  const evidence = Object.fromEntries(
    [
      "artifactId",
      "tarball",
      "archive",
      "registrySignature",
      "provenance",
      "scan",
    ].map((key) => [key, artifact[key]]),
  );
  const references = [
    artifact.archive.evidence,
    artifact.registrySignature.evidence,
    artifact.provenance.evidence,
    artifact.scan.evidence,
  ];
  const archive = JSON.parse(
    await readFile(join(sourceRoot, artifact.archive.evidence.path), "utf8"),
  );
  references.push(...archive.evidence.evidenceFiles.map(({ blob }) => blob));
  for (const reference of references) {
    const retained = await retainBlob(
      destinationRoot,
      await readFile(join(sourceRoot, reference.path)),
    );
    if (
      retained.sha256 !== reference.sha256 ||
      retained.bytes !== reference.bytes
    ) {
      controlFailure(
        "REUSE_BLOB_CHANGED",
        "Reusable evidence changed after verification",
      );
    }
  }
  return {
    evidence,
    blobs: references,
    keyids: artifact.registrySignature.signatures.map(({ keyid }) => keyid),
  };
};

/** Compare exact evidence semantics while preserving the historical interpreter observation. */
export const compareCommittedEvidence = async ({
  repositoryRoot,
  manifest,
  lockfileBytes,
}) => {
  const provenanceRoot = join(repositoryRoot, "docs", "provenance");
  let committed;
  try {
    committed = JSON.parse(
      await readFile(join(provenanceRoot, EVIDENCE_MANIFEST_NAME), "utf8"),
    );
  } catch (error) {
    controlFailure(
      "COMMITTED_EVIDENCE_UNAVAILABLE",
      "Verify-only acquisition requires committed npm package evidence",
      error,
    );
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(
    JSON.parse(
      await readFile(
        join(
          DEFAULT_REPOSITORY_ROOT,
          "docs/provenance/npm-package-evidence.schema.json",
        ),
        "utf8",
      ),
    ),
  );
  for (const document of [committed, manifest]) {
    if (!validate(document))
      controlFailure(
        "COMMITTED_EVIDENCE_SCHEMA_INVALID",
        `Evidence comparison requires valid runtime and semantic policy records: ${stableJson(validate.errors)}`,
      );
  }
  // Python is an execution observation, not a scan finding. Do not rewrite the
  // published 3.14 corpus to claim a 3.15 run. Every other field, including all
  // normalized scan digests and semantic/execution options, must remain exact.
  const comparable = (document) => {
    const copy = structuredClone(document);
    delete copy.policy.scanner.pythonVersion;
    return copy;
  };
  if (stableJson(comparable(committed)) !== stableJson(comparable(manifest))) {
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
  downloadTarball = downloadLockedRegistryTarball,
  verifyPackageMetadata = defaultVerifyPackageMetadata,
  scanArtifact = defaultScanArtifact,
  pacoteClient = null,
  scancode = null,
  registryKeySnapshot = null,
  registryKeysPath = null,
  write = false,
  shard = null,
  reuseEvidenceFrom = null,
} = {}) => {
  if (reuseEvidenceFrom !== null && shard !== null) {
    throw new TypeError(
      "Evidence reuse cannot be combined with fresh shard acquisition",
    );
  }
  const reusable =
    reuseEvidenceFrom === null
      ? null
      : await readReusableEvidence(resolve(repositoryRoot, reuseEvidenceFrom));
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
    if (registryKeySnapshot !== null && registryKeysPath !== null) {
      throw new TypeError(
        "Registry keys must come from either a snapshot value or a snapshot path",
      );
    }
    let resolvedKeySnapshot = registryKeySnapshot;
    if (registryKeysPath !== null) {
      try {
        resolvedKeySnapshot = JSON.parse(
          await readFile(resolve(repositoryRoot, registryKeysPath), "utf8"),
        );
      } catch (error) {
        controlFailure(
          "REGISTRY_KEY_SNAPSHOT_UNAVAILABLE",
          `Registry key snapshot could not be read: ${registryKeysPath}`,
          error,
        );
      }
    }
    if (resolvedKeySnapshot === null) {
      resolvedKeySnapshot = await createRegistryKeySnapshot({
        fetchImpl,
        sleep,
      });
    }
    const registryKeys = validateRegistryKeySnapshot(resolvedKeySnapshot);
    const keyById = new Map();
    for (const key of registryKeys) {
      keyById.set(key.keyid, key);
    }
    for (const key of reusable?.manifest.registryKeys ?? []) {
      const current = keyById.get(key.keyid);
      if (current && stableJson(current) !== stableJson(key)) {
        controlFailure(
          "REUSE_REGISTRY_KEY_CONFLICT",
          `Conflicting registry key evidence for ${key.keyid}`,
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
      const previous = reusable?.byArtifact.get(identity.artifactId);
      const acquired = previous
        ? await retainReusableArtifact(previous, reusable.blobRoot, corpusRoot)
        : await acquireArtifact({
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
  let registryKeysPath = null;
  let reuseEvidenceFrom = null;
  const seen = new Set();
  for (const argument of arguments_) {
    const key = argument === "--write" ? "--write" : argument.split("=", 1)[0];
    const semanticKey = key.replace(/-env$/u, "");
    if (seen.has(semanticKey)) {
      throw new TypeError(`Duplicate acquisition argument: ${semanticKey}`);
    }
    seen.add(semanticKey);
    if (argument.startsWith("--reuse-evidence=") && argument.length > 17) {
      reuseEvidenceFrom = argument.slice(17);
    } else if (argument === "--write") {
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
    } else if (
      argument.startsWith("--registry-keys=") &&
      argument.length > 16
    ) {
      registryKeysPath = argument.slice(16);
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
  if (reuseEvidenceFrom !== null && shard !== null) {
    throw new TypeError(
      "Evidence reuse cannot be combined with fresh shard acquisition",
    );
  }
  return {
    write,
    scancode,
    shard,
    registryKeysPath,
    ...(reuseEvidenceFrom === null ? {} : { reuseEvidenceFrom }),
  };
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
