import { readFileSync } from "node:fs";
import {
  OWLOntologyManager,
  IRI,
  AddOntologyAnnotation,
} from "../../model/index.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import { OWLDocumentFormats } from "../../formats/index.js";
import {
  StringDocumentSource,
  StringDocumentTarget,
  OWLOntologyStorageError,
  OWLStorerNotFoundError,
} from "../../io/index.js";
import { replaceStringDocumentTargetText } from "../../io/stringDocumentTarget.js";
import { compareOntologies } from "../model/ontologyStructuralIsomorphism.js";

const source = readFileSync(
  new URL(
    "../../util/owlapi-reference/fixtures/storage/functional-all-kinds.ofn",
    import.meta.url,
  ),
  "utf8",
);

test.each([129, 509])(
  "OWL/XML round-trips expression nesting %i within its 512-node budget",
  async (depth) => {
    const manager = new OWLOntologyManager();
    const f = manager.getOWLDataFactory();
    const a = f.getOWLClass(IRI.create("urn:depth:A"));
    let expression = a;
    for (let i = 0; i < depth; i++)
      expression = f.getOWLObjectComplementOf(expression);
    const ontology = manager.createOntology();
    manager.addAxiom(ontology, f.getOWLSubClassOfAxiom(a, expression));
    const target = new StringDocumentTarget();
    await manager.saveOntology(ontology, OWLDocumentFormats.OWL_XML, target);
    const loaded =
      await new OWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource(target.toString()),
      );
    expect(compareOntologies(ontology, loaded).equal).toBe(true);
  },
);

test("OWL/XML counts the Ontology root and rejects depth 513 before target publication", async () => {
  const manager = new OWLOntologyManager();
  const f = manager.getOWLDataFactory();
  const a = f.getOWLClass(IRI.create("urn:depth:A"));
  let expression = a;
  for (let i = 0; i < 510; i++)
    expression = f.getOWLObjectComplementOf(expression);
  const ontology = manager.createOntology();
  manager.addAxiom(ontology, f.getOWLSubClassOfAxiom(a, expression));
  const target = new StringDocumentTarget();
  replaceStringDocumentTargetText(target, "prior text");
  await expect(
    manager.saveOntology(ontology, OWLDocumentFormats.OWL_XML, target),
  ).rejects.toMatchObject({
    cause: { code: "RESOURCE_LIMIT_EXCEEDED", limit: 512 },
  });
  expect(target.toString()).toBe("prior text");
});

test("OWL/XML rejects XML 1.0 control characters with its representability reason before publication", async () => {
  const manager = new OWLOntologyManager();
  const f = manager.getOWLDataFactory();
  const ontology = manager.createOntology();
  manager.addAxiom(
    ontology,
    f.getOWLAnnotationAssertionAxiom(
      f.getRDFSLabel(),
      IRI.create("urn:xml:subject"),
      f.getOWLLiteral("a\u0001b"),
    ),
  );
  const target = new StringDocumentTarget();
  replaceStringDocumentTargetText(target, "prior text");
  await expect(
    manager.saveOntology(ontology, OWLDocumentFormats.OWL_XML, target),
  ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
  expect(target.toString()).toBe("prior text");
});

test.each(["OWL_XML", "TURTLE"])(
  "%s enforces the admitted annotation-depth ceiling before target publication",
  async (format) => {
    const manager = new OWLOntologyManager();
    const factory = manager.getOWLDataFactory();
    const ontology = manager.createOntology();
    let annotation = factory.getOWLAnnotation(
      factory.getRDFSLabel(),
      factory.getOWLLiteral("inner"),
    );
    for (let depth = 1; depth < 64; depth++)
      annotation = factory.getOWLAnnotation(
        factory.getRDFSLabel(),
        factory.getOWLLiteral("outer"),
        [annotation],
      );
    manager.applyChange(new AddOntologyAnnotation(ontology, annotation));
    const target = new StringDocumentTarget();
    await manager.saveOntology(ontology, OWLDocumentFormats[format], target);
    const prior = target.toString();
    const reloaded =
      await new OWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource(prior, { format: OWLDocumentFormats[format] }),
      );
    expect(compareOntologies(ontology, reloaded).equal).toBe(true);
    manager.applyChange(
      new AddOntologyAnnotation(
        ontology,
        factory.getOWLAnnotation(
          factory.getRDFSLabel(),
          factory.getOWLLiteral("one too many"),
          [annotation],
        ),
      ),
    );
    await expect(
      manager.saveOntology(ontology, OWLDocumentFormats[format], target),
    ).rejects.toMatchObject({
      name: "OWLOntologyStorageError",
      cause: { name: "ResourceLimitError" },
    });
    expect(target.toString()).toBe(prior);
  },
);

test.each(["OWL_XML", "TURTLE"])(
  "%s rejects unattached source expressions without replacing the target",
  async (format) => {
    const manager = new OWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        `
    @prefix owl: <http://www.w3.org/2002/07/owl#> .
    <urn:unattached:ontology> a owl:Ontology .
    <urn:unattached:A> a owl:Class .
    <urn:unattached:p> a owl:ObjectProperty .
    [] a owl:Restriction; owl:onProperty <urn:unattached:p>; owl:someValuesFrom <urn:unattached:A> .
  `,
        { format: "turtle" },
      ),
      { parsingMode: "preserve" },
    );
    expect(
      readOntologySnapshot(ontology).documentMetadata.sourceStructure
        .expressions.length,
    ).toBeGreaterThan(0);
    const target = new StringDocumentTarget();
    replaceStringDocumentTargetText(target, "prior complete text");
    await expect(
      manager.saveOntology(ontology, OWLDocumentFormats[format], target),
    ).rejects.toMatchObject({
      name: "OWLOntologyStorageError",
      reason: "ONTOLOGY_NOT_REPRESENTABLE",
      sourceKind: "unattached-expression",
    });
    expect(target.toString()).toBe("prior complete text");
  },
);

