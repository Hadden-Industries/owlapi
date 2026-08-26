import { EventEmitter } from "node:events";
import { Transform } from "node:stream";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";

import {
  createNQuadsSyntaxAdapter,
  createTurtleSyntaxAdapter,
  N3SyntaxAdapter,
} from "./n3SyntaxAdapter.js";

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration(values);

describe("N3SyntaxAdapter replacement boundary", () => {
  it("accepts only the independently governed exact-format policies", () => {
    expect(() => new N3SyntaxAdapter()).toThrow(
      "requires a supported exact-format policy",
    );
    expect(
      () =>
        new N3SyntaxAdapter({
          mediaType: "application/n-triples",
          syntaxName: "N-Triples",
        }),
    ).not.toThrow();
    expect(
      () => new N3SyntaxAdapter({ mediaType: "text/n3", syntaxName: "N3" }),
    ).toThrow("requires a supported exact-format policy");
  });

  it("loads the implementation lazily and normalizes foreign quads and prefixes", async () => {
    const chunks = [];
    const parserOptions = [];
    const foreignSubject = { termType: "BlankNode", value: "foreign-node" };
    let loadCount = 0;

    class ReplacementParser extends Transform {
      constructor(options) {
        super({ readableObjectMode: true });
        parserOptions.push(options);
      }

      _transform(chunk, encoding, callback) {
        chunks.push(String(chunk));
        callback();
      }

      _flush(callback) {
        this.emit("prefix", "ex", {
          termType: "NamedNode",
          value: "urn:test:",
        });
        this.push({
          graph: { termType: "DefaultGraph", value: "" },
          object: {
            datatype: { termType: "NamedNode", value: XSD_STRING },
            direction: "",
            language: "",
            termType: "Literal",
            value: "foreign value",
          },
          predicate: { termType: "NamedNode", value: "urn:test:label" },
          subject: foreignSubject,
          termType: "Quad",
          value: "",
        });
        callback();
      }
    }

    const adapter = createTurtleSyntaxAdapter({
      async loadImplementation() {
        loadCount += 1;
        return {
          Lexer: class ReplacementLexer {
            tokenize() {}
          },
          StreamParser: ReplacementParser,
        };
      },
    });
    expect(loadCount).toBe(0);

    const source = new StringDocumentSource("foreign Turtle bytes", {
      documentIRI: "https://example.com/documents/ontology.ttl",
    });
    const result = await adapter.parse(source, configuration());

    expect(loadCount).toBe(1);
    expect(chunks.join("")).toBe(source.getText());
    expect(parserOptions).toHaveLength(1);
    expect(parserOptions[0]).toMatchObject({
      baseIRI: "https://example.com/documents/ontology.ttl",
      factory: rdfDataFactory,
      format: "text/turtle",
    });

    expect(result.prefixes).toEqual({ ex: "urn:test:" });
    expect(Object.isFrozen(result.prefixes)).toBe(true);
    expect(result.dataset.size).toBe(1);
    const [quad] = [...result.dataset];
    expect(quad.subject).toEqual(rdfDataFactory.blankNode("foreign-node"));
    expect(quad.predicate).toEqual(rdfDataFactory.namedNode("urn:test:label"));
    expect(quad.object).toEqual(rdfDataFactory.literal("foreign value"));
    expect(quad.graph).toBe(rdfDataFactory.defaultGraph());
    expect(quad.subject).not.toBe(foreignSubject);
    expect(Object.getPrototypeOf(quad.subject)).not.toBe(Object.prototype);
  });

  it("delivers Unicode-safe chunks without changing the Turtle source", async () => {
    const chunks = [];

    class RecordingParser extends Transform {
      constructor() {
        super({ readableObjectMode: true });
      }

      _transform(chunk, encoding, callback) {
        chunks.push(String(chunk));
        callback();
      }
    }

    const adapter = createTurtleSyntaxAdapter({
      chunkSize: 1,
      loadImplementation: async () => ({
        Lexer: class RecordingLexer {
          tokenize() {}
        },
        StreamParser: RecordingParser,
      }),
    });
    const source = new StringDocumentSource(
      '@prefix ex: <urn:test:> . ex:s ex:label "before 🚀 after" .',
    );

    await adapter.parse(source, configuration());

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(source.getText());
    expect(
      chunks.every((chunk) => {
        const first = chunk.charCodeAt(0);
        const last = chunk.charCodeAt(chunk.length - 1);
        return !(
          (first >= 0xdc00 && first <= 0xdfff) ||
          (last >= 0xd800 && last <= 0xdbff)
        );
      }),
    ).toBe(true);
  });

  it("waits for drain before writing another chunk", async () => {
    const chunks = [];

    class BackpressuredParser extends EventEmitter {
      blocked = false;
      destroyed = false;

      write(chunk) {
        if (this.blocked) {
          throw new Error("A chunk was written before drain");
        }
        chunks.push(String(chunk));
        this.blocked = true;
        queueMicrotask(() => {
          this.blocked = false;
          this.emit("drain");
        });
        return false;
      }

      end() {
        queueMicrotask(() => this.emit("end"));
      }

      destroy(error) {
        this.destroyed = true;
        if (error) {
          queueMicrotask(() => this.emit("error", error));
        }
      }
    }

    const adapter = createTurtleSyntaxAdapter({
      chunkSize: 1,
      loadImplementation: async () => ({
        Lexer: class BackpressureLexer {
          tokenize() {}
        },
        StreamParser: BackpressuredParser,
      }),
    });
    const source = new StringDocumentSource("1234");

    await expect(adapter.parse(source, configuration())).resolves.toBeDefined();
    expect(chunks).toEqual(["1", "2", "3", "4"]);
  });
});

