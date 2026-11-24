const PAGE_BITS = 1024;
const PAGE_WORDS = PAGE_BITS / 32;
const FANOUT = 32;

function popcount(word) {
  word -= (word >>> 1) & 0x55555555;
  word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
  return Math.imul((word + (word >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

// Radix digits keep sparse pages in ordinal order. A node stores the total
// through each child so selecting a clear position needs one search per digit.
function updateRank(node, owner, step, ordinal, count) {
  if (node?.owner !== owner) {
    node = {
      owner,
      through: node ? node.through.slice() : new Uint32Array(FANOUT),
      children: step > 1 ? (node?.children.slice() ?? []) : undefined,
    };
  }
  const digit = Math.floor(ordinal / step) % FANOUT;
  for (let i = digit; i < FANOUT; i++) {
    node.through[i] += count;
  }
  if (step > 1) {
    node.children[digit] = updateRank(
      node.children[digit],
      owner,
      step / FANOUT,
      ordinal,
      count,
    );
  }
  return node;
}

/** Copy-on-write typed pages keep sparse ontology edits proportional to the
 * number of changed pages. A previously published revision never changes. */
export class DenseBitSet {
  #limit;
  #pages = new Map();
  #owned = new Set();
  #size = 0;
  #rank;
  #rankOwner;
  #step = 1;
  constructor(limit) {
    this.#limit = limit;
    while (this.#step * FANOUT * PAGE_BITS < limit) {
      this.#step *= FANOUT;
    }
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
    if (this.#rank) {
      this.#rank = updateRank(
        this.#rank,
        (this.#rankOwner ??= {}),
        this.#step,
        ordinal,
        1,
      );
    }
    return true;
  }
  #ensureRank() {
    if (this.#rank) {
      return;
    }
    const owner = (this.#rankOwner = {});
    for (const [ordinal, page] of this.#pages) {
      let count = 0;
      for (const word of page) {
        count += popcount(word);
      }
      this.#rank = updateRank(this.#rank, owner, this.#step, ordinal, count);
    }
  }
  countBefore(id) {
    if (id <= 0 || this.#size === 0) {
      return 0;
    }
    if (id >= this.#limit) {
      return this.#size;
    }
    this.#ensureRank();
    const ordinal = Math.floor(id / PAGE_BITS);
    let count = 0,
      node = this.#rank;
    for (let step = this.#step; step >= 1 && node; step /= FANOUT) {
      const digit = Math.floor(ordinal / step) % FANOUT;
      if (digit) {
        count += node.through[digit - 1];
      }
      node = node.children?.[digit];
    }
    const page = this.#pages.get(ordinal);
    if (!page) {
      return count;
    }
    const offset = id % PAGE_BITS,
      words = Math.floor(offset / 32),
      remainder = offset % 32;
    for (let i = 0; i < words; i++) {
      count += popcount(page[i]);
    }
    if (remainder) {
      count += popcount(page[words] & (0xffffffff >>> (32 - remainder)));
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
    if (rank < 0 || rank >= this.#limit - this.#size) {
      return -1;
    }
    if (this.#size === 0) {
      return rank;
    }
    this.#ensureRank();
    let node = this.#rank,
      start = 0;
    for (let step = this.#step; step >= 1; step /= FANOUT) {
      if (!node) {
        return start + rank;
      }
      const span = step * PAGE_BITS;
      let low = 0,
        high = FANOUT - 1;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if ((mid + 1) * span - node.through[mid] > rank) {
          high = mid;
        } else {
          low = mid + 1;
        }
      }
      rank -= low * span - (low ? node.through[low - 1] : 0);
      start += low * span;
      node = node.children?.[low];
    }
    const page = this.#pages.get(start / PAGE_BITS);
    if (!page) {
      return start + rank;
    }
    for (const word of page) {
      const clearCount = 32 - popcount(word);
      if (rank < clearCount) {
        let available = ~word;
        for (let i = 0; i < rank; i++) {
          available &= available - 1;
        }
        return start + 31 - Math.clz32(available & -available);
      }
      start += 32;
      rank -= clearCount;
    }
    return -1;
  }
  clone() {
    const other = new DenseBitSet(this.#limit);
    other.#pages = new Map(this.#pages);
    other.#size = this.#size;
    other.#rank = this.#rank;
    // Future writes copy only the touched prefix path in each revision.
    this.#rankOwner = undefined;
    this.#owned.clear();
    return other;
  }
}
