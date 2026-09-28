import {
  OWLManager,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../index.js";

const ONTOLOGY_IRI = "https://example.com/vocabulary/";
const ANNOTATION_PROPERTY_IRI = "http://purl.org/dc/terms/isVersionOf";

describe("ontology identity across RDF document preparation and reconstruction", () => {
  it.each([
    { parsingMode: "strict", declared: true },
    { parsingMode: "compatible", declared: true },
    { parsingMode: "compatible", declared: false },
  ])(
    "retains a self-referential ontology annotation ($parsingMode, declared=$declared)",
    async ({ parsingMode, declared }) => {
      const document = `<rdf:RDF
        xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns:owl="http://www.w3.org/2002/07/owl#"
        xmlns:dcterms="http://purl.org/dc/terms/">
        <owl:Ontology rdf:about="${ONTOLOGY_IRI}">
          <dcterms:isVersionOf rdf:resource="${ONTOLOGY_IRI}"/>
        </owl:Ontology>
        ${declared ? `<owl:AnnotationProperty rdf:about="${ANNOTATION_PROPERTY_IRI}"/>` : ""}
      </rdf:RDF>`;
      const manager = OWLManager.createOWLOntologyManager();

      const { ontology, documents } =
        await manager.loadOntologyGraphFromOntologyDocument(
          new StringDocumentSource(document, {
            contentType: "application/rdf+xml",
            documentIRI: "https://example.com/vocabulary/source.rdf",
          }),
          new OWLOntologyLoaderConfiguration({ parsingMode }),
        );

      expect(ontology.getOntologyID().ontologyIRI?.value).toBe(ONTOLOGY_IRI);
      expect([...ontology.getAnnotations()]).toEqual([
        expect.objectContaining({
          property: expect.objectContaining({
            iri: expect.objectContaining({ value: ANNOTATION_PROPERTY_IRI }),
          }),
          value: expect.objectContaining({ value: ONTOLOGY_IRI }),
        }),
      ]);
      expect(documents[0].context.diagnostics.map(({ code }) => code)).toEqual(
        declared ? [] : ["RDF_UNDECLARED_ANNOTATION_PROPERTY"],
      );
    },
  );
});
