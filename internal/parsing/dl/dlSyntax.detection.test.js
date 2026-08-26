import { StringDocumentSource } from "../../../index.js";
import { OWLParserRegistry } from "../parserRegistry.js";

import { dlSyntaxParserDescriptor } from "./descriptor.js";

const detect = (text, configuration) => {
  const registry = new OWLParserRegistry([dlSyntaxParserDescriptor]);
  return registry.resolveCandidates(
    new StringDocumentSource(text),
    configuration,
  )[0];
};

describe("OWL DL Syntax detection", () => {
  it.each([
    { label: "XML", text: '<?xml version="1.0"?><rdf:RDF/>' },
    {
      label: "RDF/XML after a comment",
      text: "<!-- prologue --><rdf:RDF/>",
    },
    { label: "OWL/XML", text: '<Ontology ontologyIRI="urn:test:o"/>' },
    {
      label: "Functional Syntax",
      text: "Ontology(Declaration(Class(<urn:test:A>)))",
    },
    {
      label: "Manchester Syntax",
      text: "Ontology: <urn:test:o>\nClass: :A",
    },
    {
      label: "Turtle",
      text: "@prefix : <urn:test:> .\n:A a <urn:test:C> .",
    },
    {
      label: "RDF line syntax",
      text: '<urn:test:s> <urn:test:p> "A != B" .',
    },
  ])("rejects the strong $label signature", ({ text }) => {
    expect(detect(text)).toMatchObject({
      detection: {
        reasonCode: "DL_STRONG_NEGATIVE",
        result: "NO_MATCH",
      },
      eligible: false,
    });
  });

  it("recognizes class, equality, transitivity, and assertion forms", () => {
    expect(detect("Person \\sqsubseteq Agent")).toMatchObject({
      detection: {
        reasonCode: "DL_AXIOM_OPERATOR",
        result: "MATCH",
      },
      eligible: true,
    });
    expect(detect("Person(alice)")).toMatchObject({
      detection: {
        reasonCode: "DL_ASSERTION",
        result: "MATCH",
      },
      eligible: true,
    });
    expect(detect("alice = ally")).toMatchObject({
      detection: {
        reasonCode: "DL_AXIOM_OPERATOR",
        result: "MATCH",
      },
      eligible: true,
    });
    expect(detect(": hasAncestor ∈ transitive")).toMatchObject({
      detection: {
        reasonCode: "DL_AXIOM_OPERATOR",
        result: "MATCH",
      },
      eligible: true,
    });
  });

  it("returns indeterminate for empty input and no-match for ordinary text", () => {
    expect(detect(" \r\n\t")).toMatchObject({
      detection: {
        reasonCode: "DL_EMPTY",
        result: "INDETERMINATE",
      },
      eligible: false,
    });
    expect(detect("This is ordinary prose.")).toMatchObject({
      detection: {
        reasonCode: "DL_SIGNATURE_ABSENT",
        result: "NO_MATCH",
      },
      eligible: false,
    });
  });

  it("cannot inspect a DL marker beyond the registry's UTF-8 sniff bound", () => {
    const text = `${"é".repeat(20)} Person ⊑ Agent`;

    expect(detect(text, { maxSniffBytes: 8 })).toMatchObject({
      detection: { result: "NO_MATCH" },
      eligible: false,
    });
  });
});
