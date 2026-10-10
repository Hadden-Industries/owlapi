import { encodeTerm, encodeQuad } from "./fixtureTerms.mjs";
import { suiteRevision } from "./suiteRevision.mjs";

it("retains nested quad terms, literal language/direction and default graph", () => {
  const named = { termType: "NamedNode", value: "urn:s" };
  const blank = { termType: "BlankNode", value: "b1" };
  const literal = {
    termType: "Literal",
    value: "hello",
    language: "en",
    direction: "rtl",
    datatype: { value: "urn:type" },
  };
  const graph = { termType: "DefaultGraph" };
  const quad = {
    termType: "Quad",
    subject: named,
    predicate: named,
    object: literal,
    graph,
  };
  expect(
    encodeQuad({ subject: quad, predicate: named, object: blank, graph }),
  ).toEqual([
    [
      "Q",
      ["N", "urn:s"],
      ["N", "urn:s"],
      ["L", "hello", "en", "rtl", "urn:type"],
      ["D"],
    ],
    ["N", "urn:s"],
    ["B", "b1"],
    ["D"],
  ]);
  expect(encodeTerm({ ...literal, direction: undefined })).toEqual([
    "L",
    "hello",
    "en",
    "",
    "urn:type",
  ]);
  expect(() => encodeTerm({ termType: "Variable" })).toThrow(
    "Unsupported RDF fixture term",
  );
});

it("keeps RDF/XML and Turtle-family pins distinct and rejects unknown scopes", () => {
  expect(suiteRevision("w3c-rdf-tests", "RDF/XML")).toBe(
    "ad541a5f0479f0798608c4801369d97b8e08b36f",
  );
  for (const format of ["N-Triples", "N-Quads", "Turtle", "TriG"])
    expect(suiteRevision("w3c-rdf-tests", format)).toBe(
      "12774b0ebb385d17651b396654b19254d0fefbfa",
    );
  expect(() => suiteRevision("w3c-rdf-tests", "JSON-LD")).toThrow(
    "Missing or ambiguous",
  );
});
