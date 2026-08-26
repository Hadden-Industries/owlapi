import { OWLManager, OWLOntologyManager } from "../index.js";

describe("OWLManager", () => {
  it("creates independent ontology managers through the narrow root API", () => {
    const first = OWLManager.createOWLOntologyManager();
    const second = OWLManager.createOWLOntologyManager();

    expect(first).toBeInstanceOf(OWLOntologyManager);
    expect(second).toBeInstanceOf(OWLOntologyManager);
    expect(first).not.toBe(second);
    expect(first.getOWLDataFactory()).not.toBe(second.getOWLDataFactory());
  });
});
