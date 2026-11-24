import { DenseBitSet } from "./denseBitSet.js";
import { capturedKeysEqual } from "./structuralComparator.js";
import { hashCapturedKey } from "./structuralHash.js";
import { captureStructuralKey } from "./structuralProjection.js";

const processSalt = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
const ordinary = Object.freeze({
  key: captureStructuralKey,
  hash: hashCapturedKey,
  equals: capturedKeysEqual,
});
export const axiomBodyOperations = Object.freeze({
  key: (value) => captureStructuralKey(value, true),
  hash: (key, seed) => hashCapturedKey(key, seed, true),
  equals: (a, b) => capturedKeysEqual(a, b, true),
});
const noBuckets = new Int32Array(0);
const noHashes = new Uint32Array(0);

/** Dense, insertion-ordered ordinals. Zero buckets denote empty slots. Hash
 * collisions always compare the original, captured structural identity. */
export class StructuralHashTable {
  #buckets = noBuckets;
  #hashes = noHashes;
  #values = [];
  #otherKeys;
  #deleted;
  #operations;

  constructor(operations = ordinary) {
    this.#operations = operations;
  }
  get size() {
    return this.#values.length - (this.#deleted?.size ?? 0);
  }
  #slotAt(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this.size) {
      return -1;
    }
    return this.#deleted?.selectClear(id) ?? id;
  }
  valueAt(id) {
    return this.#values[this.#deleted ? this.#slotAt(id) : id];
  }
  keyAt(id) {
    return this.#keyAtSlot(this.#deleted ? this.#slotAt(id) : id);
  }
  #keyAtSlot(slot) {
    return this.#otherKeys?.has(slot)
      ? this.#otherKeys.get(slot)
      : this.#values[slot];
  }
  *values() {
    for (let i = 0; i < this.#values.length; i++) {
      if (!this.#deleted?.has(i)) {
        yield this.#values[i];
      }
    }
  }
  *reverseValues() {
    for (let i = this.#values.length - 1; i >= 0; i--) {
      if (!this.#deleted?.has(i)) {
        yield this.#values[i];
      }
    }
  }
  *capturedEntries() {
    for (let slot = 0; slot < this.#values.length; slot++) {
      if (!this.#deleted?.has(slot)) {
        yield [this.#keyAtSlot(slot), this.#values[slot]];
      }
    }
  }
  sortedValues(compareKeys) {
    const slots = [];
    for (let i = 0; i < this.#values.length; i++) {
      if (!this.#deleted?.has(i)) {
        slots.push(i);
      }
    }
    slots.sort((a, b) => compareKeys(this.#keyAtSlot(a), this.#keyAtSlot(b)));
    return slots.map((slot) => this.#values[slot]);
  }
  [Symbol.iterator]() {
    return this.values();
  }

  #find(key, hash) {
    const mask = this.#buckets.length - 1;
    let bucket = hash & mask;
    while (this.#buckets[bucket]) {
      const slot = this.#buckets[bucket] - 1;
      if (
        hash === this.#hashes[slot] &&
        this.#operations.equals(this.#keyAtSlot(slot), key)
      ) {
        break;
      }
      bucket = (bucket + 1) & mask;
    }
    return bucket;
  }
  #rebuild(capacity) {
    this.#buckets = new Int32Array(capacity);
    const mask = capacity - 1;
    for (let slot = 0; slot < this.#values.length; slot++) {
      if (this.#deleted?.has(slot)) {
        continue;
      }
      let bucket = this.#hashes[slot] & mask;
      while (this.#buckets[bucket]) {
        bucket = (bucket + 1) & mask;
      }
      this.#buckets[bucket] = slot + 1;
    }
  }
  #lookup(key) {
    if (!this.size) {
      return -1;
    }
    const hash = this.#operations.hash(key, processSalt) >>> 0;
    return this.#buckets[this.#find(key, hash)] - 1;
  }
  valueForCapturedKey(key) {
    return this.#values[this.#lookup(key)];
  }
  idOf(value) {
    return this.idOfCapturedKey(this.#operations.key(value));
  }
  idOfCapturedKey(key) {
    const slot = this.#lookup(key);
    return slot < 0 ? -1 : slot - (this.#deleted?.countBefore(slot) ?? 0);
  }
  add(value, replace = false) {
    return this.addPrepared(value, this.#operations.key(value), replace);
  }
  addPrepared(value, key, replace = false) {
    const hash = this.#operations.hash(key, processSalt) >>> 0;
    let bucket = this.#buckets.length ? this.#find(key, hash) : 0;
    const existing = this.#buckets[bucket];
    if (existing) {
      const slot = existing - 1;
      if (replace) {
        this.#values[slot] = value;
        if (key === value) {
          this.#otherKeys?.delete(slot);
        } else {
          (this.#otherKeys ??= new Map()).set(slot, key);
        }
      }
      return slot - (this.#deleted?.countBefore(slot) ?? 0);
    }
    if (this.#values.length === this.#hashes.length) {
      const capacity = Math.max(8, this.#buckets.length * 2);
      const hashes = new Uint32Array(capacity - capacity / 4);
      hashes.set(this.#hashes);
      this.#hashes = hashes;
      this.#rebuild(capacity);
      bucket = this.#find(key, hash);
    }
    const id = this.size,
      slot = this.#values.length;
    this.#values.push(value);
    this.#hashes[slot] = hash;
    if (key !== value) {
      (this.#otherKeys ??= new Map()).set(slot, key);
    }
    this.#buckets[bucket] = slot + 1;
    return id;
  }
  delete(value) {
    return this.deleteKey(this.#operations.key(value));
  }
  deleteKey(key) {
    if (!this.size) {
      return false;
    }
    const hash = this.#operations.hash(key, processSalt) >>> 0;
    let hole = this.#find(key, hash);
    const slot = this.#buckets[hole] - 1;
    if (slot < 0) {
      return false;
    }

    // Close only this linear-probe cluster. Moving a bucket never changes a
    // value's physical slot, insertion order or any other bucket's ordinal.
    const mask = this.#buckets.length - 1;
    for (
      let next = (hole + 1) & mask;
      this.#buckets[next];
      next = (next + 1) & mask
    ) {
      const home = this.#hashes[this.#buckets[next] - 1] & mask;
      if (((next - home) & mask) >= ((next - hole) & mask)) {
        this.#buckets[hole] = this.#buckets[next];
        hole = next;
      }
    }
    this.#buckets[hole] = 0;
    this.#values[slot] = undefined;
    this.#otherKeys?.delete(slot);
    (this.#deleted ??= new DenseBitSet(0x7fffffff)).add(slot);
    if (this.#deleted.size * 4 > this.#values.length) {
      this.#compact();
    }
    return true;
  }
  #compact() {
    const retainedKeys = this.#otherKeys ? new Map() : undefined;
    let write = 0;
    for (let read = 0; read < this.#values.length; read++) {
      if (this.#deleted.has(read)) {
        continue;
      }
      this.#values[write] = this.#values[read];
      this.#hashes[write] = this.#hashes[read];
      if (this.#otherKeys?.has(read)) {
        retainedKeys.set(write, this.#otherKeys.get(read));
      }
      write++;
    }
    this.#values.length = write;
    this.#deleted = undefined;
    this.#otherKeys = retainedKeys;
    if (write === 0) {
      this.#hashes = noHashes;
      this.#buckets = noBuckets;
      return;
    }
    let capacity = this.#buckets.length;
    while (capacity > 8 && write <= (capacity * 3) / 8) {
      capacity /= 2;
    }
    if (capacity !== this.#buckets.length) {
      this.#hashes = this.#hashes.slice(0, capacity - capacity / 4);
    }
    this.#rebuild(capacity);
  }
  clone() {
    const other = new StructuralHashTable(this.#operations);
    other.#values = this.#values.slice();
    other.#hashes = this.#hashes.slice();
    other.#buckets = this.#buckets.slice();
    other.#deleted = this.#deleted?.clone();
    if (this.#otherKeys) {
      other.#otherKeys = new Map(this.#otherKeys);
    }
    return other;
  }
}
