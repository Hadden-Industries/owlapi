import { buildCsrPostingIndex } from "../collections/csrPostingIndex.js";

const empty = Object.freeze([]);

/** Project an immutable range of ordinals without retaining a bucket of model objects. */
export function postingValues(values, postings, key) {
  if (key < 0 || key + 1 >= postings.offsets.length) return empty;
  const start = postings.offsets[key];
  const end = postings.offsets[key + 1];
  if (start === end) return empty;
  return Object.freeze({
    length: end - start,
    *[Symbol.iterator]() {
      for (let i = start; i < end; i++)
        yield values.valueAt(postings.entries[i]);
    },
  });
}

/** Discover keys and visit structural fields once. Only numeric pairs survive
 * until the final CSR is filled, including for caller-supplied structural values. */
export function collectPostings(keys, visit) {
  const blocks = [];
  const seen = new Set();
  let previous = -1;
  let pairs = 0;
  let block;
  let used = 0;
  visit((key, value, captured) => {
    if (value !== previous) {
      previous = value;
      seen.clear();
    }
    const id =
      captured === undefined ? keys.add(key) : keys.addPrepared(key, captured);
    if (seen.has(id)) return false;
    seen.add(id);
    if (!block || used === block.length) {
      block = new Uint32Array(Math.min(16384, block ? block.length * 2 : 32));
      blocks.push(block);
      used = 0;
    }
    block[used++] = id;
    block[used++] = value;
    pairs++;
    return true;
  });
  return buildCsrPostingIndex(keys.size, (emit) => {
    let remaining = pairs;
    for (const pairBlock of blocks) {
      const length = Math.min(pairBlock.length / 2, remaining);
      for (let i = 0; i < length; i++)
        emit(pairBlock[i * 2], pairBlock[i * 2 + 1]);
      remaining -= length;
    }
  });
}
