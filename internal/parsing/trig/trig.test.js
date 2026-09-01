import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLObjectKind } from "../../../model/index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";
import { selectOntologyGraph } from "../../rdfjs/graphPolicy.js";
import { createTriGSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";
import { detectTriG, triGParserDescriptor } from "./descriptor.js";

const source = (text, options = {}) => new StringDocumentSource(text, options);

describe("TriG parser descriptor", () => {
  it.each([
    ["MATCH", "TRIG_GRAPH_BLOCK", "<urn:graph> { <urn:s> <urn:p> <urn:o> . }"],
    [
      "MATCH",
      "TRIG_GRAPH_BLOCK",
      "GRAPH _:graph { <urn:s> <urn:p> <urn:o> . }",
    ],
    [
      "MATCH",
      "TRIG_GRAPH_BLOCK",
      "@prefix ex: <urn:test:> .\nex:graph { ex:s ex:p ex:o . }",
    ],
    ["MATCH", "TRIG_GRAPH_BLOCK", "{ <urn:s> <urn:p> <urn:o> . }"],
    [
      "NO_MATCH",
      "TRIG_TURTLE_DOCUMENT",
      "@prefix ex: <urn:test:> . ex:s ex:p ex:o .",
    ],
    ["NO_MATCH", "TRIG_LINE_DATASET", "<urn:s> <urn:p> <urn:o> <urn:g> ."],
    [
      "NO_MATCH",
      "TRIG_N3_LANGUAGE",
      "{ <urn:s> <urn:p> <urn:o> . } => { <urn:x> <urn:y> <urn:z> . } .",
    ],
    ["NO_MATCH", "TRIG_SIGNATURE_ABSENT", '<urn:s> <urn:p> "not { a graph" .'],
    [
      "NO_MATCH",
      "TRIG_SIGNATURE_ABSENT",
      "# not { a graph\n<urn:s> <urn:p> <urn:o> .",
    ],
    ["NO_MATCH", "TRIG_XML", '<?xml version="1.0"?><root value="{" />'],
    ["NO_MATCH", "TRIG_JSON", '{"name":"not a graph block"}'],
    ["INDETERMINATE", "TRIG_EMPTY", "# comments only\n"],
  ])("returns %s with %s", (result, reasonCode, text) => {
    expect(detectTriG(source(text))).toMatchObject({ reasonCode, result });
  });

  it("publishes an independent dataset-format descriptor", () => {
    expect(triGParserDescriptor).toMatchObject({
      format: OWLDocumentFormats.TRIG,
      id: "trig",
      supportsCompatibleRecovery: false,
    });
    expect(Object.isFrozen(triGParserDescriptor)).toBe(true);
  });
});

describe("TriG manager integration", () => {
  it("auto-detects a graph block without stealing Turtle or N-Quads", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const trig = await manager.loadOntologyGraphFromOntologyDocument(
      source(`@prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        <urn:test:graph> { <urn:test:Detected> rdf:type owl:Class . }`),
    );
    const turtle = await manager.loadOntologyGraphFromOntologyDocument(
      source(`@prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
        <urn:test:Turtle> rdf:type owl:Class .`),
      new OWLOntologyLoaderConfiguration({
        rdfDatasetGraphPolicy: "defaultGraphOnly",
      }),
    );
    const nquads = await manager.loadOntologyGraphFromOntologyDocument(
      source(
        "<urn:test:NQuads> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> <urn:graph> .",
      ),
    );

    expect(trig.documents[0].context.format).toBe(OWLDocumentFormats.TRIG);
    expect(turtle.documents[0].context.format).toBe(OWLDocumentFormats.TURTLE);
    expect(nquads.documents[0].context.format).toBe(OWLDocumentFormats.N_QUADS);
  });

  it("applies every explicit graph policy and reports graph-context loss", async () => {
    const document = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      <urn:test:Default> rdf:type owl:Class .
      <urn:first> { <urn:test:First> rdf:type owl:Class . }
      <urn:selected> { <urn:test:Selected> rdf:type owl:Class . }`;
    const load = (values) =>
      OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        source(document),
        new OWLOntologyLoaderConfiguration({
          format: OWLDocumentFormats.TRIG,
          ...values,
        }),
      );

    await expect(load()).rejects.toMatchObject({
      code: "AMBIGUOUS_RDF_DATASET",
    });
    const defaultGraph = await load({
      rdfDatasetGraphPolicy: "defaultGraphOnly",
    });
    const selectedGraph = await load({
      rdfDatasetGraphPolicy: "selectGraph",
      selectedGraph: rdfDataFactory.namedNode("urn:selected"),
    });
    const merged = await load({ rdfDatasetGraphPolicy: "merge" });

    expect(
      [...defaultGraph.ontology.getClassesInSignature()].map(
        ({ iri }) => iri.value,
      ),
    ).toEqual(["urn:test:Default"]);
    expect(defaultGraph.documents[0].context.diagnostics).toEqual([
      expect.objectContaining({
        code: "RDF_NAMED_GRAPHS_IGNORED",
        ignoredGraphCount: 2,
        ignoredQuadCount: 2,
      }),
    ]);
    expect(
      [...selectedGraph.ontology.getClassesInSignature()].map(
        ({ iri }) => iri.value,
      ),
    ).toEqual(["urn:test:Selected"]);
    expect(
      merged.ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 3);
    expect(merged.documents[0].context).toMatchObject({
      diagnostics: [{ code: "RDF_DATASET_GRAPHS_MERGED" }],
      merged: true,
      selectedGraph: { termType: "DefaultGraph", value: "" },
    });
  });

  it("preserves dataset-scoped blank-node identity across graph blocks", async () => {
    const { dataset } = await createTriGSyntaxAdapter().parse(
      source(`_:shared <urn:p> "value" .
        <urn:graph> { _:shared <urn:p> "value" . }`),
      new OWLOntologyLoaderConfiguration({
        format: OWLDocumentFormats.TRIG,
        rdfDatasetGraphPolicy: "merge",
      }),
    );
    const merged = selectOntologyGraph(
      dataset,
      new OWLOntologyLoaderConfiguration({ rdfDatasetGraphPolicy: "merge" }),
    );

    expect(dataset).toHaveProperty("size", 2);
    expect(
      new Set([...dataset].map(({ subject }) => subject.value)),
    ).toHaveProperty("size", 1);
    expect(merged.dataset).toHaveProperty("size", 1);
  });

  it("loads TriG in an import closure", async () => {
    const importedTriG = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      <urn:graph> { <urn:test:Imported> rdf:type owl:Class . }`;
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        async load() {
          return importedTriG;
        },
      },
    });
    const closure = await manager.loadOntologyGraphFromOntologyDocument(
      "Ontology(<urn:test:root> Import(<urn:test:imported>))",
    );
    const imported = closure.documents.find(
      ({ context }) => context.format === OWLDocumentFormats.TRIG,
    );
    expect(imported).toBeDefined();
    expect(
      [...imported.ontology.getClassesInSignature()].map(
        ({ iri }) => iri.value,
      ),
    ).toEqual(["urn:test:Imported"]);
  });

  it("rejects broader Notation3 constructs in exact TriG mode", async () => {
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source(
          "{ <urn:s> <urn:p> <urn:o> . } => { <urn:x> <urn:y> <urn:z> . } .",
        ),
        new OWLOntologyLoaderConfiguration({ format: OWLDocumentFormats.TRIG }),
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR", syntax: "TriG" });
  });
});
