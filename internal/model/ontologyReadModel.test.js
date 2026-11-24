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
import { collectPostings, postingValues } from "./structuralPostings.js";
import { OWLStructuralObject } from "../../model/structural.js";
import { StructuralAxiomSet } from "./axiomSemantics.js";
import { AnnotationValueShortFormProvider } from "../../util/annotationValueShortFormProvider.js";
import { compareOntologies } from "./ontologyStructuralIsomorphism.js";

const f = new OWLDataFactory();
const a = f.getOWLClass(IRI.create("urn:read:A"));
const b = f.getOWLClass(IRI.create("urn:read:B"));
const c = f.getOWLClass(IRI.create("urn:read:C"));
afterEach(() => jest.restoreAllMocks());

test("each posting family sizes its index to its own participating keys", () => {
  const keys = { size: 1_000_000, add: (value) => value };
  const empty = collectPostings(keys, () => {});
  const sparse = collectPostings(keys, (emit) => {
    emit(999_999, 0);
    emit(999_999, 1);
    emit(800_000, 1);
  });
  expect(empty.offsets.length).toBeLessThan(3);
  expect(sparse.offsets.length).toBeLessThan(5);
  const values = { valueAt: (i) => ["a", "b"][i] };
  expect([...postingValues(values, sparse, 999_999)]).toEqual(["a", "b"]);
  expect([...postingValues(values, sparse, 800_000)]).toEqual(["b"]);
  expect([...postingValues(values, sparse, 1)]).toEqual([]);
});

test("exact membership captures effective protocol keys at first query", () => {
  const axiom = f.getOWLSubClassOfAxiom(a, b);
  const ontology = new OWLOntology({ axioms: [axiom] });
  const override = jest
    .spyOn(OWLStructuralObject.prototype, "structuralKey")
    .mockReturnValue("overridden key");
  expect(ontology.containsAxiom(axiom)).toBe(true);
  override.mockRestore();
  expect(ontology.containsAxiom(axiom)).toBe(false);
});

test("counting, filtering by kind and committing a small edit do not flatten the axiom table", () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const flatten = jest.spyOn(StructuralAxiomSet.prototype, "toFrozenArray");
  const first = f.getOWLDeclarationAxiom(a);
  manager.addAxiom(ontology, first);
  const prior = readOntologySnapshot(ontology);
  manager.addAxiom(ontology, f.getOWLSubClassOfAxiom(a, b));
  expect(ontology.getAxiomCount()).toBe(2);
  expect([...ontology.getAxiomsByType(K.DECLARATION_AXIOM)]).toEqual([first]);
  expect(flatten).not.toHaveBeenCalled();
  expect(prior.directAxioms).toEqual([first]);
});

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
  expect([...reader.axioms(K.DECLARATION_AXIOM)]).toEqual([first]);
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
