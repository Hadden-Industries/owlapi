import { OWLOntologyLoaderConfiguration } from "../io/index.js";
import { IRI, OWLObjectKind } from "../model/index.js";
import {
  rdfDataFactory,
  rdfDatasetFactory,
  RdfToOwlTranslator,
} from "./index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const EX = "https://example.com/ontology#";

const namedNode = (...values) => rdfDataFactory.namedNode(...values);
const literal = (...values) => rdfDataFactory.literal(...values);
const quad = (...values) => rdfDataFactory.quad(...values);

const datasetOf = (...quads) => rdfDatasetFactory.dataset(quads);

describe("RdfToOwlTranslator ontology boundary", () => {
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
