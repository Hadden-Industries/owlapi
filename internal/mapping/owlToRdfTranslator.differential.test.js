import { readFileSync } from "node:fs";

import { StringDocumentSource } from "../../index.js";
import { OWLManager } from "../../index.js";
import { createNTriplesSyntaxAdapter } from "../parsing/rdf/n3SyntaxAdapter.js";
import { datasetsAreIsomorphic } from "../../util/rdf-dataset-isomorphism.mjs";
import { rdfDataFactory, rdfDatasetFactory } from "../rdfjs/environment.js";
import { OwlToRdfTranslator } from "./owlToRdfTranslator.js";

const STRUCTURAL_URL = new URL(
  "../../util/owlapi-reference/fixtures/rdf/phase16-graph.ofn",
  import.meta.url,
);
const JAVA_GRAPH_URL = new URL(
  "../../util/owlapi-reference/fixtures/rdf/phase16-graph.java.nt",
  import.meta.url,
);
const RDF_TYPE = rdfDataFactory.namedNode(
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
);
const RDF_LIST = rdfDataFactory.namedNode(
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#List",
);

const removeJavaListTyping = (dataset) => {
  const normalized = rdfDatasetFactory.dataset();
  let removed = 0;
  for (const quad of dataset) {
    if (quad.predicate.equals(RDF_TYPE) && quad.object.equals(RDF_LIST)) {
      removed += 1;
    } else {
      normalized.add(quad);
    }
  }
  return { normalized, removed };
};

describe("OwlToRdfTranslator Java differential", () => {
  it("is graph-equivalent to the pinned OWLAPI 5.5.1 public storer result", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(readFileSync(STRUCTURAL_URL, "utf8"), {
        contentType: "text/owl-functional",
        documentIRI: "urn:owlapi-js:phase16:graph-document",
        fileName: "phase16-graph.ofn",
      }),
    );
    const actual = new OwlToRdfTranslator().translate(ontology);
    const { dataset: javaDataset } = await createNTriplesSyntaxAdapter().parse(
      new StringDocumentSource(readFileSync(JAVA_GRAPH_URL, "utf8"), {
        contentType: "application/n-triples",
        fileName: "phase16-graph.java.nt",
      }),
    );

    // OWLAPI's AbstractTranslator adds rdf:type rdf:List to every list cell;
    // W3C Table 1 defines only rdf:first/rdf:rest. Keep the deviation exact and
    // counted rather than weakening graph comparison generally.
    const { normalized, removed } = removeJavaListTyping(javaDataset);
    expect(removed).toBe(3);
    expect(datasetsAreIsomorphic(actual, normalized)).toBe(true);
  });
});
