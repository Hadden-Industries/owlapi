import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../io/index.js";
import { OWLManager } from "../manager/index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const OWL = "http://www.w3.org/2002/07/owl#";

// OWL 2 expects one ontology header per document, so strict mode rejects a
// graph carrying several. Real vocabularies violate this: protege-dc.owl
// declares both itself and the Dublin Core elements vocabulary, and prov.owl
// merges fifteen PROV modules into one document.
//
// Compatible mode selects one deterministically. It prefers the ontology whose
// IRI is the document's own, because that is the ontology the document *is*
// rather than one it merely describes, and falls back to the first declared.
const document = (headers) => `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:owl="${OWL}">
    ${headers.map((about) => `<owl:Ontology rdf:about="${about}"/>`).join("\n")}
    <owl:Class rdf:about="http://example.org/other/Thing"/>
  </rdf:RDF>
`;

const load = (headers, parsingMode) =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(document(headers), {
      contentType: "application/rdf+xml",
      documentIRI: "http://example.org/self.rdf",
      fileName: "self.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode }),
  );

describe("multiple OWL ontology headers", () => {
  it("rejects the document in strict mode", async () => {
    await expect(
      load(
        ["http://example.org/self.rdf", "http://example.org/other/"],
        "strict",
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("prefers the header whose IRI is the document itself", async () => {
    const { documents, ontology } = await load(
      ["http://example.org/other/", "http://example.org/self.rdf"],
      "compatible",
    );

    expect(ontology.getOntologyID().ontologyIRI?.value).toBe(
      "http://example.org/self.rdf",
    );
    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_MULTIPLE_ONTOLOGY_HEADERS",
        severity: "warning",
      }),
    );
  });

  it("falls back to the first declared header when none is the document", async () => {
    const { ontology } = await load(
      ["http://example.org/first/", "http://example.org/second/"],
      "compatible",
    );

    expect(ontology.getOntologyID().ontologyIRI?.value).toBe(
      "http://example.org/first/",
    );
  });
});
