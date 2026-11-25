import { AXIOM_KINDS, ENTITY_KINDS, OWLObjectKind } from "../../model/kinds.js";
import {
  captureStructuralKey,
  decimalPlace,
  escapedCode,
  escapedWidth,
  ProtocolKey,
  renderCapturedKey,
  tupleEntry,
  tupleFields,
  tupleLength,
} from "./structuralProjection.js";

const AXIOM_KIND_SET = new Set(AXIOM_KINDS);
const SINGLE_IRI_ENTITY_KINDS = new Set(ENTITY_KINDS);

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function compareJsonStrings(left, right) {
  if (left === right) {
    return 0;
  }
  // Identical IRI namespace prefixes have identical JSON bytes. A common
  // high surrogate is the only unit whose escaping can depend on the first
  // differing unit; compare it with its original neighbor when necessary.
  const limit = Math.min(left.length, right.length);
  let i = 0;
  while (i < limit && left.charCodeAt(i) === right.charCodeAt(i)) i++;
  const preceding = left.charCodeAt(i - 1);
  if (preceding >= 0xd800 && preceding <= 0xdbff) i--;
  let j = i,
    aPart = 0,
    bPart = 0;
  for (;;) {
    const a = left.charCodeAt(i),
      b = right.charCodeAt(j);
    const aWidth = escapedWidth(left, i, a),
      bWidth = escapedWidth(right, j, b);
    const aCode = i === left.length ? 34 : escapedCode(a, aWidth, aPart);
    const bCode = j === right.length ? 34 : escapedCode(b, bWidth, bPart);
    if (aCode !== bCode) {
      return compare(aCode, bCode);
    }
    if (i === left.length && j === right.length) {
      return 0;
    }
    if (++aPart === aWidth) {
      ++i;
      aPart = 0;
    }
    if (++bPart === bWidth) {
      ++j;
      bPart = 0;
    }
  }
}

function firstCode(value) {
  if (value === null || value === undefined) {
    return 110;
  }
  if (typeof value === "string") {
    return 34;
  }
  if (typeof value === "number") {
    return 48 + Math.floor(value / decimalPlace(value));
  }
  return 91;
}

function compareNumbers(a, b, aTail, bTail) {
  let aPlace = decimalPlace(a),
    bPlace = decimalPlace(b);
  while (aPlace >= 1 && bPlace >= 1) {
    const aDigit = Math.floor(a / aPlace),
      bDigit = Math.floor(b / bPlace);
    if (aDigit !== bDigit) {
      return compare(aDigit, bDigit);
    }
    a %= aPlace;
    b %= bPlace;
    aPlace /= 10;
    bPlace /= 10;
  }
  return compare(
    aPlace >= 1 ? 48 + Math.floor(a / aPlace) : aTail,
    bPlace >= 1 ? 48 + Math.floor(b / bPlace) : bTail,
  );
}

