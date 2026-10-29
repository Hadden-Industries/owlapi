import { OWLManager } from "../apibinding/index.js";
import { StringDocumentSource } from "../io/index.js";
import { generateBenchmarkFixture } from "./generate-owlapi-benchmark-fixtures.cjs";
import {
  assertDeclarationWorkload,
  observeDeclarations,
} from "./verify-benchmark-io-semantics.mjs";

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "the %s sink rejects a wrong declaration with the same axiom count",
  async (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const text = generateBenchmarkFixture("functional", { count: 100 }).replace(
      ":C42)",
      ":Different)",
    );
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, { format: "functional" }),
    );
    expect(ontology.getAxiomCount()).toBe(100);
    expect(() =>
      assertDeclarationWorkload(observeDeclarations(ontology), "functional"),
    ).toThrow();
  },
);

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "the %s sink rejects lost identity independently of declaration count",
  async (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const text = generateBenchmarkFixture("functional", { count: 100 }).replace(
      "<urn:owlapi-js:benchmark:functional>",
      "<urn:wrong>",
    );
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, { format: "functional" }),
    );
    expect(ontology.getAxiomCount()).toBe(100);
    expect(() =>
      assertDeclarationWorkload(observeDeclarations(ontology), "functional"),
    ).toThrow();
  },
);
