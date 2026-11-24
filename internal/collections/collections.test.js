import {
  IRI,
  OWLStructuralObject,
  normalizeStructuralSet,
} from "../../model/structural.js";
import { OWLDataFactory } from "../../model/owlDataFactory.js";
import { StructuralAxiomSet } from "../model/axiomSemantics.js";
import {
  compareJsonStrings,
  compareStructuralValues,
} from "./structuralComparator.js";
import {
  hashStructuralValue,
  hashAxiomBodyWithoutAnnotations,
} from "./structuralHash.js";
import { StructuralHashTable } from "./structuralHashTable.js";
import { buildCsrPostingIndex } from "./csrPostingIndex.js";
import { DenseBitSet } from "./denseBitSet.js";
import { captureStructuralKey } from "./structuralProjection.js";
import { hashCapturedKey } from "./structuralHash.js";
import { capturedKeysEqual } from "./structuralComparator.js";

const factory = new OWLDataFactory();
const owlClass = (name) => factory.getOWLClass(IRI.create(name));
const sign = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
test("skips equal JSON string prefixes without losing the escape at a surrogate boundary", () => {
  const prefix = 'urn:shared:"\\\n/namespace/';
  const suffixes = [
    "",
    "!",
    "A",
    "\uD800",
    "\uD800x",
    "\uD800\uDC00",
    "\uD800\uDC01",
    "\uDC00",
    "\u0000",
    '"',
    "\\",
  ];
  for (const left of suffixes)
    for (const right of suffixes) {
      expect(Math.sign(compareJsonStrings(prefix + left, prefix + right))).toBe(
        sign(JSON.stringify(prefix + left), JSON.stringify(prefix + right)),
      );
    }
});
const names = [
  "a",
  "a!",
  'a"',
  "a\\",
  "a\n",
  "a\r",
  "a\t",
  "\b",
  "\f",
  "\u0000",
  "\u001f",
  "\u007f",
  "\ud800",
  "\udc00",
  "\ue000",
  "𐀀",
  "é",
  "e\u0301",
  '["IRI","x"]',
  '["OWLAnnotationAssertionAxiom"',
  ']]["OWLClass"[',
];
const cls = owlClass("urn:collection:class");
const prop = factory.getOWLObjectProperty(
  IRI.create("urn:collection:property"),
);
const ann = factory.getOWLAnnotation(
  factory.getRDFSLabel(),
  factory.getOWLLiteral("note"),
);
const axiom = factory.getOWLSubClassOfAxiom(cls, cls);
const annotated = axiom.getAnnotatedAxiom([ann]);
const values = [
  ...names.map(IRI.create),
  ...names.map(owlClass),
  ...names.map((value) => factory.getOWLLiteral(value, "en")),
  ...[1, 2, 10, 11, 100].map((n) =>
    factory.getOWLObjectMinCardinality(n, prop, cls),
  ),
  new OWLDataFactory({
    behaviorProfileId: "java-owlapi-5.5.1",
  }).getOWLObjectOneOf([]),
  factory.getOWLObjectSomeValuesFrom(prop, cls),
  factory.getOWLAnonymousIndividual("n", "scope"),
  factory.getOWLObjectIntersectionOf([cls, owlClass("x")]),
  axiom,
  annotated,
  ann,
];

test("orders native tuples exactly like JSON UTF-16 for every pair", () => {
  const keys = values.map((value) => value.structuralKey());
  for (const [i, left] of values.entries()) {
    for (const [j, right] of values.entries()) {
      expect(Math.sign(compareStructuralValues(left, right))).toBe(
        sign(keys[i], keys[j]),
      );
    }
    const foreign = Object.freeze({
      structuralKey: () => keys[i],
      toStructuralTuple: () => left.toStructuralTuple(),
    });
    expect(hashStructuralValue(left, 42)).toBe(
      hashStructuralValue(foreign, 42),
    );
    expect(compareStructuralValues(left, foreign)).toBe(0);
  }
  expect(hashAxiomBodyWithoutAnnotations(axiom, 71)).toBe(
    hashAxiomBodyWithoutAnnotations(annotated, 71),
  );
  expect(hashStructuralValue(IRI.create("a"), 3)).not.toBe(
    hashStructuralValue(IRI.create("a"), 7),
  );
});

