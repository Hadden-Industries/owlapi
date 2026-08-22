import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";

import { detectTurtle, turtleParserDescriptor } from "./descriptor.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const OWL = "http://www.w3.org/2002/07/owl#";

const source = (text, options) => new StringDocumentSource(text, options);

describe("Turtle parser descriptor", () => {
  it.each([
    {
      expected: "MATCH",
      reasonCode: "TURTLE_AT_DIRECTIVE",
      text: "# leading comment\n@prefix ex: <urn:test:> .",
    },
    {
      expected: "MATCH",
      reasonCode: "TURTLE_SPARQL_DIRECTIVE",
      text: "PREFIX ex: <urn:test:>\nex:s ex:p ex:o .",
    },
    {
      expected: "MATCH",
      reasonCode: "TURTLE_TRIPLE",
      text: "<urn:test:s> <urn:test:p> <urn:test:o> .",
    },
    {
      expected: "MATCH",
      reasonCode: "TURTLE_TRIPLE",
      text: "[] <urn:test:p> <urn:test:o> .",
    },
    {
      expected: "NO_MATCH",
      reasonCode: "TURTLE_XML",
      text: `<?xml version="1.0"?><rdf:RDF xmlns:rdf="${RDF}"/>`,
    },
    {
      expected: "NO_MATCH",
      reasonCode: "TURTLE_XML",
      text: `<!-- vocabulary description -->\n<!-- namespaces -->\n<rdf:RDF xmlns:rdf="${RDF}"/>`,
    },
    {
      expected: "NO_MATCH",
      reasonCode: "TURTLE_FUNCTIONAL",
      text: "Ontology(<urn:test:ontology>)",
    },
    {
      expected: "NO_MATCH",
      reasonCode: "TURTLE_MANCHESTER",
      text: "Ontology: <urn:test:ontology>",
    },
    {
      expected: "INDETERMINATE",
      reasonCode: "TURTLE_EMPTY",
      text: "# comments only\n",
    },
  ])("returns $expected with $reasonCode", ({ expected, reasonCode, text }) => {
    expect(detectTurtle(source(text))).toMatchObject({
      reasonCode,
      result: expected,
    });
  });

  it("publishes immutable Turtle metadata without compatible recovery", () => {
    expect(turtleParserDescriptor).toMatchObject({
      format: OWLDocumentFormats.TURTLE,
      id: "turtle",
      supportsCompatibleRecovery: false,
    });
    expect(Object.isFrozen(turtleParserDescriptor)).toBe(true);
  });
});

describe("Turtle manager integration", () => {
  it("loads a directive-free Turtle document through the shared RDF translator", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(
        `<urn:test:ontology> <${RDF}type> <${OWL}Ontology> .
         <urn:test:A> <${RDF}type> <${OWL}Class> .`,
        { documentIRI: "https://example.com/root.ttl", fileName: "root.ttl" },
      ),
    );

    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      "urn:test:ontology",
    );
    expect([...ontology.getAxioms()].map(({ kind }) => kind)).toContain(
      OWLObjectKind.DECLARATION_AXIOM,
    );
    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value),
    ).toEqual(["urn:test:A"]);
  });

  it("preserves Turtle prefixes as immutable document metadata", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      source(
        `@base <https://example.com/ontology/> .
         @prefix owl: <${OWL}> .
         @prefix ex: <https://example.com/ontology#> .
         <> a owl:Ontology .
         ex:A a owl:Class .`,
        { documentIRI: "https://example.com/root.ttl", fileName: "root.ttl" },
      ),
    );

    expect(result.documents[0].context).toMatchObject({
      format: OWLDocumentFormats.TURTLE,
      prefixes: {
        ex: "https://example.com/ontology#",
        owl: OWL,
      },
    });
    expect(Object.isFrozen(result.documents[0].context.prefixes)).toBe(true);
  });

  it("enforces the shared RDF-list limit after Turtle parsing", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const configuration = new OWLOntologyLoaderConfiguration({
      maxRdfListLength: 1,
    });
    const turtle = `@prefix owl: <${OWL}> .
      @prefix ex: <urn:test:> .
      ex:ontology a owl:Ontology .
      ex:A owl:equivalentClass [
        a owl:Class ;
        owl:intersectionOf (ex:B ex:C)
      ] .`;

    await expect(
      manager.loadOntologyFromOntologyDocument(source(turtle), configuration),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxRdfListLength",
    });
  });

  it("rejects N3-only formula and implication syntax after selecting Turtle", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const n3 = `@prefix ex: <urn:test:> .
      { ex:s ex:p ex:o . } => { ex:s ex:q ex:o . } .`;

    await expect(
      manager.loadOntologyFromOntologyDocument(source(n3)),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      syntax: "Turtle",
    });
  });

  it.each([
    ["universal quantifier", "@forAll ex:x . ex:s ex:p ex:o ."],
    ["existential quantifier", "@forSome ex:x . ex:s ex:p ex:o ."],
    ["path expression", "ex:s!ex:p ex:q ex:o ."],
  ])("rejects N3-only %s syntax", async (_name, statement) => {
    const manager = OWLManager.createOWLOntologyManager();
    const n3 = `@prefix ex: <urn:test:> .\n${statement}`;

    await expect(
      manager.loadOntologyFromOntologyDocument(source(n3)),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      syntax: "Turtle",
    });
  });

  it("keeps the RDF 1.2 triple-term boundary explicit at OWL reconstruction", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const rdf12 = `PREFIX : <http://example/>
      :s :p :o .
      <<:s :p :o>> :q 123 .`;

    await expect(
      manager.loadOntologyFromOntologyDocument(source(rdf12)),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      termType: "Quad",
    });
  });
});
