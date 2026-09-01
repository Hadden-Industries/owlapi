import { jest } from "@jest/globals";

import { OWLOntologyLoaderConfiguration } from "../../index.js";
import { rdfDataFactory, rdfDatasetFactory } from "../rdfjs/environment.js";
import { RdfToOwlTranslator } from "./rdfToOwlTranslator.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const OWL = "http://www.w3.org/2002/07/owl#";
const EX = "https://example.com/strict-complete#";

const selectedGraph = rdfDataFactory.namedNode(`${EX}selected-graph`);
const ontologyNode = rdfDataFactory.namedNode(`${EX}ontology`);
const sourceLocation = Object.freeze({ column: 7, line: 19, offset: 311 });

const namedNode = (...values) => rdfDataFactory.namedNode(...values);
const blankNode = (...values) => rdfDataFactory.blankNode(...values);
const literal = (...values) => rdfDataFactory.literal(...values);
const quad = (...values) => rdfDataFactory.quad(...values);

const locatedQuad = (currentQuad, location) =>
  Object.freeze({
    equals: (other) => currentQuad.equals(other),
    graph: currentQuad.graph,
    object: currentQuad.object,
    predicate: currentQuad.predicate,
    sourceLocation: Object.freeze({ ...location }),
    subject: currentQuad.subject,
    termType: currentQuad.termType,
    value: currentQuad.value,
  });

const describeTerm = (term) => ({
  ...(term.termType === "Literal"
    ? {
        datatype: {
          termType: term.datatype.termType,
          value: term.datatype.value,
        },
        ...(term.direction ? { direction: term.direction } : {}),
        language: term.language,
      }
    : {}),
  termType: term.termType,
  value: term.value,
});

const configurationFor = (parsingMode, changes = {}) =>
  new OWLOntologyLoaderConfiguration({
    parsingMode,
    rdfDatasetGraphPolicy: "selectGraph",
    selectedGraph,
    ...changes,
  });

const datasetWith = (unconsumedQuad) =>
  rdfDatasetFactory.dataset([
    quad(
      ontologyNode,
      namedNode(`${RDF}type`),
      namedNode(`${OWL}Ontology`),
      selectedGraph,
    ),
    locatedQuad(unconsumedQuad, sourceLocation),
  ]);

const datasetWhoseMatchDropsQuadMetadata = (quads) => {
  const sourceDataset = rdfDatasetFactory.dataset(quads);
  const matchingDataset = rdfDatasetFactory.dataset(
    quads.map((currentQuad) =>
      quad(
        currentQuad.subject,
        currentQuad.predicate,
        currentQuad.object,
        currentQuad.graph,
      ),
    ),
  );
  const datasetFacade = {
    add: (currentQuad) => {
      sourceDataset.add(currentQuad);
      matchingDataset.add(
        quad(
          currentQuad.subject,
          currentQuad.predicate,
          currentQuad.object,
          currentQuad.graph,
        ),
      );
      return datasetFacade;
    },
    delete: (currentQuad) => {
      sourceDataset.delete(currentQuad);
      matchingDataset.delete(currentQuad);
      return datasetFacade;
    },
    has: (currentQuad) => matchingDataset.has(currentQuad),
    match: (...terms) => matchingDataset.match(...terms),
    get size() {
      return sourceDataset.size;
    },
    [Symbol.iterator]: () => sourceDataset[Symbol.iterator](),
  };
  return datasetFacade;
};

const traversalCountingDataset = (quads) => {
  const sourceDataset = rdfDatasetFactory.dataset(quads);
  const yieldedQuadCounts = [];
  const datasetFacade = {
    add: (currentQuad) => {
      sourceDataset.add(currentQuad);
      return datasetFacade;
    },
    delete: (currentQuad) => {
      sourceDataset.delete(currentQuad);
      return datasetFacade;
    },
    has: (currentQuad) => sourceDataset.has(currentQuad),
    match: (...terms) => sourceDataset.match(...terms),
    get size() {
      return sourceDataset.size;
    },
    [Symbol.iterator]: () => {
      const traversalIndex = yieldedQuadCounts.length;
      yieldedQuadCounts.push(0);
      const sourceIterator = sourceDataset[Symbol.iterator]();
      return {
        next: () => {
          const result = sourceIterator.next();
          if (!result.done) {
            yieldedQuadCounts[traversalIndex] += 1;
          }
          return result;
        },
        [Symbol.iterator]() {
          return this;
        },
      };
    },
  };
  return { dataset: datasetFacade, yieldedQuadCounts };
};

