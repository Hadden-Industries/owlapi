import { jest } from "@jest/globals";
import {
  OWLDataFactory,
  OWLOntology,
  OWLOntologyManager,
  IRI,
  OWLObjectKind as K,
  AddImport,
  RemoveImport,
} from "../../model/index.js";
import { Imports, AxiomAnnotations } from "../../model/parameters/index.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import { readOntologyModel } from "./ontologyReadModel.js";
import { AnnotationValueShortFormProvider } from "../../util/annotationValueShortFormProvider.js";
import { compareOntologies } from "./ontologyStructuralIsomorphism.js";

const f = new OWLDataFactory();
const a = f.getOWLClass(IRI.create("urn:read:A"));
const b = f.getOWLClass(IRI.create("urn:read:B"));
const c = f.getOWLClass(IRI.create("urn:read:C"));
afterEach(() => jest.restoreAllMocks());

test("ordered signature discovery includes ontology annotations and keeps punned kinds distinct", () => {
  const person = f.getOWLNamedIndividual(a.iri);
  const anonymous = f.getOWLAnonymousIndividual("annotation");
  const ontology = new OWLOntology({
    axioms: [f.getOWLSubClassOfAxiom(a, b), f.getOWLDeclarationAxiom(person)],
    annotations: [f.getOWLAnnotation(f.getRDFSLabel(), anonymous)],
  });
  expect([...ontology.getClassesInSignature()]).toEqual([b, a]);
  expect([...ontology.getSignature()]).toEqual([
    b,
    a,
    person,
    f.getRDFSLabel(),
  ]);
  expect([...ontology.getEntitiesInSignature(a.iri)]).toEqual([a, person]);
  expect([...ontology.getReferencedAnonymousIndividuals()]).toEqual([
    anonymous,
  ]);
  const prior = ontology.getSignature();
  prior.clear();
  expect([...ontology.getSignature()]).toEqual([
    b,
    a,
    person,
    f.getRDFSLabel(),
  ]);
});

test("position and annotation-insensitive results preserve stored order and annotated variants", () => {
  const plain = f.getOWLSubClassOfAxiom(a, b);
  const annotated = f.getOWLSubClassOfAxiom(a, b, [
    f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("label")),
  ]);
  const nary = f.getOWLEquivalentClassesAxiom([a, b, c]);
  const ontology = new OWLOntology({ axioms: [annotated, nary, plain] });
  const equivalentA = new OWLDataFactory().getOWLClass(a.iri);
  expect([...ontology.getSubClassAxiomsForSubClass(equivalentA)]).toEqual([
    annotated,
    plain,
  ]);
  expect([...ontology.getEquivalentClassesAxioms(equivalentA)]).toEqual([nary]);
  expect([...ontology.getAxiomsIgnoreAnnotations(plain)]).toEqual([
    annotated,
    plain,
  ]);
  expect(
    ontology.containsAxiom(
      plain,
      Imports.EXCLUDED,
      AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS,
    ),
  ).toBe(true);
  const values = ontology.getAxiomsByType(K.SUBCLASS_OF_AXIOM);
  values.clear();
  expect([...ontology.getAxiomsByType(K.SUBCLASS_OF_AXIOM)]).toEqual([
    annotated,
    plain,
  ]);
});

test("commits replace read ownership while previously returned values remain snapshots", () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const first = f.getOWLDeclarationAxiom(a),
    second = f.getOWLDeclarationAxiom(b);
  manager.addAxiom(ontology, first);
  const snapshot = readOntologySnapshot(ontology),
    reader = readOntologyModel(snapshot);
  const before = ontology.getClassesInSignature();
  expect(readOntologyModel(snapshot)).toBe(reader);
  expect(Object.isFrozen(reader.axioms(K.DECLARATION_AXIOM))).toBe(true);
  manager.removeAxiom(ontology, first);
  manager.addAxiom(ontology, second);
  expect([...ontology.getClassesInSignature()]).toEqual([b]);
  expect(ontology.getDeclarationAxioms(a).size).toBe(0);
  expect([...before]).toEqual([a]);
  expect(reader.axioms(K.DECLARATION_AXIOM)).toEqual([first]);
  expect(readOntologyModel(readOntologySnapshot(ontology))).not.toBe(reader);
});

test("loaded closure changes are read independently from cached direct snapshots", () => {
  const manager = new OWLOntologyManager();
  const root = manager.createOntology();
  const child = manager.createOntology(
    f.getOWLOntologyID(IRI.create("urn:read:child")),
  );
  const declaration = f.getOWLImportsDeclaration(
    child.getOntologyID().ontologyIRI,
  );
  manager.addAxiom(root, f.getOWLDeclarationAxiom(a));
  manager.addAxiom(child, f.getOWLDeclarationAxiom(b));
  expect([...root.getClassesInSignature(Imports.INCLUDED)]).toEqual([a]);
  manager.applyChange(new AddImport(root, declaration));
  expect([...root.getClassesInSignature(Imports.INCLUDED)]).toEqual([a, b]);
  const rootSnapshot = readOntologySnapshot(root);
  manager.addAxiom(child, f.getOWLDeclarationAxiom(c));
  expect(readOntologySnapshot(root)).toBe(rootSnapshot);
  expect([...root.getClassesInSignature(Imports.INCLUDED)]).toEqual([a, b, c]);
  manager.applyChange(new RemoveImport(root, declaration));
  expect([...root.getClassesInSignature(Imports.INCLUDED)]).toEqual([a]);
});

test("label candidates are sorted over a complete root closure, preserving repeated root order", () => {
  const manager = new OWLOntologyManager();
  const root = manager.createOntology();
  const child = manager.createOntology(
    f.getOWLOntologyID(IRI.create("urn:read:labels")),
  );
  const label = f.getRDFSLabel();
  manager.applyChange(
    new AddImport(
      root,
      f.getOWLImportsDeclaration(child.getOntologyID().ontologyIRI),
    ),
  );
  manager.addAxiom(
    root,
    f.getOWLAnnotationAssertionAxiom(
      label,
      a.iri,
      f.getOWLLiteral("Zulu", "en"),
    ),
  );
  const alpha = f.getOWLAnnotationAssertionAxiom(
    label,
    a.iri,
    f.getOWLLiteral("Alpha", "en"),
  );
  manager.addAxiom(child, alpha);
  let members = [root, child, root];
  const provider = new AnnotationValueShortFormProvider(
    [label],
    new Map([[label, ["en"]]]),
    { ontologies: () => members },
  );
  expect(provider.getShortForm(a)).toBe("Alpha");
  manager.removeAxiom(child, alpha);
  expect(provider.getShortForm(a)).toBe("Zulu");
  members = [child];
  expect(provider.getShortForm(a)).toBe("A");
});

test("private comparison reads do not allocate public defensive collections", () => {
  const left = new OWLOntology({ axioms: [f.getOWLSubClassOfAxiom(a, b)] });
  const right = new OWLOntology({ axioms: [f.getOWLSubClassOfAxiom(a, b)] });
  const spies = ["getAxioms", "getAnnotations", "getImportsDeclarations"].map(
    (name) => jest.spyOn(OWLOntology.prototype, name),
  );
  expect(compareOntologies(left, right, { compareOntologyID: false })).toEqual({
    equal: true,
    mismatch: null,
  });
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  expect(() => compareOntologies({}, right)).toThrow(
    "left must be an OWLOntology",
  );
});
