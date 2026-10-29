import { jest } from "@jest/globals";
import {
  IRI,
  OWLDataFactory,
  OWLObjectKind,
  OWLOntology,
  OWLStructuralObject,
} from "../../model/index.js";

import {
  compareOntologies,
  OntologyStructuralComparisonLimitError,
} from "./ontologyStructuralIsomorphism.js";

const dataFactory = new OWLDataFactory();

test("late-loaded comparison does not bless an earlier structural-key override", async () => {
  await jest.isolateModulesAsync(async () => {
    const { OWLStructuralObject: Structural, IRI: NativeIRI } =
      await import("../../model/structural.js");
    const { OWLDataFactory: Factory } =
      await import("../../model/owlDataFactory.js");
    const { OWLOntology: Ontology } =
      await import("../../model/owlOntology.js");
    const factory = new Factory();
    const make = (iri) =>
      new Ontology({
        axioms: [
          factory.getOWLDeclarationAxiom(
            factory.getOWLClass(NativeIRI.create(iri)),
          ),
        ],
      });
    const left = make("urn:late-comparison:left");
    const right = make("urn:late-comparison:right");
    const original = Structural.prototype.structuralKey;
    try {
      Structural.prototype.structuralKey = () => "patched-key";
      const { compareOntologies: compare } =
        await import("./ontologyStructuralIsomorphism.js");
      expect(compare(left, right).equal).toBe(false);
    } finally {
      Structural.prototype.structuralKey = original;
    }
  });
});

test("declaration construction retains foreign entity tuple conversion order", () => {
  let calls = 0;
  const entity = Object.freeze({
    kind: OWLObjectKind.CLASS,
    iri: IRI.create("urn:foreign:stateful"),
    structuralKey: () => "foreign:entity",
    toStructuralTuple: () => [OWLObjectKind.CLASS, ++calls],
  });
  const declaration = dataFactory.getOWLDeclarationAxiom(entity);
  expect(calls).toBe(2);
  expect(declaration.toStructuralTuple()).toEqual([
    OWLObjectKind.DECLARATION_AXIOM,
    [OWLObjectKind.CLASS, 1],
    [],
  ]);
  expect(JSON.parse(declaration.structuralKeyWithoutAnnotations())).toEqual([
    OWLObjectKind.DECLARATION_AXIOM,
    [OWLObjectKind.CLASS, 2],
  ]);
});

test("declaration construction retains the array tuple protocol and its comparison fallback", () => {
  const previous = Object.getOwnPropertyDescriptor(
    Array.prototype,
    "toStructuralTuple",
  );
  let declaration;
  try {
    Object.defineProperty(Array.prototype, "toStructuralTuple", {
      configurable: true,
      value() {
        return ["array-protocol"];
      },
    });
    declaration = dataFactory.getOWLDeclarationAxiom(
      dataFactory.getOWLClass(IRI.create("urn:array:protocol")),
    );
  } finally {
    if (previous)
      Object.defineProperty(Array.prototype, "toStructuralTuple", previous);
    else delete Array.prototype.toStructuralTuple;
  }
  expect(declaration.toStructuralTuple().at(-1)).toEqual(["array-protocol"]);
  const ordinary = dataFactory.getOWLDeclarationAxiom(declaration.entity);
  expect(
    compareOntologies(
      new OWLOntology({ axioms: [declaration] }),
      new OWLOntology({ axioms: [ordinary] }),
    ).equal,
  ).toBe(false);
});
const objectProperty = dataFactory.getOWLObjectProperty(
  IRI.create("urn:ontology-isomorphism:related"),
);
const dataProperty = dataFactory.getOWLDataProperty(
  IRI.create("urn:ontology-isomorphism:value"),
);
const annotationProperty = dataFactory.getOWLAnnotationProperty(
  IRI.create("urn:ontology-isomorphism:note"),
);
const owlClass = dataFactory.getOWLClass(
  IRI.create("urn:ontology-isomorphism:Class"),
);

const ontology = ({
  annotations = [],
  axioms = [],
  imports = [],
  ontologyID = dataFactory.getOWLOntologyID(),
} = {}) =>
  new OWLOntology({
    annotations,
    axioms,
    imports,
    ontologyID,
  });

