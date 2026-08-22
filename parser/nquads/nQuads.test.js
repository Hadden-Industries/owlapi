import {
  AmbiguousRdfDatasetError,
  GraphSelectionError,
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";
import { rdfDataFactory } from "../../rdf/index.js";
import { selectOntologyGraph } from "../../rdf/graphPolicy.js";
import { createNQuadsSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";
import owl2vowl from "../../../owl2vowl/js/index.js";

import { detectNQuads, nQuadsParserDescriptor } from "./descriptor.js";

const source = (text) => new StringDocumentSource(text);
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const OWL_CLASS = "http://www.w3.org/2002/07/owl#Class";
const classDeclaration = (iri, graph = "") =>
  `<${iri}> <${RDF_TYPE}> <${OWL_CLASS}>${graph ? ` <${graph}>` : ""} .`;
const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration({
    format: OWLDocumentFormats.N_QUADS,
    ...values,
  });

describe("N-Quads parser descriptor", () => {
  it.each([
    [
      "MATCH",
      "NQUADS_QUAD",
      "# dataset statement\n<urn:s> <urn:p> <urn:o> <urn:graph> .",
    ],
    ["MATCH", "NQUADS_QUAD", '_:s <urn:p> "value"@en _:graph .'],
    [
      "MATCH",
      "NQUADS_QUAD",
      "<urn:s> <urn:p> <<( <urn:quoted-s> <urn:quoted-p> <urn:quoted-o> )>> <urn:graph> .",
    ],
    [
      "MATCH",
      "NQUADS_QUAD",
      "<urn:default> <urn:p> <urn:o> .\n  <urn:named> <urn:p> <urn:o> <urn:graph> .",
    ],
    ["NO_MATCH", "NQUADS_NTRIPLES_STATEMENT", "<urn:s> <urn:p> <urn:o> ."],
    ["NO_MATCH", "NQUADS_TURTLE_DIRECTIVE", "@prefix ex: <urn:test:> ."],
    ["NO_MATCH", "NQUADS_SIGNATURE_ABSENT", '<?xml version="1.0"?><rdf:RDF />'],
    ["INDETERMINATE", "NQUADS_EMPTY", "# comments only\n"],
  ])("returns %s with %s", (result, reasonCode, text) => {
    expect(detectNQuads(source(text))).toMatchObject({ reasonCode, result });
  });

  it("publishes an independent dataset-format descriptor", () => {
    expect(nQuadsParserDescriptor).toMatchObject({
      format: OWLDocumentFormats.N_QUADS,
      id: "nquads",
      supportsCompatibleRecovery: false,
    });
    expect(Object.isFrozen(nQuadsParserDescriptor)).toBe(true);
  });
});

describe("N-Quads manager integration", () => {
  it("loads the only named graph and records the graph selection", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(
        `<urn:test:ontology> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Ontology> <urn:test:graph> .
         <urn:test:Class> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/2002/07/owl#Class> <urn:test:graph> .`,
        {
          documentIRI: "https://example.com/root.nq",
          fileName: "root.nq",
        },
      ),
      new OWLOntologyLoaderConfiguration({
        format: OWLDocumentFormats.N_QUADS,
      }),
    );

    expect(
      result.ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 1);
    expect(result.documents[0].context).toMatchObject({
      format: OWLDocumentFormats.N_QUADS,
      merged: false,
      selectedGraph: {
        termType: "NamedNode",
        value: "urn:test:graph",
      },
    });
  });

  it("auto-detects a graph-labelled statement ahead of graph syntaxes", async () => {
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        new StringDocumentSource(
          classDeclaration("urn:test:Detected", "urn:test:graph"),
          { fileName: "ontology" },
        ),
      );

    expect(result.documents[0].context.format).toBe(OWLDocumentFormats.N_QUADS);
  });

  it("rejects multiple non-empty graphs under the default policy", async () => {
    const document = [
      classDeclaration("urn:test:Default"),
      classDeclaration("urn:test:Named", "urn:test:graph"),
    ].join("\n");

    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source(document),
        configuration(),
      ),
    ).rejects.toBeInstanceOf(AmbiguousRdfDatasetError);
  });

  it("uses only the default graph and records named-graph loss", async () => {
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        source(
          [
            classDeclaration("urn:test:Default"),
            classDeclaration("urn:test:Ignored", "urn:test:graph"),
          ].join("\n"),
        ),
        configuration({ rdfDatasetGraphPolicy: "defaultGraphOnly" }),
      );

    expect(
      [...result.ontology.getClassesInSignature()].map(({ iri }) => iri.value),
    ).toEqual(["urn:test:Default"]);
    expect(result.documents[0].context).toMatchObject({
      diagnostics: [
        {
          code: "RDF_NAMED_GRAPHS_IGNORED",
          ignoredGraphCount: 1,
          ignoredQuadCount: 1,
        },
      ],
      merged: false,
      selectedGraph: { termType: "DefaultGraph", value: "" },
    });
  });

  it("selects an explicit named graph and rejects one that is absent", async () => {
    const document = [
      classDeclaration("urn:test:First", "urn:test:first"),
      classDeclaration("urn:test:Selected", "urn:test:selected"),
    ].join("\n");
    const selectedGraph = rdfDataFactory.namedNode("urn:test:selected");
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        source(document),
        configuration({
          rdfDatasetGraphPolicy: "selectGraph",
          selectedGraph,
        }),
      );

    expect(
      [...result.ontology.getClassesInSignature()].map(({ iri }) => iri.value),
    ).toEqual(["urn:test:Selected"]);
    expect(result.documents[0].context.selectedGraph).toMatchObject({
      termType: "NamedNode",
      value: "urn:test:selected",
    });

    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source(document),
        configuration({
          rdfDatasetGraphPolicy: "selectGraph",
          selectedGraph: rdfDataFactory.namedNode("urn:test:missing"),
        }),
      ),
    ).rejects.toBeInstanceOf(GraphSelectionError);
  });

  it("merges graphs explicitly, deduplicates triples, and records context loss", async () => {
    const declaration = classDeclaration("urn:test:Merged");
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        source(
          `${declaration}\n${declaration.replace(" .", " <urn:test:graph> .")}`,
        ),
        configuration({ rdfDatasetGraphPolicy: "merge" }),
      );

    expect(
      result.ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 1);
    expect(result.documents[0].context).toMatchObject({
      diagnostics: [{ code: "RDF_DATASET_GRAPHS_MERGED" }],
      merged: true,
      selectedGraph: { termType: "DefaultGraph", value: "" },
    });
  });

  it("preserves dataset-scoped blank-node identity while merging parsed graphs", async () => {
    const { dataset } = await createNQuadsSyntaxAdapter().parse(
      source(
        '_:shared <urn:test:p> "value" .\n_:shared <urn:test:p> "value" <urn:test:graph> .',
      ),
      configuration({ rdfDatasetGraphPolicy: "merge" }),
    );
    const merged = selectOntologyGraph(
      dataset,
      configuration({ rdfDatasetGraphPolicy: "merge" }),
    );

    expect(dataset.size).toBe(2);
    const sourceBlankNodeIds = new Set(
      [...dataset].map(({ subject }) => subject.value),
    );
    expect(sourceBlankNodeIds).toHaveProperty("size", 1);
    expect(merged.dataset.size).toBe(1);
    expect([...merged.dataset][0].subject).toMatchObject({
      termType: "BlankNode",
      value: [...sourceBlankNodeIds][0],
    });
  });

  it("loads N-Quads in an import closure and through the production VOWL path", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        async load() {
          return classDeclaration("urn:test:Imported", "urn:test:graph");
        },
      },
    });
    const closure = await manager.loadOntologyGraphFromOntologyDocument(
      "Ontology(<urn:test:root> Import(<urn:test:imported>))",
    );
    const imported = closure.documents.find(
      ({ context }) => context.format === OWLDocumentFormats.N_QUADS,
    );
    const vowl = await owl2vowl(
      classDeclaration("urn:test:Rendered", "urn:test:graph"),
      { fileName: "ontology.nq" },
    );

    expect(imported).toBeDefined();
    expect(
      [...imported.ontology.getClassesInSignature()].map(
        ({ iri }) => iri.value,
      ),
    ).toEqual(["urn:test:Imported"]);
    expect(vowl.classAttribute.map(({ iri }) => iri)).toEqual([
      "urn:test:Rendered",
    ]);
  });

  it("keeps TriG unregistered until Phase 14", async () => {
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source("<urn:s> <urn:p> <urn:o> <urn:g> ."),
        new OWLOntologyLoaderConfiguration({
          format: OWLDocumentFormats.TRIG,
        }),
      ),
    ).rejects.toThrow("No parser is registered for format: trig");
  });
});