test.each(["OWL_XML", "TURTLE"])(
  "%s storage retains every supported kind and direct identity without acquisition",
  async (format) => {
    let loads = 0;
    const manager = new OWLOntologyManager({
      documentLoader: {
        load() {
          loads++;
          throw new Error("no network");
        },
      },
    });
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(source),
      { parsingMode: "strict" },
    );
    if (format === "TURTLE") {
      // Author missing declarations without adding a plain variant beside an
      // already annotated declaration: RDF cannot distinguish both variants.
      const declared = new Set(
        [...ontology.getAxiomsByType("OWLDeclarationAxiom")].map((axiom) =>
          axiom.entity.structuralKey(),
        ),
      );
      manager.addAxioms(
        ontology,
        [...ontology.getSignature()]
          .filter((entity) => !declared.has(entity.structuralKey()))
          .map((entity) =>
            manager.getOWLDataFactory().getOWLDeclarationAxiom(entity),
          ),
      );
    }
    const target = new StringDocumentTarget();
    await manager
      .saveOntology(ontology, OWLDocumentFormats[format], target)
      .catch((cause) => {
        throw new Error(
          `Save failed: ${cause.message}; mismatch: ${JSON.stringify(cause.mismatch)}`,
          { cause },
        );
      });
    expect(target.toString().length).toBeGreaterThan(500);
    const reloaded =
      await new OWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource(
          target.toString(),
          undefined,
          OWLDocumentFormats[format],
        ),
        { parsingMode: "strict" },
      );
    expect(compareOntologies(ontology, reloaded).equal).toBe(true);
    expect(loads).toBe(0);
  },
);

test.each(["OWL_XML", "TURTLE"])(
  "%s fails atomically for unsupported parameters",
  async (format) => {
    const manager = new OWLOntologyManager();
    const ontology = manager.createOntology();
    const target = new StringDocumentTarget();
    replaceStringDocumentTargetText(target, "prior text");
    const error = await manager
      .saveOntology(
        ontology,
        OWLDocumentFormats[format].withParameter("unknown", true),
        target,
      )
      .then(
        () => {
          throw new Error("Unsupported parameters were accepted");
        },
        (cause) => cause,
      );
    expect(error).toBeInstanceOf(OWLOntologyStorageError);
    expect(error).not.toBeInstanceOf(OWLStorerNotFoundError);
    expect(error.message).toContain("does not support output parameters");
    expect(target.toString()).toBe("prior text");
  },
);

test("OWL/XML preserves attribute whitespace and literal CR, tab, quotes and XML delimiters", async () => {
  const manager = new OWLOntologyManager();
  const f = manager.getOWLDataFactory();
  const ontology = manager.createOntology(
    f.getOWLOntologyID(IRI.create("urn:xml:ontology")),
  );
  manager.addAxiom(
    ontology,
    f.getOWLAnnotationAssertionAxiom(
      f.getRDFSLabel(),
      IRI.create("urn:xml:subject"),
      f.getOWLLiteral('a\r\nb\t<&"😀'),
    ),
  );
  const target = new StringDocumentTarget();
  await manager.saveOntology(ontology, OWLDocumentFormats.OWL_XML, target);
  const reloaded =
    await new OWLOntologyManager().loadOntologyFromOntologyDocument(
      new StringDocumentSource(target.toString()),
    );
  expect(compareOntologies(ontology, reloaded).equal).toBe(true);
});

test.each(["OWL_XML", "TURTLE"])(
  "%s rejects excessively deep authored input with a resource cause and unchanged text",
  async (format) => {
    const manager = new OWLOntologyManager();
    const f = manager.getOWLDataFactory();
    const a = f.getOWLClass(IRI.create("urn:deep:A"));
    let expression = a;
    for (let depth = 0; depth < 1200; depth++)
      expression = f.getOWLObjectComplementOf(expression);
    const ontology = manager.createOntology();
    manager.addAxiom(ontology, f.getOWLSubClassOfAxiom(a, expression));
    const target = new StringDocumentTarget();
    replaceStringDocumentTargetText(target, "prior text");
    await expect(
      manager.saveOntology(ontology, OWLDocumentFormats[format], target),
    ).rejects.toMatchObject({ cause: { code: "RESOURCE_LIMIT_EXCEEDED" } });
    expect(target.toString()).toBe("prior text");
  },
);

test("Turtle rejects ambiguous annotated/plain RDF declarations without publishing partial text", async () => {
  const manager = new OWLOntologyManager();
  const f = manager.getOWLDataFactory();
  const ontology = manager.createOntology();
  const entity = f.getOWLClass(IRI.create("urn:turtle:ambiguous"));
  const annotation = f.getOWLAnnotation(
    f.getRDFSLabel(),
    f.getOWLLiteral("note"),
  );
  manager.addAxioms(ontology, [
    f.getOWLDeclarationAxiom(entity),
    f.getOWLDeclarationAxiom(entity, [annotation]),
  ]);
  const target = new StringDocumentTarget();
  replaceStringDocumentTargetText(target, "prior complete text");
  await expect(
    manager.saveOntology(ontology, OWLDocumentFormats.TURTLE, target),
  ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
  expect(target.toString()).toBe("prior complete text");
});