const anonymousIndividual = (nodeID, documentScope) =>
  dataFactory.getOWLAnonymousIndividual(nodeID, documentScope);

const objectAssertion = (subject, value, annotations = []) =>
  dataFactory.getOWLObjectPropertyAssertionAxiom(
    objectProperty,
    subject,
    value,
    annotations,
  );

const expectMismatch = (result, category, path) => {
  expect(result).toEqual({
    equal: false,
    mismatch: {
      category,
      path,
    },
  });
};

const directedCycleAxioms = (prefix, documentScope, size) => {
  const individuals = Array.from({ length: size }, (_, index) =>
    anonymousIndividual(`${prefix}-${index}`, documentScope),
  );
  return individuals.map((individual, index) =>
    objectAssertion(individual, individuals[(index + 1) % individuals.length]),
  );
};

describe("ontology structural isomorphism", () => {
  it("accepts renamed anonymous individuals across nested expressions, annotations, and axiom order", () => {
    const leftA = anonymousIndividual("_:left-a", "left-document");
    const leftB = anonymousIndividual("_:left-b", "left-document");
    const rightX = anonymousIndividual("_:right-x", "right-document");
    const rightY = anonymousIndividual("_:right-y", "right-document");
    const nestedAxiom = (first, second) =>
      dataFactory.getOWLClassAssertionAxiom(
        dataFactory.getOWLObjectHasValue(objectProperty, first),
        second,
        [
          dataFactory.getOWLAnnotation(annotationProperty, first, [
            dataFactory.getOWLAnnotation(annotationProperty, second),
          ]),
        ],
      );
    const sameIndividuals = (first, second) =>
      dataFactory.getOWLSameIndividualAxiom([first, second]);

    const left = ontology({
      annotations: [dataFactory.getOWLAnnotation(annotationProperty, leftA)],
      axioms: [
        objectAssertion(leftA, leftB),
        nestedAxiom(leftA, leftB),
        sameIndividuals(leftA, leftB),
      ],
    });
    const right = ontology({
      annotations: [dataFactory.getOWLAnnotation(annotationProperty, rightX)],
      axioms: [
        sameIndividuals(rightY, rightX),
        nestedAxiom(rightX, rightY),
        objectAssertion(rightX, rightY),
      ],
    });

    expect(compareOntologies(left, right)).toEqual({
      equal: true,
      mismatch: null,
    });
  });

  it("rejects a many-to-one anonymous-individual mapping", () => {
    const leftA = anonymousIndividual("_:left-a", "left");
    const leftB = anonymousIndividual("_:left-b", "left");
    const right = anonymousIndividual("_:right", "right");

    expectMismatch(
      compareOntologies(
        ontology({ axioms: [objectAssertion(leftA, leftB)] }),
        ontology({ axioms: [objectAssertion(right, right)] }),
      ),
      "AXIOMS",
      ["axioms", OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM],
    );
  });

  it("rejects a one-to-many anonymous-individual mapping", () => {
    const left = anonymousIndividual("_:left", "left");
    const rightA = anonymousIndividual("_:right-a", "right");
    const rightB = anonymousIndividual("_:right-b", "right");

    expectMismatch(
      compareOntologies(
        ontology({ axioms: [objectAssertion(left, left)] }),
        ontology({ axioms: [objectAssertion(rightA, rightB)] }),
      ),
      "AXIOMS",
      ["axioms", OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM],
    );
  });

  it("standardizes apart two source scopes that reuse one node label", () => {
    const leftA = anonymousIndividual("_:same", "left-source-a");
    const leftB = anonymousIndividual("_:same", "left-source-b");
    const rightA = anonymousIndividual("_:renamed", "right-source-a");
    const rightB = anonymousIndividual("_:renamed", "right-source-b");

    expect(
      compareOntologies(
        ontology({ axioms: [objectAssertion(leftA, leftB)] }),
        ontology({ axioms: [objectAssertion(rightA, rightB)] }),
      ),
    ).toEqual({ equal: true, mismatch: null });
  });

  it("uses one anonymous-individual bijection across ontology annotations and axioms", () => {
    const left = anonymousIndividual("_:left", "left");
    const rightAnnotationValue = anonymousIndividual(
      "_:right-annotation",
      "right",
    );
    const rightAxiomValue = anonymousIndividual("_:right-axiom", "right");

    expectMismatch(
      compareOntologies(
        ontology({
          annotations: [dataFactory.getOWLAnnotation(annotationProperty, left)],
          axioms: [dataFactory.getOWLClassAssertionAxiom(owlClass, left)],
        }),
        ontology({
          annotations: [
            dataFactory.getOWLAnnotation(
              annotationProperty,
              rightAnnotationValue,
            ),
          ],
          axioms: [
            dataFactory.getOWLClassAssertionAxiom(owlClass, rightAxiomValue),
          ],
        }),
      ),
      "AXIOMS",
      ["axioms", OWLObjectKind.CLASS_ASSERTION_AXIOM],
    );
  });

  it("omits an axiom kind when a cross-kind anonymous mapping conflict has no single culprit", () => {
    const exactlyEqualAxiom = dataFactory.getOWLAnnotationPropertyDomainAxiom(
      annotationProperty,
      IRI.create("urn:ontology-isomorphism:domain"),
    );
    const left = anonymousIndividual("_:left", "left");
    const rightClassIndividual = anonymousIndividual("_:right-class", "right");
    const rightAssertionIndividual = anonymousIndividual(
      "_:right-assertion",
      "right",
    );

    expectMismatch(
      compareOntologies(
        ontology({
          axioms: [
            exactlyEqualAxiom,
            dataFactory.getOWLClassAssertionAxiom(owlClass, left),
            objectAssertion(left, left),
          ],
        }),
        ontology({
          axioms: [
            exactlyEqualAxiom,
            dataFactory.getOWLClassAssertionAxiom(
              owlClass,
              rightClassIndividual,
            ),
            objectAssertion(rightAssertionIndividual, rightAssertionIndividual),
          ],
        }),
      ),
      "AXIOMS",
      ["axioms"],
    );
  });

  it.each([
    [
      "lexical form",
      dataFactory.getOWLLiteral("left"),
      dataFactory.getOWLLiteral("right"),
    ],
    [
      "language tag",
      dataFactory.getOWLLiteral("colour", "en"),
      dataFactory.getOWLLiteral("colour", "fr"),
    ],
    [
      "datatype",
      dataFactory.getOWLLiteral(
        "1",
        dataFactory.getOWLDatatype(
          IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
        ),
      ),
      dataFactory.getOWLLiteral(
        "1",
        dataFactory.getOWLDatatype(
          IRI.create("http://www.w3.org/2001/XMLSchema#decimal"),
        ),
      ),
    ],
  ])("preserves a literal's %s", (_label, leftLiteral, rightLiteral) => {
    const leftIndividual = anonymousIndividual("_:left", "left");
    const rightIndividual = anonymousIndividual("_:right", "right");
    const assertion = (individual, literal) =>
      dataFactory.getOWLDataPropertyAssertionAxiom(
        dataProperty,
        individual,
        literal,
      );

    expectMismatch(
      compareOntologies(
        ontology({ axioms: [assertion(leftIndividual, leftLiteral)] }),
        ontology({ axioms: [assertion(rightIndividual, rightLiteral)] }),
      ),
      "AXIOMS",
      ["axioms", OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM],
    );
  });

  it("compares named ontology and version IRIs exactly but ignores anonymous ontology tokens", () => {
    expect(compareOntologies(ontology(), ontology())).toEqual({
      equal: true,
      mismatch: null,
    });

    const ontologyIRI = IRI.create("urn:ontology-isomorphism:ontology");
    const left = ontology({
      ontologyID: dataFactory.getOWLOntologyID(
        ontologyIRI,
        IRI.create("urn:ontology-isomorphism:version:left"),
      ),
    });
    const right = ontology({
      ontologyID: dataFactory.getOWLOntologyID(
        ontologyIRI,
        IRI.create("urn:ontology-isomorphism:version:right"),
      ),
    });

    expectMismatch(compareOntologies(left, right), "ONTOLOGY_ID", [
      "ontologyID",
      "versionIRI",
    ]);
  });

  it("reports stable import and ontology-annotation mismatch paths", () => {
    const importIRI = IRI.create("urn:ontology-isomorphism:import");
    const differentImportIRI = IRI.create(
      "urn:ontology-isomorphism:different-import",
    );
    expectMismatch(
      compareOntologies(
        ontology({
          imports: [dataFactory.getOWLImportsDeclaration(importIRI)],
        }),
        ontology({
          imports: [dataFactory.getOWLImportsDeclaration(differentImportIRI)],
        }),
      ),
      "IMPORTS",
      ["imports", OWLObjectKind.IMPORTS_DECLARATION],
    );

    expectMismatch(
      compareOntologies(
        ontology({
          annotations: [
            dataFactory.getOWLAnnotation(
              annotationProperty,
              dataFactory.getOWLLiteral("left"),
            ),
          ],
        }),
        ontology({
          annotations: [
            dataFactory.getOWLAnnotation(
              annotationProperty,
              dataFactory.getOWLLiteral("right"),
            ),
          ],
        }),
      ),
      "ONTOLOGY_ANNOTATIONS",
      ["annotations", OWLObjectKind.ANNOTATION],
    );
  });

  it("honours explicit component exclusions without weakening enabled comparisons", () => {
    const left = ontology({
      annotations: [
        dataFactory.getOWLAnnotation(
          annotationProperty,
          dataFactory.getOWLLiteral("left"),
        ),
      ],
      axioms: [dataFactory.getOWLDeclarationAxiom(owlClass)],
      imports: [
        dataFactory.getOWLImportsDeclaration(
          IRI.create("urn:ontology-isomorphism:import:left"),
        ),
      ],
      ontologyID: dataFactory.getOWLOntologyID(
        IRI.create("urn:ontology-isomorphism:id:left"),
      ),
    });
    const right = ontology({
      annotations: [
        dataFactory.getOWLAnnotation(
          annotationProperty,
          dataFactory.getOWLLiteral("right"),
        ),
      ],
      axioms: [],
      imports: [
        dataFactory.getOWLImportsDeclaration(
          IRI.create("urn:ontology-isomorphism:import:right"),
        ),
      ],
      ontologyID: dataFactory.getOWLOntologyID(
        IRI.create("urn:ontology-isomorphism:id:right"),
      ),
    });

    expect(
      compareOntologies(left, right, {
        compareAnnotations: false,
        compareAxioms: false,
        compareImports: false,
        compareOntologyID: false,
      }),
    ).toEqual({ equal: true, mismatch: null });
    expectMismatch(
      compareOntologies(left, right, {
        compareAnnotations: false,
        compareAxioms: true,
        compareImports: false,
        compareOntologyID: false,
      }),
      "AXIOMS",
      ["axioms", OWLObjectKind.DECLARATION_AXIOM],
    );
  });

  it("handles an adversarial symmetric cycle within a bounded search budget", () => {
    const leftAxioms = directedCycleAxioms("left", "left-document", 8);
    const rightAxioms = directedCycleAxioms("right", "right-document", 8);

    expect(
      compareOntologies(
        ontology({ axioms: leftAxioms }),
        ontology({ axioms: [...rightAxioms].reverse() }),
        { maximumSearchStates: 256 },
      ),
    ).toEqual({ equal: true, mismatch: null });
  });

  it("fingerprints positional anonymous-individual alias patterns before backtracking", () => {
    const positionalAliasPatternCount = 200;
    const annotationProperties = Array.from({ length: 12 }, (_, index) =>
      dataFactory.getOWLAnnotationProperty(
        IRI.create(`urn:ontology-isomorphism:alias-position:${index}`),
      ),
    );
    const collectAnonymousEqualityPairings = (
      unpairedPositions,
      completedPairs = [],
      pairings = [],
    ) => {
      if (pairings.length === positionalAliasPatternCount) {
        return pairings;
      }
      if (unpairedPositions.length === 0) {
        pairings.push(completedPairs);
        return pairings;
      }
      const [firstPosition, ...remainingPositions] = unpairedPositions;
      for (
        let partnerIndex = 0;
        partnerIndex < remainingPositions.length &&
        pairings.length < positionalAliasPatternCount;
        partnerIndex += 1
      ) {
        collectAnonymousEqualityPairings(
          remainingPositions.filter((_, index) => index !== partnerIndex),
          [
            ...completedPairs,
            [firstPosition, remainingPositions[partnerIndex]],
          ],
          pairings,
        );
      }
      return pairings;
    };
    const positionalAliasPatterns = collectAnonymousEqualityPairings(
      annotationProperties.map((_, index) => index),
    );
    const annotatedDeclarations = (side) =>
      positionalAliasPatterns.map((positionPairs, axiomIndex) => {
        const anonymousValueByPosition = new Map();
        positionPairs.forEach((positions, pairIndex) => {
          const anonymousValue = anonymousIndividual(
            `${side}-${axiomIndex}-${pairIndex}`,
            `${side}-document-${axiomIndex}`,
          );
          positions.forEach((position) =>
            anonymousValueByPosition.set(position, anonymousValue),
          );
        });
        return dataFactory.getOWLDeclarationAxiom(
          owlClass,
          annotationProperties.map((property, position) =>
            dataFactory.getOWLAnnotation(
              property,
              anonymousValueByPosition.get(position),
            ),
          ),
        );
      });

    expect(
      compareOntologies(
        ontology({ axioms: annotatedDeclarations("left") }),
        ontology({ axioms: annotatedDeclarations("right").reverse() }),
        { maximumSearchStates: 3_000 },
      ),
    ).toEqual({ equal: true, mismatch: null });
  });

  it("compares large singleton fingerprint collections without exhausting the call stack", () => {
    const declarations = Array.from({ length: 1_250 }, (_, index) =>
      dataFactory.getOWLDeclarationAxiom(
        dataFactory.getOWLClass(
          IRI.create(`urn:ontology-isomorphism:declaration:${index}`),
        ),
      ),
    );

    expect(
      compareOntologies(
        ontology({ axioms: declarations }),
        ontology({ axioms: [...declarations].reverse() }),
        { maximumSearchStates: 2_000 },
      ),
    ).toEqual({ equal: true, mismatch: null });
  });

  it("compares a large same-fingerprint collection without exhausting the call stack", () => {
    const assertions = (prefix, scope) =>
      Array.from({ length: 700 }, (_, index) =>
        dataFactory.getOWLClassAssertionAxiom(
          owlClass,
          anonymousIndividual(`${prefix}-${index}`, scope),
        ),
      );

    expect(
      compareOntologies(
        ontology({ axioms: assertions("left", "left-document") }),
        ontology({ axioms: assertions("right", "right-document") }),
        { maximumSearchStates: 1_000 },
      ),
    ).toEqual({ equal: true, mismatch: null });
  });

  it("uses canonical structural semantics for signed-zero cardinalities", () => {
    const left = anonymousIndividual("_:left", "left-document");
    const right = anonymousIndividual("_:right", "right-document");
    const cardinalityAxiom = (cardinality, individual) =>
      dataFactory.getOWLSubClassOfAxiom(
        owlClass,
        dataFactory.getOWLObjectMinCardinality(
          cardinality,
          objectProperty,
          dataFactory.getOWLObjectOneOf([individual]),
        ),
      );

    expect(
      compareOntologies(
        ontology({ axioms: [cardinalityAxiom(-0, left)] }),
        ontology({ axioms: [cardinalityAxiom(0, right)] }),
      ),
    ).toEqual({ equal: true, mismatch: null });
  });

  it("fails predictably when the structural comparison search budget is exhausted", () => {
    const leftAxioms = directedCycleAxioms("left", "left-document", 4);
    const rightAxioms = directedCycleAxioms("right", "right-document", 4);

    expect(() =>
      compareOntologies(
        ontology({ axioms: leftAxioms }),
        ontology({ axioms: rightAxioms }),
        { maximumSearchStates: 1 },
      ),
    ).toThrow(OntologyStructuralComparisonLimitError);
    try {
      compareOntologies(
        ontology({ axioms: leftAxioms }),
        ontology({ axioms: rightAxioms }),
        { maximumSearchStates: 1 },
      );
    } catch (error) {
      expect(error).toMatchObject({
        code: "ONTOLOGY_STRUCTURAL_COMPARISON_LIMIT_EXCEEDED",
        maximumSearchStates: 1,
        searchStatesExamined: 2,
      });
    }
  });

  it("rejects invalid ontology values and comparison options", () => {
    expect(() => compareOntologies({}, ontology())).toThrow(
      /left must be an OWLOntology/u,
    );
    expect(() =>
      compareOntologies(ontology(), ontology(), { compareAxioms: "yes" }),
    ).toThrow(/compareAxioms must be a boolean/u);
    expect(() =>
      compareOntologies(ontology(), ontology(), { maximumSearchStates: 0 }),
    ).toThrow(/maximumSearchStates must be a positive safe integer/u);
    expect(() =>
      compareOntologies(ontology(), ontology(), { compareMetadata: true }),
    ).toThrow(/Unknown ontology comparison option compareMetadata/u);
  });

  it.each(["normative-v1", "java-owlapi-5.5.1"])(
    "%s preserves exact declaration search-state charges and zero-state mismatches",
    (behaviorProfileId) => {
      const factory = new OWLDataFactory({ behaviorProfileId });
      const declaration = (name) =>
        factory.getOWLDeclarationAxiom(
          factory.getOWLClass(IRI.create(`urn:declaration-budget:${name}`)),
        );
      const axioms = Array.from({ length: 64 }, (_, index) =>
        declaration(index),
      );
      const left = ontology({ axioms });
      const equal = ontology({ axioms: [...axioms].reverse() });
      expect(() =>
        compareOntologies(left, equal, { maximumSearchStates: 63 }),
      ).toThrow(
        expect.objectContaining({
          code: "ONTOLOGY_STRUCTURAL_COMPARISON_LIMIT_EXCEEDED",
          maximumSearchStates: 63,
          searchStatesExamined: 64,
        }),
      );
      expect(
        compareOntologies(left, equal, { maximumSearchStates: 64 }),
      ).toEqual({ equal: true, mismatch: null });
      expect(
        compareOntologies(
          left,
          ontology({ axioms: [...axioms.slice(0, 63), declaration("other")] }),
          { maximumSearchStates: 1 },
        ).equal,
      ).toBe(false);
    },
  );

  it("retains full matching and state charges for generic field/tuple disagreement", () => {
    const first = dataFactory.getOWLDeclarationAxiom(
      dataFactory.getOWLClass(IRI.create("urn:generic-ground:a")),
    );
    const entity = dataFactory.getOWLClass(IRI.create("urn:generic-ground:z"));
    const generic = new OWLStructuralObject(
      OWLObjectKind.DECLARATION_AXIOM,
      { annotations: Object.freeze([]), entity },
      ["a different stored body", []],
    );
    const left = ontology({ axioms: [first, generic] });
    const right = ontology({
      axioms: [first, dataFactory.getOWLDeclarationAxiom(entity)],
    });
    expect(() =>
      compareOntologies(left, right, { maximumSearchStates: 1 }),
    ).toThrow(
      expect.objectContaining({
        code: "ONTOLOGY_STRUCTURAL_COMPARISON_LIMIT_EXCEEDED",
        searchStatesExamined: 2,
      }),
    );
    expect(
      compareOntologies(left, right, { maximumSearchStates: 2 }).equal,
    ).toBe(false);
  });

  it.each(["kind", "iri", "annotations", "value"])(
    "compares fields introduced by an inherited %s setter",
    (field) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        OWLStructuralObject.prototype,
        field,
      );
      let intercepted;
      try {
        Object.defineProperty(OWLStructuralObject.prototype, field, {
          configurable: true,
          set(value) {
            Object.defineProperty(this, field, {
              value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
            this.injected = "extra structural field";
          },
        });
        const factory = new OWLDataFactory();
        intercepted = factory.getOWLDeclarationAxiom(
          factory.getOWLClass(IRI.create(`urn:intercepted-field:${field}`)),
        );
      } finally {
        if (descriptor)
          Object.defineProperty(
            OWLStructuralObject.prototype,
            field,
            descriptor,
          );
        else delete OWLStructuralObject.prototype[field];
      }
      const factory = new OWLDataFactory();
      const ordinary = factory.getOWLDeclarationAxiom(
        factory.getOWLClass(IRI.create(`urn:intercepted-field:${field}`)),
      );
      expect(
        compareOntologies(
          ontology({ axioms: [intercepted] }),
          ontology({ axioms: [ordinary] }),
          { maximumSearchStates: 1 },
        ).equal,
      ).toBe(false);
    },
  );
});
