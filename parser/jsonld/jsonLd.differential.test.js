import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";

const structuralKeys = (ontology) =>
  [...ontology.getAxioms()].map((axiom) => axiom.structuralKey()).sort();
const load = (text, options) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:phase15",
      ...options,
    }),
    new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    }),
  );

describe("JSON-LD structural differential", () => {
  it("matches the same ontology expressed as RDF/XML", async () => {
    const jsonLd = await load(
      JSON.stringify([
        {
          "@id": "urn:test:phase15",
          "@type": "http://www.w3.org/2002/07/owl#Ontology",
        },
        {
          "@id": "urn:test:phase15#Agent",
          "@type": "http://www.w3.org/2002/07/owl#Class",
        },
        {
          "@id": "urn:test:phase15#Person",
          "@type": "http://www.w3.org/2002/07/owl#Class",
          "http://www.w3.org/2000/01/rdf-schema#subClassOf": {
            "@id": "urn:test:phase15#Agent",
          },
        },
      ]),
      { contentType: "application/ld+json" },
    );
    const rdfXml = await load(
      `<?xml version="1.0"?>
       <rdf:RDF
         xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#">
         <owl:Ontology rdf:about="urn:test:phase15" />
         <owl:Class rdf:about="urn:test:phase15#Agent" />
         <owl:Class rdf:about="urn:test:phase15#Person">
           <rdfs:subClassOf rdf:resource="urn:test:phase15#Agent" />
         </owl:Class>
       </rdf:RDF>`,
      { contentType: "application/rdf+xml" },
    );

    expect(structuralKeys(jsonLd)).toEqual(structuralKeys(rdfXml));
  });
});
