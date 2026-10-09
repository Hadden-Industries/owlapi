import { IRI, OWLDataFactory, OWLOntology } from "../model/index.js";
import { EntitySearcher } from "./entitySearcher.js";

const factory = new OWLDataFactory();
const a = factory.getOWLClass(IRI.create("urn:rc2:A"));
const b = factory.getOWLClass(IRI.create("urn:rc2:B"));

test("search preserves annotation variants and repeated ontology-stream multiplicity", () => {
  const annotation = factory.getOWLAnnotation(
    factory.getRDFSLabel(),
    factory.getOWLLiteral("note"),
  );
  const plain = factory.getOWLSubClassOfAxiom(a, b);
  const annotated = factory.getOWLSubClassOfAxiom(a, b, [annotation]);
  const ontology = new OWLOntology({ axioms: [plain, annotated] });
  expect(EntitySearcher.getSuperClasses(a, ontology)).toEqual([b, b]);
  expect(EntitySearcher.getSuperClasses(a, [ontology, ontology])).toEqual([
    b,
    b,
    b,
    b,
  ]);
  expect(EntitySearcher.getSubClasses(a, ontology)).toEqual([]);
  const result = EntitySearcher.getSuperClasses(a, ontology);
  result.length = 0;
  expect(EntitySearcher.getSuperClasses(a, ontology)).toHaveLength(2);
  expect(() => EntitySearcher.getSuperClasses(a.iri, ontology)).toThrow(
    TypeError,
  );
  expect(() => EntitySearcher.getSuperClasses(a, [ontology, {}])).toThrow(
    TypeError,
  );
});

test("annotation objects exclude assertion annotations while getAnnotations retains them as separate results", () => {
  const label = factory.getRDFSLabel();
  const comment = factory.getOWLAnnotationProperty(
    IRI.create("http://www.w3.org/2000/01/rdf-schema#comment"),
  );
  const nested = factory.getOWLAnnotation(
    comment,
    factory.getOWLLiteral("nested"),
  );
  const value = factory.getOWLLiteral("A", "en");
  const assertion = factory.getOWLAnnotationAssertionAxiom(
    label,
    a.iri,
    value,
    [nested],
  );
  const ontology = new OWLOntology({ axioms: [assertion] });
  expect(EntitySearcher.getAnnotationAssertionAxioms(a, ontology)).toEqual([
    assertion,
  ]);
  expect(EntitySearcher.getAnnotationObjects(a, ontology)).toEqual([
    factory.getOWLAnnotation(label, value),
  ]);
  expect(new Set(EntitySearcher.getAnnotations(a, ontology))).toEqual(
    new Set([nested, factory.getOWLAnnotation(label, value)]),
  );
  expect(
    EntitySearcher.getAnnotations(a, [ontology, ontology], label),
  ).toHaveLength(2);
  expect(
    EntitySearcher.getAnnotationObjects(a.iri, [ontology, ontology], null),
  ).toHaveLength(2);
  expect(() =>
    EntitySearcher.getAnnotationAssertionAxioms(a, [ontology]),
  ).toThrow(TypeError);
  expect(() => EntitySearcher.getAnnotations(a, [ontology])).toThrow(TypeError);
});

test.each([
  [
    "Object",
    "getOWLObjectProperty",
    "getOWLObjectPropertyDomainAxiom",
    a,
    "getOWLObjectPropertyRangeAxiom",
    b,
  ],
  [
    "Data",
    "getOWLDataProperty",
    "getOWLDataPropertyDomainAxiom",
    a,
    "getOWLDataPropertyRangeAxiom",
    factory.getOWLDatatype(
      IRI.create("http://www.w3.org/2000/01/rdf-schema#Literal"),
    ),
  ],
  [
    "Annotation",
    "getOWLAnnotationProperty",
    "getOWLAnnotationPropertyDomainAxiom",
    a.iri,
    "getOWLAnnotationPropertyRangeAxiom",
    b.iri,
  ],
])(
  "property queries dispatch %s positions and preserve stream multiplicity",
  (family, create, domain, domainValue, range, rangeValue) => {
    const p = factory[create](IRI.create("urn:rc2:p"));
    const q = factory[create](IRI.create("urn:rc2:q"));
    const ontology = new OWLOntology({
      axioms: [
        factory[`getOWLSub${family}PropertyOfAxiom`](p, q),
        factory[domain](p, domainValue),
        factory[range](p, rangeValue),
      ],
    });
    expect(EntitySearcher.getSuperProperties(p, [ontology, ontology])).toEqual([
      q,
      q,
    ]);
    expect(EntitySearcher.getSubProperties(q, ontology)).toEqual([p]);
    expect(EntitySearcher.getDomains(p, ontology)).toEqual([domainValue]);
    expect(EntitySearcher.getRanges(p, ontology)).toEqual([rangeValue]);
    expect(EntitySearcher.getDomains(q, ontology)).toEqual([]);
    expect(() => EntitySearcher.getDomains(a, ontology)).toThrow(TypeError);
  },
);

test.each([
  "Functional",
  "InverseFunctional",
  "Transitive",
  "Symmetric",
  "Asymmetric",
  "Reflexive",
  "Irreflexive",
])("%s search finds only direct property positions", (characteristic) => {
  const p = factory.getOWLObjectProperty(IRI.create("urn:rc2:p"));
  const q = factory.getOWLObjectProperty(IRI.create("urn:rc2:q"));
  const ontology = new OWLOntology({
    axioms: [factory[`getOWL${characteristic}ObjectPropertyAxiom`](p)],
  });
  const empty = new OWLOntology();
  expect(EntitySearcher[`is${characteristic}`](p, [empty, ontology])).toBe(
    true,
  );
  expect(EntitySearcher[`is${characteristic}`](q, ontology)).toBe(false);
});

test("inverse queries exclude self and data functional overload uses its own family", () => {
  const p = factory.getOWLObjectProperty(IRI.create("urn:rc2:p"));
  const q = factory.getOWLObjectProperty(IRI.create("urn:rc2:q"));
  const data = factory.getOWLDataProperty(p.iri);
  const ontology = new OWLOntology({
    axioms: [
      factory.getOWLInverseObjectPropertiesAxiom(p, q),
      factory.getOWLFunctionalDataPropertyAxiom(data),
    ],
  });
  expect(EntitySearcher.getInverses(q, ontology)).toEqual([p]);
  expect(EntitySearcher.isFunctional(p, ontology)).toBe(false);
  expect(EntitySearcher.isFunctional(data, ontology)).toBe(true);
});
