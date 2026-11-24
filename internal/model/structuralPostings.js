import { buildCsrPostingIndex } from "../collections/csrPostingIndex.js";

const empty = Object.freeze([]);
const emptyIndex = { offsets: new Uint32Array(1), entries: new Uint32Array() };

function postingKey(index, key) {
  if (!index.keys) return key;
  let low = 0,
    high = index.keys.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (index.keys[middle] < key) low = middle + 1;
    else high = middle;
  }
  return index.keys[low] === key ? low : -1;
}

/** Project an immutable range of ordinals without retaining a bucket of model objects. */
export function postingValues(values, postings, key) {
  key = postingKey(postings, key);
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
  let largestKey = -1;
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
    largestKey = Math.max(largestKey, id);
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
  if (!pairs) return emptyIndex;
  function replay(emit) {
    let remaining = pairs;
    for (const pairBlock of blocks) {
      const length = Math.min(pairBlock.length / 2, remaining);
      for (let i = 0; i < length; i++)
        emit(pairBlock[i * 2], pairBlock[i * 2 + 1]);
      remaining -= length;
    }
  }
  if (largestKey + 1 <= 2 * pairs)
    return buildCsrPostingIndex(largestKey + 1, replay);
  // A sparse family can mention only a few high ordinals in an already large
  // dictionary. Store its own sorted key directory and allocate offsets for it.
  const participants = new Set();
  replay((id) => participants.add(id));
  const directory = { keys: Uint32Array.from(participants).sort() };
  return {
    ...directory,
    ...buildCsrPostingIndex(directory.keys.length, (emit) =>
      replay((id, value) => emit(postingKey(directory, id), value)),
    ),
  };
}
