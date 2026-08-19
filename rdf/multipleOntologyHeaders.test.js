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
// rather than one it merely describes.
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

// RFC 3986 section 5.1 ranks a base embedded in the content above the URI the
// document was retrieved from. `protege-dc.owl` relies on exactly that: it sets
// `xml:base` to its own IRI and writes `rdf:about=""` for its own header, so the
// header that *is* the document is only recognisable once the embedded base
// outranks the retrieval IRI. Selecting on the retrieval IRI alone falls through
// to the tie-break and picks the Dublin Core vocabulary the document merely
// describes.
const documentWithBase = (base, headers) => `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:owl="${OWL}" xml:base="${base}">
    ${headers.map((about) => `<owl:Ontology rdf:about="${about}"/>`).join("\n")}
    <owl:Class rdf:about="http://example.org/other/Thing"/>
  </rdf:RDF>
`;

const loadWithBase = (base, headers) =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(documentWithBase(base, headers), {
      contentType: "application/rdf+xml",
      documentIRI: "http://retrieval.example/elsewhere.rdf",
      fileName: "elsewhere.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode: "compatible" }),
  );

describe("embedded base and ontology identity", () => {
  it("prefers the header naming the embedded base over the retrieval IRI", async () => {
    const { ontology } = await loadWithBase(
      "http://example.org/self/document.owl",
      ["", "http://a.example/"],
    );

    expect(ontology.getOntologyID().ontologyIRI?.value).toBe(
      "http://example.org/self/document.owl",
    );
  });
});

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

  // When no header is the document itself there is no fact about which ontology
  // the document "is", so the choice is arbitrary and must at least be a
  // function of the ontology. Document order is not: RDF is an unordered graph,
  // and the same ontology may serialise its type triples in any order.
  //
  // The shortest IRI wins because authors give the core vocabulary the shortest
  // name and extend it with suffixes for modules - `prov#` against
  // `prov-dictionary#`. Code-point comparison breaks ties, deliberately not
  // `localeCompare`, which weights `#` and `-` as punctuation and would reverse
  // exactly that case.
  it("prefers the shortest ontology IRI when none is the document", async () => {
    const { ontology } = await load(
      ["http://example.org/alpha-extension/", "http://example.org/alpha/"],
      "compatible",
    );

    expect(ontology.getOntologyID().ontologyIRI?.value).toBe(
      "http://example.org/alpha/",
    );
  });

  it("breaks a length tie by code point rather than collation", async () => {
    const { ontology } = await load(
      ["http://example.org/aaa/", "http://example.org/AAA/"],
      "compatible",
    );

    expect(ontology.getOntologyID().ontologyIRI?.value).toBe(
      "http://example.org/AAA/",
    );
  });

  it("names every discarded candidate in the diagnostic", async () => {
    const { documents } = await load(
      ["http://example.org/alpha-extension/", "http://example.org/alpha/"],
      "compatible",
    );

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        candidateOntologyIRIs: [
          "http://example.org/alpha-extension/",
          "http://example.org/alpha/",
        ],
        code: "RDF_MULTIPLE_ONTOLOGY_HEADERS",
      }),
    );
  });
});
