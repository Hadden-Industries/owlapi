import { expect, jest, test } from "@jest/globals";
import { DOMParser } from "@xmldom/xmldom";
import { StringDocumentSource } from "../../../io/stringDocumentSource.js";
import { OWLOntologyLoaderConfiguration } from "../../../model/owlOntologyLoaderConfiguration.js";
import { RdfXmlSyntaxAdapter } from "./rdfXmlSyntaxAdapter.js";
const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const header =
  '<?xml version="1.0"?>\n<!--original prolog-->\n<r:RDF xmlns:r="' +
  rdf +
  '" xmlns:e="urn:batch:" xml:base="https://example.org/batch/">\n';
const footer = "\n</r:RDF>\n<!--original epilog-->";
const property =
  '<e:list r:parseType="Collection"><r:Description r:about="member"/></e:list><e:item r:parseType="Resource"><e:v>ok</e:v></e:item>';
const body = Array.from(
  { length: 1000 },
  (_, id) =>
    '<r:Description r:about="id' + id + '">' + property + "</r:Description>\n",
).join("");
const fallback = () =>
  new RdfXmlSyntaxAdapter({
    loadImplementation: () => import("rdfxml-streaming-parser"),
  });

const rdfTerms = (dataset) => {
  const blanks = new Map();
  const value = (term) => {
    if (term.termType !== "BlankNode")
      return [term.termType, term.value, term.language, term.datatype?.value];
    if (!blanks.has(term.value)) blanks.set(term.value, blanks.size);
    return ["BlankNode", blanks.get(term.value)];
  };
  return [...dataset].map((q) =>
    [q.subject, q.predicate, q.object, q.graph].map(value),
  );
};

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s validates ordinary parse types under the original XML root in bounded documents",
  async (behaviorProfileId) => {
    const xml = header + body + footer;
    const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
    try {
      const config = new OWLOntologyLoaderConfiguration({ behaviorProfileId });
      const source = new StringDocumentSource(xml);
      const actual = await new RdfXmlSyntaxAdapter().parse(source, config);
      const documents = parse.mock.calls.map(([text]) => text);
      expect(documents.length).toBeGreaterThan(1);
      expect(Math.max(...documents.map((text) => text.length))).toBeLessThan(
        70_000,
      );
      for (const text of documents) {
        expect(text.startsWith(header.trimEnd())).toBe(true);
        expect(text.endsWith(footer.trimStart())).toBe(true);
      }
      expect(actual.size).toBe(5000);
      const expected = await fallback().parse(source, config);
      expect(rdfTerms(actual)).toEqual(rdfTerms(expected));
      expect(parse.mock.calls.at(-1)[0]).toBe(xml);
    } finally {
      parse.mockRestore();
    }
  },
);

test("reads string source getters synchronously and reuses their original values", async () => {
  const reads = [];
  const xml = header + body + footer;
  const source = {
    getText() {
      reads.push("text");
      return xml;
    },
    getDocumentIRI() {
      reads.push("document");
      return {
        get value() {
          reads.push("value");
          return "https://example.org/retrieved";
        },
      };
    },
  };
  const pending = new RdfXmlSyntaxAdapter().parse(source);
  expect(reads).toEqual(["text", "document", "value"]);
  await pending;
  expect(reads).toEqual([
    "text",
    "document",
    "value",
    "value",
    "document",
    "value",
  ]);
});

test("preserves Java's provider name limit inside a later validation batch", async () => {
  const longName = "n".repeat(1001);
  const xml =
    header +
    body +
    '<r:Description r:about="late"><e:' +
    longName +
    ">v</e:" +
    longName +
    "></r:Description>" +
    footer;
  const config = new OWLOntologyLoaderConfiguration({
    behaviorProfileId: "java-owlapi-5.5.1",
    sourceLocations: true,
  });
  for (const adapter of [fallback(), new RdfXmlSyntaxAdapter()]) {
    await expect(
      adapter.parse(new StringDocumentSource(xml), config),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxXmlNameCodeUnits",
      limit: 1000,
      observed: 1001,
    });
  }
});

test("retains global entity budgets and the original XML for literal canonicalization", async () => {
  const xml =
    header +
    body +
    '<r:Description r:about="literal"><e:value r:parseType="Other"><e:child/></e:value></r:Description>' +
    footer;
  const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
  try {
    const graph = await new RdfXmlSyntaxAdapter().parse(
      new StringDocumentSource(xml),
    );
    expect(parse.mock.calls.some(([text]) => text === xml)).toBe(true);
    expect(
      [...graph].some(
        ({ object }) =>
          object.datatype?.value === rdf + "XMLLiteral" &&
          object.value === '<e:child xmlns:e="urn:batch:"></e:child>',
      ),
    ).toBe(true);
    await expect(
      new RdfXmlSyntaxAdapter().parse(
        new StringDocumentSource(header + body + footer),
        new OWLOntologyLoaderConfiguration({ maxExpandedXmlBytes: 150_000 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxExpandedXmlBytes",
    });
  } finally {
    parse.mockRestore();
  }
});

test("uses original-document diagnostics on late malformed XML before loading an injected provider", async () => {
  const xml =
    header +
    body +
    '<r:Description r:about="bad" r:about="duplicate"/>\n' +
    footer;
  const source = new StringDocumentSource(xml);
  const config = new OWLOntologyLoaderConfiguration({ sourceLocations: true });
  const loadImplementation = jest.fn(() => import("rdfxml-streaming-parser"));
  const readError = async (adapter) => {
    try {
      await adapter.parse(source, config);
    } catch (error) {
      return error;
    }
    throw new Error("Malformed input was accepted");
  };
  const reference = await readError(
    new RdfXmlSyntaxAdapter({ loadImplementation }),
  );
  const actual = await readError(new RdfXmlSyntaxAdapter());
  expect(loadImplementation).not.toHaveBeenCalled();
  expect(actual.code).toBe("XML_PARSE_ERROR");
  expect(actual.message).toBe(reference.message);
  expect(actual.line).toBe(reference.line);
  expect(actual.column).toBe(reference.column);
  expect(actual.cause.message).toBe(reference.cause.message);
});

test("reports the authored line, column and offset of a late mismatched end tag", async () => {
  const xml = header + body + "<r:Description></r:Seq>" + footer;
  const offset = xml.indexOf("</r:Seq>");
  const line = xml.slice(0, offset).split("\n").length;
  const config = new OWLOntologyLoaderConfiguration({ sourceLocations: true });
  for (const adapter of [fallback(), new RdfXmlSyntaxAdapter()]) {
    await expect(
      adapter.parse(new StringDocumentSource(xml), config),
    ).rejects.toMatchObject({
      code: "XML_PARSE_ERROR",
      line,
      column: 16,
      offset,
      expectedElement: "r:Description",
      observedElement: "r:Seq",
    });
  }
});
