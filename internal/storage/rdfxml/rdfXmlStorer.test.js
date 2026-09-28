import { readFileSync } from "node:fs";
import { OWLManager } from "../../../apibinding/index.js";
import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
  StringDocumentSource,
  StringDocumentTarget,
} from "../../../io/index.js";
import { replaceStringDocumentTargetText } from "../../../io/stringDocumentTarget.js";
import {
  AddOntologyAnnotation,
  IRI,
  OWLObjectKind,
  OWL_OBJECT_KINDS,
} from "../../../model/index.js";
import { OwlToRdfTranslator } from "../../mapping/owlToRdfTranslator.js";
import { OntologyState } from "../../model/ontologyState.js";
import {
  compareOntologies,
  OntologyStructuralComparisonLimitError,
} from "../../model/ontologyStructuralIsomorphism.js";
import {
  rdfDataFactory as rdf,
  rdfDatasetFactory,
} from "../../rdfjs/environment.js";
import {
  OWL_NAMESPACE,
  RDF_NAMESPACE,
  XSD_NAMESPACE,
} from "../../rdfjs/vocabulary.js";
import { StorerRegistry } from "../storerRegistry.js";
import { createRdfXmlStorer } from "./rdfXmlStorer.js";

const functionalFixture = readFileSync(
  new URL(
    "../../../util/owlapi-reference/fixtures/storage/functional-all-kinds.ofn",
    import.meta.url,
  ),
  "utf8",
);
const read = (manager, text) =>
  manager.loadOntologyFromOntologyDocument(new StringDocumentSource(text), {
    parsingMode: "strict",
  });
const targetWithPriorText = () => {
  const target = new StringDocumentTarget();
  replaceStringDocumentTargetText(target, "prior complete document");
  return target;
};
const representableFixture = async (manager) => {
  const ontology = await read(manager, functionalFixture);
  const factory = manager.getOWLDataFactory();
  const declaredEntityKeys = new Set(
    [...ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM)].map(
      ({ entity }) => entity.structuralKey(),
    ),
  );
  // RDF's reverse mapping can infer declarations. The positive fixture authors
  // them explicitly; the storer must never add them to the caller's ontology.
  manager.addAxioms(
    ontology,
    [
      ...ontology.getClassesInSignature(),
      ...ontology.getObjectPropertiesInSignature(),
      ...ontology.getDataPropertiesInSignature(),
      ...ontology.getAnnotationPropertiesInSignature(),
      ...ontology.getIndividualsInSignature(),
      ...ontology.getDatatypesInSignature(),
    ]
      .filter((entity) => !declaredEntityKeys.has(entity.structuralKey()))
      .map((entity) => factory.getOWLDeclarationAxiom(entity)),
  );
  return ontology;
};
const snapshot = (ontology) =>
  new OntologyState({
    ontologyID: ontology.getOntologyID(),
    directAxioms: ontology.getAxioms(),
    directOntologyAnnotations: ontology.getAnnotations(),
    authoredImportDeclarations: ontology.getImportsDeclarations(),
  }).createSnapshot();
const requireRepresentabilityFailure = async (
  operation,
  target,
  details = {},
) => {
  await expect(operation).rejects.toBeInstanceOf(OWLOntologyStorageError);
  await expect(operation).rejects.toMatchObject({
    code: "ONTOLOGY_STORAGE_FAILED",
    reason: "ONTOLOGY_NOT_REPRESENTABLE",
    ...details,
  });
  expect(target.toString()).toBe("prior complete document");
};

