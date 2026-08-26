import { Transform } from "node:stream";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";

import { RdfXmlSyntaxAdapter } from "./rdfXmlSyntaxAdapter.js";

const RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDF_XML_LITERAL = `${RDF_NAMESPACE}XMLLiteral`;
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

const configuration = (values) => new OWLOntologyLoaderConfiguration(values);

const rdfDocument = (body = "") => `
  <rdf:RDF xmlns:rdf="${RDF_NAMESPACE}" xmlns:ex="urn:test:">
    ${body}
  </rdf:RDF>
`;

describe("RdfXmlSyntaxAdapter replacement boundary", () => {
  it("loads the implementation lazily and normalizes foreign quads", async () => {
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

    const adapter = new RdfXmlSyntaxAdapter({
      chunkSize: 7,
      async loadImplementation() {
        loadCount += 1;
        return { RdfXmlParser: ReplacementParser };
      },
    });
    expect(loadCount).toBe(0);

    const source = new StringDocumentSource(rdfDocument(), {
      documentIRI: "https://example.com/documents/ontology.rdf",
    });
    const dataset = await adapter.parse(source, configuration({}));

    expect(loadCount).toBe(1);
    expect(chunks.join("")).toBe(source.getText());
    expect(parserOptions).toHaveLength(1);
    expect(parserOptions[0]).toMatchObject({
      allowDuplicateRdfIds: false,
      baseIRI: "https://example.com/documents/ontology.rdf",
      parseUnsupportedVersions: false,
      strict: true,
      trackPosition: true,
      validateUri: true,
    });
    expect(parserOptions[0].dataFactory).toBe(rdfDataFactory);

    expect(dataset.size).toBe(1);
    const [quad] = [...dataset];
    expect(quad.subject).toEqual(rdfDataFactory.blankNode("foreign-node"));
    expect(quad.predicate).toEqual(rdfDataFactory.namedNode("urn:test:label"));
    expect(quad.object).toEqual(rdfDataFactory.literal("foreign value"));
    expect(quad.graph).toBe(rdfDataFactory.defaultGraph());
    expect(quad.subject).not.toBe(foreignSubject);
    expect(Object.getPrototypeOf(quad.subject)).not.toBe(Object.prototype);
  });

  it("delivers Unicode-safe chunks without changing the prepared XML", async () => {
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

    const adapter = new RdfXmlSyntaxAdapter({
      chunkSize: 1,
      loadImplementation: async () => ({ RdfXmlParser: RecordingParser }),
    });
    const source = new StringDocumentSource(
      rdfDocument(`
        <rdf:Description rdf:about="urn:test:subject">
          <ex:label>before 🚀 after</ex:label>
        </rdf:Description>
      `),
    );

    await adapter.parse(source, configuration({}));

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
});

describe("RdfXmlSyntaxAdapter RDF/XML semantics", () => {
  it("recognizes an rdf:RDF root with character references in its namespace", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const dataset = await adapter.parse(
      new StringDocumentSource(`
        <rdf:RDF
          xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns&#x23;"
          xmlns:ex="urn:test:"
        >
          <rdf:Description rdf:about="urn:test:subject">
            <ex:label>value</ex:label>
          </rdf:Description>
        </rdf:RDF>
      `),
      configuration({}),
    );

    expect(dataset.size).toBe(1);
  });

  it("canonicalizes non-reserved parseType values as XML literals in document order", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const dataset = await adapter.parse(
      new StringDocumentSource(`
        <rdf:RDF xmlns:rdf="${RDF_NAMESPACE}" xmlns:ex="urn:test:">
          <rdf:Description rdf:about="urn:test:subject">
            <ex:other rdf:parseType="Other"><br /></ex:other>
            <ex:literal rdf:parseType="Literal"><z:box xmlns:z="urn:z:" rdf:parseType="Other" /></ex:literal>
          </rdf:Description>
        </rdf:RDF>
      `),
      configuration({}),
    );
    const subject = rdfDataFactory.namedNode("urn:test:subject");
    const datatype = rdfDataFactory.namedNode(RDF_XML_LITERAL);

    expect(
      dataset.match(
        subject,
        rdfDataFactory.namedNode("urn:test:other"),
        rdfDataFactory.literal("<br></br>", datatype),
      ).size,
    ).toBe(1);
    expect(
      dataset.match(
        subject,
        rdfDataFactory.namedNode("urn:test:literal"),
        rdfDataFactory.literal(
          `<z:box xmlns:rdf="${RDF_NAMESPACE}" xmlns:z="urn:z:" rdf:parseType="Other"></z:box>`,
          datatype,
        ),
      ).size,
    ).toBe(1);
  });

  it("canonicalizes parseType XML literals without rewriting explicit typed lexical forms", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const source = new StringDocumentSource(`
      <rdf:RDF
        xmlns:rdf="${RDF_NAMESPACE}"
        xmlns:ex="urn:test:"
        xmlns:unused="urn:unused:"
      >
        <rdf:Description rdf:about="urn:test:subject">
          <ex:typed rdf:datatype="${RDF_XML_LITERAL}">&lt;br /&gt;</ex:typed>
          <ex:markup rdf:parseType="Literal"><z:box xmlns:z="urn:z:" b="2" a="1">&lt;<!--kept--><?step go?></z:box></ex:markup>
        </rdf:Description>
      </rdf:RDF>
    `);

    const dataset = await adapter.parse(source, configuration({}));
    const subject = rdfDataFactory.namedNode("urn:test:subject");
    const datatype = rdfDataFactory.namedNode(RDF_XML_LITERAL);

    expect(
      dataset.match(
        subject,
        rdfDataFactory.namedNode("urn:test:typed"),
        rdfDataFactory.literal("<br />", datatype),
      ).size,
    ).toBe(1);
    expect(
      dataset.match(
        subject,
        rdfDataFactory.namedNode("urn:test:markup"),
        rdfDataFactory.literal(
          '<z:box xmlns:z="urn:z:" a="1" b="2">&lt;<!--kept--><?step go?></z:box>',
          datatype,
        ),
      ).size,
    ).toBe(1);
  });

  it("preserves XML Base, typed and language literals, resources, and collections", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const source = new StringDocumentSource(`
      <rdf:RDF
        xmlns:rdf="${RDF_NAMESPACE}"
        xmlns:ex="https://example.com/vocabulary#"
        xml:base="https://example.com/base/"
      >
        <rdf:Description rdf:about="subject">
          <ex:typed rdf:datatype="../types#code">7</ex:typed>
          <ex:label xml:lang="ro">Salut</ex:label>
          <ex:child rdf:parseType="Resource">
            <ex:name>Copil</ex:name>
          </ex:child>
          <ex:items rdf:parseType="Collection">
            <rdf:Description rdf:about="one"/>
            <rdf:Description rdf:about="two"/>
          </ex:items>
        </rdf:Description>
      </rdf:RDF>
    `);

    const dataset = await adapter.parse(source, configuration({}));
    const subject = rdfDataFactory.namedNode(
      "https://example.com/base/subject",
    );

    expect(
      dataset.match(
        subject,
        rdfDataFactory.namedNode("https://example.com/vocabulary#typed"),
        rdfDataFactory.literal(
          "7",
          rdfDataFactory.namedNode("https://example.com/types#code"),
        ),
      ).size,
    ).toBe(1);
    expect(
      dataset.match(
        subject,
        rdfDataFactory.namedNode("https://example.com/vocabulary#label"),
        rdfDataFactory.literal("Salut", "ro"),
      ).size,
    ).toBe(1);
    expect(
      dataset.match(
        subject,
        rdfDataFactory.namedNode("https://example.com/vocabulary#child"),
      ).size,
    ).toBe(1);
    expect(
      dataset.match(
        subject,
        rdfDataFactory.namedNode("https://example.com/vocabulary#items"),
      ).size,
    ).toBe(1);
    expect(
      dataset.match(
        undefined,
        rdfDataFactory.namedNode(`${RDF_NAMESPACE}first`),
      ).size,
    ).toBe(2);
    expect(
      [...dataset].every((quad) =>
        quad.graph.equals(rdfDataFactory.defaultGraph()),
      ),
    ).toBe(true);
  });
});
