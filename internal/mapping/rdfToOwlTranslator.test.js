import { OWLOntologyLoaderConfiguration } from "../../index.js";
import { IRI, OWLObjectKind } from "../../model/index.js";
import { rdfDataFactory, rdfDatasetFactory } from "../rdfjs/environment.js";
import { RdfToOwlTranslator } from "./rdfToOwlTranslator.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const EX = "https://example.com/ontology#";

const namedNode = (...values) => rdfDataFactory.namedNode(...values);
const literal = (...values) => rdfDataFactory.literal(...values);
const quad = (...values) => rdfDataFactory.quad(...values);

const datasetOf = (...quads) => rdfDatasetFactory.dataset(quads);

describe("RdfToOwlTranslator ontology boundary", () => {
  it.each(["strict", "compatible"])(
    "retains an ontology's self-referential ordinary annotation in %s mode",
    async (parsingMode) => {
      const ontology = namedNode("https://example.com/current");
      const property = namedNode(`${EX}isVersionOf`);
      const input = datasetOf(
        quad(ontology, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
        quad(
          property,
          namedNode(`${RDF}type`),
          namedNode(`${OWL}AnnotationProperty`),
        ),
        quad(ontology, property, ontology),
      );

      const result = await new RdfToOwlTranslator().translate(input, {
        configuration: new OWLOntologyLoaderConfiguration({ parsingMode }),
      });

      expect(result.ontology.getOntologyID().ontologyIRI?.value).toBe(
        ontology.value,
      );
      expect([...result.ontology.getAnnotations()]).toEqual([
        expect.objectContaining({
          property: expect.objectContaining({
            iri: expect.objectContaining({ value: property.value }),
          }),
          value: expect.objectContaining({ value: ontology.value }),
        }),
      ]);
      expect(result.context.diagnostics).toEqual([]);
    },
  );

  it.each([`${RDFS}seeAlso`, `${EX}relatedOntology`])(
    "does not disqualify a second ontology header referenced by ordinary annotation %s",
    async (propertyIRI) => {
      const ontology = namedNode("https://example.com/current");
      const other = namedNode("https://example.com/other");
      const property = namedNode(propertyIRI);
      const input = datasetOf(
        quad(ontology, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
        quad(other, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
        quad(
          property,
          namedNode(`${RDF}type`),
          namedNode(`${OWL}AnnotationProperty`),
        ),
        quad(ontology, property, other),
      );

      await expect(
        new RdfToOwlTranslator().translate(input),
      ).rejects.toMatchObject({
        code: "OWL_SYNTAX_ERROR",
      });
    },
  );

  it("uses an explicit owl:OntologyProperty declaration to exclude a referenced header", async () => {
    const ontology = namedNode("https://example.com/current");
    const other = namedNode("https://example.com/other");
    const property = namedNode(`${EX}priorEdition`);
    const input = datasetOf(
      quad(ontology, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
      quad(other, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
      quad(
        property,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}OntologyProperty`),
      ),
      quad(ontology, property, other),
    );

    const result = await new RdfToOwlTranslator().translate(input);

    expect(result.ontology.getOntologyID().ontologyIRI?.value).toBe(
      ontology.value,
    );
    expect([...result.ontology.getAnnotations()]).toEqual([
      expect.objectContaining({
        property: expect.objectContaining({
          iri: expect.objectContaining({ value: property.value }),
        }),
        value: expect.objectContaining({ value: other.value }),
      }),
    ]);
    expect(result.context.diagnostics).toEqual([]);
  });

  it("retains ontology identity and the structural declaration for a self-import", async () => {
    const ontology = namedNode("https://example.com/current");
    const input = datasetOf(
      quad(ontology, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
      quad(ontology, namedNode(`${OWL}imports`), ontology),
    );

    const result = await new RdfToOwlTranslator().translate(input);

    expect(result.ontology.getOntologyID().ontologyIRI?.value).toBe(
      ontology.value,
    );
    expect([...result.ontology.getImportsDeclarations()]).toEqual([
      expect.objectContaining({
        iri: expect.objectContaining({ value: ontology.value }),
      }),
    ]);
    expect(result.context.diagnostics).toEqual([]);
  });

  it("selects the ontology header while retaining a typed prior-version annotation value", async () => {
    const ontology = namedNode("https://example.com/current");
    const priorVersion = namedNode("https://example.com/prior");
    const input = datasetOf(
      quad(ontology, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
      quad(ontology, namedNode(`${OWL}priorVersion`), priorVersion),
      quad(priorVersion, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
    );

    const { ontology: result } = await new RdfToOwlTranslator().translate(
      input,
    );

    expect(result.getOntologyID()).toMatchObject({
      ontologyIRI: expect.objectContaining({ value: ontology.value }),
    });
    expect([...result.getAnnotations()]).toEqual([
      expect.objectContaining({
        property: expect.objectContaining({
          iri: expect.objectContaining({ value: `${OWL}priorVersion` }),
        }),
        value: expect.objectContaining({ value: priorVersion.value }),
      }),
    ]);
  });

  it("selects a graph and reconstructs ontology identity, imports, annotations, and declarations", async () => {
    const graph = namedNode("https://example.com/graph");
    const unselectedGraph = namedNode("https://example.com/unselected-graph");
    const ontology = namedNode("https://example.com/ontology");
    const version = namedNode("https://example.com/ontology/1");
    const imported = namedNode("https://example.com/imported");
    const owlClass = namedNode(`${EX}Person`);
    const objectProperty = namedNode(`${EX}knows`);
    const dataProperty = namedNode(`${EX}age`);
    const annotationProperty = namedNode(`${EX}curator`);
    const datatype = namedNode(`${EX}Age`);
    const individual = namedNode(`${EX}alice`);
    const input = datasetOf(
      quad(
        ontology,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}Ontology`),
        graph,
      ),
      quad(ontology, namedNode(`${OWL}versionIRI`), version, graph),
      quad(ontology, namedNode(`${OWL}imports`), imported, graph),
      quad(
        ontology,
        namedNode(`${RDFS}label`),
        literal("Example", "en"),
        graph,
      ),
      quad(owlClass, namedNode(`${RDF}type`), namedNode(`${OWL}Class`), graph),
      quad(
        objectProperty,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}ObjectProperty`),
        graph,
      ),
      quad(
        dataProperty,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}DatatypeProperty`),
        graph,
      ),
      quad(
        annotationProperty,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}AnnotationProperty`),
        graph,
      ),
      quad(
        datatype,
        namedNode(`${RDF}type`),
        namedNode(`${RDFS}Datatype`),
        graph,
      ),
      quad(
        individual,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}NamedIndividual`),
        graph,
      ),
      quad(
        namedNode(`${EX}unselectedSubject`),
        namedNode(`${EX}unselectedPredicate`),
        namedNode(`${EX}unselectedObject`),
        unselectedGraph,
      ),
    );
    const configuration = new OWLOntologyLoaderConfiguration({
      rdfDatasetGraphPolicy: "selectGraph",
      selectedGraph: graph,
    });

    const result = await new RdfToOwlTranslator().translate(input, {
      configuration,
      documentIRI: IRI.create("https://example.com/source.rdf"),
    });

    expect(result.ontology.getOntologyID()).toMatchObject({
      ontologyIRI: expect.objectContaining({ value: ontology.value }),
      versionIRI: expect.objectContaining({ value: version.value }),
    });
    expect([...result.ontology.getImportsDeclarations()]).toEqual([
      expect.objectContaining({
        iri: expect.objectContaining({ value: imported.value }),
      }),
    ]);
    expect([...result.ontology.getAnnotations()]).toEqual([
      expect.objectContaining({
        kind: OWLObjectKind.ANNOTATION,
        property: expect.objectContaining({
          iri: expect.objectContaining({ value: `${RDFS}label` }),
        }),
        value: expect.objectContaining({
          language: "en",
          lexicalForm: "Example",
        }),
      }),
    ]);
    expect(
      result.ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 6);
    expect(result.context).toMatchObject({
      diagnostics: [],
      documentIRI: expect.objectContaining({
        value: "https://example.com/source.rdf",
      }),
      merged: false,
      selectedGraph: expect.objectContaining({ value: graph.value }),
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(Object.isFrozen(result.context.diagnostics)).toBe(true);
  });

  it("does not publish a partial ontology when reconstruction fails", async () => {
    const ontology = namedNode("https://example.com/ontology");
    const input = datasetOf(
      quad(ontology, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
      quad(ontology, namedNode(`${OWL}versionIRI`), literal("not-an-iri")),
    );
    const translator = new RdfToOwlTranslator();

    await expect(translator.translate(input)).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });

    const retry = await translator.translate(datasetOf());
    expect(retry.ontology.getAxioms()).toHaveProperty("size", 0);
    expect(retry.ontology.getImportsDeclarations()).toHaveProperty("size", 0);
    expect(retry.ontology.getAnnotations()).toHaveProperty("size", 0);
  });
});
