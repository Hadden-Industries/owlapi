/** Build ordered postings in two passes over the same snapshot. The callback
 * emits (key ordinal, value ordinal) pairs in the required iteration order. */
export function buildCsrPostingIndex(keyCount, visit) {
  const offsets = new Uint32Array(keyCount + 1);
  visit((key) => {
    offsets[key + 1]++;
  });
  for (let i = 1; i < offsets.length; i++) {
    offsets[i] += offsets[i - 1];
  }
  const entries = new Uint32Array(offsets[keyCount]);
  const cursors = offsets.slice(0, keyCount);
  visit((key, id) => {
    entries[cursors[key]++] = id;
  });
  return { offsets, entries };
}
