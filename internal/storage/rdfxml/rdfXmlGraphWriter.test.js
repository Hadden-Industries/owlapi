import { DOMParser } from "@xmldom/xmldom";
import { OWLOntologyLoaderConfiguration } from "../../../model/index.js";
import {
  OWLOntologyStorageError,
  StringDocumentSource,
} from "../../../io/index.js";
import { datasetsAreIsomorphic } from "../../../util/rdf-dataset-isomorphism.mjs";
import { RdfXmlSyntaxAdapter } from "../../parsing/rdfxml/rdfXmlSyntaxAdapter.js";
import {
  rdfDataFactory as factory,
  rdfDatasetFactory,
} from "../../rdfjs/environment.js";
import { RDF_NAMESPACE, XSD_NAMESPACE } from "../../rdfjs/vocabulary.js";
import { writeRdfXmlGraph } from "./rdfXmlGraphWriter.js";

const named = (...args) => factory.namedNode(...args);
const blank = (...args) => factory.blankNode(...args);
const literal = (...args) => factory.literal(...args);
const quad = (...args) => factory.quad(...args);
const subject = named("urn:test:subject");
const predicate = named("urn:test:predicate");
const dataset = (quads) => rdfDatasetFactory.dataset(quads);
const parse = (text) =>
  new RdfXmlSyntaxAdapter().parse(
    new StringDocumentSource(text, { documentIRI: "urn:test:saved" }),
    new OWLOntologyLoaderConfiguration({ parsingMode: "strict" }),
  );
const roundTrip = async (quads) => {
  const input = dataset(quads);
  const text = writeRdfXmlGraph(input);
  expect(datasetsAreIsomorphic(input, await parse(text))).toBe(true);
  return text;
};

