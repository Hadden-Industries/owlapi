import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";

const TRIG_FIXTURE = new URL(
  "../../../../util/owlapi-reference/fixtures/trig/phase14-structural.trig",
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
      documentIRI: "urn:test:phase14",
      fileName,
    }),
    new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    }),
  );

describe("TriG structural differential", () => {
  it("matches the same selected graph expressed as RDF/XML", async () => {
    const trig = await load(readFileSync(TRIG_FIXTURE, "utf8"), "phase14.trig");
    const rdfXml = await load(
      `<?xml version="1.0"?>
       <rdf:RDF
         xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:ex="urn:test:phase14#">
         <owl:Ontology rdf:about="urn:test:phase14" />
         <owl:Class rdf:about="urn:test:phase14#Agent" />
         <owl:Class rdf:about="urn:test:phase14#Person">
           <rdfs:subClassOf rdf:resource="urn:test:phase14#Agent" />
           <rdfs:label xml:lang="en">Person</rdfs:label>
         </owl:Class>
         <owl:ObjectProperty rdf:about="urn:test:phase14#knows">
           <rdfs:domain rdf:resource="urn:test:phase14#Person" />
           <rdfs:range rdf:resource="urn:test:phase14#Agent" />
         </owl:ObjectProperty>
         <owl:NamedIndividual rdf:about="urn:test:phase14#alice">
           <rdf:type rdf:resource="urn:test:phase14#Person" />
           <ex:knows rdf:resource="urn:test:phase14#bob" />
         </owl:NamedIndividual>
         <owl:NamedIndividual rdf:about="urn:test:phase14#bob" />
       </rdf:RDF>`,
      "phase14.rdf",
    );

    expect(structuralKeys(trig)).toEqual(structuralKeys(rdfXml));
    expect(signature(trig)).toEqual(signature(rdfXml));
  });
});
