import dataFactory from "@rdfjs/data-model";
import datasetFactory from "@rdfjs/dataset";

import {
  AmbiguousRdfDatasetError,
  GraphSelectionError,
  OWLOntologyLoaderConfiguration,
} from "../io/index.js";
import { selectOntologyGraph } from "./graphPolicy.js";

const ex = (localName) =>
  dataFactory.namedNode(`https://example.com/${localName}`);
const quad = (localName, graph = dataFactory.defaultGraph()) =>
  dataFactory.quad(ex(`${localName}-s`), ex("p"), ex(`${localName}-o`), graph);

describe("selectOntologyGraph", () => {
  it("requires the complete RDF/JS DatasetCore boundary", () => {
    const partialDataset = {
      *[Symbol.iterator]() {},
      match() {
        return this;
      },
      size: 0,
    };

    expect(() =>
      selectOntologyGraph(
        partialDataset,
        OWLOntologyLoaderConfiguration.defaults(),
      ),
    ).toThrow(/DatasetCore/);
  });

  it("accepts the only non-empty graph and projects it to an RDF graph", () => {
    const graphName = ex("graph");
    const input = datasetFactory.dataset([quad("one", graphName)]);

    const result = selectOntologyGraph(
      input,
      OWLOntologyLoaderConfiguration.defaults(),
    );

    expect(result.dataset.size).toBe(1);
    expect([...result.dataset][0].graph.termType).toBe("DefaultGraph");
    expect(result.selectedGraph.equals(graphName)).toBe(true);
    expect(input.match(null, null, null, graphName).size).toBe(1);
  });

  it("rejects a dataset with more than one non-empty graph by default", () => {
    const input = datasetFactory.dataset([
      quad("default"),
      quad("named", ex("graph")),
    ]);

    expect(() =>
      selectOntologyGraph(input, OWLOntologyLoaderConfiguration.defaults()),
    ).toThrow(AmbiguousRdfDatasetError);
  });

  it("records loss when only the default graph is requested", () => {
    const input = datasetFactory.dataset([
      quad("default"),
      quad("named", ex("graph")),
    ]);
    const configuration =
      OWLOntologyLoaderConfiguration.defaults().withRdfDatasetGraphPolicy(
        "defaultGraphOnly",
      );

    const result = selectOntologyGraph(input, configuration);

    expect(result.dataset.size).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "RDF_NAMED_GRAPHS_IGNORED" }),
    ]);
  });

  it("selects an explicitly named graph and rejects a missing one", () => {
    const selectedGraph = ex("selected");
    const input = datasetFactory.dataset([
      quad("selected", selectedGraph),
      quad("other", ex("other")),
    ]);
    const configuration =
      OWLOntologyLoaderConfiguration.defaults().withRdfDatasetGraphPolicy(
        "selectGraph",
        selectedGraph,
      );

    expect(selectOntologyGraph(input, configuration).dataset.size).toBe(1);

    const missingConfiguration = configuration.withRdfDatasetGraphPolicy(
      "selectGraph",
      ex("missing"),
    );
    expect(() => selectOntologyGraph(input, missingConfiguration)).toThrow(
      GraphSelectionError,
    );
  });

  it("rejects RDF terms that cannot identify dataset graphs", () => {
    const input = datasetFactory.dataset([quad("default")]);
    const configuration =
      OWLOntologyLoaderConfiguration.defaults().withRdfDatasetGraphPolicy(
        "selectGraph",
        dataFactory.literal("not-a-graph-name"),
      );

    expect(() => selectOntologyGraph(input, configuration)).toThrow(TypeError);
  });

  it("merges graphs without changing blank-node identity and deduplicates triples", () => {
    const blankNode = dataFactory.blankNode("shared");
    const predicate = ex("p");
    const object = ex("o");
    const input = datasetFactory.dataset([
      dataFactory.quad(blankNode, predicate, object),
      dataFactory.quad(blankNode, predicate, object, ex("graph")),
    ]);
    const configuration =
      OWLOntologyLoaderConfiguration.defaults().withRdfDatasetGraphPolicy(
        "merge",
      );

    const result = selectOntologyGraph(input, configuration);

    expect(result.dataset.size).toBe(1);
    expect([...result.dataset][0].subject.equals(blankNode)).toBe(true);
    expect(result.merged).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "RDF_DATASET_GRAPHS_MERGED" }),
    ]);
  });
});
