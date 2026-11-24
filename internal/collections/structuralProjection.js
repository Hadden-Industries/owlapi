import { AXIOM_KINDS, OWLObjectKind } from "../../model/kinds.js";
import { structuralFields } from "../model/structuralFields.js";

// Constructor field order differs from the canonical tuple in these two kinds.
export const tupleFields = new Map(structuralFields);
const axiomKinds = new Set(AXIOM_KINDS);
tupleFields.set(OWLObjectKind.LITERAL, ["lexicalForm", "language", "datatype"]);
tupleFields.set(OWLObjectKind.ANONYMOUS_INDIVIDUAL, [
  "documentScope",
  "nodeID",
]);

let model;
export function bindStructuralModel(access) {
  if (model) {
    throw new TypeError("Structural model already initialized");
  }
  model = Object.freeze(access);
}

// The public protocol admits arbitrary Map keys from foreign implementations.
export class ProtocolKey {
  constructor(value) {
    this.value = value;
  }
}

export function captureStructuralKey(value, body = false) {
  const method = body
    ? value.structuralKeyWithoutAnnotations
    : value.structuralKey;
  if (
    model?.projectable(value) &&
    method === (body ? model.bodyMethod : model.keyMethod) &&
    (!body ||
      axiomKinds.has(value.kind) ||
      value.structuralKey === model.keyMethod)
  ) {
    return value;
  }
  const key = method.call(value);
  return typeof key === "string" ? key : new ProtocolKey(key);
}

export function renderCapturedKey(key, body) {
  if (typeof key === "string") {
    return key;
  }
  if (key instanceof ProtocolKey) {
    return key.value;
  }
  return (body ? model.bodyMethod : model.keyMethod).call(key);
}

// A package structural node is a virtual JSON array whose first entry is its kind.
export const tupleLength = (value, body) => {
  if (Array.isArray(value)) {
    return value.length;
  }
  const fields = tupleFields.get(value.kind);
  return fields.length + 1 - Number(body && axiomKinds.has(value.kind));
};
export const tupleEntry = (value, index) => {
  if (Array.isArray(value)) {
    return value[index];
  }
  return index === 0
    ? value.kind
    : (value[tupleFields.get(value.kind)[index - 1]] ?? null);
};

export function decimalPlace(value) {
  let place = 1;
  while (value >= place * 10) {
    place *= 10;
  }
  return place;
}

export function escapedWidth(text, index, unit) {
  if (unit < 32) {
    return unit === 8 || unit === 9 || unit === 10 || unit === 12 || unit === 13
      ? 2
      : 6;
  }
  if (unit === 34 || unit === 92) {
    return 2;
  }
  if (unit >= 0xd800 && unit <= 0xdfff) {
    const neighbor = text.charCodeAt(index + (unit < 0xdc00 ? 1 : -1));
    const paired =
      unit < 0xdc00
        ? neighbor >= 0xdc00 && neighbor <= 0xdfff
        : neighbor >= 0xd800 && neighbor <= 0xdbff;
    return paired ? 1 : 6;
  }
  return 1;
}

const escapes = { 8: 98, 9: 116, 10: 110, 12: 102, 13: 114, 34: 34, 92: 92 };
export function escapedCode(unit, width, part) {
  if (width === 1) {
    return unit;
  }
  if (part === 0) {
    return 92;
  }
  if (width === 2) {
    return escapes[unit];
  }
  if (part === 1) {
    return 117;
  }
  const nibble = (unit >>> ((5 - part) * 4)) & 15;
  return nibble < 10 ? 48 + nibble : 87 + nibble;
}
