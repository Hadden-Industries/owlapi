import {
  AmbiguousRdfDatasetError,
  GraphSelectionError,
} from "../../io/errors.js";
import { rdfDataFactory, rdfDatasetFactory } from "./environment.js";

const GRAPH_TERM_TYPES = new Set(["BlankNode", "DefaultGraph", "NamedNode"]);

const termKey = (term) => {
  if (!term || !GRAPH_TERM_TYPES.has(term.termType)) {
    throw new TypeError("RDF graph values must be RDF/JS graph-name terms");
  }
  return `${term.termType}:${term.value}`;
};

const requireDataset = (dataset) => {
  if (
    !dataset ||
    typeof dataset[Symbol.iterator] !== "function" ||
    !["add", "delete", "has", "match"].every(
      (method) => typeof dataset[method] === "function",
    ) ||
    !Number.isSafeInteger(dataset.size) ||
    dataset.size < 0
  ) {
    throw new TypeError("dataset must implement RDF/JS DatasetCore");
  }
};

const analyzeGraphs = (dataset) => {
  let defaultQuadCount = 0;
  const namedGraphs = new Map();
  for (const currentQuad of dataset) {
    if (currentQuad.graph.termType === "DefaultGraph") {
      defaultQuadCount += 1;
    } else {
      const key = termKey(currentQuad.graph);
      const entry = namedGraphs.get(key) || {
        quadCount: 0,
        term: currentQuad.graph,
      };
      entry.quadCount += 1;
      namedGraphs.set(key, entry);
    }
  }
  return { defaultQuadCount, namedGraphs };
};

const projectGraph = (dataset, selectedGraph) => {
  const projected = rdfDatasetFactory.dataset();
  for (const currentQuad of dataset.match(null, null, null, selectedGraph)) {
    projected.add(
      rdfDataFactory.quad(
        currentQuad.subject,
        currentQuad.predicate,
        currentQuad.object,
      ),
    );
  }
  return projected;
};

const mergeGraphs = (dataset) => {
  const merged = rdfDatasetFactory.dataset();
  for (const currentQuad of dataset) {
    merged.add(
      rdfDataFactory.quad(
        currentQuad.subject,
        currentQuad.predicate,
        currentQuad.object,
      ),
    );
  }
  return merged;
};

const diagnostic = (code, message, details = {}) =>
  Object.freeze({ code, message, severity: "warning", ...details });

const result = ({ dataset, diagnostics = [], merged = false, selectedGraph }) =>
  Object.freeze({
    dataset,
    diagnostics: Object.freeze(diagnostics),
    merged,
    selectedGraph,
  });

export const selectOntologyGraph = (dataset, configuration) => {
  requireDataset(dataset);
  if (
    !configuration ||
    typeof configuration.rdfDatasetGraphPolicy !== "string"
  ) {
    throw new TypeError("configuration must define rdfDatasetGraphPolicy");
  }

  const defaultGraph = rdfDataFactory.defaultGraph();
  const { defaultQuadCount, namedGraphs } = analyzeGraphs(dataset);
  switch (configuration.rdfDatasetGraphPolicy) {
    case "requireSingleGraph": {
      if (defaultQuadCount > 0 && namedGraphs.size > 0) {
        throw new AmbiguousRdfDatasetError(
          "The RDF dataset has both default-graph and named-graph content",
          { graphCount: namedGraphs.size + 1 },
        );
      }
      if (namedGraphs.size > 1) {
        throw new AmbiguousRdfDatasetError(
          "The RDF dataset has more than one non-empty named graph",
          { graphCount: namedGraphs.size },
        );
      }
      const selectedGraph =
        namedGraphs.size === 1
          ? namedGraphs.values().next().value.term
          : defaultGraph;
      return result({
        dataset: projectGraph(dataset, selectedGraph),
        selectedGraph,
      });
    }
    case "defaultGraphOnly": {
      const diagnostics = [];
      if (namedGraphs.size > 0) {
        diagnostics.push(
          diagnostic(
            "RDF_NAMED_GRAPHS_IGNORED",
            "Named-graph content was ignored by the defaultGraphOnly policy",
            {
              ignoredGraphCount: namedGraphs.size,
              ignoredQuadCount: [...namedGraphs.values()].reduce(
                (total, entry) => total + entry.quadCount,
                0,
              ),
            },
          ),
        );
      }
      return result({
        dataset: projectGraph(dataset, defaultGraph),
        diagnostics,
        selectedGraph: defaultGraph,
      });
    }
    case "selectGraph": {
      const selectedGraph = configuration.selectedGraph;
      termKey(selectedGraph);
      const selectedKey = termKey(selectedGraph);
      const graphExists =
        selectedGraph.termType === "DefaultGraph" ||
        namedGraphs.has(selectedKey);
      if (!graphExists) {
        throw new GraphSelectionError(
          "The requested graph does not exist in the RDF dataset",
          { selectedGraph },
        );
      }
      return result({
        dataset: projectGraph(dataset, selectedGraph),
        selectedGraph,
      });
    }
    case "merge":
      return result({
        dataset: mergeGraphs(dataset),
        diagnostics: [
          diagnostic(
            "RDF_DATASET_GRAPHS_MERGED",
            "RDF graph membership was removed by the merge policy",
            {
              sourceGraphCount:
                namedGraphs.size + (defaultQuadCount > 0 ? 1 : 0),
            },
          ),
        ],
        merged: true,
        selectedGraph: defaultGraph,
      });
    default:
      throw new RangeError(
        `Unknown rdfDatasetGraphPolicy: ${configuration.rdfDatasetGraphPolicy}`,
      );
  }
};