test("captures inserted keys, respects protocol overrides, and preserves representatives", () => {
  const first = IRI.create("same");
  const last = IRI.create("same");
  const other = IRI.create("different");
  const table = new StructuralHashTable();
  expect(table.add(first)).toBe(0);
  expect(table.add(last)).toBe(0);
  expect(table.add(other)).toBe(1);
  expect(table.valueAt(0)).toBe(first);
  expect(normalizeStructuralSet([first, last], "iris")[0]).toBe(last);
  const native = OWLStructuralObject.prototype.structuralKey;
  try {
    OWLStructuralObject.prototype.structuralKey = () => "patched";
    expect(compareStructuralValues(first, other)).toBe(0);
    expect(table.idOf(first)).toBe(-1);
    expect(table.add(first)).toBe(2);
    expect(table.idOf(other)).toBe(2);
  } finally {
    OWLStructuralObject.prototype.structuralKey = native;
  }
  expect(table.idOf(first)).toBe(0);
  const equalForeign = Object.freeze({
    structuralKey: () => first.structuralKey(),
    toStructuralTuple: () => first.toStructuralTuple(),
  });
  expect(table.idOf(equalForeign)).toBe(0);
});

test("normal objects have exact frozen fields, on-demand tuples and scoped IRI identity", () => {
  const first = IRI.create("urn:collection:shared");
  const entity = factory.getOWLClass(first);
  expect(factory.getOWLNamedIndividual(IRI.create(first.value)).iri).toBe(
    entity.iri,
  );
  expect(
    new OWLDataFactory().getOWLClass(IRI.create(first.value)).iri,
  ).not.toBe(entity.iri);
  expect(Reflect.ownKeys(axiom)).toEqual([
    "kind",
    "annotations",
    "subClass",
    "superClass",
  ]);
  expect(Object.isFrozen(axiom)).toBe(true);
  expect(axiom.toStructuralTuple()).not.toBe(axiom.toStructuralTuple());
  expect(Object.isFrozen(axiom.toStructuralTuple()[1])).toBe(true);
  const copied = Object.freeze(
    Object.create(IRI.prototype, Object.getOwnPropertyDescriptors(first)),
  );
  expect(() => IRI.create(copied)).toThrow(TypeError);
  expect(() =>
    OWLStructuralObject.prototype.structuralKey.call(copied),
  ).toThrow(TypeError);
});

test("retains dense insertion order across integer hash collisions, resizing and deletion", () => {
  const table = new StructuralHashTable({
    key: (value) => value,
    hash: () => 6,
    equals: (left, right) => left === right,
  });
  for (let i = 0; i < 100; i++) expect(table.add(i)).toBe(i);
  expect(table.delete(30)).toBe(true);
  expect(table.add(30)).toBe(99);
  expect(table.idOf(31)).toBe(30);
  expect([...table.values()].at(-1)).toBe(30);
  const set = new StructuralAxiomSet([axiom, annotated]);
  expect(set.valueAt(set.idOf(annotated))).toBe(annotated);
  const copy = set.clone();
  copy.delete(axiom);
  expect(copy.valueAt(0)).toBe(annotated);
  expect(set.valueAt(0)).toBe(axiom);
});

test("builds ordered sparse postings and independent tombstone snapshots", () => {
  const rows = [
    [2, 9],
    [0, 3],
    [2, 8],
  ];
  const index = buildCsrPostingIndex(4, (emit) => {
    for (const [key, id] of rows) emit(key, id);
  });
  expect([...index.offsets]).toEqual([0, 1, 1, 3, 3]);
  expect([...index.entries]).toEqual([3, 9, 8]);
  const bits = new DenseBitSet(6000);
  bits.add(0);
  bits.add(32);
  bits.add(5999);
  const other = bits.clone();
  expect(other.add(32)).toBe(false);
  expect(other.add(63)).toBe(true);
  expect(bits.has(63)).toBe(false);
  expect(other.has(5999)).toBe(true);
});

test("compares delta membership across tombstones, reinsertion and compaction", () => {
  const axioms = Array.from({ length: 160 }, (_, i) =>
    factory.getOWLDeclarationAxiom(owlClass("urn:delta:" + i)),
  );
  const base = new StructuralAxiomSet(axioms.slice(0, 128));
  const left = base.clone(),
    right = base.clone();
  left.delete(axioms[63]);
  left.add(axioms[63]);
  expect(left.sameMembers(base)).toBe(true);
  expect(base.sameMembers(left)).toBe(true);
  right.delete(axioms[31]);
  right.add(axioms[128]);
  expect(left.sameMembers(right)).toBe(false);
  left.delete(axioms[31]);
  left.add(axioms[128]);
  expect(left.sameMembers(right)).toBe(true);
  for (let i = 0; i < 24; i++) {
    left.delete(axioms[i]);
    right.delete(axioms[i]);
  }
  expect(left.sameMembers(right)).toBe(true);
  expect(base.size).toBe(128);
  expect([...left.reverseValues()]).toEqual([...left].reverse());
  for (const [id, value] of [...left].entries()) {
    expect(left.idOf(value)).toBe(id);
    expect(left.valueAt(id)).toBe(value);
  }
});

