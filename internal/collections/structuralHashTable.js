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
  #operations;

  constructor(operations = ordinary) {
    this.#operations = operations;
  }
  get size() {
    return this.#values.length;
  }
  valueAt(id) {
    return this.#values[id];
  }
  values() {
    return this.#values.values();
  }
  sortedValues(compareKeys) {
    const ids = Array.from(this.#values.keys());
    ids.sort((a, b) => compareKeys(this.keyAt(a), this.keyAt(b)));
    return ids.map((id) => this.#values[id]);
  }
  *reverseValues() {
    for (let i = this.size - 1; i >= 0; i--) {
      yield this.#values[i];
    }
  }
  [Symbol.iterator]() {
    return this.values();
  }

  keyAt(id) {
    return this.#otherKeys?.has(id)
      ? this.#otherKeys.get(id)
      : this.#values[id];
  }
  #find(key, hash) {
    const mask = this.#buckets.length - 1;
    let slot = hash & mask;
    while (this.#buckets[slot]) {
      const id = this.#buckets[slot] - 1;
      if (
        hash === this.#hashes[id] &&
        this.#operations.equals(this.keyAt(id), key)
      ) {
        break;
      }
      slot = (slot + 1) & mask;
    }
    return slot;
  }
  #rebuild(capacity) {
    this.#buckets = new Int32Array(capacity);
    const mask = capacity - 1;
    for (let id = 0; id < this.size; id++) {
      let slot = this.#hashes[id] & mask;
      while (this.#buckets[slot]) {
        slot = (slot + 1) & mask;
      }
      this.#buckets[slot] = id + 1;
    }
  }
  idOf(value) {
    return this.idOfCapturedKey(this.#operations.key(value));
  }
  idOfCapturedKey(key) {
    if (this.size === 0) {
      return -1;
    }
    const hash = this.#operations.hash(key, processSalt) >>> 0;
    return this.#buckets[this.#find(key, hash)] - 1;
  }
  add(value, replace = false) {
    return this.addPrepared(value, this.#operations.key(value), replace);
  }
  addPrepared(value, key, replace = false) {
    const hash = this.#operations.hash(key, processSalt) >>> 0;
    let slot = this.#buckets.length ? this.#find(key, hash) : 0;
    const existing = this.#buckets[slot];
    if (existing) {
      if (replace) {
        const id = existing - 1;
        this.#values[id] = value;
        if (key === value) {
          this.#otherKeys?.delete(id);
        } else {
          (this.#otherKeys ??= new Map()).set(id, key);
        }
      }
      return existing - 1;
    }
    if (this.size === this.#hashes.length) {
      const capacity = Math.max(8, this.#buckets.length * 2);
      const hashes = new Uint32Array(capacity - capacity / 4);
      hashes.set(this.#hashes);
      this.#hashes = hashes;
      this.#rebuild(capacity);
      slot = this.#find(key, hash);
    }
    const id = this.size;
    this.#values.push(value);
    this.#hashes[id] = hash;
    if (key !== value) {
      (this.#otherKeys ??= new Map()).set(id, key);
    }
    this.#buckets[slot] = id + 1;
    return id;
  }
  delete(value) {
    return this.deleteKey(this.#operations.key(value));
  }
  deleteKey(key) {
    const id = this.idOfCapturedKey(key);
    if (id < 0) {
      return false;
    }
    this.#values.splice(id, 1);
    this.#hashes.copyWithin(id, id + 1, this.size + 1);
    if (this.#otherKeys) {
      const keys = new Map();
      for (const [index, key] of this.#otherKeys) {
        if (index !== id) {
          keys.set(index > id ? index - 1 : index, key);
        }
      }
      this.#otherKeys = keys;
    }
    this.#rebuild(this.#buckets.length);
    return true;
  }
  clone() {
    const other = new StructuralHashTable(this.#operations);
    other.#values = this.#values.slice();
    other.#hashes = this.#hashes.slice();
    other.#buckets = this.#buckets.slice();
    if (this.#otherKeys) {
      other.#otherKeys = new Map(this.#otherKeys);
    }
    return other;
  }
}