describe("manager-selected lossless RDF/XML storage", () => {
  it("retains the exhaustive native Java oracle fixture's direct structure", async () => {
    const java = JSON.parse(
      readFileSync(
        new URL(
          "../../../util/owlapi-reference/fixtures/storage/rdfxml-all-kinds.java.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const rdfxml = readFileSync(
      new URL(
        "../../../util/owlapi-reference/fixtures/storage/rdfxml-all-kinds.rdf",
        import.meta.url,
      ),
      "utf8",
    );
    const ontology = await read(OWLManager.createOWLOntologyManager(), rdfxml);
    const expected = await representableFixture(
      OWLManager.createOWLOntologyManager(),
    );
    expect(compareOntologies(expected, ontology)).toEqual({
      equal: true,
      mismatch: null,
    });
    expect(java.oracle).toMatchObject({
      revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
      version: "5.5.1",
    });
    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      java.snapshot.ontologyIRI,
    );
    expect(ontology.getOntologyID().versionIRI.value).toBe(
      java.snapshot.versionIRI,
    );
    const counts = {};
    for (const { kind } of ontology.getAxioms()) {
      const type = kind.slice(3, -5);
      counts[type] = (counts[type] ?? 0) + 1;
    }
    const javaCountNames = {
      AnnotationPropertyRangeOf: "AnnotationPropertyRange",
      IrrefexiveObjectProperty: "IrreflexiveObjectProperty",
    };
    expect(counts).toEqual(
      Object.fromEntries(
        Object.entries(java.snapshot.axiomTypeCounts).map(([type, count]) => [
          javaCountNames[type] ?? type,
          count,
        ]),
      ),
    );
    expect(ontology.getAxioms().size).toBe(java.snapshot.axioms.length);
    expect(ontology.getAnnotations().size).toBe(
      java.snapshot.ontologyAnnotations.length,
    );
    expect(ontology.getImportsDeclarations().size).toBe(0);
  });

  it("round-trips every structural kind with no external loading and stable repeated bytes", async () => {
    let externalLoads = 0;
    const createManager = () =>
      OWLManager.createOWLOntologyManager({
        documentLoader: {
          load() {
            externalLoads += 1;
            throw new Error("Unexpected external load");
          },
        },
      });
    const manager = createManager();
    const ontology = await representableFixture(manager);
    const kinds = new Set();
    const visited = new Set();
    const visit = (value) => {
      if (!value || typeof value !== "object" || visited.has(value)) return;
      visited.add(value);
      if (value.kind) kinds.add(value.kind);
      Object.values(value).forEach(visit);
    };
    visit(snapshot(ontology));
    expect([...kinds].sort()).toEqual(
      OWL_OBJECT_KINDS.filter(
        (kind) => kind !== OWLObjectKind.IMPORTS_DECLARATION,
      ).sort(),
    );
    const before = [...ontology.getAxioms()];
    const target = targetWithPriorText();
    const operation = manager.saveOntology(
      ontology,
      OWLDocumentFormats.RDF_XML,
      target,
    );
    expect(operation).toBeInstanceOf(Promise);
    expect(target.toString()).toBe("prior complete document");
    await expect(operation).resolves.toBeUndefined();
    const text = target.toString();
    expect(text).toContain("<rdf:RDF");
    const fresh = createManager();
    const loaded = await fresh.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(text),
      { parsingMode: "strict" },
    );
    expect(compareOntologies(ontology, loaded.ontology)).toEqual({
      equal: true,
      mismatch: null,
    });
    expect(loaded.documents).toHaveLength(1);
    expect(loaded.documents[0].context.diagnostics).toEqual([]);
    expect(externalLoads).toBe(0);
    expect([...ontology.getAxioms()]).toEqual(before);
    for (let index = 0; index < 25; index += 1) rdf.blankNode();
    await manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target);
    expect(target.toString()).toBe(text);
    const reorderedManager = createManager();
    const reordered = reorderedManager.createOntology(ontology.getOntologyID());
    reorderedManager.addAxioms(
      reordered,
      [...ontology.getAxioms()].toReversed(),
    );
    for (const annotation of [...ontology.getAnnotations()].toReversed()) {
      reorderedManager.applyChange(
        new AddOntologyAnnotation(reordered, annotation),
      );
    }
    const reorderedTarget = new StringDocumentTarget();
    await reorderedManager.saveOntology(
      reordered,
      OWLDocumentFormats.RDF_XML,
      reorderedTarget,
    );
    expect(reorderedTarget.toString()).toBe(text);
  });

  it("round-trips anonymous ontology identity and literal CR, Unicode, datatype, and language", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const factory = manager.getOWLDataFactory();
    const ontology = manager.createOntology();
    const property = factory.getOWLAnnotationProperty(
      IRI.create("urn:storage:label"),
    );
    manager.addAxiom(ontology, factory.getOWLDeclarationAxiom(property));
    for (const value of [
      factory.getOWLLiteral("\t\n\r\n<&> Δ 😀"),
      factory.getOWLLiteral("é", "fr-ca"),
      factory.getOWLLiteral(
        "01",
        factory.getOWLDatatype(IRI.create(`${XSD_NAMESPACE}integer`)),
      ),
    ]) {
      manager.applyChange(
        new AddOntologyAnnotation(
          ontology,
          factory.getOWLAnnotation(property, value),
        ),
      );
    }
    const target = targetWithPriorText();
    await manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target);
    const reloaded = await read(
      OWLManager.createOWLOntologyManager(),
      target.toString(),
    );
    expect(compareOntologies(ontology, reloaded)).toEqual({
      equal: true,
      mismatch: null,
    });
  });

  it("preserves authored imports without loading them during save or serializing their axioms", async () => {
    const calls = [];
    const createManager = () =>
      OWLManager.createOWLOntologyManager({
        documentLoader: {
          load(documentIRI) {
            calls.push(documentIRI.value);
            return new StringDocumentSource(
              "Ontology(<urn:storage:imported> Declaration(Class(<urn:storage:ImportedClass>)))",
              { documentIRI },
            );
          },
        },
      });
    const manager = createManager();
    const ontology = await read(
      manager,
      "Ontology(<urn:storage:root> Import(<urn:storage:imported>) Declaration(Class(<urn:storage:RootClass>)))",
    );
    const target = targetWithPriorText();
    await manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target);
    expect(calls).toEqual(["urn:storage:imported"]);
    expect(target.toString()).not.toContain("ImportedClass");
    const reloaded = await read(createManager(), target.toString());
    expect(calls).toEqual(["urn:storage:imported", "urn:storage:imported"]);
    expect(compareOntologies(ontology, reloaded)).toEqual({
      equal: true,
      mismatch: null,
    });
  });

  it("rejects non-injective ontology annotation and annotation-assertion roles atomically", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await read(
      manager,
      `Ontology(<urn:storage:root>
      Annotation(<urn:storage:note> "same value")
      Declaration(AnnotationProperty(<urn:storage:note>))
      AnnotationAssertion(<urn:storage:note> <urn:storage:root> "same value")
    )`,
    );
    const target = targetWithPriorText();
    await requireRepresentabilityFailure(
      manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target),
      target,
      {
        mismatch: {
          category: "AXIOMS",
          path: ["axioms", "OWLAnnotationAssertionAxiom"],
        },
      },
    );
    // The caller may explicitly choose the lossless structural syntax.
    await manager.saveOntology(ontology, OWLDocumentFormats.FUNCTIONAL, target);
    expect(
      compareOntologies(
        ontology,
        await read(OWLManager.createOWLOntologyManager(), target.toString()),
      ).equal,
    ).toBe(true);
  });

  it("rejects inferred declaration changes rather than accepting logical equivalence", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await read(
      manager,
      "Ontology(<urn:storage:root> TransitiveObjectProperty(<urn:storage:p>))",
    );
    const target = targetWithPriorText();
    await requireRepresentabilityFailure(
      manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target),
      target,
      {
        mismatch: {
          category: "AXIOMS",
          path: ["axioms", "OWLDeclarationAxiom"],
        },
      },
    );
  });

  it("rejects an annotated and unannotated declaration collapsed onto one RDF triple", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await read(
      manager,
      `Ontology(<urn:storage:root>
      Declaration(Class(<urn:storage:A>))
      Declaration(Annotation(rdfs:label "annotated") Class(<urn:storage:A>))
    )`,
    );
    const target = targetWithPriorText();
    await requireRepresentabilityFailure(
      manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target),
      target,
      {
        mismatch: {
          category: "AXIOMS",
          path: ["axioms", "OWLDeclarationAxiom"],
        },
      },
    );
  });

  it.each([
    ["a non-QName predicate", "urn:storage:ends/", "text"],
    ["an RDF syntax predicate", `${RDF_NAMESPACE}about`, "text"],
    ["a relative IRI", "relative", "text"],
    ["a forbidden XML character", "urn:storage:label", "\0"],
  ])(
    "rejects %s through the public boundary without target changes",
    async (_name, propertyIRI, lexicalForm) => {
      const manager = OWLManager.createOWLOntologyManager();
      const factory = manager.getOWLDataFactory();
      const ontology = manager.createOntology();
      manager.applyChange(
        new AddOntologyAnnotation(
          ontology,
          factory.getOWLAnnotation(
            factory.getOWLAnnotationProperty(IRI.create(propertyIRI)),
            factory.getOWLLiteral(lexicalForm),
          ),
        ),
      );
      const target = targetWithPriorText();
      await requireRepresentabilityFailure(
        manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target),
        target,
      );
    },
  );

  it("rejects unsupported output parameters without attempting a syntax fallback", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const target = targetWithPriorText();
    const operation = manager.saveOntology(
      manager.createOntology(),
      OWLDocumentFormats.RDF_XML.withParameter("pretty", true),
      target,
    );
    await expect(operation).rejects.toBeInstanceOf(OWLOntologyStorageError);
    await expect(operation).rejects.toMatchObject({
      code: "ONTOLOGY_STORAGE_FAILED",
    });
    expect(target.toString()).toBe("prior complete document");
  });

  it("saves the call-time snapshot independently of later manager mutations", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await read(
      manager,
      "Ontology(<urn:storage:root> Declaration(Class(<urn:storage:Before>)))",
    );
    const before = snapshot(ontology);
    const target = targetWithPriorText();
    const operation = manager.saveOntology(
      ontology,
      OWLDocumentFormats.RDF_XML,
      target,
    );
    const factory = manager.getOWLDataFactory();
    manager.addAxiom(
      ontology,
      factory.getOWLDeclarationAxiom(
        factory.getOWLClass(IRI.create("urn:storage:After")),
      ),
    );
    await operation;
    const reloaded = await read(
      OWLManager.createOWLOntologyManager(),
      target.toString(),
    );
    expect([...reloaded.getAxioms()]).toEqual(before.directAxioms);
    expect(ontology.getAxioms().size).toBe(before.directAxioms.length + 1);
  });
});

