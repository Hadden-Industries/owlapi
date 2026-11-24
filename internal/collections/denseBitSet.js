const PAGE_BITS = 1024;
const PAGE_WORDS = PAGE_BITS / 32;

function popcount(word) {
  word -= (word >>> 1) & 0x55555555;
  word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
  return Math.imul((word + (word >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Copy-on-write typed pages keep sparse ontology edits proportional to the
 * number of changed pages. A previously published revision never changes. */
export class DenseBitSet {
  #limit;
  #pages = new Map();
  #owned = new Set();
  #size = 0;
  constructor(limit) {
    this.#limit = limit;
  }
  get size() {
    return this.#size;
  }
  has(id) {
    if (id < 0 || id >= this.#limit) {
      return false;
    }
    const page = this.#pages.get(Math.floor(id / PAGE_BITS));
    return Boolean(page && page[(id >>> 5) % PAGE_WORDS] & (1 << (id & 31)));
  }
  add(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this.#limit) {
      throw new RangeError("Invalid bit ordinal");
    }
    if (this.has(id)) {
      return false;
    }
    const ordinal = Math.floor(id / PAGE_BITS);
    let page = this.#pages.get(ordinal);
    if (!this.#owned.has(ordinal)) {
      page = page ? page.slice() : new Uint32Array(PAGE_WORDS);
      this.#pages.set(ordinal, page);
      this.#owned.add(ordinal);
    }
    page[(id >>> 5) % PAGE_WORDS] |= 1 << (id & 31);
    this.#size++;
    return true;
  }
  countBefore(id) {
    let count = 0;
    for (const [ordinal, page] of this.#pages) {
      const limit = Math.min(PAGE_BITS, id - ordinal * PAGE_BITS);
      if (limit <= 0) {
        continue;
      }
      const words = Math.floor(limit / 32);
      for (let i = 0; i < words; i++) {
        count += popcount(page[i]);
      }
      const remainder = limit % 32;
      if (remainder) {
        count += popcount(page[words] & (0xffffffff >>> (32 - remainder)));
      }
    }
    return count;
  }
  *values() {
    for (const [ordinal, page] of this.#pages) {
      for (let word = 0; word < page.length; word++) {
        let live = page[word];
        while (live) {
          const bit = 31 - Math.clz32(live & -live);
          yield ordinal * PAGE_BITS + word * 32 + bit;
          live &= live - 1;
        }
      }
    }
  }
  selectClear(rank) {
    let low = rank,
      high = Math.min(rank + this.#size, this.#limit - 1);
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (middle + 1 - this.countBefore(middle + 1) > rank) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    return low;
  }
  clone() {
    const other = new DenseBitSet(this.#limit);
    other.#pages = new Map(this.#pages);
    other.#size = this.#size;
    this.#owned.clear();
    return other;
  }
}