test("distributes common-prefix IRI families across seeded buckets", () => {
  const sizes = new Uint32Array(1024);
  for (let id = 0; id < 8192; id++) {
    const name = id
      .toString(2)
      .padStart(13, "0")
      .replaceAll("0", "Aa")
      .replaceAll("1", "BB");
    sizes[
      hashStructuralValue(IRI.create("urn:bucket:" + name), 0xc7b193) & 1023
    ]++;
  }
  expect(Math.max(...sizes)).toBeLessThan(30);
});

test("public tuple projection keeps deep chains stack-safe and shares repeated children per call", () => {
  let input = cls;
  for (let i = 0; i < 10000; i++) {
    input = factory.getOWLObjectComplementOf(input);
  }
  const shared = factory.getOWLSubClassOfAxiom(input, input);
  const tuple = shared.toStructuralTuple();
  expect(tuple[1] === tuple[2]).toBe(true);
  let node = tuple[1];
  for (let i = 0; i < 10000; i++) {
    if (node[0] !== "OWLObjectComplementOf" || !Object.isFrozen(node)) {
      throw new Error("invalid complement projection");
    }
    node = node[1];
  }
  expect(node).toEqual(cls.toStructuralTuple());
  expect(shared.toStructuralTuple() === tuple).toBe(false);
  const generic = new OWLStructuralObject("Custom", {}, [input, input]);
  const captured = generic.toStructuralTuple();
  expect(captured[1] === captured[2]).toBe(true);
});

test("public equality calls overridden methods using strict equality, independently of Map membership", () => {
  const a = IRI.create("left"),
    b = IRI.create("right");
  for (const [key, equal] of [
    ["structuralKey", "equals"],
    ["structuralKeyWithoutAnnotations", "equalsIgnoreAnnotations"],
  ]) {
    const native = OWLStructuralObject.prototype[key];
    try {
      OWLStructuralObject.prototype[key] = () => NaN;
      expect(a[equal](b)).toBe(false);
      OWLStructuralObject.prototype[key] = () => undefined;
      expect(a[equal](b)).toBe(true);
      OWLStructuralObject.prototype[key] = undefined;
      expect(a[equal](b)).toBe(false);
      expect(a[equal](a)).toBe(true);
      expect(() => a[equal]({ [key]: () => "foreign" })).toThrow(TypeError);
    } finally {
      OWLStructuralObject.prototype[key] = native;
    }
  }
});

test("foreign object, function and symbol key identities scale and retain Map equality", () => {
  let comparisons = 0;
  const table = new StructuralHashTable({
    key: captureStructuralKey,
    hash: hashCapturedKey,
    equals: (a, b) => {
      comparisons++;
      return capturedKeysEqual(a, b);
    },
  });
  const wrap = (key) =>
    Object.freeze({ structuralKey: () => key, toStructuralTuple: () => [] });
  for (const make of [
    () => ({}),
    () => function identity() {},
    () => Symbol("same-description"),
  ]) {
    for (let i = 0; i < 1000; i++) {
      const key = make(),
        id = table.add(wrap(key));
      if (table.add(wrap(key)) !== id) {
        throw new Error("lost identity");
      }
    }
  }
  expect(table.size).toBe(3000);
  expect(comparisons).toBeLessThan(15000);
  expect(table.add(wrap(NaN))).toBe(table.add(wrap(NaN)));
});

test("bulk removal from compacted bases and additions preserves order without repeatedly shifting the entire array", () => {
  const rows = Array.from({ length: 4096 }, (_, i) =>
    factory.getOWLDeclarationAxiom(owlClass("urn:remove:" + i)),
  );
  const base = new StructuralAxiomSet(rows.slice(0, 3584));
  const draft = base.clone();
  for (let i = 3584; i < 3968; i++) {
    draft.add(rows[i]);
  }
  const splice = Array.prototype.splice;
  let shifted = 0;
  try {
    Array.prototype.splice = function (start, count, ...rest) {
      if (
        count === 1 &&
        this.length > 32 &&
        this[0]?.kind === "OWLDeclarationAxiom"
      ) {
        shifted += this.length - start - 1;
      }
      return Reflect.apply(splice, this, [start, count, ...rest]);
    };
    for (let i = 3584; i < 3920; i++) {
      draft.delete(rows[i]);
    }
    for (let i = 0; i < 3000; i++) {
      draft.delete(rows[i]);
    }
  } finally {
    Array.prototype.splice = splice;
  }
  expect(shifted).toBeLessThan(4 * rows.length);
  expect([...draft]).toEqual([
    ...rows.slice(3000, 3584),
    ...rows.slice(3920, 3968),
  ]);
  expect(base.size).toBe(3584);
});

