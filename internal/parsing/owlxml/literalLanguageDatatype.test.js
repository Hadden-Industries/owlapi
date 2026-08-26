import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";

const RDF_PLAIN_LITERAL =
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#PlainLiteral";

// The OWL 2 XML Serialization schema defines Literal as extending xsd:string
// with a datatypeIRI attribute and the xml:specialAttrs group, which carries
// xml:lang. It states no prohibition on their combination.
//
// rdf:PlainLiteral is OWL 2's datatype for language-tagged literals, so
// xml:lang together with rdf:PlainLiteral is redundant rather than
// contradictory. personasonto.owl serialises all three of its language-tagged
// annotations this way.
const ontology = (datatypeIRI) => `
  <Ontology xmlns="http://www.w3.org/2002/07/owl#"
            ontologyIRI="http://example.org/literals">
    <Declaration><Class IRI="http://example.org/literals#Thing"/></Declaration>
    <AnnotationAssertion>
      <AnnotationProperty IRI="http://www.w3.org/2000/01/rdf-schema#label"/>
      <IRI>http://example.org/literals#Thing</IRI>
      <Literal xml:lang="en" datatypeIRI="${datatypeIRI}">Thing</Literal>
    </AnnotationAssertion>
  </Ontology>
`;

const load = (datatypeIRI, parsingMode) =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(ontology(datatypeIRI), {
      contentType: "application/owl+xml",
      fileName: "literals.owx",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode }),
  );

describe("OWL/XML literal with xml:lang and datatypeIRI", () => {
  it("accepts rdf:PlainLiteral alongside a language tag in strict mode", async () => {
    const { ontology: loaded } = await load(RDF_PLAIN_LITERAL, "strict");

    expect(loaded.getAxioms().size).toBeGreaterThan(0);
  });

  it("still rejects a language tag with a contradictory datatype", async () => {
    await expect(
      load("http://www.w3.org/2001/XMLSchema#integer", "strict"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });
});
