import {
  captureStructuralKey,
  decimalPlace,
  escapedCode,
  escapedWidth,
  ProtocolKey,
  tupleFields,
} from "./structuralProjection.js";
import {
  AXIOM_KINDS_WITH_SWRL as AXIOM_KINDS,
  ENTITY_KINDS,
  OWL_OBJECT_KINDS_WITH_SWRL as OWL_OBJECT_KINDS,
  OWLObjectKind,
} from "../../model/kinds.js";

// A known ["Kind" prefix has a token outside the UTF-16 code-unit range.
// Native field walks and foreign, exact key strings apply the same substitution.
const IRI_TOKEN = 65536 + OWL_OBJECT_KINDS.indexOf(OWLObjectKind.IRI);
const kindTokens = new Map(
  OWL_OBJECT_KINDS.map((kind, index) => [kind, 65536 + index]),
);
const AXIOM_KIND_SET = new Set(AXIOM_KINDS);
const ENTITY_KIND_SET = new Set(ENTITY_KINDS);
const kindMeta = new Map(
  OWL_OBJECT_KINDS.map((kind, index) => [
    kind,
    Object.freeze({
      token: 65536 + index,
      fields: tupleFields.get(kind),
      isAxiom: AXIOM_KIND_SET.has(kind),
      isSingleIriEntity: ENTITY_KIND_SET.has(kind),
    }),
  ]),
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
function hashJsonString(hash, text) {
  hash = mix(hash, 34);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (
      unit >= 32 &&
      unit !== 34 &&
      unit !== 92 &&
      (unit < 0xd800 || unit > 0xdfff)
    ) {
      hash = mix(hash, unit);
      continue;
    }
    const width = escapedWidth(text, i, unit);
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
function hashNative(hash, value, body) {
  if (value === null || value === undefined) {
    return hashText(hash, "null");
  }
  if (typeof value === "string") {
    return hashJsonString(hash, value);
  }
  if (typeof value === "number") {
    for (let place = decimalPlace(value); place >= 1; place /= 10) {
      hash = mix(hash, 48 + Math.floor(value / place));
      value %= place;
    }
    return hash;
  }
  if (!Array.isArray(value)) {
    const kind = value.kind;
    if (kind === OWLObjectKind.IRI && typeof value.value === "string") {
      return mix(
        hashJsonString(mix(mix(hash, IRI_TOKEN), 44), value.value),
        93,
      );
    }
    const meta = kindMeta.get(kind);
    if (
      meta.isSingleIriEntity &&
      value.iri?.kind === OWLObjectKind.IRI &&
      typeof value.iri.value === "string"
    ) {
      return mix(
        mix(
          hashJsonString(
            mix(mix(mix(mix(hash, meta.token), 44), IRI_TOKEN), 44),
            value.iri.value,
          ),
          93,
        ),
        93,
      );
    }
    hash = mix(hash, meta.token);
    const fields = meta.fields,
      length = body && meta.isAxiom ? fields.length - 1 : fields.length;
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