const unconsumedCases = [
  {
    compatibleDisposition: "silent-non-owl-rdf",
    name: "an arbitrary predicate",
    statement: () =>
      quad(
        blankNode("arbitrary-subject"),
        namedNode(`${EX}arbitraryPredicate`),
        namedNode(`${EX}arbitrary-object`),
        selectedGraph,
      ),
  },
  {
    compatibleDisposition: "warning",
    name: "an otherwise ignored RDF typing statement",
    statement: () =>
      quad(
        namedNode(`${EX}legacy-property`),
        namedNode(`${RDF}type`),
        namedNode(`${RDF}Property`),
        selectedGraph,
      ),
  },
  {
    compatibleDisposition: "warning",
    name: "an extra RDF list edge",
    statement: () =>
      quad(
        blankNode("orphan-list-node"),
        namedNode(`${RDF}first`),
        namedNode(`${EX}orphan-list-member`),
        selectedGraph,
      ),
  },
  {
    compatibleDisposition: "silent-non-owl-rdf",
    name: "an RDF reification fragment",
    statement: () =>
      quad(
        blankNode("orphan-reification"),
        namedNode(`${RDF}subject`),
        namedNode(`${EX}reified-subject`),
        selectedGraph,
      ),
  },
  {
    compatibleDisposition: "silent-non-owl-rdf",
    name: "an unrelated named subject",
    statement: () =>
      quad(
        namedNode(`${EX}unrelated-subject`),
        namedNode(`${EX}unrelated-predicate`),
        namedNode(`${EX}unrelated-object`),
        selectedGraph,
      ),
  },
  {
    compatibleDisposition: "recovered-annotation",
    name: "a surplus annotation-shaped statement",
    statement: () =>
      quad(
        ontologyNode,
        namedNode(`${EX}editorialNote`),
        literal("retained only by compatible mode"),
        selectedGraph,
      ),
  },
];

const expectedStatementDetails = (
  statement,
  reconstructionGraph = selectedGraph,
) => ({
  column: sourceLocation.column,
  graph: reconstructionGraph.value,
  line: sourceLocation.line,
  object: statement.object.value,
  offset: sourceLocation.offset,
  predicate: statement.predicate.value,
  quad: {
    graph: describeTerm(reconstructionGraph),
    object: describeTerm(statement.object),
    predicate: describeTerm(statement.predicate),
    subject: describeTerm(statement.subject),
  },
  subject: statement.subject.value,
});

