import {
  AddAxiom,
  AddOntologyAnnotation,
  IRI,
  OWLDataFactory,
  OWLOntologyManager,
  RemoveAxiom,
  SetOntologyID,
} from "./index.js";

describe("ontology change records", () => {
  const dataFactory = new OWLDataFactory();

  it.each(["java-owlapi-5.5.1", "normative-v1"])(
    "%s keeps removal proposals opaque, nominal, fresh and independently applicable",
    (behaviorProfileId) => {
      const manager = new OWLOntologyManager({ behaviorProfileId });
      const factory = manager.getOWLDataFactory();
      const ontology = manager.createOntology();
      const axiom = factory.getOWLDeclarationAxiom(
        factory.getOWLClass(IRI.create("urn:change-record:removed")),
      );
      manager.addAxiom(ontology, axiom);
      const first = new RemoveAxiom(ontology, axiom);
      const second = new RemoveAxiom(ontology, axiom);
      expect(first).not.toBe(second);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Reflect.ownKeys(first)).toEqual([]);
      expect(RemoveAxiom.name).toBe("RemoveAxiom");
      expect(RemoveAxiom.length).toBe(2);
      expect(Object.getPrototypeOf(RemoveAxiom.prototype)).toBe(
        Object.prototype,
      );
      expect(Object.getOwnPropertyNames(RemoveAxiom.prototype).sort()).toEqual(
        ["constructor", "getAxiom", "getOntology"].sort(),
      );
      expect(first.getOntology()).toBe(ontology);
      expect(first.getAxiom()).toBe(axiom);
      for (const forged of [
        Object.create(RemoveAxiom.prototype),
        new Proxy(first, {}),
      ]) {
        expect(() =>
          Reflect.apply(RemoveAxiom.prototype.getAxiom, forged, []),
        ).toThrow(TypeError);
        expect(() => manager.applyChange(forged)).toThrow(TypeError);
        expect(ontology.getAxiomCount()).toBe(1);
      }
      const addition = new AddAxiom(ontology, axiom);
      expect(RemoveAxiom.prototype.getAxiom.call(addition)).toBe(axiom);
      expect(RemoveAxiom.prototype.getOntology.call(addition)).toBe(ontology);
      expect(AddAxiom.prototype.getAxiom.call(first)).toBe(axiom);
      expect(ontology.getAxiomCount()).toBe(1);
      manager.applyChange(first);
      expect(ontology.getAxiomCount()).toBe(0);
      expect(second.getAxiom()).toBe(axiom);
      manager.applyChange(second);
      expect(ontology.getAxiomCount()).toBe(0);
    },
  );

  it("captures a frozen SetOntologyID record with only the approved Java-shaped readers", () => {
    const manager = new OWLOntologyManager({ dataFactory });
    const originalOntologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change-record:original"),
      IRI.create("urn:change-record:original:version"),
    );
    const newOntologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change-record:replacement"),
      IRI.create("urn:change-record:replacement:version"),
    );
    const ontology = manager.createOntology(originalOntologyID);
    const change = new SetOntologyID(ontology, newOntologyID);

    expect(change.getOntology()).toBe(ontology);
    expect(change.getOriginalOntologyID()).toBe(originalOntologyID);
    expect(change.getNewOntologyID()).toBe(newOntologyID);
    expect(Object.isFrozen(change)).toBe(true);
    expect(Reflect.ownKeys(change)).toEqual([]);
    expect(Object.getOwnPropertyNames(SetOntologyID.prototype).sort()).toEqual(
      [
        "constructor",
        "getNewOntologyID",
        "getOntology",
        "getOriginalOntologyID",
      ].sort(),
    );
  });

  it("captures a frozen AddOntologyAnnotation record with only the approved Java-shaped readers", () => {
    const manager = new OWLOntologyManager({ dataFactory });
    const ontology = manager.createOntology();
    const annotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("ontology change", "en"),
    );
    const change = new AddOntologyAnnotation(ontology, annotation);

    expect(change.getOntology()).toBe(ontology);
    expect(change.getAnnotation()).toBe(annotation);
    expect(Object.isFrozen(change)).toBe(true);
    expect(Reflect.ownKeys(change)).toEqual([]);
    expect(
      Object.getOwnPropertyNames(AddOntologyAnnotation.prototype).sort(),
    ).toEqual(["constructor", "getAnnotation", "getOntology"].sort());
  });

  it("rejects missing targets and non-structural change values", () => {
    const manager = new OWLOntologyManager({ dataFactory });
    const ontology = manager.createOntology();
    const ontologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change-record:valid-id"),
    );
    const annotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("valid annotation"),
    );
    const notAnAnnotation = dataFactory.getOWLClass(
      IRI.create("urn:change-record:not-an-annotation"),
    );

    expect(() => new SetOntologyID(undefined, ontologyID)).toThrow(
      /ontology must be an OWLOntology/,
    );
    expect(() => new SetOntologyID(ontology, undefined)).toThrow(
      /ontologyID must be an OWLOntologyID/,
    );
    expect(
      () =>
        new SetOntologyID(
          ontology,
          IRI.create("urn:change-record:not-an-ontology-id"),
        ),
    ).toThrow(/ontologyID must be an OWLOntologyID/);
    expect(() => new AddOntologyAnnotation(undefined, annotation)).toThrow(
      /ontology must be an OWLOntology/,
    );
    expect(() => new AddOntologyAnnotation(undefined, notAnAnnotation)).toThrow(
      /ontology must be an OWLOntology/,
    );
    expect(() => new AddOntologyAnnotation(ontology, notAnAnnotation)).toThrow(
      /annotation must be an OWLAnnotation/,
    );
  });
});
