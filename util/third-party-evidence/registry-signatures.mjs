import {
  createHash,
  createPublicKey,
  verify as verifyCryptographicSignature,
} from "node:crypto";
import { parseExactSha512Sri } from "./digests.mjs";

const NPM_ECDSA_SCHEME = "ecdsa-sha2-nistp256";
const NPM_ECDSA_CURVE = "nistp256";

const sshWireString = (value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
};

const parseP256PublicKey = (publicDer) => {
  if (!Buffer.isBuffer(publicDer) || publicDer.length === 0) {
    throw new TypeError("Registry public key DER must be a non-empty Buffer");
  }
  const publicKey = createPublicKey({
    key: publicDer,
    format: "der",
    type: "spki",
  });
  if (publicKey.asymmetricKeyType !== "ec") {
    throw new TypeError("Registry signature key is not elliptic-curve");
  }
  const curve = publicKey.asymmetricKeyDetails?.namedCurve;
  if (curve && !new Set(["prime256v1", "P-256"]).has(curve)) {
    throw new TypeError("Registry signature key does not use P-256");
  }
  return publicKey;
};

export const npmRegistryKeyId = (publicDer) => {
  const publicKey = parseP256PublicKey(publicDer);
  const { x, y } = publicKey.export({ format: "jwk" });
  if (typeof x !== "string" || typeof y !== "string") {
    throw new TypeError("Registry P-256 public key has no affine coordinates");
  }

  // npm follows the OpenSSH fingerprint convention: hash the three SSH wire
  // fields, not the DER SubjectPublicKeyInfo bytes returned by its key endpoint.
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(x, "base64url"),
    Buffer.from(y, "base64url"),
  ]);
  const sshPublicKey = Buffer.concat([
    sshWireString(NPM_ECDSA_SCHEME),
    sshWireString(NPM_ECDSA_CURVE),
    sshWireString(point),
  ]);
  return `SHA256:${createHash("sha256")
    .update(sshPublicKey)
    .digest("base64")
    .replace(/=+$/u, "")}`;
};

const decodeCanonicalBase64 = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Missing ${label}`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== value) {
    throw new TypeError(`Invalid ${label}`);
  }
  return bytes;
};

const requireIdentityPart = (value, label) => {
  if (typeof value !== "string" || !value || /[\s:]/u.test(value)) {
    throw new TypeError(`Invalid registry signature ${label}`);
  }
  return value;
};

const parseRegistryTimestamp = (value, label) => {
  if (
    typeof value !== "string" ||
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`Invalid registry signature ${label}`);
  }
  return Date.parse(value);
};

export const registrySignaturePayload = (name, version, integrity) => {
  requireIdentityPart(name, "package name");
  requireIdentityPart(version, "package version");
  parseExactSha512Sri(integrity);
  return `${name}@${version}:${integrity}`;
};

export const verifyRegistrySignature = ({ identity, signature, key }) => {
  try {
    if (!identity || !signature || !key) {
      throw new TypeError("Incomplete registry signature evidence");
    }
    if (key.keytype !== NPM_ECDSA_SCHEME || key.scheme !== NPM_ECDSA_SCHEME) {
      throw new TypeError("Unsupported registry signature scheme");
    }
    const publicDer = decodeCanonicalBase64(key.key, "registry public key");
    const publicKey = parseP256PublicKey(publicDer);
    const expectedKeyId = npmRegistryKeyId(publicDer);
    if (key.keyid !== expectedKeyId || signature.keyid !== expectedKeyId) {
      throw new Error("Registry signature key identifier mismatch");
    }
    const publishedAt = parseRegistryTimestamp(
      identity.publishedAt,
      "publication time",
    );
    if (
      key.expires !== null &&
      publishedAt >= parseRegistryTimestamp(key.expires, "key expiry")
    ) {
      throw new Error("Registry signature key was expired at publication time");
    }
    const signatureBytes = decodeCanonicalBase64(
      signature.sig,
      "registry signature",
    );
    const payload = Buffer.from(
      registrySignaturePayload(
        identity.name,
        identity.version,
        identity.integrity,
      ),
      "utf8",
    );
    if (
      !verifyCryptographicSignature(
        "sha256",
        payload,
        publicKey,
        signatureBytes,
      )
    ) {
      throw new Error("Registry signature bytes did not verify");
    }
    return true;
  } catch (error) {
    throw new Error(
      `Registry signature verification failed: ${error.message}`,
      {
        cause: error,
      },
    );
  }
};
