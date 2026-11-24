import {
  captureStructuralKey,
  decimalPlace,
  escapedCode,
  escapedWidth,
  ProtocolKey,
  tupleEntry,
  tupleLength,
} from "./structuralProjection.js";

// Seed Jenkins' per-code-unit mixer before the first input unit. Foreign keys
// use the same UTF-16 stream as the native virtual tuple, including escapes.
function mix(hash, code) {
  hash = (hash + code) | 0;
  hash = (hash + (hash << 10)) | 0;
  return hash ^ (hash >>> 6);
}
function hashText(hash, text) {
  for (let i = 0; i < text.length; i++) {
    hash = mix(hash, text.charCodeAt(i));
  }
  return hash;
}
// Identity hashes never retain their owners. Registered symbols already have
// a stable registry name; all other reference keys can be held weakly.
const identities = new WeakMap();
let nextIdentity = 0;
function hashProtocolValue(seed, value) {
  const type = typeof value;
  if (type === "symbol") {
    const name = Symbol.keyFor(value);
    if (name !== undefined) {
      return hashText(seed, name);
    }
  } else if (value === null || (type !== "object" && type !== "function")) {
    return hashText(seed, String(value));
  }
  let identity = identities.get(value);
  if (identity === undefined) {
    identity = nextIdentity;
    nextIdentity = (nextIdentity + 1) >>> 0;
    identities.set(value, identity);
  }
  return mix(seed, identity);
}
function hashNative(hash, value, body) {
  if (value === null || value === undefined) {
    return hashText(hash, "null");
  }
  if (typeof value === "string") {
    hash = mix(hash, 34);
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i),
        width = escapedWidth(value, i, unit);
      if (width === 1) {
        hash = mix(hash, unit);
      } else {
        for (let part = 0; part < width; part++) {
          hash = mix(hash, escapedCode(unit, width, part));
        }
      }
    }
    return mix(hash, 34);
  }
  if (typeof value === "number") {
    for (let place = decimalPlace(value); place >= 1; place /= 10) {
      hash = mix(hash, 48 + Math.floor(value / place));
      value %= place;
    }
    return hash;
  }
  hash = mix(hash, 91);
  const length = tupleLength(value, body);
  for (let index = 0; index < length; index++) {
    if (index > 0) {
      hash = mix(hash, 44);
    }
    hash = hashNative(hash, tupleEntry(value, index), false);
  }
  return mix(hash, 93);
}
export function hashCapturedKey(key, seed, body = false) {
  let hash;
  if (key instanceof ProtocolKey) {
    hash = hashProtocolValue(seed, key.value);
  } else {
    hash =
      typeof key === "string"
        ? hashText(seed, key)
        : hashNative(seed, key, body);
  }
  hash = (hash + (hash << 3)) | 0;
  hash ^= hash >>> 11;
  return (hash + (hash << 15)) >>> 0;
}
export const hashStructuralValue = (value, seed) =>
  hashCapturedKey(captureStructuralKey(value), seed);
export const hashAxiomBodyWithoutAnnotations = (axiom, seed) =>
  hashCapturedKey(captureStructuralKey(axiom, true), seed, true);
