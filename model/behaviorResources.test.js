import { OWLManager } from "../apibinding/index.js";
import { AddAxiom, IRI } from "./index.js";
import { OWL2DLProfile } from "../profiles/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import { StringDocumentSource, StringDocumentTarget } from "../io/index.js";
import { ResourceLimitError } from "../io/errors.js";
import { ManchesterOWLSyntaxOWLObjectRendererImpl } from "../manchestersyntax/renderer/index.js";

test("Java Manchester object rendering has no hidden 32 MiB output cap", () => {
  const options = { behaviorProfileId: "java-owlapi-5.5.1" };
  const factory =
    OWLManager.createOWLOntologyManager(options).getOWLDataFactory();
  const lexicalForm = "x".repeat(32 * 1024 * 1024 + 1);
  const literal = factory.getOWLLiteral(lexicalForm);
  const java = new ManchesterOWLSyntaxOWLObjectRendererImpl(options);
  expect(java.render(literal)).toBe(`"${lexicalForm}"`);
  expect(java.getBehaviorProfileId()).toBe("java-owlapi-5.5.1");
  const normative = new ManchesterOWLSyntaxOWLObjectRendererImpl();
  expect(normative.getBehaviorProfileId()).toBe("normative-v1");
  expect(() => normative.render(literal)).toThrow(ResourceLimitError);
  expect(
    () =>
      new ManchesterOWLSyntaxOWLObjectRendererImpl({
        behaviorProfileId: "unknown",
      }),
  ).toThrow(RangeError);
});

test.each([
  OWLDocumentFormats.FUNCTIONAL,
  OWLDocumentFormats.RDF_XML,
  OWLDocumentFormats.OWL_XML,
  OWLDocumentFormats.TURTLE,
])(
  "Java %s creation, save and reload exceed the previous 32 MiB byte limit",
  async (format) => {
    const options = { behaviorProfileId: "java-owlapi-5.5.1" };
    const manager = OWLManager.createOWLOntologyManager(options);
    const factory = manager.getOWLDataFactory();
    const ontology = manager.createOntology(
      factory.getOWLOntologyID(IRI.create("urn:resources:large")),
    );
    const lexicalForm = "x".repeat(32 * 1024 * 1024 + 1);
    manager.addAxiom(
      ontology,
      factory.getOWLAnnotationAssertionAxiom(
        factory.getRDFSLabel(),
        IRI.create("urn:resources:subject"),
        factory.getOWLLiteral(lexicalForm),
      ),
    );
    const target = new StringDocumentTarget();
    await manager.saveOntology(ontology, format, target);
    expect(Buffer.byteLength(target.toString(), "utf8")).toBeGreaterThan(
      32 * 1024 * 1024,
    );
    const source = new StringDocumentSource(target.toString(), { format });
    const reloaded =
      await OWLManager.createOWLOntologyManager(
        options,
      ).loadOntologyFromOntologyDocument(source);
    expect([...reloaded.getAxioms()][0].value.lexicalForm).toBe(lexicalForm);
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source,
      ),
    ).rejects.toThrow(ResourceLimitError);
  },
  120000,
);

test("Java admission accepts annotations beyond the old private depth cap", async () => {
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  const factory = manager.getOWLDataFactory();
  const ontology = manager.createOntology();
  let annotation = factory.getOWLAnnotation(
    factory.getRDFSLabel(),
    factory.getOWLLiteral("leaf"),
  );
  for (let depth = 1; depth < 65; depth++)
    annotation = factory.getOWLAnnotation(
      factory.getRDFSLabel(),
      factory.getOWLLiteral("outer"),
      [annotation],
    );
  const axiom = factory.getOWLDeclarationAxiom(
    factory.getOWLClass(IRI.create("urn:large:C")),
    [annotation],
  );
  expect(manager.applyChange(new AddAxiom(ontology, axiom))).toBe(
    "SUCCESSFULLY",
  );
  for (const format of [
    OWLDocumentFormats.FUNCTIONAL,
    OWLDocumentFormats.TURTLE,
    OWLDocumentFormats.RDF_XML,
    OWLDocumentFormats.OWL_XML,
  ])
    await expect(
      manager.saveOntology(ontology, format, new StringDocumentTarget()),
    ).resolves.toBeUndefined();
});

test("Java OWL profile validation has no JS literal-length cap, while explicit exhaustion cannot report invalidity", async () => {
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  const factory = manager.getOWLDataFactory();
  const ontology = manager.createOntology();
  manager.addAxiom(
    ontology,
    factory.getOWLAnnotationAssertionAxiom(
      factory.getRDFSLabel(),
      IRI.create("urn:large:s"),
      factory.getOWLLiteral("x".repeat(1048577)),
    ),
  );
  const checker = new OWL2DLProfile({ behaviorProfileId: "java-owlapi-5.5.1" });
  expect((await checker.checkOntology(ontology)).isInProfile()).toBe(true);
  const exhausted = await checker.checkOntology(ontology, { maxWork: 0 });
  expect(exhausted.status).toBe("unverified");
  expect(exhausted.getViolations()).toEqual([]);
  expect(() => exhausted.isInProfile()).toThrow(ResourceLimitError);
});

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s detection accepts a valid header after a bounded whitespace prefix",
  async (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    await expect(
      manager.loadOntologyFromOntologyDocument(
        " ".repeat(9000) + "Ontology(<urn:large:root>)",
      ),
    ).resolves.toBeDefined();
  },
);

test.each([
  ["<", "maxExclusive"],
  ["<=", "maxInclusive"],
  [">", "minExclusive"],
  [">=", "minInclusive"],
])("Manchester %s has the precise bound direction", async (operator, facet) => {
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(
      `Ontology: <urn:facet>\nDataProperty: <urn:p>\nRange: integer[${operator} 5]`,
      { format: OWLDocumentFormats.MANCHESTER },
    ),
  );
  const range = [...ontology.getAxioms()].find((axiom) => axiom.range)?.range;
  expect(range.facetRestrictions[0].facet.value).toBe(
    `http://www.w3.org/2001/XMLSchema#${facet}`,
  );
});
