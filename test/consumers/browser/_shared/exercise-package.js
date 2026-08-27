import * as root from "owlapi";
import * as apibinding from "owlapi/apibinding";
import * as formats from "owlapi/formats";
import * as io from "owlapi/io";
import * as model from "owlapi/model";

const DOCUMENTS = Object.freeze([
  Object.freeze({
    key: "functional",
    contentType: "text/owl-functional",
    documentIRI: "https://example.com/browser/functional.ofn",
    text: `Prefix(:=<https://example.com/browser/functional#>)
Ontology(<https://example.com/browser/functional>
  Declaration(Class(:Entity))
)`,
  }),
  Object.freeze({
    key: "rdfxml",
    contentType: "application/rdf+xml",
    documentIRI: "https://example.com/browser/rdfxml.owl",
    text: `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="https://example.com/browser/rdfxml" />
  <owl:Class rdf:about="https://example.com/browser/rdfxml#Entity" />
</rdf:RDF>`,
  }),
  Object.freeze({
    key: "turtle",
    contentType: "text/turtle",
    documentIRI: "https://example.com/browser/turtle.ttl",
    text: `@prefix owl: <http://www.w3.org/2002/07/owl#> .
<https://example.com/browser/turtle> a owl:Ontology .
<https://example.com/browser/turtle#Entity> a owl:Class .`,
  }),
  Object.freeze({
    key: "jsonld",
    contentType: "application/ld+json",
    documentIRI: "https://example.com/browser/jsonld.jsonld",
    text: JSON.stringify({
      "@context": {
        owl: "http://www.w3.org/2002/07/owl#",
      },
      "@graph": [
        {
          "@id": "https://example.com/browser/jsonld",
          "@type": "owl:Ontology",
        },
        {
          "@id": "https://example.com/browser/jsonld#Entity",
          "@type": "owl:Class",
        },
      ],
    }),
  }),
]);

/**
 * Exercise only documented package specifiers so the fixture cannot pass by
 * reaching through the tarball boundary. The returned value intentionally uses
 * plain records, arrays, strings, numbers and booleans so the same evidence can
 * cross a DedicatedWorker structured-clone boundary unchanged.
 */
export const exerciseInstalledPackage = async () => {
  const bindingIdentity = {
    apibinding: root.OWLManager === apibinding.OWLManager,
    formats: root.OWLDocumentFormats === formats.OWLDocumentFormats,
    io: root.StringDocumentSource === io.StringDocumentSource,
    model: root.OWLOntologyManager === model.OWLOntologyManager,
  };

  if (Object.values(bindingIdentity).includes(false)) {
    throw new Error("A public subpath does not preserve root binding identity");
  }

  const documents = {};
  for (const document of DOCUMENTS) {
    const manager = apibinding.OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new io.StringDocumentSource(document.text, {
        contentType: document.contentType,
        documentIRI: document.documentIRI,
      }),
    );
    documents[document.key] = {
      axiomCount: ontology.getAxioms().size,
      importCount: ontology.getImportsDeclarations().size,
    };
  }

  return {
    bindingIdentity,
    documents,
    managerClass:
      apibinding.OWLManager.createOWLOntologyManager().constructor.name,
  };
};
