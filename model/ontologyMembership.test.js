import { describe, expect, test } from "@jest/globals";
import {
  OWLOntology,
  bindManagedOntology,
  readLoadedImportsClosure,
  readProfileClosure,
  readOntologySnapshot,
} from "./owlOntology.js";
import { readSourceEvidence } from "../internal/model/sourceEvidence.js";

describe("loaded membership shares package ontology identity", () => {
  test.each([
    {},
    Object.create(OWLOntology.prototype),
    { getAxioms: () => new Set() },
  ])(
    "rejects foreign and lookalike objects even with a membership callback",
    (foreign) => {
      bindManagedOntology(
        foreign,
        () => [foreign],
        () => true,
      );
      for (const read of [
        readLoadedImportsClosure,
        readProfileClosure,
        readSourceEvidence,
        readOntologySnapshot,
      ]) {
        expect(() => read(foreign)).toThrow("package OWLOntology");
      }
    },
  );

  test("standalone membership is defensive and manager callbacks remain isolated", () => {
    const first = new OWLOntology();
    const second = new OWLOntology();
    const standalone = readLoadedImportsClosure(first);
    standalone.push(second);
    expect(readLoadedImportsClosure(first)).toEqual([first]);
    expect(readProfileClosure(first)).toEqual({
      ontologies: [first],
      complete: true,
    });
    bindManagedOntology(
      first,
      () => [first, second],
      () => true,
    );
    bindManagedOntology(
      second,
      () => [second],
      () => false,
    );
    expect(readLoadedImportsClosure(first)).toEqual([first, second]);
    expect(readLoadedImportsClosure(second)).toEqual([second]);
    expect(readSourceEvidence(first).status).toBe("unverified");
  });
});
