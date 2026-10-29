import {
  AXIOM_KINDS,
  IRI,
  OWLDataFactory,
  OWLObjectKind,
  OWLStructuralObject,
} from "../../model/index.js";
import { StructuralAxiomSet, isLogicalAxiom } from "./axiomSemantics.js";

const setSize = (...axioms) => new StructuralAxiomSet(axioms).size;

describe("structural axiom semantics", () => {
  it("keeps incremental addition clones, parent edits and ordinary clones independent and ordered", () => {
    const factory = new OWLDataFactory();
    const axioms = Array.from({ length: 100 }, (_, index) =>
      factory.getOWLDeclarationAxiom(
        factory.getOWLClass(IRI.create("urn:append:" + index)),
      ),
    );
    const parent = new StructuralAxiomSet(axioms.slice(0, 40));
    const original = parent.toFrozenArray();
    let current = parent.cloneForAddition();
    parent.delete(axioms[0]);
    parent.add(axioms[99]);
    expect([...current]).toEqual(axioms.slice(0, 40));
    for (let index = 40; index < 90; index++) {
      const previous = current;
      current = current.cloneForAddition();
      expect(current.add(axioms[index])).toBe(true);
      expect(current.add(axioms[index])).toBe(false);
      expect([...previous]).toEqual(axioms.slice(0, index));
    }
    const sibling = current.cloneForAddition();
    expect(current.delete(axioms[5])).toBe(true);
    expect(current.add(axioms[5])).toBe(true);
    const expected = [
      ...axioms.slice(0, 90).filter((axiom) => axiom !== axioms[5]),
      axioms[5],
    ];
    expect([...current]).toEqual(expected);
    expect([...current.toSet()]).toEqual(expected);
    expect(current.toFrozenArray()).toEqual(expected);
    expect(Object.isFrozen(current.toFrozenArray())).toBe(true);
    expect([...sibling]).toEqual(axioms.slice(0, 90));
    const ordinary = current.clone();
    expect(ordinary.delete(axioms[0])).toBe(true);
    expect(current.has(axioms[0])).toBe(true);
    expect(original).toEqual(axioms.slice(0, 40));
    expect([...parent]).toEqual([...axioms.slice(1, 40), axioms[99]]);
  });
  const dataFactory = new OWLDataFactory();
  const classA = dataFactory.getOWLClass(IRI.create("urn:axiom-semantics:A"));
  const classB = dataFactory.getOWLClass(IRI.create("urn:axiom-semantics:B"));
  const annotationProperty = dataFactory.getRDFSLabel();
  const nestedAnnotationProperty = dataFactory.getOWLAnnotationProperty(
    IRI.create("urn:axiom-semantics:nested"),
  );

  it("coalesces separately allocated structurally equal axioms", () => {
    const first = dataFactory.getOWLSubClassOfAxiom(classA, classB);
    const second = dataFactory.getOWLSubClassOfAxiom(classA, classB);
    const axioms = new StructuralAxiomSet([first, second]);

    expect(axioms.size).toBe(1);
    expect(axioms.toSet()).toEqual(new Set([first]));
    expect(axioms.has(second)).toBe(true);
  });

  it("keeps axioms with different nested annotations distinct", () => {
    const annotatedAxiom = (nestedValue) => {
      const nestedAnnotation = dataFactory.getOWLAnnotation(
        nestedAnnotationProperty,
        dataFactory.getOWLLiteral(nestedValue),
      );
      const outerAnnotation = dataFactory.getOWLAnnotation(
        annotationProperty,
        dataFactory.getOWLLiteral("outer"),
        [nestedAnnotation],
      );
      return dataFactory.getOWLSubClassOfAxiom(classA, classB, [
        outerAnnotation,
      ]);
    };

    expect(setSize(annotatedAxiom("first"), annotatedAxiom("second"))).toBe(2);
  });

  it("keeps different literal lexical forms, language tags, and datatypes distinct", () => {
    const assertion = (literal) =>
      dataFactory.getOWLAnnotationAssertionAxiom(
        annotationProperty,
        IRI.create("urn:axiom-semantics:subject"),
        literal,
      );
    const integerDatatype = dataFactory.getOWLDatatype(
      IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
    );
    const decimalDatatype = dataFactory.getOWLDatatype(
      IRI.create("http://www.w3.org/2001/XMLSchema#decimal"),
    );

    expect(
      setSize(
        assertion(dataFactory.getOWLLiteral("first")),
        assertion(dataFactory.getOWLLiteral("second")),
      ),
    ).toBe(2);
    expect(
      setSize(
        assertion(dataFactory.getOWLLiteral("colour", "en")),
        assertion(dataFactory.getOWLLiteral("colour", "fr")),
      ),
    ).toBe(2);
    expect(
      setSize(
        assertion(dataFactory.getOWLLiteral("1", integerDatatype)),
        assertion(dataFactory.getOWLLiteral("1", decimalDatatype)),
      ),
    ).toBe(2);
  });

  it("keeps anonymous individuals from different document scopes distinct", () => {
    const assertion = (scope) =>
      dataFactory.getOWLClassAssertionAxiom(
        classA,
        dataFactory.getOWLAnonymousIndividual("individual", scope),
      );

    expect(setSize(assertion("document-a"), assertion("document-b"))).toBe(2);
  });

  it("classifies every supported axiom kind exactly as pinned AxiomType.isLogical", () => {
    const nonLogicalKinds = new Set([
      OWLObjectKind.DECLARATION_AXIOM,
      OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
      OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM,
      OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
      OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM,
    ]);
    const observed = new Map(
      AXIOM_KINDS.map((kind) => {
        const axiom = new OWLStructuralObject(kind, {}, []);
        return [kind, isLogicalAxiom(axiom)];
      }),
    );

    expect(observed.size).toBe(AXIOM_KINDS.length);
    expect(
      new Set(
        [...observed].filter(([, logical]) => !logical).map(([kind]) => kind),
      ),
    ).toEqual(nonLogicalKinds);
    for (const kind of AXIOM_KINDS) {
      expect(observed.get(kind)).toBe(!nonLogicalKinds.has(kind));
    }
  });

  it("rejects non-axiom structural objects", () => {
    const notAnAxiom = dataFactory.getOWLClass(
      IRI.create("urn:axiom-semantics:not-an-axiom"),
    );

    expect(() => new StructuralAxiomSet([notAnAxiom])).toThrow(TypeError);
    expect(() => isLogicalAxiom(notAnAxiom)).toThrow(TypeError);
  });

  it("keeps the exact tuple body separate from a generic annotation-free representation", () => {
    const kind = OWLObjectKind.DECLARATION_AXIOM;
    const axiom = new OWLStructuralObject(
      kind,
      { entity: classA, annotations: Object.freeze([]) },
      ["full tuple body", []],
      { componentsWithoutAnnotations: ["independent comparison body"] },
    );
    const annotation = dataFactory.getOWLAnnotation(
      annotationProperty,
      dataFactory.getOWLLiteral("copied"),
    );
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const annotated = axiom.getAnnotatedAxiom([annotation]);
      const stripped = annotated.getAxiomWithoutAnnotations();
      expect(annotated.toStructuralTuple()).toEqual([
        kind,
        "full tuple body",
        [annotation.toStructuralTuple()],
      ]);
      expect(stripped.toStructuralTuple()).toEqual([
        kind,
        "full tuple body",
        [],
      ]);
      // json-identity-contract: ordered-tuple; owner: axiom semantics tests; reason: Pin the exact legacy structural-key bytes for this ordered comparison tuple.
      expect(stripped.structuralKeyWithoutAnnotations()).toBe(
        JSON.stringify([kind, "independent comparison body"]),
      );
      expect(stripped.equalsIgnoreAnnotations(axiom)).toBe(true);
      expect(Reflect.ownKeys(stripped)).toEqual(Reflect.ownKeys(axiom));
      expect(Object.isFrozen(stripped)).toBe(true);
      expect(stripped).not.toBe(axiom);
    }
  });

  it("preserves generic tuple serialization failures before annotation copying", () => {
    const cyclic = {};
    cyclic.self = cyclic;
    for (const body of [1n, cyclic]) {
      const axiom = new OWLStructuralObject(
        OWLObjectKind.DECLARATION_AXIOM,
        { entity: classA, annotations: Object.freeze([]) },
        [body, []],
      );
      expect(() => axiom.getAnnotatedAxiom([])).toThrow(TypeError);
      expect(() => axiom.getAxiomWithoutAnnotations()).toThrow(TypeError);
    }
  });
});
