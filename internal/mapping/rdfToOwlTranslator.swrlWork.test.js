import { jest } from "@jest/globals";
import { OWLDataFactory } from "../../model/owlDataFactory.js";
import { rdfDataFactory, rdfDatasetFactory } from "../rdfjs/environment.js";
import {
  RDF_VOCABULARY as RDF,
  RDFS_VOCABULARY as RDFS,
  SWRL_VOCABULARY as SWRL,
} from "../rdfjs/vocabulary.js";
import { RdfToOwlTranslator } from "./rdfToOwlTranslator.js";

const profile = { behaviorProfileId: "java-owlapi-5.5.1" };
const { blankNode, namedNode } = rdfDataFactory;
const literal = (value) => rdfDataFactory.literal(value);
const nn = (name) => namedNode(`https://example.org/${name}`);
const row = (subject, property, object) =>
  rdfDataFactory.quad(subject, namedNode(property), object);
const type = (subject, value) => row(subject, RDF.type, namedNode(value));
const nil = namedNode(RDF.nil);

function sharedRuleDataset() {
  const variable = nn("x");
  const z = blankNode("z");
  const a = blankNode("a");
  const body = blankNode("body");
  const tail = blankNode("tail");
  const head = blankNode("head");
  const first = blankNode("first-rule");
  const second = blankNode("second-rule");
  return rdfDatasetFactory.dataset([
    type(variable, SWRL.Variable),
    type(z, SWRL.ClassAtom),
    row(z, SWRL.classPredicate, nn("Zebra")),
    row(z, SWRL.argument1, variable),
    type(a, SWRL.ClassAtom),
    row(a, SWRL.classPredicate, nn("Animal")),
    row(a, SWRL.argument1, variable),
    row(body, RDF.first, z),
    row(body, RDF.rest, tail),
    row(tail, RDF.first, a),
    row(tail, RDF.rest, nil),
    row(head, RDF.first, a),
    row(head, RDF.rest, nil),
    type(first, SWRL.Imp),
    row(first, SWRL.body, body),
    row(first, SWRL.head, head),
    row(first, RDFS.label, literal("First")),
    type(second, SWRL.Imp),
    row(second, SWRL.body, body),
    row(second, RDFS.label, literal("Second")),
  ]);
}

test("reconstructs each shared atom and rule side once in source order", async () => {
  const dataFactory = new OWLDataFactory(profile);
  const getClass = jest.spyOn(dataFactory, "getOWLClass");
  const { ontology } = await new RdfToOwlTranslator({ dataFactory }).translate(
    sharedRuleDataset(),
    { configuration: profile },
  );
  const rules = Array.from(ontology.getAxiomsByType("SWRLRule"));
  expect(rules).toHaveLength(2);
  const first = rules.find(
    (rule) => rule.annotations[0].value.lexicalForm === "First",
  );
  const second = rules.find(
    (rule) => rule.annotations[0].value.lexicalForm === "Second",
  );

  expect(first.body.map(({ predicate }) => predicate.iri.value)).toEqual([
    nn("Zebra").value,
    nn("Animal").value,
  ]);
  expect({
    requestedClasses: getClass.mock.calls.map(([iri]) => iri.value),
    sharedBody: first.body === second.body,
    sharedAtom: first.head[0] === first.body[1],
    sharedVariable: first.body[0].argument === first.body[1].argument,
  }).toEqual({
    requestedClasses: [nn("Zebra").value, nn("Animal").value],
    sharedBody: true,
    sharedAtom: true,
    sharedVariable: true,
  });
  expect(second.head).toEqual([]);
});

test("checks RDF list length before admitting a scoped rule", async () => {
  await expect(
    new RdfToOwlTranslator().translate(sharedRuleDataset(), {
      configuration: { ...profile, maxRdfListLength: 1 },
    }),
  ).rejects.toMatchObject({
    code: "RESOURCE_LIMIT_EXCEEDED",
    limit: 1,
    observed: 2,
    resource: "maxRdfListLength",
  });
});

test("checks cancellation after the last atom and before axiom admission", async () => {
  const controller = new AbortController();
  const dataFactory = new OWLDataFactory(profile);
  const getClass = dataFactory.getOWLClass.bind(dataFactory);
  jest.spyOn(dataFactory, "getOWLClass").mockImplementation((iri) => {
    if (iri.value === nn("Animal").value) controller.abort();
    return getClass(iri);
  });
  const input = sharedRuleDataset();
  input.delete(row(blankNode("body"), RDF.rest, blankNode("tail")));
  input.delete(row(blankNode("tail"), RDF.first, blankNode("a")));
  input.delete(row(blankNode("tail"), RDF.rest, nil));
  input.add(row(blankNode("body"), RDF.rest, nil));

  await expect(
    new RdfToOwlTranslator({ dataFactory }).translate(input, {
      configuration: { ...profile, maxAxioms: 0, signal: controller.signal },
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});