function compareNative(left, right, aTail, bTail, body) {
  if (left === right) {
    return 0;
  }
  const type = firstCode(left),
    other = firstCode(right);
  if (type !== other) {
    return compare(type, other);
  }
  if (type === 34) {
    return compareJsonStrings(left, right);
  }
  if (type !== 91) {
    return type === 110 ? 0 : compareNumbers(left, right, aTail, bTail);
  }
  if (!Array.isArray(left) && !Array.isArray(right)) {
    if (left.kind !== right.kind) {
      return compareJsonStrings(left.kind, right.kind);
    }
    if (
      left.kind === OWLObjectKind.IRI &&
      typeof left.value === "string" &&
      typeof right.value === "string"
    ) {
      return compareJsonStrings(left.value, right.value);
    }
    if (
      SINGLE_IRI_ENTITY_KINDS.has(left.kind) &&
      left.iri?.kind === OWLObjectKind.IRI &&
      right.iri?.kind === OWLObjectKind.IRI &&
      typeof left.iri.value === "string" &&
      typeof right.iri.value === "string"
    ) {
      return left.iri === right.iri
        ? 0
        : compareJsonStrings(left.iri.value, right.iri.value);
    }
    const fields = tupleFields.get(left.kind),
      length =
        body && AXIOM_KIND_SET.has(left.kind)
          ? fields.length - 1
          : fields.length;
    for (let i = 0; i < length; i++) {
      const tail = i + 1 === length ? 93 : 44,
        field = fields[i];
      const result = compareNative(
        left[field] ?? null,
        right[field] ?? null,
        tail,
        tail,
        false,
      );
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  }
  const aLength = tupleLength(left, body),
    bLength = tupleLength(right, body);
  const common = Math.min(aLength, bLength);
  for (let index = 0; index < common; index++) {
    const result = compareNative(
      tupleEntry(left, index),
      tupleEntry(right, index),
      index + 1 === aLength ? 93 : 44,
      index + 1 === bLength ? 93 : 44,
      false,
    );
    if (result !== 0) {
      return result;
    }
  }
  if (aLength === bLength) {
    return 0;
  }
  // JSON closes a shorter tuple with ']' instead of a comma. An empty tuple
  // compares its closing bracket with the first token of the nonempty tuple.
  if (common > 0) {
    return aLength < bLength ? 1 : -1;
  }
  return aLength === 0
    ? compare(93, firstCode(tupleEntry(right, 0)))
    : compare(firstCode(tupleEntry(left, 0)), 93);
}

function equalNative(left, right, body) {
  if (left === right) {
    return true;
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  if (!Array.isArray(left) && !Array.isArray(right)) {
    if (left.kind !== right.kind) {
      return false;
    }
    if (left.kind === OWLObjectKind.IRI) {
      return (left.value ?? null) === (right.value ?? null);
    }
    if (
      SINGLE_IRI_ENTITY_KINDS.has(left.kind) &&
      left.iri?.kind === OWLObjectKind.IRI &&
      right.iri?.kind === OWLObjectKind.IRI
    ) {
      return left.iri === right.iri || left.iri.value === right.iri.value;
    }
    const fields = tupleFields.get(left.kind),
      length =
        body && AXIOM_KIND_SET.has(left.kind)
          ? fields.length - 1
          : fields.length;
    for (let i = 0; i < length; i++) {
      const field = fields[i];
      if (!equalNative(left[field] ?? null, right[field] ?? null, false)) {
        return false;
      }
    }
    return true;
  }
  const length = tupleLength(left, body);
  if (length !== tupleLength(right, body)) {
    return false;
  }
  for (let i = 0; i < length; i++) {
    if (!equalNative(tupleEntry(left, i), tupleEntry(right, i), false)) {
      return false;
    }
  }
  return true;
}

export function capturedKeysEqual(left, right, body = false) {
  if (left === right) {
    return true;
  }
  if (left instanceof ProtocolKey || right instanceof ProtocolKey) {
    return (
      left instanceof ProtocolKey &&
      right instanceof ProtocolKey &&
      (left.value === right.value ||
        (Number.isNaN(left.value) && Number.isNaN(right.value)))
    );
  }
  if (typeof left === "string" || typeof right === "string") {
    return renderCapturedKey(left, body) === renderCapturedKey(right, body);
  }
  return equalNative(left, right, body);
}

export function compareCapturedKeys(a, b) {
  if (a === b) {
    return 0;
  }
  if (
    typeof a === "string" ||
    typeof b === "string" ||
    a instanceof ProtocolKey ||
    b instanceof ProtocolKey
  ) {
    return compare(renderCapturedKey(a, false), renderCapturedKey(b, false));
  }
  return compareNative(a, b, 93, 93, false);
}
export const compareStructuralValues = (left, right) =>
  compareCapturedKeys(captureStructuralKey(left), captureStructuralKey(right));

// Public equals uses ===. A collection's SameValueZero also unifies NaN.
export function structuralEquals(left, right, body = false) {
  if (left === right) {
    return true;
  }
  const a = captureStructuralKey(left, body),
    b = captureStructuralKey(right, body);
  if (a instanceof ProtocolKey || b instanceof ProtocolKey) {
    return (
      a instanceof ProtocolKey &&
      b instanceof ProtocolKey &&
      a.value === b.value
    );
  }
  return capturedKeysEqual(a, b, body);
}
