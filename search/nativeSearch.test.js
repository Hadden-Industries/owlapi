import { readFileSync } from "node:fs";
import {
  DATA_RANGE_KINDS,
  IRI,
  OWLOntology,
  OWLOntologyManager,
} from "../model/index.js";
import { StringDocumentSource } from "../io/index.js";
import { compareOntologies } from "../internal/model/ontologyStructuralIsomorphism.js";
import { EntitySearcher } from "./index.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../util/owlapi-reference/fixtures/rc2/search-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const manager = new OWLOntologyManager(),
  factory = manager.getOWLDataFactory();
let ontology;
const load = (text) =>
  new OWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text),
    { parsingMode: "strict" },
  );
beforeAll(async () => {
  ontology = await load(fixture.input);
});
const argumentFor = (argument) => {
  if (argument.kind === "IRI") return IRI.create(argument.iri);
  if (argument.kind === "AnonymousIndividual")
    return [...ontology.getReferencedAnonymousIndividuals()][0];
  if (argument.kind === "ObjectInverseOf")
    return factory.getOWLObjectInverseOf(
      factory.getOWLObjectProperty(IRI.create(argument.iri)),
    );
  return factory["getOWL" + argument.kind](IRI.create(argument.iri));
};
const sentinel = IRI.create("urn:rc2:search:sentinel");
const wrap = (value) => {
  if (value.kind === "OWLAnnotation")
    return new OWLOntology({ annotations: [value] });
  if (value.kind.endsWith("Axiom")) return new OWLOntology({ axioms: [value] });
  const entity = [
    "OWLClass",
    "OWLObjectProperty",
    "OWLDataProperty",
    "OWLAnnotationProperty",
    "OWLNamedIndividual",
    "OWLDatatype",
  ].includes(value.kind);
  const axiom = entity
    ? factory.getOWLDeclarationAxiom(value)
    : value.kind === "OWLObjectInverseOf"
      ? factory.getOWLSubObjectPropertyOfAxiom(
          factory.getOWLObjectProperty(sentinel),
          value,
        )
      : DATA_RANGE_KINDS.includes(value.kind)
        ? factory.getOWLDataPropertyRangeAxiom(
            factory.getOWLDataProperty(sentinel),
            value,
          )
        : ["IRI", "OWLLiteral", "OWLAnonymousIndividual"].includes(value.kind)
          ? factory.getOWLAnnotationAssertionAxiom(
              factory.getOWLAnnotationProperty(sentinel),
              sentinel,
              value,
            )
          : factory.getOWLSubClassOfAxiom(factory.getOWLClass(sentinel), value);
  return new OWLOntology({ axioms: [axiom] });
};
test.each(fixture.observations.map((row, index) => [index, row.method, row]))(
  "native search %i %s",
  async (_index, _method, row) => {
    const args = [
      argumentFor(row.argument),
      row.repeated ? [ontology, ontology] : ontology,
    ];
    if (row.filtered) args.push(factory.getRDFSLabel());
    const result = EntitySearcher[row.method](...args);
    if (Object.hasOwn(row, "boolean")) {
      expect(result).toBe(row.boolean);
      return;
    }
    expect(result).toHaveLength(row.results.length);
    const remaining = result.map(wrap);
    for (const input of row.results) {
      const expected = await load(input);
      const index = remaining.findIndex(
        (actual) => compareOntologies(actual, expected).equal,
      );
      if (index < 0)
        throw new Error(`Search result mismatch: ${JSON.stringify(row)}`);
      remaining.splice(index, 1);
    }
    expect(remaining).toHaveLength(0);
  },
);
test("native search inventory covers every selected static member", () => {
  expect(new Set(fixture.observations.map((row) => row.method)).size).toBe(19);
});