describe("RdfToOwlTranslator strict selected-graph completeness", () => {
  it.each(unconsumedCases)("rejects $name", async ({ statement }) => {
    const unconsumedStatement = statement();

    await expect(
      new RdfToOwlTranslator().translate(datasetWith(unconsumedStatement), {
        configuration: configurationFor("strict"),
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      ...expectedStatementDetails(unconsumedStatement),
    });
  });

  it.each(unconsumedCases)(
    "preserves the compatible-mode disposition for $name",
    async ({ compatibleDisposition, statement }) => {
      const unconsumedStatement = statement();
      const result = await new RdfToOwlTranslator().translate(
        datasetWith(unconsumedStatement),
        { configuration: configurationFor("compatible") },
      );

      if (compatibleDisposition === "warning") {
        expect(result.context.diagnostics).toEqual([
          expect.objectContaining({
            code: "RDF_UNCONSUMED_OWL_TRIPLE",
            severity: "warning",
            ...expectedStatementDetails(unconsumedStatement),
          }),
        ]);
        expect(Object.isFrozen(result.context.diagnostics[0].quad)).toBe(true);
        expect(
          Object.values(result.context.diagnostics[0].quad).every((term) =>
            Object.isFrozen(term),
          ),
        ).toBe(true);
      } else if (compatibleDisposition === "recovered-annotation") {
        expect(result.context.diagnostics).toEqual([
          expect.objectContaining({
            code: "RDF_UNDECLARED_ANNOTATION_PROPERTY",
            iri: unconsumedStatement.predicate.value,
            severity: "warning",
          }),
        ]);
        expect(result.ontology.getAnnotations()).toHaveProperty("size", 1);
      } else {
        expect(result.context.diagnostics).toEqual([]);
      }
    },
  );

  it("omits available quad locations when source-location reporting is disabled", async () => {
    const unconsumedStatement = unconsumedCases[1].statement();
    const result = await new RdfToOwlTranslator().translate(
      datasetWith(unconsumedStatement),
      {
        configuration: configurationFor("compatible", {
          sourceLocations: false,
        }),
      },
    );
    const [diagnostic] = result.context.diagnostics;

    expect(diagnostic).toMatchObject({ code: "RDF_UNCONSUMED_OWL_TRIPLE" });
    expect(diagnostic).not.toHaveProperty("column");
    expect(diagnostic).not.toHaveProperty("line");
    expect(diagnostic).not.toHaveProperty("offset");
  });

  it("distinguishes ignored directional literals and retains each statement's location", async () => {
    const subject = namedNode(`${EX}directional-subject`);
    const predicate = namedNode(`${OWL}unsupportedMappingPredicate`);
    const leftToRightLocation = Object.freeze({
      column: 3,
      line: 23,
      offset: 401,
    });
    const rightToLeftLocation = Object.freeze({
      column: 5,
      line: 24,
      offset: 449,
    });
    const leftToRightStatement = quad(
      subject,
      predicate,
      literal("directional text", { direction: "ltr", language: "en" }),
      selectedGraph,
    );
    const rightToLeftStatement = quad(
      subject,
      predicate,
      literal("directional text", { direction: "rtl", language: "en" }),
      selectedGraph,
    );
    const result = await new RdfToOwlTranslator().translate(
      rdfDatasetFactory.dataset([
        quad(
          ontologyNode,
          namedNode(`${RDF}type`),
          namedNode(`${OWL}Ontology`),
          selectedGraph,
        ),
        locatedQuad(leftToRightStatement, leftToRightLocation),
        locatedQuad(rightToLeftStatement, rightToLeftLocation),
      ]),
      { configuration: configurationFor("compatible") },
    );

    expect(result.context.diagnostics).toEqual([
      expect.objectContaining({
        code: "RDF_UNCONSUMED_OWL_TRIPLE",
        ...leftToRightLocation,
        quad: expect.objectContaining({
          object: describeTerm(leftToRightStatement.object),
        }),
      }),
      expect.objectContaining({
        code: "RDF_UNCONSUMED_OWL_TRIPLE",
        ...rightToLeftLocation,
        quad: expect.objectContaining({
          object: describeTerm(rightToLeftStatement.object),
        }),
      }),
    ]);
  });

  it("retains source metadata exposed only by the original dataset iterator", async () => {
    const unconsumedStatement = unconsumedCases[1].statement();
    const input = datasetWhoseMatchDropsQuadMetadata([
      quad(
        ontologyNode,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}Ontology`),
        selectedGraph,
      ),
      locatedQuad(unconsumedStatement, sourceLocation),
    ]);

    await expect(
      new RdfToOwlTranslator().translate(input, {
        configuration: configurationFor("strict"),
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      ...expectedStatementDetails(unconsumedStatement),
    });
  });

  it("retains an unambiguous source location after graph merging", async () => {
    const sourceGraph = namedNode(`${EX}merge-source-graph`);
    const reconstructionGraph = rdfDataFactory.defaultGraph();
    const unconsumedStatement = quad(
      namedNode(`${EX}merged-subject`),
      namedNode(`${RDF}type`),
      namedNode(`${RDF}Property`),
      sourceGraph,
    );
    const input = rdfDatasetFactory.dataset([
      quad(
        ontologyNode,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}Ontology`),
        sourceGraph,
      ),
      locatedQuad(unconsumedStatement, sourceLocation),
    ]);

    await expect(
      new RdfToOwlTranslator().translate(input, {
        configuration: configurationFor("strict", {
          rdfDatasetGraphPolicy: "merge",
          selectedGraph: undefined,
        }),
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      ...expectedStatementDetails(unconsumedStatement, reconstructionGraph),
    });
  });

  it("does not misattribute a location when graph merging collapses duplicate triples", async () => {
    const firstSourceGraph = namedNode(`${EX}first-merge-source-graph`);
    const secondSourceGraph = namedNode(`${EX}second-merge-source-graph`);
    const subject = namedNode(`${EX}merged-duplicate-subject`);
    const predicate = namedNode(`${RDF}type`);
    const object = namedNode(`${RDF}Property`);
    const input = rdfDatasetFactory.dataset([
      quad(ontologyNode, namedNode(`${RDF}type`), namedNode(`${OWL}Ontology`)),
      locatedQuad(
        quad(subject, predicate, object, firstSourceGraph),
        sourceLocation,
      ),
      locatedQuad(quad(subject, predicate, object, secondSourceGraph), {
        column: 2,
        line: 31,
        offset: 503,
      }),
    ]);

    let failure;
    try {
      await new RdfToOwlTranslator().translate(input, {
        configuration: configurationFor("strict", {
          rdfDatasetGraphPolicy: "merge",
          selectedGraph: undefined,
        }),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      graph: "",
      object: object.value,
      predicate: predicate.value,
      subject: subject.value,
    });
    expect(failure).not.toHaveProperty("column");
    expect(failure).not.toHaveProperty("line");
    expect(failure).not.toHaveProperty("offset");
  });

  it("does not add a source-dataset traversal when no quad exposes a source location", async () => {
    const inputQuads = [
      quad(
        namedNode(`${EX}declared-class`),
        namedNode(`${RDF}type`),
        namedNode(`${OWL}Class`),
        selectedGraph,
      ),
    ];
    const withLocations = traversalCountingDataset(inputQuads);
    const withoutLocations = traversalCountingDataset(inputQuads);

    await new RdfToOwlTranslator().translate(withLocations.dataset, {
      configuration: configurationFor("strict"),
    });
    await new RdfToOwlTranslator().translate(withoutLocations.dataset, {
      configuration: configurationFor("strict", { sourceLocations: false }),
    });

    expect(withLocations.yieldedQuadCounts).toHaveLength(
      withoutLocations.yieldedQuadCounts.length,
    );
  });

  it("does not inspect source metadata when compatible diagnostics are disabled", async () => {
    const declaration = quad(
      namedNode(`${EX}quiet-compatible-class`),
      namedNode(`${RDF}type`),
      namedNode(`${OWL}Class`),
      selectedGraph,
    );
    const inputQuad = Object.freeze({
      equals: (other) => declaration.equals(other),
      graph: declaration.graph,
      object: declaration.object,
      predicate: declaration.predicate,
      get sourceLocation() {
        throw new Error("source metadata must remain unread");
      },
      subject: declaration.subject,
      termType: declaration.termType,
      value: declaration.value,
    });

    await expect(
      new RdfToOwlTranslator().translate(
        rdfDatasetFactory.dataset([inputQuad]),
        {
          configuration: configurationFor("compatible", {
            collectWarnings: false,
          }),
        },
      ),
    ).resolves.toMatchObject({
      context: { diagnostics: [] },
    });
  });

  it("snapshots accessor-backed source metadata with exactly one read", async () => {
    const statement = unconsumedCases[1].statement();
    let sourceLocationReadCount = 0;
    const accessorLocatedStatement = Object.freeze({
      equals: (other) => statement.equals(other),
      graph: statement.graph,
      object: statement.object,
      predicate: statement.predicate,
      get sourceLocation() {
        sourceLocationReadCount += 1;
        return {
          column: sourceLocationReadCount,
          line: 100 + sourceLocationReadCount,
          offset: 1_000 + sourceLocationReadCount,
        };
      },
      subject: statement.subject,
      termType: statement.termType,
      value: statement.value,
    });
    const input = rdfDatasetFactory.dataset([
      quad(
        ontologyNode,
        namedNode(`${RDF}type`),
        namedNode(`${OWL}Ontology`),
        selectedGraph,
      ),
      accessorLocatedStatement,
    ]);

    let failure;
    try {
      await new RdfToOwlTranslator().translate(input, {
        configuration: configurationFor("strict"),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      column: 1,
      line: 101,
      offset: 1_001,
    });
    expect(sourceLocationReadCount).toBe(1);
  });

  it("does not construct diagnostic term descriptors for silently ignored compatible statements", async () => {
    const originalFreeze = Object.freeze;
    const frozenDiagnosticTermDescriptors = [];
    const input = datasetWith(unconsumedCases[0].statement());
    const configuration = configurationFor("compatible", {
      collectWarnings: false,
    });
    const freezeSpy = jest
      .spyOn(Object, "freeze")
      .mockImplementation((value) => {
        if (
          value &&
          typeof value === "object" &&
          Object.hasOwn(value, "termType") &&
          Object.hasOwn(value, "value") &&
          typeof value.equals !== "function"
        ) {
          frozenDiagnosticTermDescriptors.push(value);
        }
        return originalFreeze(value);
      });

    let result;
    try {
      result = await new RdfToOwlTranslator().translate(input, {
        configuration,
      });
    } finally {
      freezeSpy.mockRestore();
    }

    expect(result.context.diagnostics).toEqual([]);
    expect(frozenDiagnosticTermDescriptors).toEqual([]);
  });

  it("does not inspect source metadata outside the graph selected for reconstruction", async () => {
    const ignoredGraph = namedNode(`${EX}ignored-source-location-graph`);
    const ignoredStatement = quad(
      namedNode(`${EX}ignored-subject`),
      namedNode(`${EX}ignored-predicate`),
      namedNode(`${EX}ignored-object`),
      ignoredGraph,
    );
    const inaccessibleSourceLocation = Object.freeze({
      equals: (other) => ignoredStatement.equals(other),
      graph: ignoredStatement.graph,
      object: ignoredStatement.object,
      predicate: ignoredStatement.predicate,
      get sourceLocation() {
        throw new Error("unselected source metadata must remain unread");
      },
      subject: ignoredStatement.subject,
      termType: ignoredStatement.termType,
      value: ignoredStatement.value,
    });
    const input = rdfDatasetFactory.dataset([
      quad(
        namedNode(`${EX}selected-class`),
        namedNode(`${RDF}type`),
        namedNode(`${OWL}Class`),
        selectedGraph,
      ),
      inaccessibleSourceLocation,
    ]);

    await expect(
      new RdfToOwlTranslator().translate(input, {
        configuration: configurationFor("strict"),
      }),
    ).resolves.toMatchObject({
      context: { selectedGraph: { value: selectedGraph.value } },
    });
  });

  it("checks cancellation cooperatively while disambiguating merged source locations", async () => {
    const sourceGraph = namedNode(`${EX}cooperative-merge-source-graph`);
    const inputQuads = Array.from({ length: 1025 }, (_, index) =>
      quad(
        namedNode(`${EX}cooperative-class-${index}`),
        namedNode(`${RDF}type`),
        namedNode(`${OWL}Class`),
        sourceGraph,
      ),
    );
    inputQuads[0] = locatedQuad(inputQuads[0], sourceLocation);
    const input = traversalCountingDataset(inputQuads);
    const cancellationSignal = {
      addEventListener: () => {},
      get aborted() {
        return (input.yieldedQuadCounts[3] ?? 0) >= 512;
      },
      throwIfAborted() {
        if (this.aborted) {
          const failure = new Error("cooperative source-location cancellation");
          failure.name = "AbortError";
          throw failure;
        }
      },
    };

    await expect(
      new RdfToOwlTranslator().translate(input.dataset, {
        configuration: configurationFor("strict", {
          rdfDatasetGraphPolicy: "merge",
          selectedGraph: undefined,
          signal: cancellationSignal,
        }),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(input.yieldedQuadCounts[3]).toBe(512);
    expect(input.yieldedQuadCounts[3]).toBeLessThan(input.dataset.size);
  });
});
