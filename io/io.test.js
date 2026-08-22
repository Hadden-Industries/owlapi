import {
  AmbiguousRdfDatasetError,
  DocumentLoadError,
  GraphSelectionError,
  MissingImportError,
  OWLDocumentFormat,
  OWLOntologyCreationError,
  OWLOntologyLoaderConfiguration,
  OWLOntologyStateError,
  ParserMismatchError,
  ResourceLimitError,
  SecurityPolicyError,
  StringDocumentSource,
  UnloadableImportError,
  UnparsableOntologyException,
  UnsupportedConstructError,
  OWLSyntaxError,
} from "../index.js";

describe("document loading interface", () => {
  it("keeps document metadata and loader configuration immutable", () => {
    const source = new StringDocumentSource("Ontology()", {
      contentType: "text/owl-functional",
      documentIRI: "https://example.com/document",
      fileName: "ontology.ofn",
    });
    const defaults = OWLOntologyLoaderConfiguration.defaults();
    const compatible = defaults.withParsingMode("compatible");

    expect(source.getText()).toBe("Ontology()");
    expect(source.getDocumentIRI().value).toBe("https://example.com/document");
    expect(source.getContentType()).toBe("text/owl-functional");
    expect(source.getFileName()).toBe("ontology.ofn");
    expect(defaults.parsingMode).toBe("strict");
    expect(compatible.parsingMode).toBe("compatible");
    expect(defaults.parsingMode).toBe("strict");
    expect(Object.isFrozen(compatible)).toBe(true);
  });

  it("rejects unknown, non-finite, and mistyped loader settings", () => {
    expect(
      () => new OWLOntologyLoaderConfiguration({ maxInputBytes: Infinity }),
    ).toThrow(RangeError);
    expect(
      () => new OWLOntologyLoaderConfiguration({ maxImportDepth: -1 }),
    ).toThrow(RangeError);
    expect(
      () => new OWLOntologyLoaderConfiguration({ remoteImports: "false" }),
    ).toThrow(TypeError);
    expect(() => new OWLOntologyLoaderConfiguration({ relaxed: true })).toThrow(
      TypeError,
    );
    expect(() => new OWLOntologyLoaderConfiguration({ format: "" })).toThrow(
      TypeError,
    );
    expect(
      () =>
        new OWLOntologyLoaderConfiguration({
          format: { key: "functional" },
        }),
    ).toThrow(TypeError);
  });

  it("validates document-source hints and immutable format metadata", () => {
    expect(
      () => new StringDocumentSource("Ontology()", { documentIRI: "" }),
    ).toThrow(TypeError);
    expect(
      () => new StringDocumentSource("Ontology()", { contentType: 42 }),
    ).toThrow(TypeError);
    expect(
      () => new StringDocumentSource("Ontology()", { fileName: false }),
    ).toThrow(TypeError);
    expect(
      () => new OWLDocumentFormat({ key: "test", mediaTypes: [42] }),
    ).toThrow(TypeError);
    expect(
      () => new OWLDocumentFormat({ key: "test", mediaTypes: [""] }),
    ).toThrow(TypeError);
  });

  it("copies immutable document-format parameters without sharing caller data", () => {
    const expandContext = {
      "@context": {
        ex: "urn:before:",
      },
    };
    const base = new OWLDocumentFormat({
      isRdf: true,
      key: "jsonld-test",
      mediaTypes: ["application/ld+json"],
    });
    const withContext = base.withParameter("expandContext", expandContext);
    const withMode = withContext.withParameter("processingMode", "json-ld-1.0");

    expandContext["@context"].ex = "urn:after:";

    expect(base.getParameter("expandContext")).toBeUndefined();
    expect(withContext.getParameter("processingMode", "json-ld-1.1")).toBe(
      "json-ld-1.1",
    );
    expect(withMode.getParameter("processingMode")).toBe("json-ld-1.0");
    expect(withMode.getParameter("expandContext")).toEqual({
      "@context": { ex: "urn:before:" },
    });
    expect(Object.isFrozen(withMode.getParameter("expandContext"))).toBe(true);
    expect(
      Object.isFrozen(withMode.getParameter("expandContext")["@context"]),
    ).toBe(true);
    expect(Object.isFrozen(withMode)).toBe(true);
  });

  it("rejects invalid document-format parameter keys and mutable-only values", () => {
    const format = new OWLDocumentFormat({ key: "test" });

    expect(() => format.withParameter("", "value")).toThrow(TypeError);
    expect(() => format.withParameter("callback", () => {})).toThrow(TypeError);

    const cyclic = {};
    cyclic.self = cyclic;
    expect(() => format.withParameter("cyclic", cyclic)).toThrow(TypeError);
  });

  it("treats prototype-shaped parameter names as ordinary data keys", () => {
    const format = new OWLDocumentFormat({ key: "test" }).withParameter(
      "__proto__",
      "parameter-value",
    );

    expect(format.getParameter("__proto__")).toBe("parameter-value");
  });

  it("snapshots the selected RDF graph term", () => {
    const selectedGraph = {
      equals(other) {
        return this.termType === other?.termType && this.value === other?.value;
      },
      termType: "NamedNode",
      value: "urn:graph:before",
    };
    const configuration = new OWLOntologyLoaderConfiguration({
      rdfDatasetGraphPolicy: "selectGraph",
      selectedGraph,
    });

    selectedGraph.value = "urn:graph:after";

    expect(configuration.selectedGraph.value).toBe("urn:graph:before");
    expect(Object.isFrozen(configuration.selectedGraph)).toBe(true);
  });

  it("exposes stable typed parser and aggregate error contracts", () => {
    const mismatch = new ParserMismatchError("not functional", {
      parserId: "functional",
    });
    const aggregate = new UnparsableOntologyException([mismatch]);

    expect(mismatch.code).toBe("PARSER_MISMATCH");
    expect(mismatch.parserId).toBe("functional");
    expect(aggregate).toBeInstanceOf(AggregateError);
    expect(aggregate.code).toBe("UNPARSABLE_ONTOLOGY");
    expect(aggregate.errors).toEqual([mismatch]);
  });

  it("implements every canonical public error code and hierarchy", () => {
    const errors = [
      [new ParserMismatchError(), "PARSER_MISMATCH", Error],
      [new OWLSyntaxError(), "OWL_SYNTAX_ERROR", Error],
      [new UnsupportedConstructError(), "UNSUPPORTED_CONSTRUCT", Error],
      [new ResourceLimitError(), "RESOURCE_LIMIT_EXCEEDED", Error],
      [new SecurityPolicyError(), "SECURITY_POLICY_VIOLATION", Error],
      [new DocumentLoadError(), "DOCUMENT_LOAD_FAILED", Error],
      [new MissingImportError(), "MISSING_IMPORT", DocumentLoadError],
      [new UnloadableImportError(), "UNLOADABLE_IMPORT", DocumentLoadError],
      [new OWLOntologyCreationError(), "ONTOLOGY_CREATION_FAILED", Error],
      [
        new AmbiguousRdfDatasetError(),
        "AMBIGUOUS_RDF_DATASET",
        OWLOntologyCreationError,
      ],
      [
        new GraphSelectionError(),
        "RDF_GRAPH_SELECTION_FAILED",
        OWLOntologyCreationError,
      ],
      [new OWLOntologyStateError(), "ONTOLOGY_STATE_INVALID", Error],
      [
        new UnparsableOntologyException([]),
        "UNPARSABLE_ONTOLOGY",
        AggregateError,
      ],
    ];

    for (const [error, code, parent] of errors) {
      expect(error).toBeInstanceOf(parent);
      expect(error.code).toBe(code);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it("keeps canonical error identity immutable from detail fields", () => {
    const cause = new Error("cause");
    const error = new ParserMismatchError("canonical message", {
      cause,
      code: "OVERRIDDEN",
      message: "overridden message",
      name: "OverriddenName",
      parserId: "functional",
    });
    const hostileDetails = JSON.parse('{"__proto__":{"polluted":true}}');
    const protectedError = new ParserMismatchError(
      "protected identity",
      hostileDetails,
    );

    expect(error).toMatchObject({
      cause,
      code: "PARSER_MISMATCH",
      message: "canonical message",
      name: "ParserMismatchError",
      parserId: "functional",
    });
    expect(Object.getPrototypeOf(protectedError)).toBe(
      ParserMismatchError.prototype,
    );
    expect(protectedError.polluted).toBeUndefined();
  });
});