test("colliding bucket deletion, compaction and clone membership match an insertion-ordered Map", () => {
  const operations = {
    key: (value) => value.id,
    hash: (key) => key % 97,
    equals: (a, b) => a === b,
  };
  const table = new StructuralHashTable(operations),
    expected = new Map();
  let seed = 137;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  }
  for (let step = 0; step < 12000; step++) {
    const id = random() % 1703;
    if (random() % 5 < 2) {
      if (table.deleteKey(id) !== expected.delete(id)) {
        throw new Error("delete mismatch");
      }
    } else {
      const value = { id, step };
      table.add(value, true);
      expected.set(id, value);
    }
    if (step % 1000 === 999) {
      const keys = [...expected.keys()];
      const snapshot = table.clone();
      expect([...snapshot].map((entry) => entry.id)).toEqual(keys);
      for (let index = 0; index < keys.length; index += 41) {
        const key = keys[index];
        expect(snapshot.idOfCapturedKey(key)).toBe(index);
        expect(snapshot.valueAt(index)).toBe(expected.get(key));
      }
      for (const key of keys.slice(0, 40)) {
        snapshot.deleteKey(key);
      }
      expect(table.size).toBe(expected.size);
    }
  }
});

test("rank and select reuse sparse page counts across scattered reads and isolate subsequent page writes", () => {
  const limit = 1024 * 97 + 19,
    bits = new DenseBitSet(limit),
    removed = new Set();
  for (let page = 0; page < 97; page += 2) {
    for (const offset of [0, 31, 510]) {
      const id = page * 1024 + offset;
      bits.add(id);
      removed.add(id);
    }
  }
  const live = Array.from({ length: limit }, (_, i) => i).filter(
    (id) => !removed.has(id),
  );
  const original = Map.prototype[Symbol.iterator];
  let pageVisits = 0;
  try {
    Map.prototype[Symbol.iterator] = function () {
      const iter = Reflect.apply(original, this, []);
      if (this.size < 40 || !(this.get(0) instanceof Uint32Array)) {
        return iter;
      }
      return (function* () {
        for (const item of iter) {
          pageVisits++;
          yield item;
        }
      })();
    };
    for (let rank = 0; rank < live.length; rank += 173) {
      expect(bits.selectClear(rank)).toBe(live[rank]);
      expect(bits.countBefore(live[rank])).toBe(live[rank] - rank);
    }
    const copy = bits.clone();
    copy.add(1024 + 2);
    bits.add(1024 * 96 + 17);
    expect(copy.countBefore(1024 + 3)).toBe(bits.countBefore(1024 + 3) + 1);
    expect(copy.has(1024 * 96 + 17)).toBe(false);
    expect(bits.has(1024 + 2)).toBe(false);
  } finally {
    Map.prototype[Symbol.iterator] = original;
  }
  expect(pageVisits).toBeLessThan(160);
});

test("native hashing matches JSON structuralKey streams for ASCII, escaped, and surrogate text", () => {
  const label = factory.getRDFSLabel();
  const c = owlClass('urn:test:"quoted"\\\n\uD800\uDC00/C');
  const d = owlClass("urn:test:plain/D");
  const op = factory.getOWLObjectProperty(IRI.create("urn:test:op"));
  const dp = factory.getOWLDataProperty(IRI.create("urn:test:dp"));
  const ind = factory.getOWLNamedIndividual(IRI.create("urn:test:ind\t1"));
  const lit = factory.getOWLLiteral('a"b\\c\n\uD800\uD800\uDC00', "en-gb");
  const dt = factory.getOWLDatatype(
    IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
  );
  const facet = factory.getOWLFacetRestriction(
    IRI.create("http://www.w3.org/2001/XMLSchema#minInclusive"),
    factory.getOWLLiteral("5", dt),
  );
  const restriction = factory.getOWLDatatypeRestriction(dt, [facet]);
  const some = factory.getOWLObjectSomeValuesFrom(
    factory.getOWLObjectInverseOf(op),
    factory.getOWLObjectIntersectionOf([c, d]),
  );
  const ann = factory.getOWLAnnotation(label, lit);
  const ax1 = factory.getOWLSubClassOfAxiom(c, some, [ann]);
  const ax2 = factory.getOWLDataPropertyRangeAxiom(dp, restriction);
  const ax3 = factory.getOWLDataPropertyAssertionAxiom(dp, ind, lit, [ann]);
  const samples = [
    c,
    c.iri,
    op,
    dp,
    ind,
    lit,
    restriction,
    some,
    ax1,
    ax2,
    ax3,
  ];
  for (const seed of [0, 123456789, 0xdeadbeef]) {
    for (const sample of samples) {
      expect(hashCapturedKey(sample, seed, false)).toBe(
        hashCapturedKey(sample.structuralKey(), seed, false),
      );
      if (typeof sample.structuralKeyWithoutAnnotations === "function") {
        expect(hashCapturedKey(sample, seed, true)).toBe(
          hashCapturedKey(sample.structuralKeyWithoutAnnotations(), seed, true),
        );
      }
    }
  }
});
