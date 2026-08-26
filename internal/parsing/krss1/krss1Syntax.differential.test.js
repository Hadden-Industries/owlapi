import { readFileSync } from "node:fs";

import { StringDocumentSource } from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLObjectKind } from "../../../model/index.js";

const namespace = "urn:test:phase17#";
const representations = [
  [
    "subset.krss",
    "(define-primitive-concept Person Mammal) (instance alice Person)",
  ],
  [
    "subset.krss2",
    "(define-primitive-concept Person Mammal) (instance alice Person)",
  ],
  [
    "subset.ofn",
    `Ontology(SubClassOf(<${namespace}Person> <${namespace}Mammal>) ClassAssertion(<${namespace}Person> <${namespace}alice>))`,
  ],
  [
    "subset.omn",
    `Ontology: <urn:test:phase17>\nClass: <${namespace}Person> SubClassOf: <${namespace}Mammal>\nIndividual: <${namespace}alice> Types: <${namespace}Person>`,
  ],
  [
    "subset.owx",
    `<Ontology xmlns="http://www.w3.org/2002/07/owl#"><SubClassOf><Class IRI="${namespace}Person"/><Class IRI="${namespace}Mammal"/></SubClassOf><ClassAssertion><Class IRI="${namespace}Person"/><NamedIndividual IRI="${namespace}alice"/></ClassAssertion></Ontology>`,
  ],
  [
    "subset.rdf",
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:owl="http://www.w3.org/2002/07/owl#"><owl:Class rdf:about="${namespace}Person"><rdfs:subClassOf rdf:resource="${namespace}Mammal"/></owl:Class><owl:NamedIndividual rdf:about="${namespace}alice"><rdf:type rdf:resource="${namespace}Person"/></owl:NamedIndividual></rdf:RDF>`,
  ],
  [
    "subset.ttl",
    `@prefix : <${namespace}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix owl: <http://www.w3.org/2002/07/owl#> . :Person a owl:Class ; rdfs:subClassOf :Mammal . :alice a :Person .`,
  ],
  ["subset.dl", "Person ⊑ Mammal\nPerson(alice)"],
];

const structuralKeys = (ontology) =>
  [...ontology.getAxioms()]
    .filter(({ kind }) => kind !== OWLObjectKind.DECLARATION_AXIOM)
    .map((axiom) => axiom.structuralKey())
    .sort();
const load = (text, fileName) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:phase17",
      fileName,
    }),
  );
const typeCounts = (ontology) => {
  const counts = {};
  for (const { kind } of ontology.getAxioms()) {
    const name = kind.replace(/^OWL/u, "").replace(/Axiom$/u, "");
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
};

describe("KRSS1 structural differentials", () => {
  it("matches every supported OWL-native and RDF representation of a shared subset", async () => {
    const ontologies = [];
    for (const [fileName, text] of representations) {
      try {
        ontologies.push(await load(text, fileName));
      } catch (cause) {
        throw new Error(`The ${fileName} counterpart did not parse`, { cause });
      }
    }
    const expected = structuralKeys(ontologies[0]);

    for (const ontology of ontologies.slice(1)) {
      expect(structuralKeys(ontology)).toEqual(expected);
    }
    expect(expected).toHaveLength(2);
  });

  it("pins the Java-reachable subset and makes corrected ABox behavior explicit", async () => {
    const root = new URL(
      "../../../util/owlapi-reference/fixtures/krss1/",
      import.meta.url,
    );
    const javaDocument = JSON.parse(
      readFileSync(new URL("phase17-structural.java.json", root), "utf8"),
    );
    const ontology = await load(
      readFileSync(new URL("phase17-structural.krss", root), "utf8"),
      "phase17-structural.krss",
    );
    const counts = typeCounts(ontology);

    expect(javaDocument.oracle).toMatchObject({
      revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
      version: "5.5.1",
    });
    expect(counts).toMatchObject(javaDocument.snapshot.axiomTypeCounts);
    expect(counts).toMatchObject({
      ClassAssertion: 1,
      DifferentIndividuals: 1,
      ObjectPropertyAssertion: 1,
      SameIndividual: 1,
    });
    expect(ontology.getAxioms()).toHaveProperty(
      "size",
      javaDocument.snapshot.axioms.length + 4,
    );
  });
});
