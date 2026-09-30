import { IRI, OWLDataFactory } from "../../index.js";
import { createProfileBudget } from "./budget.js";
import { inspectFacet } from "./facets.js";

const factory = new OWLDataFactory();
const namespaces = {
  xsd: "http://www.w3.org/2001/XMLSchema#",
  owl: "http://www.w3.org/2002/07/owl#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
};
const iri = (name) => {
  const [prefix, local] = name.split(":");
  return IRI.create(namespaces[prefix] + local);
};

test.each([
  ["xsd:byte", "xsd:minInclusive", "xsd:integer", "300", false],
  ["xsd:byte", "xsd:minInclusive", "xsd:decimal", "127.0", true],
  ["xsd:byte", "xsd:maxExclusive", "owl:rational", "254/2", true],
  ["xsd:byte", "xsd:minInclusive", "xsd:decimal", "127.5", false],
  ["xsd:integer", "xsd:minInclusive", "owl:rational", "6/2", true],
  ["xsd:integer", "xsd:minInclusive", "owl:rational", "7/2", false],
  ["xsd:decimal", "xsd:minExclusive", "owl:rational", "1/2", true],
  ["xsd:decimal", "xsd:minExclusive", "owl:rational", "1/3", false],
  ["owl:real", "xsd:minInclusive", "owl:rational", "1/3", true],
  ["owl:rational", "xsd:maxInclusive", "xsd:float", "1", false],
  ["xsd:double", "xsd:maxInclusive", "xsd:float", "1", false],
  ["xsd:double", "xsd:maxInclusive", "xsd:decimal", "1", false],
  ["xsd:float", "xsd:maxInclusive", "xsd:float", "NaN", true],
  [
    "xsd:dateTimeStamp",
    "xsd:minInclusive",
    "xsd:dateTime",
    "2020-01-01T00:00:00Z",
    true,
  ],
  [
    "xsd:dateTimeStamp",
    "xsd:minInclusive",
    "xsd:dateTime",
    "2020-01-01T00:00:00",
    false,
  ],
  [
    "xsd:dateTime",
    "xsd:minInclusive",
    "xsd:dateTimeStamp",
    "2020-01-01T00:00:00Z",
    true,
  ],
  [
    "xsd:dateTime",
    "xsd:minInclusive",
    "xsd:string",
    "2020-01-01T00:00:00Z",
    false,
  ],
  ["xsd:string", "xsd:length", "xsd:decimal", "2.0", true],
  ["xsd:string", "xsd:length", "owl:rational", "4/2", true],
  ["xsd:string", "xsd:length", "xsd:integer", "-1", false],
  ["xsd:string", "xsd:length", "xsd:float", "2", false],
  ["xsd:string", "xsd:length", "xsd:decimal", "2.5", false],
  ["xsd:NCName", "xsd:pattern", "xsd:string", "[a-z-[aeiou]]+", true],
  ["xsd:NCName", "xsd:pattern", "xsd:anyURI", "[a-z]+", false],
  ["xsd:string", "xsd:pattern", "xsd:string", "(?=a)", false],
  ["xsd:base64Binary", "xsd:length", "xsd:integer", "1", true],
  ["xsd:base64Binary", "xsd:pattern", "xsd:string", "A*", false],
  ["rdf:PlainLiteral", "rdf:langRange", "xsd:string", "*", true],
  ["rdf:PlainLiteral", "rdf:langRange", "xsd:string", "EN-us", true],
  ["rdf:PlainLiteral", "rdf:langRange", "xsd:string", "en-a", true],
  ["rdf:PlainLiteral", "rdf:langRange", "xsd:string", "en-*", false],
  ["rdf:PlainLiteral", "rdf:langRange", "xsd:string", "", false],
  ["rdf:PlainLiteral", "rdf:langRange", "rdf:PlainLiteral", "en@", true],
  ["rdf:PlainLiteral", "rdf:langRange", "rdf:PlainLiteral", "en@en", false],
  ["xsd:boolean", "xsd:length", "xsd:integer", "1", false],
])("checks %s %s against %s %s", async (base, facet, type, lexical, valid) => {
  const result = await inspectFacet(
    factory.getOWLDatatype(iri(base)),
    factory.getOWLFacetRestriction(
      iri(facet),
      factory.getOWLLiteral(lexical, iri(type)),
    ),
  );
  expect(result.status).toBe(valid ? "valid" : "invalid");
});

test.each([
  ["profileWork", "<a></a>".repeat(1000), { maxWork: 10 }],
  ["profileDepth", "<a>".repeat(64) + "</a>".repeat(64), { maxDepth: 20 }],
])(
  "applies the shared %s budget to XML facet values",
  async (resource, lexical, limits) => {
    const budget = createProfileBudget(limits);
    await expect(
      inspectFacet(
        factory.getOWLDatatype(iri("xsd:string")),
        factory.getOWLFacetRestriction(
          iri("xsd:pattern"),
          factory.getOWLLiteral(lexical, iri("rdf:XMLLiteral")),
        ),
        budget.configuration,
        budget,
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED", resource });
  },
);
