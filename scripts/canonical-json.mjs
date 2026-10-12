/** Semantic JSON identity: recursive UTF-16 key ordering; array order is significant.
 * This repository encoding is not an RFC 8785 claim. Raw-file hashes use raw bytes.
 */
const canonicalize = (value, ancestors = new Set()) => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON cannot contain a non-finite number");
    return value;
  }
  if (typeof value !== "object")
    throw new TypeError(`Canonical JSON cannot contain ${typeof value}`);
  if (ancestors.has(value))
    throw new TypeError("Canonical JSON cannot contain a cycle");
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value))
    return Array.from(value, (entry) => canonicalize(entry, next));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && Object.getPrototypeOf(prototype) !== null)
    throw new TypeError("Canonical JSON requires plain objects");
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key], next)]),
  );
};

// Preserve the established pretty encoding used by dependency evidence.
export const stableJson = (value) =>
  `${JSON.stringify(canonicalize(value), null, 2)}\n`;

const compact = (value) => {
  if (Array.isArray(value)) return `[${value.map(compact).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${compact(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
// Preserve the established compact encoding of qualification summaries.
export const canonicalJson = (value) => compact(canonicalize(value));
