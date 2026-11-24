import {
  captureStructuralKey,
  decimalPlace,
  escapedCode,
  escapedWidth,
  ProtocolKey,
  tupleLength,
  tupleFields,
} from "./structuralProjection.js";
import { OWL_OBJECT_KINDS } from "../../model/kinds.js";

// A known ["Kind" prefix has a token outside the UTF-16 code-unit range.
// Native field walks and foreign, exact key strings apply the same substitution.
const kindTokens = new Map(
  OWL_OBJECT_KINDS.map((kind, index) => [kind, 65536 + index]),
);
const longestKind = Math.max(...OWL_OBJECT_KINDS.map((kind) => kind.length));

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
function hashKeyText(hash, text) {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit === 91 && text.charCodeAt(i + 1) === 34) {
      const start = i + 2,
        stop = text.indexOf('"', start);
      const token =
        stop >= start && stop - start <= longestKind
          ? kindTokens.get(text.slice(start, stop))
          : undefined;
      if (token !== undefined) {
        hash = mix(hash, token);
        i = stop;
        continue;
      }
    }
    hash = mix(hash, unit);
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
  if (!Array.isArray(value)) {
    hash = mix(hash, kindTokens.get(value.kind));
    const fields = tupleFields.get(value.kind),
      length = tupleLength(value, body) - 1;
    for (let i = 0; i < length; i++) {
      hash = hashNative(mix(hash, 44), value[fields[i]], false);
    }
    return mix(hash, 93);
  }
  const token = kindTokens.get(value[0]);
  hash = mix(hash, token ?? 91);
  for (let index = token === undefined ? 0 : 1; index < value.length; index++) {
    if (index > 0) {
      hash = mix(hash, 44);
    }
    hash = hashNative(hash, value[index], false);
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
        ? hashKeyText(seed, key)
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
