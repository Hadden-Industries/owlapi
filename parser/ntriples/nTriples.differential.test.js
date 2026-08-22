import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";

const N_TRIPLES_FIXTURE = new URL(
  "../../../../util/owlapi-reference/fixtures/ntriples/phase12-structural.nt",
  import.meta.url,
);

const structuralKeys = (ontology) =>
  [...ontology.getAxioms()].map((axiom) => axiom.structuralKey()).sort();
const signature = (ontology) => {
  const iris = (entities) => [...entities].map(({ iri }) => iri.value).sort();
  return {
    classes: iris(ontology.getClassesInSignature()),
    individuals: iris(ontology.getIndividualsInSignature()),
    objectProperties: iris(ontology.getObjectPropertiesInSignature()),
  };
};
const load = (text, fileName) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:phase12",
      fileName,
    }),
    new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    }),
  );

describe("N-Triples structural differential", () => {
  it("matches the same OWL graph expressed as RDF/XML", async () => {
    const nTriples = await load(
      readFileSync(N_TRIPLES_FIXTURE, "utf8"),
      "phase12.nt",
    );
    const rdfXml = await load(
      `<?xml version="1.0"?>
       <rdf:RDF
         xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:ex="urn:test:phase12#">
         <owl:Ontology rdf:about="urn:test:phase12" />
         <owl:Class rdf:about="urn:test:phase12#Agent" />
         <owl:Class rdf:about="urn:test:phase12#Person">
           <rdfs:subClassOf rdf:resource="urn:test:phase12#Agent" />
           <rdfs:label xml:lang="en">Person</rdfs:label>
         </owl:Class>
         <owl:ObjectProperty rdf:about="urn:test:phase12#knows">
           <rdfs:domain rdf:resource="urn:test:phase12#Person" />
           <rdfs:range rdf:resource="urn:test:phase12#Agent" />
         </owl:ObjectProperty>
         <owl:NamedIndividual rdf:about="urn:test:phase12#alice">
           <rdf:type rdf:resource="urn:test:phase12#Person" />
           <ex:knows rdf:resource="urn:test:phase12#bob" />
         </owl:NamedIndividual>
         <owl:NamedIndividual rdf:about="urn:test:phase12#bob" />
       </rdf:RDF>`,
      "phase12.rdf",
    );

    expect(structuralKeys(nTriples)).toEqual(structuralKeys(rdfXml));
    expect(signature(nTriples)).toEqual(signature(rdfXml));
  });
});
