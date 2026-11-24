import { buildCsrPostingIndex } from "./csrPostingIndex.js";
import { capturedKeysEqual } from "./structuralComparator.js";
import { hashCapturedKey } from "./structuralHash.js";
import { captureStructuralKey } from "./structuralProjection.js";

/** Immutable annotation-insensitive lookup. A positive bucket names a single
 * axiom directly; only bodies with multiple annotations require a posting list. */
export function indexAxiomBodies(axioms) {
  const salt = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  let capacity = 8;
  while (capacity * 0.75 < axioms.length) capacity *= 2;
  const buckets = new Int32Array(capacity);
  const mask = capacity - 1;
  let alternateKeys;
  let groups = [];
  let overlaps = null;
  function representative(marker) {
    if (marker > 0) return marker - 1;
    const group = -marker - 1;
    return overlaps
      ? overlaps.entries[overlaps.offsets[group]]
      : groups[group][0];
  }
  function find(key) {
    let slot = hashCapturedKey(key, salt, true) & mask;
    while (buckets[slot]) {
      const id = representative(buckets[slot]);
      const stored = alternateKeys?.has(id)
        ? alternateKeys.get(id)
        : axioms.valueAt(id);
      if (capturedKeysEqual(stored, key, true)) break;
      slot = (slot + 1) & mask;
    }
    return slot;
  }
  let id = 0;
  for (const axiom of axioms) {
    const key = captureStructuralKey(axiom, true);
    const slot = find(key);
    const marker = buckets[slot];
    if (marker === 0) {
      buckets[slot] = id + 1;
      if (key !== axiom) (alternateKeys ??= new Map()).set(id, key);
    } else if (marker > 0) {
      groups.push([marker - 1, id]);
      buckets[slot] = -groups.length;
    } else {
      groups[-marker - 1].push(id);
    }
    id++;
  }
  overlaps = buildCsrPostingIndex(groups.length, (emit) => {
    for (let i = 0; i < groups.length; i++)
      for (const ordinal of groups[i]) emit(i, ordinal);
  });
  groups = undefined;
  return { marker: (key) => buckets[find(key)], overlaps };
}