describe("N3SyntaxAdapter Turtle semantics", () => {
  it("preserves base resolution, prefixes, typed literals, and language tags", async () => {
    const adapter = createTurtleSyntaxAdapter();
    const result = await adapter.parse(
      new StringDocumentSource(
        `@base <https://example.com/base/> .
         @prefix ex: <https://example.com/vocabulary#> .
         <subject> ex:typed "7"^^<../types#code> ;
                   ex:label "Cheers"@en-UK .`,
        { documentIRI: "https://example.com/retrieval/root.ttl" },
      ),
      configuration(),
    );
    const subject = rdfDataFactory.namedNode(
      "https://example.com/base/subject",
    );

    expect(result.prefixes).toEqual({
      ex: "https://example.com/vocabulary#",
    });
    expect(
      result.dataset.match(
        subject,
        rdfDataFactory.namedNode("https://example.com/vocabulary#typed"),
        rdfDataFactory.literal(
          "7",
          rdfDataFactory.namedNode("https://example.com/types#code"),
        ),
      ).size,
    ).toBe(1);
    expect(
      result.dataset.match(
        subject,
        rdfDataFactory.namedNode("https://example.com/vocabulary#label"),
        rdfDataFactory.literal("Cheers", "en-uk"),
      ).size,
    ).toBe(1);
  });

  it("normalizes dependency syntax failures with source locations", async () => {
    const adapter = createTurtleSyntaxAdapter();

    await expect(
      adapter.parse(
        new StringDocumentSource("@prefix ex: <urn:test:> .\nex:s ex:p ."),
        configuration(),
      ),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      column: 11,
      line: 2,
      syntax: "Turtle",
    });
  });
});

describe("N3SyntaxAdapter N-Triples semantics", () => {
  it("normalizes dependency output to the default graph", async () => {
    class NamedGraphParser extends Transform {
      constructor() {
        super({ readableObjectMode: true });
      }

      _transform(chunk, encoding, callback) {
        callback();
      }

      _flush(callback) {
        this.emit("prefix", "unexpected", rdfDataFactory.namedNode("urn:p:"));
        this.push(
          rdfDataFactory.quad(
            rdfDataFactory.namedNode("urn:test:subject"),
            rdfDataFactory.namedNode("urn:test:predicate"),
            rdfDataFactory.namedNode("urn:test:object"),
            rdfDataFactory.namedNode("urn:dependency:unexpected-graph"),
          ),
        );
        callback();
      }
    }

    const adapter = new N3SyntaxAdapter({
      loadImplementation: async () => ({
        Lexer: class NamedGraphLexer {
          tokenize() {}
        },
        StreamParser: NamedGraphParser,
      }),
      mediaType: "application/n-triples",
      syntaxName: "N-Triples",
    });
    const { dataset, prefixes } = await adapter.parse(
      new StringDocumentSource(
        "<urn:test:subject> <urn:test:predicate> <urn:test:object> .",
      ),
      configuration(),
    );

    expect(prefixes).toEqual({});
    expect([...dataset]).toEqual([
      rdfDataFactory.quad(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:predicate"),
        rdfDataFactory.namedNode("urn:test:object"),
      ),
    ]);
  });

  it("reports strict N-Triples failures with the selected syntax identity", async () => {
    const adapter = new N3SyntaxAdapter({
      mediaType: "application/n-triples",
      syntaxName: "N-Triples",
    });

    await expect(
      adapter.parse(
        new StringDocumentSource("@prefix ex: <urn:test:> ."),
        configuration(),
      ),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      syntax: "N-Triples",
    });
  });
});

