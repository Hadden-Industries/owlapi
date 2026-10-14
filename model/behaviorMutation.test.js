import { OWLManager } from "../apibinding/index.js";
import { StringDocumentSource } from "../io/index.js";
import {
  AddAxiom,
  RemoveAxiom,
  SetOntologyID,
  AddImport,
  IRI,
} from "./index.js";

const createManager = (behaviorProfileId = "java-owlapi-5.5.1") =>
  OWLManager.createOWLOntologyManager({ behaviorProfileId });
const declaration = (manager) => {
  const f = manager.getOWLDataFactory();
  return f.getOWLDeclarationAxiom(f.getOWLClass(IRI.create("urn:mutation:C")));
};
const ontologyID = (manager, iri) =>
  manager.getOWLDataFactory().getOWLOntologyID(IRI.create(iri));

describe("profile-specific mutation publication", () => {
  test.each(["java-owlapi-5.5.1", "normative-v1"])(
    "%s import resolution preserves its reference semantics after rename",
    (profile) => {
      const manager = createManager(profile);
      const root = manager.createOntology(
        ontologyID(manager, "urn:import:root"),
      );
      const imported = manager.createOntology(
        ontologyID(manager, "urn:import:child"),
      );
      const declaration = manager
        .getOWLDataFactory()
        .getOWLImportsDeclaration(IRI.create("urn:import:child"));
      manager.applyChange(new AddImport(root, declaration));
      expect(manager.getImportsClosure(root)).toEqual(
        new Set([root, imported]),
      );
      manager.applyChange(
        new SetOntologyID(imported, ontologyID(manager, "urn:import:moved")),
      );
      if (profile === "java-owlapi-5.5.1")
        expect(() => manager.getImportsClosure(root)).toThrow(/document/);
      else
        expect(manager.getImportsClosure(root)).toEqual(
          new Set([root, imported]),
        );
    },
  );
  test("Java rename uses the change's captured ID and permits equal-axiom destinations", () => {
    const manager = createManager();
    const firstID = ontologyID(manager, "urn:mutation:equal-first");
    const occupiedID = ontologyID(manager, "urn:mutation:equal-occupied");
    const ontology = manager.createOntology(firstID);
    const occupied = manager.createOntology(occupiedID);
    expect(manager.applyChange(new SetOntologyID(ontology, occupiedID))).toBe(
      "SUCCESSFULLY",
    );
    expect(manager.getOntology(occupiedID)).toBe(ontology);
    expect(occupied.getAxiomCount()).toBe(0);
    expect(() => manager.getOntology(firstID)).toThrow(/document/);
    const secondID = ontologyID(manager, "urn:mutation:second");
    const thirdID = ontologyID(manager, "urn:mutation:third");
    expect(
      manager.applyChanges([
        new SetOntologyID(ontology, secondID),
        new SetOntologyID(ontology, thirdID),
      ]),
    ).toBe("SUCCESSFULLY");
    expect(ontology.getOntologyID()).toBe(thirdID);
    expect(manager.getOntology(secondID)).toBe(ontology);
    expect(manager.getOntology(thirdID)).toBeUndefined();
  });
  test("Java reports enacted changes even when the final axiom set is unchanged", () => {
    const manager = createManager();
    const ontology = manager.createOntology();
    const axiom = declaration(manager);
    expect(manager.applyChanges([])).toBe("NO_OPERATION");
    expect(manager.addAxiom(ontology, axiom)).toBe("SUCCESSFULLY");
    expect(manager.addAxiom(ontology, axiom)).toBe("NO_OPERATION");
    expect(manager.removeAxiom(ontology, axiom)).toBe("SUCCESSFULLY");
    expect(
      manager.applyChanges([
        new AddAxiom(ontology, axiom),
        new RemoveAxiom(ontology, axiom),
      ]),
    ).toBe("SUCCESSFULLY");
    expect(ontology.getAxiomCount()).toBe(0);
  });

  test.each(["java-owlapi-5.5.1", "normative-v1"])(
    "%s collision preserves its specified partial-state boundary",
    (profile) => {
      const manager = createManager(profile);
      const originalID = ontologyID(manager, "urn:mutation:original");
      const ontology = manager.createOntology(originalID);
      const occupiedID = ontologyID(manager, "urn:mutation:occupied");
      const occupied = manager.createOntology(occupiedID);
      const axiom = declaration(manager);
      expect(() =>
        manager.applyChanges([
          new AddAxiom(ontology, axiom),
          new SetOntologyID(ontology, occupiedID),
        ]),
      ).toThrow();
      expect(ontology.getAxiomCount()).toBe(profile === "normative-v1" ? 0 : 1);
      expect(ontology.getOntologyID()).toBe(originalID);
      expect(manager.getOntology(originalID)).toBe(ontology);
      expect(manager.getOntology(occupiedID)).toBe(occupied);
      expect(manager.addAxiom(ontology, axiom)).toBe(
        profile === "normative-v1" ? true : "NO_OPERATION",
      );
    },
  );

  test("Java permits same-profile foreign mutation and keeps the original manager's rename index", () => {
    const owner = createManager();
    const other = createManager();
    const originalID = ontologyID(owner, "urn:mutation:original");
    const renamedID = ontologyID(owner, "urn:mutation:renamed");
    const ontology = owner.createOntology(originalID);
    const axiom = declaration(owner);
    expect(other.addAxiom(ontology, axiom)).toBe("SUCCESSFULLY");
    expect(other.applyChange(new SetOntologyID(ontology, renamedID))).toBe(
      "SUCCESSFULLY",
    );
    expect(ontology.getOntologyID()).toBe(renamedID);
    expect(ontology.getAxiomCount()).toBe(1);
    expect(owner.getOntology(originalID)).toBe(ontology);
    expect(owner.getOntology(renamedID)).toBeUndefined();
    expect(other.getOntology(renamedID)).toBeUndefined();
    expect(owner.removeAxiom(ontology, axiom)).toBe("SUCCESSFULLY");
  });

  test("mixed-profile mutation and normative foreign mutation reject without publication", () => {
    const java = createManager();
    const normative = createManager("normative-v1");
    const secondNormative = createManager("normative-v1");
    const javaOntology = java.createOntology();
    const normativeOntology = normative.createOntology();
    const axiom = declaration(java);
    for (const [manager, ontology] of [
      [java, normativeOntology],
      [normative, javaOntology],
      [secondNormative, normativeOntology],
    ]) {
      expect(() => manager.addAxiom(ontology, axiom)).toThrow();
      expect(ontology.getAxiomCount()).toBe(0);
    }
  });

  test("a mixed-profile Java batch is rejected before an earlier compatible change is published", () => {
    const java = createManager();
    const normative = createManager("normative-v1");
    const first = java.createOntology();
    const second = normative.createOntology();
    const axiom = declaration(java);
    expect(() =>
      java.applyChanges([
        new AddAxiom(first, axiom),
        new AddAxiom(second, axiom),
      ]),
    ).toThrow();
    expect(first.getAxiomCount()).toBe(0);
    expect(second.getAxiomCount()).toBe(0);
  });

  test("Java unsuccessful batches retain the measured inverse-order effect and stop subsequent changes", async () => {
    const manager = createManager();
    const f = manager.getOWLDataFactory();
    const configuration = manager
      .getOntologyLoaderConfiguration()
      .setLoadAnnotationAxioms(false);
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("Ontology(<urn:mutation:filtered>)"),
      configuration,
    );
    const axiom = declaration(manager);
    const annotation = f.getOWLAnnotationAssertionAxiom(
      f.getOWLAnnotationProperty(
        IRI.create("http://www.w3.org/2000/01/rdf-schema#label"),
      ),
      IRI.create("urn:mutation:C"),
      f.getOWLLiteral("ignored"),
    );
    const later = f.getOWLDeclarationAxiom(
      f.getOWLClass(IRI.create("urn:mutation:later")),
    );
    expect(manager.addAxiom(ontology, annotation)).toBe("UNSUCCESSFULLY");
    expect(
      manager.applyChanges([
        new AddAxiom(ontology, axiom),
        new RemoveAxiom(ontology, axiom),
        new AddAxiom(ontology, annotation),
        new AddAxiom(ontology, later),
      ]),
    ).toBe("UNSUCCESSFULLY");
    expect(ontology.getAxiomCount()).toBe(1);
    expect(ontology.containsAxiom(axiom)).toBe(true);
    expect(ontology.containsAxiom(annotation)).toBe(false);
    expect(ontology.containsAxiom(later)).toBe(false);
    const other = createManager();
    expect(other.addAxiom(ontology, annotation)).toBe("SUCCESSFULLY");
  });
});
