import { expect, jest, test } from "@jest/globals";
import {
  OWLDocumentFormats,
  OWLManager,
  StringDocumentSource,
  StringDocumentTarget,
} from "../../index.js";
import { CompactRdfGraph } from "../rdfjs/compactRdfGraph.js";

test.each([
  ["without subproperty axioms", "", []],
  [
    "with a subproperty component",
    `SubAnnotationPropertyOf(<urn:lookup:tag> <urn:lookup:group>)
     SubAnnotationPropertyOf(<urn:lookup:leaf> <urn:lookup:tag>)
     SubAnnotationPropertyOf(<urn:lookup:other> <urn:lookup:parent>)
     AnnotationAssertion(<urn:lookup:ref> <urn:lookup:subject> <urn:lookup:tag>)`,
    [
      [undefined, "urn:lookup:tag", 2],
      [undefined, "urn:lookup:group", 1],
      [undefined, "urn:lookup:leaf", 0],
    ],
  ],
])(
  "Java Turtle limits incoming lookups %s",
  async (_name, axioms, expected) => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        `Ontology(
        Declaration(AnnotationProperty(<urn:lookup:tag>))
        ${axioms}
        DLSafeRule(Annotation(<urn:lookup:tag> "value") Body() Head()))`,
        { format: OWLDocumentFormats.FUNCTIONAL },
      ),
    );
    const matches = [];
    const match = CompactRdfGraph.prototype.match;
    const spy = jest
      .spyOn(CompactRdfGraph.prototype, "match")
      .mockImplementation(function (subject, predicate, object, graph) {
        const result = match.call(this, subject, predicate, object, graph);
        if (!subject && object?.value.startsWith("urn:lookup:"))
          matches.push([predicate?.value, object.value, result.size]);
        return result;
      });
    try {
      await manager.saveOntology(
        ontology,
        OWLDocumentFormats.TURTLE,
        new StringDocumentTarget(),
      );
    } finally {
      spy.mockRestore();
    }
    expect(matches).toEqual(expected);
  },
);
