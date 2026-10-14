import { OWLManager } from "../apibinding/index.js";
import { IRI } from "../model/index.js";
import { OWLOntologyMerger } from "./index.js";

const profiles = ["java-owlapi-5.5.1", "normative-v1"];
const sourceFor = (behaviorProfileId) => {
  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
  const ontology = manager.createOntology();
  const factory = manager.getOWLDataFactory();
  manager.addAxiom(
    ontology,
    factory.getOWLDeclarationAxiom(
      factory.getOWLClass(IRI.create("urn:copy:C")),
    ),
  );
  return { manager, ontology };
};

test.each(
  profiles.flatMap((sourceProfile) =>
    profiles.map((destinationProfile) => [sourceProfile, destinationProfile]),
  ),
)(
  "copy from %s to %s retains both owners and uses destination publication",
  (sourceProfile, destinationProfile) => {
    const source = sourceFor(sourceProfile);
    const destination = OWLManager.createOWLOntologyManager({
      behaviorProfileId: destinationProfile,
    });
    const targetIRI = IRI.create("urn:copy:target");
    const targetID = destination
      .getOWLDataFactory()
      .getOWLOntologyID(targetIRI);
    let seenDuringProvider;
    const copied = new OWLOntologyMerger({
      ontologies() {
        seenDuringProvider = destination.getOntology(targetID);
        return [source.ontology];
      },
    }).createMergedOntology(destination, targetIRI);
    expect(seenDuringProvider).toBe(
      destinationProfile === "java-owlapi-5.5.1" ? copied : undefined,
    );
    expect(copied).not.toBe(source.ontology);
    expect(copied.getAxioms()).toEqual(source.ontology.getAxioms());
    const [axiom] = source.ontology.getAxioms();
    expect(destination.addAxiom(copied, axiom)).toBe(
      destinationProfile === "java-owlapi-5.5.1" ? "NO_OPERATION" : false,
    );
    expect(source.manager.addAxiom(source.ontology, axiom)).toBe(
      sourceProfile === "java-owlapi-5.5.1" ? "NO_OPERATION" : false,
    );
    expect(source.manager.getOntology(source.ontology.getOntologyID())).toBe(
      source.ontology,
    );
    expect(destination.getOntology(targetID)).toBe(copied);
  },
);

test.each(profiles)(
  "%s keeps its copy failure publication contract",
  (behaviorProfileId) => {
    const source = sourceFor(behaviorProfileId);
    const destination = OWLManager.createOWLOntologyManager({
      behaviorProfileId,
    });
    const targetIRI = IRI.create("urn:copy:failed");
    const targetID = destination
      .getOWLDataFactory()
      .getOWLOntologyID(targetIRI);
    const failure = new Error("owned provider failure");
    const merger = new OWLOntologyMerger({
      *ontologies() {
        yield source.ontology;
        throw failure;
      },
    });
    expect(() => merger.createMergedOntology(destination, targetIRI)).toThrow(
      failure,
    );
    const retained = destination.getOntology(targetID);
    if (behaviorProfileId === "java-owlapi-5.5.1") {
      expect(retained.getAxiomCount()).toBe(1);
      expect(
        destination.addAxiom(retained, [...source.ontology.getAxioms()][0]),
      ).toBe("NO_OPERATION");
    } else expect(retained).toBeUndefined();
    expect(source.ontology.getAxiomCount()).toBe(1);
    expect(source.manager.getOntology(source.ontology.getOntologyID())).toBe(
      source.ontology,
    );
  },
);

test("Java rejects an occupied copy identity before querying the provider", () => {
  const source = sourceFor("java-owlapi-5.5.1");
  const targetIRI = IRI.create("urn:copy:occupied");
  const targetID = source.manager
    .getOWLDataFactory()
    .getOWLOntologyID(targetIRI);
  const existing = source.manager.createOntology(targetID);
  let calls = 0;
  const merger = new OWLOntologyMerger({
    ontologies() {
      calls++;
      return [source.ontology];
    },
  });
  expect(() =>
    merger.createMergedOntology(source.manager, targetIRI),
  ).toThrow();
  expect(calls).toBe(0);
  expect(source.manager.getOntology(targetID)).toBe(existing);
  expect(existing.getAxiomCount()).toBe(0);
});