describe("N3SyntaxAdapter N-Quads semantics", () => {
  it("selects strict line mode and preserves every parsed graph term", async () => {
    const parserOptions = [];
    let lexerOptions;

    class GraphPreservingParser extends Transform {
      constructor(options) {
        super({ readableObjectMode: true });
        parserOptions.push(options);
      }

      _transform(chunk, encoding, callback) {
        callback();
      }

      _flush(callback) {
        this.emit("prefix", "unexpected", rdfDataFactory.namedNode("urn:p:"));
        this.push(
          rdfDataFactory.quad(
            rdfDataFactory.namedNode("urn:test:subject"),
            rdfDataFactory.namedNode("urn:test:predicate"),
            rdfDataFactory.namedNode("urn:test:object"),
            rdfDataFactory.namedNode("urn:test:graph"),
          ),
        );
        callback();
      }
    }

    const adapter = createNQuadsSyntaxAdapter({
      loadImplementation: async () => ({
        Lexer: class GraphPreservingLexer {
          constructor(options) {
            lexerOptions = options;
          }

          tokenize() {}
        },
        StreamParser: GraphPreservingParser,
      }),
    });
    const { dataset, prefixes } = await adapter.parse(
      new StringDocumentSource(
        "<urn:test:subject> <urn:test:predicate> <urn:test:object> <urn:test:graph> .",
      ),
      configuration(),
    );

    expect(parserOptions[0]).toMatchObject({ format: "N-Quads" });
    expect(lexerOptions).toEqual({ lineMode: true, n3: false });
    expect(prefixes).toEqual({});
    expect([...dataset][0].graph).toEqual(
      rdfDataFactory.namedNode("urn:test:graph"),
    );
  });
});

describe("N3SyntaxAdapter TriG semantics", () => {
  it("selects exact TriG mode while preserving prefixes and graph terms", async () => {
    const parserOptions = [];
    let lexerOptions;

    class GraphPreservingParser extends Transform {
      constructor(options) {
        super({ readableObjectMode: true });
        parserOptions.push(options);
      }

      _transform(chunk, encoding, callback) {
        callback();
      }

      _flush(callback) {
        this.emit("prefix", "ex", rdfDataFactory.namedNode("urn:test:"));
        this.push(
          rdfDataFactory.quad(
            rdfDataFactory.namedNode("urn:test:subject"),
            rdfDataFactory.namedNode("urn:test:predicate"),
            rdfDataFactory.namedNode("urn:test:object"),
            rdfDataFactory.namedNode("urn:test:graph"),
          ),
        );
        callback();
      }
    }

    const adapter = new N3SyntaxAdapter({
      loadImplementation: async () => ({
        Lexer: class GraphPreservingLexer {
          constructor(options) {
            lexerOptions = options;
          }

          tokenize() {}
        },
        StreamParser: GraphPreservingParser,
      }),
      mediaType: "application/trig",
      syntaxName: "TriG",
    });
    const { dataset, prefixes } = await adapter.parse(
      new StringDocumentSource(
        "@prefix ex: <urn:test:> . ex:graph { ex:subject ex:predicate ex:object . }",
      ),
      configuration(),
    );

    expect(parserOptions[0]).toMatchObject({ format: "TriG" });
    expect(lexerOptions).toEqual({ lineMode: false, n3: false });
    expect(prefixes).toEqual({ ex: "urn:test:" });
    expect([...dataset][0].graph).toEqual(
      rdfDataFactory.namedNode("urn:test:graph"),
    );
  });
});
