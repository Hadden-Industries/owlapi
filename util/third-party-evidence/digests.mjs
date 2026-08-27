import { createHash, timingSafeEqual } from "node:crypto";

export const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const canonicalize = (value, ancestors) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot contain a non-finite number");
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("Canonical JSON cannot contain a cycle");
    }
    const nextAncestors = new Set(ancestors).add(value);
    return value.map((entry) => canonicalize(entry, nextAncestors));
  }
  if (typeof value === "object") {
    if (ancestors.has(value)) {
      throw new TypeError("Canonical JSON cannot contain a cycle");
    }
    const nextAncestors = new Set(ancestors).add(value);
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareCodeUnits)
        .map((key) => {
          if (value[key] === undefined) {
            throw new TypeError(
              `Canonical JSON cannot contain undefined at property ${key}`,
            );
          }
          return [key, canonicalize(value[key], nextAncestors)];
        }),
    );
  }
  throw new TypeError(`Canonical JSON cannot contain ${typeof value}`);
};

export const stableJson = (value) =>
  `${JSON.stringify(canonicalize(value, new Set()), null, 2)}\n`;

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

export const verifySha512Sri = (bytes, integrity) => {
  const expected = parseExactSha512Sri(integrity);
  const actual = createHash("sha512").update(bytes).digest();
  if (!timingSafeEqual(actual, expected)) {
    throw new Error("Package integrity mismatch");
  }
  return true;
};