describe("RDF/XML default-graph writer", () => {
  it("round-trips all RDF 1.1 term forms, shared blanks, and ordinary list triples", async () => {
    const shared = blank("not an XML name <shared>");
    const tail = blank("different scope:shared");
    const quads = [
      quad(
        subject,
        predicate,
        named("https://example.org/ä/🚀?a=1&b=2#fragment"),
      ),
      quad(subject, predicate, shared),
      quad(shared, predicate, shared),
      quad(shared, predicate, literal("")),
      quad(shared, predicate, literal("literal <&> \" ' ]]> 🚀")),
      quad(shared, predicate, literal("bonjour", "fr-ca")),
      quad(shared, predicate, literal("private language", "x-example")),
      quad(shared, predicate, literal("grandfathered", "i-klingon")),
      quad(shared, predicate, literal("01", named(`${XSD_NAMESPACE}integer`))),
      quad(
        shared,
        predicate,
        literal("<p>XML & text</p>", named(`${RDF_NAMESPACE}XMLLiteral`)),
      ),
      quad(subject, named("https://example.org/é🚀"), tail),
      quad(tail, named(`${RDF_NAMESPACE}first`), literal("list item")),
      quad(tail, named(`${RDF_NAMESPACE}rest`), named(`${RDF_NAMESPACE}nil`)),
    ];
    const text = await roundTrip(quads);
    expect(text).not.toContain(shared.value);
    expect(text).not.toContain(tail.value);
    expect(text).not.toContain("parseType");
    const document = new DOMParser().parseFromString(text, "application/xml");
    expect(
      document.getElementsByTagNameNS(RDF_NAMESPACE, "Description").length,
    ).toBe(3);
    expect(writeRdfXmlGraph(dataset(quads.toReversed()))).toBe(text);
  });

  it("preserves literal CR, CRLF, LF, tab, and XML metacharacters exactly", async () => {
    const value = "\r\n\tbefore\rafter\n<&>\"'\r";
    const text = await roundTrip([quad(subject, predicate, literal(value))]);
    expect(text).toContain("&#xD;");
    expect(text).not.toContain("\r");
    expect([...(await parse(text))][0].object.value).toBe(value);
  });

  it("chooses the longest legal namespace and assigns prefixes in lexical order", async () => {
    const text = await roundTrip([
      quad(subject, named("urn:z:longLocal"), literal("z")),
      quad(subject, named("urn:a:abc1"), literal("a")),
      quad(subject, named(`${RDF_NAMESPACE}type`), named("urn:test:Class")),
    ]);
    expect(text).toContain('xmlns:ns0="urn:a:ab"');
    expect(text).toContain('xmlns:ns1="urn:z:longLoca"');
    expect(text).toContain("<ns0:c1 ");
    expect(text).toContain("<rdf:type ");
    expect(text).not.toContain(`xmlns:ns2="${RDF_NAMESPACE}`);
  });

  it("writes an empty default graph", async () => {
    const text = await roundTrip([]);
    expect(text).toContain("rdf:RDF");
  });

  const malformedLiteral = (changes) => ({
    termType: "Literal",
    value: "text",
    language: "",
    datatype: named(`${XSD_NAMESPACE}string`),
    ...changes,
  });
  const invalidQuads = [
    [
      "a named graph",
      quad(subject, predicate, literal("text"), named("urn:test:graph")),
    ],
    [
      "a blank graph",
      quad(subject, predicate, literal("text"), blank("graph")),
    ],
    [
      "a false default graph",
      {
        ...quad(subject, predicate, literal("text")),
        graph: { termType: "DefaultGraph", value: "named" },
      },
    ],
    ["a blank predicate", quad(subject, blank("predicate"), literal("text"))],
    ["a literal subject", quad(literal("subject"), predicate, literal("text"))],
    [
      "a quoted-triple object",
      quad(subject, predicate, quad(subject, predicate, literal("nested"))),
    ],
    [
      "a relative subject IRI",
      quad(named("relative"), predicate, literal("text")),
    ],
    [
      "an invalid object IRI",
      quad(subject, predicate, named("urn:invalid value")),
    ],
    [
      "a malformed Unicode IRI",
      quad(subject, predicate, named("urn:invalid:\ud800")),
    ],
    [
      "a predicate with no QName split",
      quad(subject, named("urn:test:ends/"), literal("text")),
    ],
    [
      "a non-QName RDF namespace suffix",
      quad(subject, named(`${RDF_NAMESPACE}term/name`), literal("text")),
    ],
    [
      "an invalid language tag",
      quad(
        subject,
        predicate,
        malformedLiteral({
          language: "en--US",
          datatype: named(`${RDF_NAMESPACE}langString`),
        }),
      ),
    ],
    [
      "an unnormalized language tag",
      quad(
        subject,
        predicate,
        malformedLiteral({
          language: "EN",
          datatype: named(`${RDF_NAMESPACE}langString`),
        }),
      ),
    ],
    [
      "a mismatched language datatype",
      quad(subject, predicate, malformedLiteral({ language: "en" })),
    ],
    [
      "langString without a language",
      quad(
        subject,
        predicate,
        malformedLiteral({ datatype: named(`${RDF_NAMESPACE}langString`) }),
      ),
    ],
    [
      "a blank datatype",
      quad(
        subject,
        predicate,
        malformedLiteral({ datatype: blank("datatype") }),
      ),
    ],
    [
      "a relative datatype",
      quad(
        subject,
        predicate,
        malformedLiteral({ datatype: named("relative") }),
      ),
    ],
    [
      "an RDF 1.2 directional literal",
      quad(subject, predicate, malformedLiteral({ direction: "ltr" })),
    ],
    [
      "the RDF 1.1 HTML datatype",
      quad(
        subject,
        predicate,
        literal("<p>text</p>", named(`${RDF_NAMESPACE}HTML`)),
      ),
    ],
    ...[
      "\0",
      "\b",
      "\u001f",
      "\ufffe",
      "\uffff",
      "\ud800",
      "\udfff",
      "\r\0",
    ].map((value) => [
      `an XML-forbidden literal ${JSON.stringify(value)}`,
      quad(subject, predicate, literal(value)),
    ]),
    ...[
      "RDF",
      "ID",
      "about",
      "parseType",
      "resource",
      "nodeID",
      "datatype",
      "Description",
      "li",
      "aboutEach",
      "aboutEachPrefix",
      "bagID",
    ].map((name) => [
      `the reserved rdf:${name} predicate`,
      quad(subject, named(`${RDF_NAMESPACE}${name}`), literal("text")),
    ]),
  ];
  it.each(invalidQuads)(
    "rejects %s with a typed representability failure",
    (_name, invalidQuad) => {
      // Foreign RDF/JS terms are deliberately not normalized through fromQuad.
      const operation = () => writeRdfXmlGraph([invalidQuad]);
      expect(operation).toThrow(OWLOntologyStorageError);
      try {
        operation();
      } catch (error) {
        expect(error).toMatchObject({
          code: "ONTOLOGY_STORAGE_FAILED",
          reason: "ONTOLOGY_NOT_REPRESENTABLE",
        });
      }
    },
  );
});
