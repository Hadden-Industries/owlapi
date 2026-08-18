import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../io/index.js";
import { OWLManager } from "../manager/index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const OWL = "http://www.w3.org/2002/07/owl#";

// BIBO asserts `dcterms:title "The Bibliographic Ontology"` on its ontology
// header while also declaring `dcterms:title` an object property. An object
// property assertion cannot take a literal object, so this is OWL Full.
//
// The reading as an object property is impossible rather than merely
// disfavoured, so the choice is between preserving the statement as an
// annotation and discarding the document. The pinned behavioural oracle
// preserves it: its output carries the value as the ontology header title.
const document = `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:owl="${OWL}"
           xmlns:dcterms="http://purl.org/dc/terms/">
    <owl:Ontology rdf:about="urn:test:owlfull">
      <dcterms:title>A literal on an object property</dcterms:title>
    </owl:Ontology>
    <owl:ObjectProperty rdf:about="http://purl.org/dc/terms/title"/>
  </rdf:RDF>
`;

const load = (parsingMode) =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(document, {
      contentType: "application/rdf+xml",
      fileName: "owlfull.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode }),
  );

describe("object property assertion with a literal object", () => {
  it("rejects the document in strict mode", async () => {
    await expect(load("strict")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
  });

  it("keeps the statement as an annotation in compatible mode", async () => {
    const { documents } = await load("compatible");

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_OWL_FULL_OBJECT_PROPERTY_LITERAL",
        severity: "warning",
      }),
    );
  });
});
