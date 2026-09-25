import { readFileSync } from "node:fs";
import { OWLManager } from "../../../apibinding/index.js";
import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  OWLOntologyStorageError,
  StringDocumentSource,
  StringDocumentTarget,
} from "../../../io/index.js";
import { replaceStringDocumentTargetText } from "../../../io/stringDocumentTarget.js";
import {
  IRI,
  AddOntologyAnnotation,
  OWLStructuralObject,
  OWLObjectKind,
} from "../../../model/index.js";
import { compareOntologies } from "../../model/ontologyStructuralIsomorphism.js";

const fixture = readFileSync(
  new URL(
    "../../../util/owlapi-reference/fixtures/storage/functional-all-kinds.ofn",
    import.meta.url,
  ),
  "utf8",
);

describe("manager-selected Functional Syntax storage", () => {
  it("matches the pinned Java snapshot's identity, axiom counts, and direct signature", async () => {
    const expected = JSON.parse(
      readFileSync(
        new URL(
          "../../../util/owlapi-reference/fixtures/storage/functional-all-kinds.java.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(expected.oracle).toMatchObject({
      revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
      version: "5.5.1",
    });
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(fixture),
      { parsingMode: "strict" },
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
        Object.entries(expected.snapshot.axiomTypeCounts).map(
          ([type, count]) => [javaCountNames[type] ?? type, count],
        ),
      ),
    );
    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      expected.snapshot.ontologyIRI,
    );
    expect(ontology.getOntologyID().versionIRI.value).toBe(
      expected.snapshot.versionIRI,
    );
    expect(ontology.getAxioms().size).toBe(expected.snapshot.axioms.length);
    for (const [category, method] of Object.entries({
      classes: "getClassesInSignature",
      objectProperties: "getObjectPropertiesInSignature",
      dataProperties: "getDataPropertiesInSignature",
      annotationProperties: "getAnnotationPropertiesInSignature",
      individuals: "getIndividualsInSignature",
      datatypes: "getDatatypesInSignature",
    })) {
      expect(
        [...ontology[method]()].map(({ iri }) => iri.value).sort(),
      ).toEqual(expected.snapshot.signature[category]);
    }
  });

  it("round-trips every kind through the public save boundary without imports, diagnostics, or external loads", async () => {
    let calls = 0;
    const createManager = () =>
      OWLManager.createOWLOntologyManager({
        documentLoader: {
          load() {
            calls += 1;
            throw new Error("Unexpected external load");
          },
        },
      });
    const manager = createManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(fixture),
      { parsingMode: "strict" },
    );
    const target = new StringDocumentTarget();
    replaceStringDocumentTargetText(target, "prior text");
    const operation = manager.saveOntology(
      ontology,
      OWLDocumentFormats.FUNCTIONAL,
      target,
    );
    expect(operation).toBeInstanceOf(Promise);
    expect(target.toString()).toBe("prior text");
    await expect(operation).resolves.toBeUndefined();
    const fresh = createManager();
    const loaded = await fresh.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(target.toString()),
      { parsingMode: "strict" },
    );
    const reloaded = loaded.ontology;
    expect(compareOntologies(ontology, reloaded)).toEqual({
      equal: true,
      mismatch: null,
    });
    expect(fresh.importsClosure(reloaded)).toEqual([reloaded]);
    expect(reloaded.getImportsDeclarations().size).toBe(0);
    expect(
      loaded.documents.every(({ context }) => context.diagnostics.length === 0),
    ).toBe(true);
    expect(calls).toBe(0);
  });

  it("round-trips only authored direct imports with a deterministic counting loader", async () => {
    const calls = [];
    const createManager = () =>
      OWLManager.createOWLOntologyManager({
        documentLoader: {
          load(documentIRI) {
            calls.push(documentIRI.value);
            expect(documentIRI.value).toBe("urn:storage:imported");
            return new StringDocumentSource(
              "Ontology(<urn:storage:imported> Declaration(Class(<urn:storage:ImportedClass>)))",
              { documentIRI },
            );
          },
        },
      });
    const manager = createManager();
    const root = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        "Ontology(<urn:storage:root> Import(<urn:storage:imported>) Declaration(Class(<urn:storage:RootClass>)))",
      ),
      { parsingMode: "strict" },
    );
    expect(calls).toEqual(["urn:storage:imported"]);
    const target = new StringDocumentTarget();
    await manager.saveOntology(root, OWLDocumentFormats.FUNCTIONAL, target);
    expect(calls).toEqual(["urn:storage:imported"]);
    expect(target.toString()).toContain("Import(<urn:storage:imported>)");
    expect(target.toString()).not.toContain("ImportedClass");
    const fresh = createManager();
    const reloaded = await fresh.loadOntologyFromOntologyDocument(
      new StringDocumentSource(target.toString()),
      { parsingMode: "strict" },
    );
    expect(calls).toEqual(["urn:storage:imported", "urn:storage:imported"]);
    expect(fresh.importsClosure(reloaded)).toHaveLength(2);
    expect(compareOntologies(root, reloaded)).toEqual({
      equal: true,
      mismatch: null,
    });
  });

  it("retains populated target text for invalid lexical values and unsupported output parameters", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const factory = manager.getOWLDataFactory();
    const target = new StringDocumentTarget();
    replaceStringDocumentTargetText(target, "retained text");
    for (const value of [
      IRI.create("urn:invalid>iri"),
      factory.getOWLLiteral("\udfff"),
      factory.getOWLLiteral("value", "en-abcdefghi"),
      new OWLStructuralObject(
        OWLObjectKind.LITERAL,
        {
          lexicalForm: "value",
          language: "",
          datatype: new OWLStructuralObject("UnhandledDatatype", {}, []),
        },
        [],
      ),
    ]) {
      const ontology = manager.createOntology();
      manager.applyChange(
        new AddOntologyAnnotation(
          ontology,
          factory.getOWLAnnotation(factory.getRDFSLabel(), value),
        ),
      );
      await expect(
        manager.saveOntology(ontology, OWLDocumentFormats.FUNCTIONAL, target),
      ).rejects.toBeInstanceOf(OWLOntologyStorageError);
      await expect(
        manager.saveOntology(ontology, OWLDocumentFormats.FUNCTIONAL, target),
      ).rejects.toMatchObject({
        code: "ONTOLOGY_STORAGE_FAILED",
        reason: "ONTOLOGY_NOT_REPRESENTABLE",
      });
      expect(target.toString()).toBe("retained text");
    }
    await expect(
      manager.saveOntology(
        manager.createOntology(),
        OWLDocumentFormats.FUNCTIONAL.withParameter(
          "unknown-output-option",
          true,
        ),
        target,
      ),
    ).rejects.toMatchObject({ code: "ONTOLOGY_STORAGE_FAILED" });
    expect(target.toString()).toBe("retained text");
  });

  it("saves one committed revision while a later manager mutation remains independent", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const factory = manager.getOWLDataFactory();
    const ontology = manager.createOntology();
    const target = new StringDocumentTarget();
    const before = factory.getOWLDeclarationAxiom(
      factory.getOWLClass(IRI.create("urn:before")),
    );
    const after = factory.getOWLDeclarationAxiom(
      factory.getOWLClass(IRI.create("urn:after")),
    );
    manager.addAxiom(ontology, before);
    const operation = manager.saveOntology(
      ontology,
      OWLDocumentFormats.FUNCTIONAL,
      target,
    );
    manager.addAxiom(ontology, after);
    await operation;
    expect(target.toString()).toContain("urn:before");
    expect(target.toString()).not.toContain("urn:after");
    expect(ontology.getAxioms().size).toBe(2);
  });
});
