import {
  IRI,
  OWLDataFactory,
  OWLOntology,
  OWLOntologyManager,
  OWLObjectKind,
  AddImport,
} from "./index.js";
import { Imports } from "./parameters/index.js";
import { StringDocumentSource } from "../io/index.js";

const factory = new OWLDataFactory();
const a = factory.getOWLClass(IRI.create("urn:rc2:A"));
const b = factory.getOWLClass(IRI.create("urn:rc2:B"));
const label = factory.getOWLAnnotation(
  factory.getRDFSLabel(),
  factory.getOWLLiteral("A", "en"),
);

describe("accepted rc.2 direct queries and axiom copies", () => {
  it("deduplicates diamond and cycle closures structurally and observes later edits", () => {
    const manager = new OWLOntologyManager();
    const members = ["A", "B", "C", "D"].map((name) =>
      manager.createOntology(
        factory.getOWLOntologyID(IRI.create(`urn:diamond:${name}`)),
      ),
    );
    for (const [from, to] of [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
      [3, 0],
    ])
      manager.applyChanges([
        new AddImport(
          members[from],
          factory.getOWLImportsDeclaration(
            members[to].getOntologyID().ontologyIRI,
          ),
        ),
      ]);
    const shared = factory.getOWLSubClassOfAxiom(a, b);
    manager.addAxiom(members[1], shared);
    manager.addAxiom(
      members[2],
      new OWLDataFactory().getOWLSubClassOfAxiom(a, b),
    );
    const c = factory.getOWLClass(IRI.create("urn:diamond:C"));
    const last = factory.getOWLSubClassOfAxiom(b, c);
    manager.addAxiom(members[3], last);
    const before = members[0].getSignature(Imports.INCLUDED);
    expect(members[0].getAxiomCount(Imports.INCLUDED)).toBe(3);
    expect(members[0].getClassesInSignature(Imports.INCLUDED)).toEqual(
      new Set([a, b, c]),
    );
    expect(members[0].getReferencingAxioms(b, Imports.INCLUDED).size).toBe(2);
    expect(members[0].getSubClassAxiomsForSubClass(a).size).toBe(0);
    manager.removeAxiom(members[3], last);
    expect(members[0].getAxiomCount(Imports.INCLUDED)).toBe(2);
    expect(members[0].getSignature(Imports.INCLUDED)).toEqual(new Set([a, b]));
    expect(before.has(c)).toBe(true);
  });
  it("reads current loaded closure state without acquiring imports or conflating punned entities", async () => {
    let acquisition = 0;
    const manager = new OWLOntologyManager({
      documentLoader: {
        async load() {
          acquisition++;
          throw new Error("unexpected acquisition");
        },
      },
    });
    const imported = manager.createOntology(
      factory.getOWLOntologyID(IRI.create("urn:rc2:import")),
    );
    const c = factory.getOWLClass(IRI.create("urn:rc2:C"));
    const importedAxiom = factory.getOWLSubClassOfAxiom(b, c);
    manager.addAxiom(imported, importedAxiom);
    const root = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        "Ontology(<urn:rc2:root> Import(<urn:rc2:import>) Declaration(Class(<urn:rc2:A>)))",
      ),
    );
    expect(root.getAxiomCount()).toBe(1);
    expect(root.getAxiomCount(Imports.INCLUDED)).toBe(2);
    expect(root.getClassesInSignature()).toEqual(new Set([a]));
    expect(root.getClassesInSignature(Imports.INCLUDED)).toEqual(
      new Set([a, b, c]),
    );
    expect(root.containsAxiom(importedAxiom)).toBe(false);
    expect(root.containsAxiom(importedAxiom, Imports.INCLUDED)).toBe(true);
    const previous = root.getSignature(Imports.INCLUDED);
    const punned = factory.getOWLNamedIndividual(c.iri);
    manager.addAxiom(imported, factory.getOWLDeclarationAxiom(punned));
    expect(root.getPunnedIRIs(Imports.INCLUDED)).toEqual(new Set([c.iri]));
    expect(root.getEntitiesInSignature(c.iri, Imports.INCLUDED)).toEqual(
      new Set([c, punned]),
    );
    expect(root.containsEntityInSignature(punned)).toBe(false);
    expect(root.containsEntityInSignature(punned, Imports.INCLUDED)).toBe(true);
    expect(previous.has(punned)).toBe(false);
    expect(acquisition).toBe(0);
  });

  it("distinguishes canonical primitive references from coincidental literal text", () => {
    const plain = factory.getOWLSubClassOfAxiom(a, b);
    const annotated = factory.getOWLSubClassOfAxiom(a, b, [label]);
    const declaration = factory.getOWLDeclarationAxiom(a);
    const ontology = new OWLOntology({
      axioms: [plain, annotated, declaration],
    });
    expect(ontology.getReferencingAxioms(a.iri)).toEqual(
      new Set([plain, annotated, declaration]),
    );
    expect(ontology.getReferencingAxioms(label.value)).toEqual(
      new Set([annotated]),
    );
    expect(
      ontology.getReferencingAxioms(factory.getOWLLiteral(a.iri.value)),
    ).toEqual(new Set());
  });
  it("keeps n-ary membership, nested occurrences and punned property roles distinct", () => {
    const p = factory.getOWLObjectProperty(IRI.create("urn:rc2:p"));
    const d = factory.getOWLDataProperty(p.iri);
    const ap = factory.getOWLAnnotationProperty(p.iri);
    const q = factory.getOWLObjectProperty(IRI.create("urn:rc2:q"));
    const intersection = factory.getOWLObjectIntersectionOf([a, b]);
    const equivalent = factory.getOWLEquivalentClassesAxiom([a, intersection]);
    const nested = factory.getOWLSubClassOfAxiom(intersection, a);
    const domain = factory.getOWLObjectPropertyDomainAxiom(p, intersection);
    const dataDomain = factory.getOWLDataPropertyDomainAxiom(d, a);
    const annotationDomain = factory.getOWLAnnotationPropertyDomainAxiom(
      ap,
      a.iri,
    );
    const sub = factory.getOWLSubObjectPropertyOfAxiom(p, q);
    const ontology = new OWLOntology({
      axioms: [equivalent, nested, domain, dataDomain, annotationDomain, sub],
    });
    expect(ontology.getEquivalentClassesAxioms(a)).toEqual(
      new Set([equivalent]),
    );
    expect(ontology.getSubClassAxiomsForSubClass(a)).toEqual(new Set());
    expect(ontology.getSubClassAxiomsForSuperClass(a)).toEqual(
      new Set([nested]),
    );
    expect(ontology.getObjectPropertyDomainAxioms(p)).toEqual(
      new Set([domain]),
    );
    expect(
      ontology.getObjectPropertyDomainAxioms(factory.getOWLObjectInverseOf(p)),
    ).toEqual(new Set());
    expect(ontology.getDataPropertyDomainAxioms(d)).toEqual(
      new Set([dataDomain]),
    );
    expect(ontology.getAnnotationPropertyDomainAxioms(ap)).toEqual(
      new Set([annotationDomain]),
    );
    expect(ontology.getObjectSubPropertyAxiomsForSubProperty(p)).toEqual(
      new Set([sub]),
    );
    expect(ontology.getObjectSubPropertyAxiomsForSuperProperty(p)).toEqual(
      new Set(),
    );
    expect(() => ontology.getObjectPropertyDomainAxioms(d)).toThrow(TypeError);
  });

  it.each([
    ["FunctionalObjectProperty", "getFunctionalObjectPropertyAxioms"],
    [
      "InverseFunctionalObjectProperty",
      "getInverseFunctionalObjectPropertyAxioms",
    ],
    ["SymmetricObjectProperty", "getSymmetricObjectPropertyAxioms"],
    ["AsymmetricObjectProperty", "getAsymmetricObjectPropertyAxioms"],
    ["ReflexiveObjectProperty", "getReflexiveObjectPropertyAxioms"],
    ["IrreflexiveObjectProperty", "getIrreflexiveObjectPropertyAxioms"],
    ["TransitiveObjectProperty", "getTransitiveObjectPropertyAxioms"],
  ])(
    "selects asserted %s characteristics without adding other characteristics",
    (kind, method) => {
      const p = factory.getOWLObjectProperty(IRI.create("urn:rc2:p"));
      const q = factory.getOWLObjectProperty(IRI.create("urn:rc2:q"));
      const axiom = factory[`getOWL${kind}Axiom`](p);
      const ontology = new OWLOntology({ axioms: [axiom] });
      expect(ontology[method](p)).toEqual(new Set([axiom]));
      expect(ontology[method](q)).toEqual(new Set());
    },
  );
  it("distinguishes directional positions, annotations, logical membership and defensive results", () => {
    const plain = factory.getOWLSubClassOfAxiom(a, b);
    const annotated = factory.getOWLSubClassOfAxiom(a, b, [label]);
    const declaration = factory.getOWLDeclarationAxiom(a);
    const ontology = new OWLOntology({
      axioms: [plain, annotated, declaration],
    });
    expect(ontology.getAxioms().size).toBe(3);
    expect(ontology.getAxiomCount()).toBe(3);
    expect(ontology.getLogicalAxiomCount()).toBe(2);
    expect(ontology.getSubClassAxiomsForSubClass(a)).toEqual(
      new Set([plain, annotated]),
    );
    expect(ontology.getSubClassAxiomsForSuperClass(a)).toEqual(new Set());
    expect(ontology.getDeclarationAxioms(a)).toEqual(new Set([declaration]));
    expect(ontology.getAxiomsIgnoreAnnotations(plain)).toEqual(
      new Set([plain, annotated]),
    );
    const result = ontology.getSubClassAxiomsForSubClass(a);
    result.clear();
    expect(ontology.getAxiomCount(OWLObjectKind.SUBCLASS_OF_AXIOM)).toBe(2);
    expect(ontology.getSubClassAxiomsForSubClass(a).size).toBe(2);
    expect(() => ontology.getSubClassAxiomsForSubClass(a.iri)).toThrow(
      TypeError,
    );
  });

  it("merges rather than replaces annotations and preserves the original axiom", () => {
    const plain = factory.getOWLSubClassOfAxiom(a, b);
    const annotated = factory.getOWLSubClassOfAxiom(a, b, [label]);
    const comment = factory.getOWLAnnotation(
      factory.getOWLAnnotationProperty(
        IRI.create("http://www.w3.org/2000/01/rdf-schema#comment"),
      ),
      factory.getOWLLiteral("comment"),
    );
    expect(annotated.getAxiomWithoutAnnotations().equals(plain)).toBe(true);
    const merged = annotated.getAnnotatedAxiom([comment, label]);
    expect(merged.annotations).toHaveLength(2);
    expect(
      merged.equals(factory.getOWLSubClassOfAxiom(a, b, [label, comment])),
    ).toBe(true);
    expect(annotated.annotations).toEqual([label]);
    expect(merged.getAxiomWithoutAnnotations().equals(plain)).toBe(true);
    expect(() => annotated.getAnnotatedAxiom([a])).toThrow(TypeError);
  });
});
