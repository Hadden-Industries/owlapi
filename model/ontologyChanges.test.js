import {
  AddOntologyAnnotation,
  IRI,
  OWLDataFactory,
  OWLOntologyManager,
  SetOntologyID,
} from "./index.js";

describe("ontology change records", () => {
  const dataFactory = new OWLDataFactory();

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
