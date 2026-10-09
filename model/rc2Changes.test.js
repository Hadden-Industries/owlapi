import { AddAxiom } from "./addAxiom.js";
import { RemoveAxiom } from "./removeAxiom.js";
import { AddImport } from "./addImport.js";
import { RemoveImport } from "./removeImport.js";
import { RemoveOntologyAnnotation } from "./removeOntologyAnnotation.js";
import {
  AddOntologyAnnotation,
  IRI,
  OWLDataFactory,
  OWLOntologyManager,
  SetOntologyID,
  OWLStructuralObject,
} from "./index.js";
import { OWL2DLProfile } from "../profiles/index.js";

const f = new OWLDataFactory();
const a = f.getOWLClass(IRI.create("urn:changes:A"));
const b = f.getOWLClass(IRI.create("urn:changes:B"));
const ax = f.getOWLSubClassOfAxiom(a, b);

test("change records reject branded objects whose stored key hides invalid fields", () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const forged = new OWLStructuralObject(
    ax.kind,
    {
      subClass: a,
      superClass: f.getOWLLiteral("invalid class expression"),
      annotations: Object.freeze([]),
    },
    ax.toStructuralTuple().slice(1),
  );
  expect(forged.structuralKey()).toBe(ax.structuralKey());
  expect(() => new AddAxiom(ontology, forged)).toThrow();
  expect(() => new RemoveAxiom(ontology, forged)).toThrow();
  expect(ontology.getAxiomCount()).toBe(0);
});

test("mixed changes replace equal-count collections atomically and cancel to a no-op", () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const original = f.getOWLDeclarationAxiom(a);
  manager.addAxiom(ontology, original);
  const change = new AddAxiom(ontology, ax);
  expect(Object.isFrozen(change)).toBe(true);
  expect(change.getOntology()).toBe(ontology);
  expect(change.getAxiom()).toBe(ax);
  expect(
    manager.applyChanges([new RemoveAxiom(ontology, original), change]),
  ).toBe(true);
  expect([...ontology.getAxioms()]).toEqual([ax]);
  expect(
    manager.applyChanges([
      new RemoveAxiom(ontology, ax),
      new AddAxiom(ontology, ax),
    ]),
  ).toBe(false);
  expect(manager.removeAxioms(ontology, [ax, ax])).toBe(true);
  expect(manager.removeAxiom(ontology, ax)).toBe(false);
});

test("failed final participant and throwing iterators cannot publish any earlier change", () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const foreign = new OWLOntologyManager().createOntology();
  expect(() =>
    manager.applyChanges([
      new AddAxiom(ontology, ax),
      new AddAxiom(foreign, ax),
    ]),
  ).toThrow();
  expect(ontology.getAxiomCount()).toBe(0);
  function* changes() {
    yield new AddAxiom(ontology, ax);
    throw new Error("late failure");
  }
  expect(() => manager.applyChanges(changes())).toThrow("late failure");
  expect(ontology.getAxiomCount()).toBe(0);
  expect(() =>
    manager.applyChange({ getOntology: () => ontology, getAxiom: () => ax }),
  ).toThrow(TypeError);
});

test("header annotation removal uses structural identity and retains annotation variants", () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const first = f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("first"));
  const second = f.getOWLAnnotation(
    f.getRDFSLabel(),
    f.getOWLLiteral("second"),
  );
  manager.applyChange(new AddOntologyAnnotation(ontology, first));
  expect(
    manager.applyChanges([
      new RemoveOntologyAnnotation(ontology, first),
      new AddOntologyAnnotation(ontology, second),
    ]),
  ).toBe(true);
  expect([...ontology.getAnnotations()]).toEqual([second]);
  expect(
    manager.applyChange(new RemoveOntologyAnnotation(ontology, first)),
  ).toBe(false);
});

test("import edits reconcile only loaded declarations and respond to identity changes", () => {
  let loads = 0;
  const manager = new OWLOntologyManager({
    documentLoader: {
      load() {
        loads++;
        throw new Error("no acquisition");
      },
    },
  });
  const root = manager.createOntology(
    f.getOWLOntologyID(IRI.create("urn:changes:root")),
  );
  const iri = IRI.create("urn:changes:imported");
  const imported = manager.createOntology(f.getOWLOntologyID(iri));
  const declaration = f.getOWLImportsDeclaration(iri);
  expect(manager.applyChange(new AddImport(root, declaration))).toBe(true);
  expect([...manager.importsClosure(root)]).toEqual([root, imported]);
  expect(
    manager.applyChanges([
      new RemoveImport(root, declaration),
      new AddImport(root, declaration),
    ]),
  ).toBe(false);
  expect(manager.applyChange(new RemoveImport(root, declaration))).toBe(true);
  expect([...manager.importsClosure(root)]).toEqual([root]);
  const next = IRI.create("urn:changes:next");
  manager.applyChanges([
    new SetOntologyID(imported, f.getOWLOntologyID(next)),
    new AddImport(root, f.getOWLImportsDeclaration(next)),
  ]);
  expect([...manager.importsClosure(root)]).toEqual([root, imported]);
  expect(loads).toBe(0);
});

