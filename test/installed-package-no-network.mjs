import assert from "node:assert/strict";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const observations = [];
const deny = (surface) => () => {
  observations.push(surface);
  throw new Error(`Unexpected network operation through ${surface}`);
};

globalThis.fetch = deny("fetch");
for (const [container, methods, prefix] of [
  [dns, ["lookup", "resolve", "resolve4", "resolve6"], "dns"],
  [http, ["get", "request"], "http"],
  [https, ["get", "request"], "https"],
  [net, ["connect", "createConnection"], "net"],
  [tls, ["connect"], "tls"],
]) {
  for (const method of methods) {
    container[method] = deny(`${prefix}.${method}`);
  }
}

const { OWLManager } = await import("owlapi/apibinding");
const { StringDocumentSource } = await import("owlapi/io");
const documents = [
  new StringDocumentSource("Ontology(<https://example.com/local-functional>)", {
    contentType: "text/owl-functional",
  }),
  new StringDocumentSource(
    `<?xml version="1.0"?>
     <rdf:RDF
       xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
       xmlns:owl="http://www.w3.org/2002/07/owl#">
       <owl:Ontology rdf:about="https://example.com/local-rdfxml" />
     </rdf:RDF>`,
    { contentType: "application/rdf+xml" },
  ),
  new StringDocumentSource(
    `@prefix owl: <http://www.w3.org/2002/07/owl#> .
     <https://example.com/local-turtle> a owl:Ontology .`,
    { contentType: "text/turtle" },
  ),
  new StringDocumentSource(
    JSON.stringify({
      "@context": {
        owl: "http://www.w3.org/2002/07/owl#",
        type: "@type",
      },
      "@id": "https://example.com/local-jsonld",
      type: "owl:Ontology",
    }),
    { contentType: "application/ld+json" },
  ),
];

for (const document of documents) {
  const manager = OWLManager.createOWLOntologyManager();
  const ontology = await manager.loadOntologyFromOntologyDocument(document);
  assert.ok(ontology);
}

assert.deepEqual(observations, []);
process.stdout.write(
  "Installed owlapi local parsing performed no network I/O\n",
);
