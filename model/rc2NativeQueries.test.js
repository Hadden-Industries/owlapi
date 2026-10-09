import { readFileSync } from "node:fs";
import { IRI, OWLOntologyManager, OWLOntology } from "./index.js";
import { StringDocumentSource } from "../io/index.js";
import { compareOntologies } from "../internal/model/ontologyStructuralIsomorphism.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../util/owlapi-reference/fixtures/rc2/query-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const manager = new OWLOntologyManager();
const factory = manager.getOWLDataFactory();
let ontology;
beforeAll(async () => {
  ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(fixture.input),
    { parsingMode: "strict" },
  );
});
const argumentFor = (descriptor) => {
  if (descriptor.kind === "IRI") return IRI.create(descriptor.iri);
  if (descriptor.kind === "AnonymousIndividual")
    return [...ontology.getReferencedAnonymousIndividuals()][0];
  if (descriptor.kind === "ObjectInverseOf")
    return factory.getOWLObjectInverseOf(
      factory.getOWLObjectProperty(IRI.create(descriptor.iri)),
    );
  if (descriptor.kind === "Literal")
    return factory.getOWLLiteral(
      descriptor.lexicalForm,
      descriptor.language || IRI.create(descriptor.datatype),
    );
  return factory["getOWL" + descriptor.kind](IRI.create(descriptor.iri));
};
test.each(fixture.observations.map((row, index) => [index, row.method, row]))(
  "native index result %i %s",
  async (_index, _method, row) => {
    const result = ontology[row.method](argumentFor(row.argument));
    expect(result.size).toBe(row.count);
    const expected =
      await new OWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource(row.resultInput),
        { parsingMode: "strict" },
      );
    const comparison = compareOntologies(
      new OWLOntology({ axioms: result }),
      expected,
    );
    if (!comparison.equal)
      throw new Error(
        JSON.stringify({
          method: row.method,
          argument: row.argument,
          comparison,
        }),
      );
  },
);

test("the native matrix covers every admitted direct index member", () => {
  const methods = new Set(fixture.observations.map((row) => row.method));
  expect(methods.size).toBe(34);
});
