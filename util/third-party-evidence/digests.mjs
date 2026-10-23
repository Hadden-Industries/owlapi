import { createHash, timingSafeEqual } from "node:crypto";
export { stableJson } from "../../scripts/canonical-json.mjs";

export const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export const parseExactSha512Sri = (integrity) => {
  if (typeof integrity !== "string") {
    throw new TypeError("Expected exact sha512 SRI");
  }
  const match = /^sha512-([A-Za-z0-9+/]{86}==)$/u.exec(integrity);
  if (!match) {
    throw new TypeError("Expected exact sha512 SRI");
  }
  const digest = Buffer.from(match[1], "base64");
  if (digest.length !== 64 || digest.toString("base64") !== match[1]) {
    throw new TypeError("Expected exact sha512 SRI");
  }
  return digest;
};

/** Admit a streaming owner's complete digest through the same exact SRI rule. */
export const verifySha512Digest = (actual, integrity) => {
  const expected = parseExactSha512Sri(integrity);
  if (!Buffer.isBuffer(actual) || actual.length !== expected.length)
    throw new TypeError("Invalid complete SHA-512 digest");
  if (!timingSafeEqual(actual, expected)) {
    throw new Error("Package integrity mismatch");
  }
  return true;
};

export const verifySha512Sri = (bytes, integrity) =>
  verifySha512Digest(createHash("sha512").update(bytes).digest(), integrity);
