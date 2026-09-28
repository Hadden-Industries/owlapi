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
});
