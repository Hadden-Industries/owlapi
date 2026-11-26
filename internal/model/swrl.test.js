import { OWLDataFactory } from "../../model/owlDataFactory.js";
import { IRI } from "../../model/structural.js";
import {
  createSwrlRdfRuleBuilder,
  swrlClassAtom,
  swrlObjectPropertyAtom,
  swrlRule,
  swrlVariable,
} from "./swrl.js";

const factory = new OWLDataFactory();
const iri = (name) => IRI.create("https://example.org/" + name);
const atom = (name) =>
  swrlClassAtom(factory.getOWLClass(iri(name)), swrlVariable(iri("x")));
const annotation = (value) =>
  factory.getOWLAnnotation(
    factory.getOWLAnnotationProperty(iri("note")),
    factory.getOWLLiteral(value),
  );

test("RDF rules share frozen canonical tuples while retaining exact keys and encounter order", () => {
  const relation = swrlObjectPropertyAtom(
    factory.getOWLObjectProperty(iri("related")),
    swrlVariable(iri("x")),
    swrlVariable(iri("y")),
  );
  const atoms = [relation, atom("Animal")];
  const note = annotation("first");
  const other = annotation("second");
  const { prepareSide, buildRule } = createSwrlRdfRuleBuilder();
  const side = prepareSide(atoms);
  const first = buildRule(side, side, [note]);
  const second = buildRule(side, prepareSide([atoms[0]]), [other]);
  const expected = swrlRule(atoms, atoms, [note]);
  const firstTuple = first.toStructuralTuple();
  const secondTuple = second.toStructuralTuple();
  const copy = first.getAnnotatedAxiom([other]);
  const bare = first.getAxiomWithoutAnnotations();

  expect(first.body).toEqual(atoms);
  expect(first.head).toEqual(atoms);
  expect(firstTuple).toEqual(expected.toStructuralTuple());
  expect(first.structuralKey()).toBe(expected.structuralKey());
  expect(first.structuralKeyWithoutAnnotations()).toBe(
    expected.structuralKeyWithoutAnnotations(),
  );
  expect(firstTuple[1]).toBe(firstTuple[2]);
  expect(firstTuple[1]).toBe(secondTuple[1]);
  expect(Object.isFrozen(firstTuple[1])).toBe(true);
  expect(copy.toStructuralTuple()[1]).toBe(firstTuple[1]);
  expect(bare.toStructuralTuple()[1]).toBe(firstTuple[1]);
  expect(copy.equalsIgnoreAnnotations(first)).toBe(true);
  expect(copy.equals(first)).toBe(false);
  expect(copy.toStructuralTuple()).toEqual(
    expected.getAnnotatedAxiom([other]).toStructuralTuple(),
  );
  expect(bare.toStructuralTuple()).toEqual(
    expected.getAxiomWithoutAnnotations().toStructuralTuple(),
  );
  const independent = createSwrlRdfRuleBuilder();
  const independentSide = independent.prepareSide(atoms);
  const anotherLoad = independent.buildRule(independentSide, independentSide, [
    note,
  ]);
  expect(anotherLoad.toStructuralTuple()[1]).not.toBe(firstTuple[1]);
  expect(anotherLoad.equals(first)).toBe(true);
});

test("a prepared side retains each observation of a foreign atom's tuple", () => {
  const native = atom("Animal");
  let observedTuples = 0;
  const foreign = Object.freeze({
    kind: native.kind,
    structuralKey: () => native.structuralKey(),
    get toStructuralTuple() {
      return () => [native.kind, ++observedTuples];
    },
  });
  const { prepareSide, buildRule } = createSwrlRdfRuleBuilder();
  const body = prepareSide([foreign]);
  const head = prepareSide([]);
  const first = buildRule(body, head, []);
  const second = buildRule(body, head, []);

  expect(observedTuples).toBe(4);
  expect(first.toStructuralTuple()[1]).toEqual([[native.kind, 1]]);
  expect(second.toStructuralTuple()[1]).toEqual([[native.kind, 3]]);
  expect(JSON.parse(first.structuralKeyWithoutAnnotations())[1]).toEqual([
    [native.kind, 2],
  ]);
  expect(JSON.parse(second.structuralKeyWithoutAnnotations())[1]).toEqual([
    [native.kind, 4],
  ]);
});

test("a warm projection still honors an inherited tuple getter", () => {
  const { prepareSide, buildRule } = createSwrlRdfRuleBuilder();
  const body = prepareSide([atom("Animal")]);
  const head = prepareSide([]);
  const first = buildRule(body, head, []);
  const previous = Object.getOwnPropertyDescriptor(
    Array.prototype,
    "toStructuralTuple",
  );
  let inheritedReads = 0;
  let projected;
  try {
    Object.defineProperty(Array.prototype, "toStructuralTuple", {
      configurable: true,
      get() {
        if (this !== body.canonical) return undefined;
        inheritedReads += 1;
        return () => ["custom side"];
      },
    });
    projected = buildRule(body, head, []);
  } finally {
    if (previous)
      Object.defineProperty(Array.prototype, "toStructuralTuple", previous);
    else delete Array.prototype.toStructuralTuple;
  }

  expect(inheritedReads).toBe(4);
  expect(projected.toStructuralTuple()[1]).toEqual(["custom side"]);
  expect(JSON.parse(projected.structuralKeyWithoutAnnotations())[1]).toEqual([
    "custom side",
  ]);
  expect(buildRule(body, head, []).toStructuralTuple()[1]).toBe(
    first.toStructuralTuple()[1],
  );
});

test("a warm projection still honors an inherited array map getter", () => {
  const { prepareSide, buildRule } = createSwrlRdfRuleBuilder();
  const body = prepareSide([atom("Animal")]);
  const head = prepareSide([]);
  const first = buildRule(body, head, []);
  const original = Object.getOwnPropertyDescriptor(Array.prototype, "map");
  let reads = 0;
  let projected;
  try {
    Object.defineProperty(Array.prototype, "map", {
      configurable: true,
      get() {
        if (this === body.canonical) reads += 1;
        return original.value;
      },
    });
    projected = buildRule(body, head, []);
  } finally {
    Object.defineProperty(Array.prototype, "map", original);
  }

  expect(reads).toBe(2);
  expect(projected.toStructuralTuple()).toEqual(first.toStructuralTuple());
});