describe("private RDF/XML reconstruction gate", () => {
  it.each([
    new ResourceLimitError("Mapping budget exhausted"),
    new OntologyStructuralComparisonLimitError(1, 2),
  ])(
    "does not misclassify exhausted verification limits as proven unrepresentability: %s",
    async (cause) => {
      const registry = new StorerRegistry([
        createRdfXmlStorer({
          mapOntologyToRdf() {
            throw cause;
          },
        }),
      ]);
      const target = targetWithPriorText();
      const operation = registry.store(
        new OntologyState().createSnapshot(),
        OWLDocumentFormats.RDF_XML,
        target,
      );
      await expect(operation).rejects.toMatchObject({
        code: "ONTOLOGY_STORAGE_FAILED",
        cause,
      });
      await expect(operation).rejects.not.toHaveProperty("reason");
      expect(target.toString()).toBe("prior complete document");
    },
  );

  it.each([
    ["blank predicate", { predicate: rdf.blankNode("predicate") }],
    ["literal subject", { subject: rdf.literal("subject") }],
    [
      "quoted-triple object",
      {
        object: rdf.quad(
          rdf.namedNode("urn:s"),
          rdf.namedNode("urn:p"),
          rdf.literal("nested"),
        ),
      },
    ],
    [
      "false default graph",
      { graph: { termType: "DefaultGraph", value: "not-default" } },
    ],
    [
      "invalid language tag",
      {
        object: {
          termType: "Literal",
          value: "text",
          language: "en--US",
          datatype: rdf.namedNode(`${RDF_NAMESPACE}langString`),
        },
      },
    ],
    [
      "language/datatype conflict",
      {
        object: {
          termType: "Literal",
          value: "text",
          language: "en",
          datatype: rdf.namedNode(`${XSD_NAMESPACE}string`),
        },
      },
    ],
    [
      "non-IRI datatype",
      {
        object: {
          termType: "Literal",
          value: "text",
          language: "",
          datatype: rdf.blankNode("datatype"),
        },
      },
    ],
    [
      "RDF 1.2 direction",
      {
        object: {
          termType: "Literal",
          value: "text",
          language: "",
          direction: "ltr",
          datatype: rdf.namedNode(`${XSD_NAMESPACE}string`),
        },
      },
    ],
    [
      "RDF 1.1 HTML datatype",
      { object: rdf.literal("text", rdf.namedNode(`${RDF_NAMESPACE}HTML`)) },
    ],
  ])(
    "retains prior target text for a graph-writer limitation: %s",
    async (_name, changedTerms) => {
      const registry = new StorerRegistry([
        createRdfXmlStorer({
          mapOntologyToRdf() {
            const quad = rdf.quad(
              rdf.namedNode("urn:storage:subject"),
              rdf.namedNode("urn:storage:predicate"),
              rdf.literal("text"),
            );
            return [{ ...quad, ...changedTerms }];
          },
        }),
      ]);
      const target = targetWithPriorText();
      await requireRepresentabilityFailure(
        registry.store(
          new OntologyState().createSnapshot(),
          OWLDocumentFormats.RDF_XML,
          target,
        ),
        target,
      );
    },
  );

  it.each([
    "named graph",
    "mixed graphs",
    "unconsumed quad",
    "multiple ontology headers",
    "lost axiom",
  ])("rejects a mapper defect: %s", async (defect) => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await read(
      manager,
      "Ontology(<urn:storage:root> Declaration(Class(<urn:storage:Class>)))",
    );
    const target = targetWithPriorText();
    const registry = new StorerRegistry([
      createRdfXmlStorer({
        mapOntologyToRdf(original) {
          const dataset = new OwlToRdfTranslator().translate(original);
          const named = (value) => rdf.namedNode(value);
          if (defect === "named graph")
            return rdfDatasetFactory.dataset(
              [...dataset].map((quad) =>
                rdf.quad(
                  quad.subject,
                  quad.predicate,
                  quad.object,
                  named("urn:storage:graph"),
                ),
              ),
            );
          if (defect === "mixed graphs")
            dataset.add(
              rdf.quad(
                named("urn:storage:extra"),
                named(`${RDF_NAMESPACE}type`),
                named(`${OWL_NAMESPACE}Class`),
                named("urn:storage:graph"),
              ),
            );
          if (defect === "unconsumed quad")
            dataset.add(
              rdf.quad(
                rdf.blankNode("orphan"),
                named(`${OWL_NAMESPACE}onProperty`),
                named("urn:storage:p"),
              ),
            );
          if (defect === "multiple ontology headers")
            dataset.add(
              rdf.quad(
                named("urn:storage:extra"),
                named(`${RDF_NAMESPACE}type`),
                named(`${OWL_NAMESPACE}Ontology`),
              ),
            );
          if (defect === "lost axiom") {
            for (const quad of dataset.match(
              null,
              null,
              named(`${OWL_NAMESPACE}Class`),
            ))
              dataset.delete(quad);
          }
          return dataset;
        },
      }),
    ]);
    await requireRepresentabilityFailure(
      registry.store(snapshot(ontology), OWLDocumentFormats.RDF_XML, target),
      target,
      defect === "lost axiom"
        ? {
            mismatch: {
              category: "AXIOMS",
              path: ["axioms", "OWLDeclarationAxiom"],
            },
          }
        : {},
    );
  });
});