test("profile completeness follows current import declarations after edits", async () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const missing = f.getOWLImportsDeclaration(IRI.create("urn:changes:missing"));
  manager.applyChange(new AddImport(ontology, missing));
  const incomplete = await new OWL2DLProfile().checkOntology(ontology);
  expect(incomplete.status).toBe("unverified");
  manager.applyChange(new RemoveImport(ontology, missing));
  expect((await new OWL2DLProfile().checkOntology(ontology)).status).toBe(
    "valid",
  );
});

test("later local registration resolves an authored import without acquisition", async () => {
  const manager = new OWLOntologyManager();
  const ontology = manager.createOntology();
  const iri = IRI.create("urn:changes:late");
  manager.applyChange(new AddImport(ontology, f.getOWLImportsDeclaration(iri)));
  expect([...manager.importsClosure(ontology)]).toEqual([ontology]);
  const imported = manager.createOntology(f.getOWLOntologyID(iri));
  expect([...manager.importsClosure(ontology)]).toEqual([ontology, imported]);
  expect((await new OWL2DLProfile().checkOntology(ontology)).status).toBe(
    "valid",
  );
});

test("a late import mapper failure rolls back axioms, annotations, identities and import edges together", () => {
  let calls = 0;
  const manager = new OWLOntologyManager({
    iriMappers: [
      {
        getDocumentIRI() {
          calls++;
          throw new Error("late import mapping failure");
        },
      },
    ],
  });
  const oldID = f.getOWLOntologyID(IRI.create("urn:changes:old"));
  const newID = f.getOWLOntologyID(IRI.create("urn:changes:new"));
  const ontology = manager.createOntology(oldID);
  const other = manager.createOntology();
  const annotation = f.getOWLAnnotation(
    f.getRDFSLabel(),
    f.getOWLLiteral("original"),
  );
  manager.applyChange(new AddOntologyAnnotation(ontology, annotation));
  expect(() =>
    manager.applyChanges([
      new AddAxiom(ontology, ax),
      new AddAxiom(other, ax),
      new RemoveOntologyAnnotation(ontology, annotation),
      new SetOntologyID(ontology, newID),
      new AddImport(
        ontology,
        f.getOWLImportsDeclaration(IRI.create("urn:changes:missing")),
      ),
    ]),
  ).toThrow("late import mapping failure");
  expect(calls).toBe(1);
  expect(ontology.getOntologyID()).toBe(oldID);
  expect(manager.getOntology(oldID)).toBe(ontology);
  expect(manager.getOntology(newID)).toBeUndefined();
  expect([...ontology.getAnnotations()]).toEqual([annotation]);
  expect(ontology.getAxiomCount()).toBe(0);
  expect(other.getAxiomCount()).toBe(0);
  expect([...ontology.getImportsDeclarations()]).toEqual([]);
  expect([...manager.importsClosure(ontology)]).toEqual([ontology]);
});

test("reentrant mapper mutations invalidate every prepared outer participant", () => {
  let ontology = null;
  let armed = true;
  const marker = f.getOWLDeclarationAxiom(a);
  const manager = new OWLOntologyManager({
    iriMappers: [
      {
        getDocumentIRI() {
          if (armed) {
            armed = false;
            manager.addAxiom(ontology, marker);
          }
          return undefined;
        },
      },
    ],
  });
  ontology = manager.createOntology();
  const other = manager.createOntology();
  expect(() =>
    manager.applyChanges([
      new AddAxiom(ontology, ax),
      new AddAxiom(other, ax),
      new AddImport(
        ontology,
        f.getOWLImportsDeclaration(IRI.create("urn:changes:reentrant")),
      ),
    ]),
  ).toThrow();
  expect([...ontology.getAxioms()]).toEqual([marker]);
  expect(other.getAxiomCount()).toBe(0);
  expect([...ontology.getImportsDeclarations()]).toEqual([]);
  expect([...manager.importsClosure(ontology)]).toEqual([ontology]);
});
