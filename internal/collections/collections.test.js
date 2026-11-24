import {
  IRI,
  OWLStructuralObject,
  normalizeStructuralSet,
} from "../../model/structural.js";
import { OWLDataFactory } from "../../model/owlDataFactory.js";
import { StructuralAxiomSet } from "../model/axiomSemantics.js";
import { compareStructuralValues } from "./structuralComparator.js";
import {
  hashStructuralValue,
  hashAxiomBodyWithoutAnnotations,
} from "./structuralHash.js";
import { StructuralHashTable } from "./structuralHashTable.js";
import { buildCsrPostingIndex } from "./csrPostingIndex.js";
import { DenseBitSet } from "./denseBitSet.js";

const factory = new OWLDataFactory();
const owlClass = (name) => factory.getOWLClass(IRI.create(name));
const sign = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
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
