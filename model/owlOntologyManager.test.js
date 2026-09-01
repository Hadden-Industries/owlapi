import {
  AddOntologyAnnotation,
  IRI,
  MissingImportError,
  OWLDataFactory,
  OWLDocumentFormats,
  OWLOntology,
  OWLOntologyStateError,
  ParserMismatchError,
  SetOntologyID,
  StructuralSet,
  StringDocumentSource,
  UnloadableImportError,
} from "../index.js";
import { OWLOntologyManager } from "./owlOntologyManager.js";
import {
  OWLParserRegistry,
  ParserDescriptor,
} from "../internal/parsing/parserRegistry.js";

const match = () => ({
  reason: "test fixture",
  reasonCode: "TEST_MATCH",
  result: "MATCH",
});

const captureOntologyMutationSnapshot = (manager, ontology, ontologyIDs) =>
  Object.freeze({
    aliases: Object.freeze(
      ontologyIDs.map((ontologyID) => manager.getOntology(ontologyID)),
    ),
    annotations: Object.freeze([...ontology.getAnnotations()]),
    axioms: Object.freeze([...ontology.getAxioms()]),
    importsClosure: manager.importsClosure(ontology),
    ontologyID: ontology.getOntologyID(),
  });

describe("OWLOntologyManager", () => {
  it("rejects malformed collaborator seams at construction", () => {
    expect(() => new OWLOntologyManager({ dataFactory: {} })).toThrow(
      /dataFactory must implement getOWLOntologyID/,
    );
    expect(() => new OWLOntologyManager({ documentLoader: {} })).toThrow(
      /documentLoader must implement load/,
    );
    expect(() => new OWLOntologyManager({ iriMappers: [{}] })).toThrow(
      /IRI mapper must implement getDocumentIRI/,
    );
    expect(() => new OWLOntologyManager({ registry: {} })).toThrow(
      /registry must implement resolveCandidates/,
    );
  });

  it("creates and retrieves more than one anonymous ontology", () => {
    const manager = new OWLOntologyManager();

    const first = manager.createOntology();
    const second = manager.createOntology();

    expect(first).not.toBe(second);
    expect(first.getOntologyID().equals(second.getOntologyID())).toBe(false);
    expect(manager.getOntology(first.getOntologyID())).toBe(first);
    expect(manager.getOntology(second.getOntologyID())).toBe(second);
  });

  it("snapshots a document-source protocol before asynchronous loading", async () => {
    let textReads = 0;
    let parsedText;
    const source = {
      getContentType: () => undefined,
      getDocumentIRI: () => undefined,
      getFileName: () => undefined,
      getText() {
        textReads += 1;
        return textReads === 1 ? "stable" : "mutated";
      },
    };
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(parserSource) {
            parsedText = parserSource.getText();
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({ registry });

    await manager.loadOntologyFromOntologyDocument(source);

    expect(parsedText).toBe("stable");
    expect(textReads).toBe(1);
  });

  it("discards failed candidate state and commits only accepted success", async () => {
    const dataFactory = new OWLDataFactory();
    const classA = dataFactory.getOWLClass(IRI.create("https://example.com/A"));
    const classB = dataFactory.getOWLClass(IRI.create("https://example.com/B"));
    const discarded = dataFactory.getOWLDeclarationAxiom(classA);
    const accepted = dataFactory.getOWLSubClassOfAxiom(classA, classB);
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.addAxiom(discarded);
            throw new ParserMismatchError("try the next parser");
          },
        }),
        detect: match,
        format: OWLDocumentFormats.OWL_XML,
        id: "first",
        priority: 0,
      }),
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.addAxiom(accepted);
            transaction.setOntologyID(
              dataFactory.getOWLOntologyID(
                IRI.create("https://example.com/ontology"),
              ),
            );
            transaction.setDocumentFormat(OWLDocumentFormats.FUNCTIONAL);
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "second",
        priority: 1,
      }),
    ]);
    const manager = new OWLOntologyManager({ dataFactory, registry });

    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("Ontology()"),
    );

    expect(ontology.getAxioms()).toEqual(new Set([accepted]));
    expect(manager.getOntology(ontology.getOntologyID())).toBe(ontology);
  });

  it("does not aggregate or fall back from an explicitly selected format", async () => {
    const mismatch = new ParserMismatchError("not functional", {
      parserId: "functional",
    });
    let fallbackCalls = 0;
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse() {
            throw mismatch;
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
      new ParserDescriptor({
        createParser: () => ({
          parse() {
            fallbackCalls += 1;
          },
        }),
        detect: match,
        format: OWLDocumentFormats.MANCHESTER,
        id: "manchester",
        priority: 4,
      }),
    ]);
    const manager = new OWLOntologyManager({ registry });

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology()", {
        format: OWLDocumentFormats.FUNCTIONAL,
      }),
    ).rejects.toBe(mismatch);
    expect(fallbackCalls).toBe(0);
  });

  it("aggregates only genuine parser-attempt mismatches", async () => {
    const mismatch = new ParserMismatchError("attempted and rejected", {
      parserId: "functional",
    });
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse() {
            throw mismatch;
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
      new ParserDescriptor({
        createParser: () => ({ parse() {} }),
        detect: () => ({
          reason: "The input is not Manchester Syntax",
          reasonCode: "NO_FRAME_MARKER",
          result: "NO_MATCH",
        }),
        format: OWLDocumentFormats.MANCHESTER,
        id: "manchester",
        priority: 4,
      }),
    ]);
    const manager = new OWLOntologyManager({ registry });

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology()"),
    ).rejects.toMatchObject({ errors: [mismatch] });
  });

  it("does not commit parser results completed after cancellation", async () => {
    const controller = new AbortController();
    const cancellation = new Error("cancelled by test");
    const dataFactory = new OWLDataFactory();
    const ontologyIri = IRI.create("urn:ontology:cancelled");
    const ontologyID = dataFactory.getOWLOntologyID(ontologyIri);
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          async parse(_source, transaction) {
            controller.abort(cancellation);
            await Promise.resolve();
            transaction.setOntologyID(ontologyID);
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({ dataFactory, registry });

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology()", {
        signal: controller.signal,
      }),
    ).rejects.toBe(cancellation);
    expect(manager.getOntology(ontologyID)).toBeUndefined();
  });

  it("does not read a document source when already cancelled", async () => {
    const controller = new AbortController();
    const cancellation = new Error("cancelled before source read");
    controller.abort(cancellation);
    let textReads = 0;
    const source = {
      getContentType: () => undefined,
      getDocumentIRI: () => undefined,
      getFileName: () => undefined,
      getText() {
        textReads += 1;
        return "Ontology()";
      },
    };
    const manager = new OWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(source, {
        signal: controller.signal,
      }),
    ).rejects.toBe(cancellation);
    expect(textReads).toBe(0);
  });

  it("preserves cancellation raised by an injected import loader", async () => {
    const controller = new AbortController();
    const cancellation = new Error("loader cancelled by test");
    const dataFactory = new OWLDataFactory();
    const ontologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:ontology:root"),
    );
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.setOntologyID(ontologyID);
            transaction.addImportsDeclaration(
              dataFactory.getOWLImportsDeclaration(
                IRI.create("urn:ontology:imported"),
              ),
            );
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        async load() {
          controller.abort(cancellation);
          throw cancellation;
        },
      },
      registry,
    });

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology()", {
        signal: controller.signal,
      }),
    ).rejects.toBe(cancellation);
    expect(manager.getOntology(ontologyID)).toBeUndefined();
  });

  it("counts structurally unique axioms against the ontology limit", async () => {
    const dataFactory = new OWLDataFactory();
    const cls = dataFactory.getOWLClass(IRI.create("urn:class:only"));
    const axiom = dataFactory.getOWLDeclarationAxiom(cls);
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.addAxiom(axiom);
            transaction.addAxiom(axiom);
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({ dataFactory, registry });

    const ontology = await manager.loadOntologyFromOntologyDocument(
      "Ontology()",
      { maxAxioms: 1 },
    );

    expect(ontology.getAxioms()).toEqual(new Set([axiom]));
  });

  it("rejects malformed parser diagnostics before committing state", async () => {
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.addDiagnostic({
              code: "MISSING_SEVERITY",
              message: "This diagnostic is incomplete",
            });
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({ registry });

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology()"),
    ).rejects.toThrow(TypeError);
  });

  it("rejects mutable document-format metadata returned by a parser", async () => {
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse() {
            return { key: "mutable-format" };
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({ registry });

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology()"),
    ).rejects.toThrow(/documentFormat metadata must be immutable/);
  });

  it("rejects frozen mutable diagnostic collections before publication", async () => {
    const retainedDiagnosticDetails = Object.freeze(
      new Map([["before", "retained"]]),
    );
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.addDiagnostic({
              code: "MUTABLE_INTERNAL_SLOTS",
              details: retainedDiagnosticDetails,
              message: "The diagnostic carries a frozen Map",
              severity: "info",
            });
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({ registry });

    await expect(
      manager.loadOntologyGraphFromOntologyDocument("Ontology()"),
    ).rejects.toThrow(
      /documentMetadata\.diagnostics\[0\]\.details must be immutable data/,
    );
  });

  it("rejects sentinel line and column locations in diagnostics", async () => {
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.addDiagnostic({
              code: "INVALID_LOCATION",
              line: 0,
              message: "A zero line is not a known source location",
              severity: "warning",
            });
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({ registry });

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology()"),
    ).rejects.toThrow("diagnostic line must be a positive integer");
  });

  it("loads a mapped cyclic import closure without merging direct ontology queries", async () => {
    const dataFactory = new OWLDataFactory();
    const rootOntologyIri = IRI.create("urn:ontology:root");
    const importedOntologyIri = IRI.create("urn:ontology:imported");
    const rootClass = dataFactory.getOWLClass(IRI.create("urn:class:root"));
    const importedClass = dataFactory.getOWLClass(
      IRI.create("urn:class:imported"),
    );
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(source, transaction) {
            const isRoot = source.getText() === "root";
            transaction.setOntologyID(
              dataFactory.getOWLOntologyID(
                isRoot ? rootOntologyIri : importedOntologyIri,
              ),
            );
            transaction.addAxiom(
              dataFactory.getOWLDeclarationAxiom(
                isRoot ? rootClass : importedClass,
              ),
            );
            transaction.addImportsDeclaration(
              dataFactory.getOWLImportsDeclaration(
                isRoot ? importedOntologyIri : rootOntologyIri,
              ),
            );
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "imports-fixture",
        priority: 0,
      }),
    ]);
    const documents = new Map([
      ["urn:document:root", "root"],
      ["urn:document:imported", "imported"],
    ]);
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        async load(documentIRI) {
          return new StringDocumentSource(documents.get(documentIRI.value), {
            documentIRI,
          });
        },
      },
      iriMappers: [
        {
          getDocumentIRI(ontologyIRI) {
            return IRI.create(
              ontologyIRI.equals(rootOntologyIri)
                ? "urn:document:root"
                : "urn:document:imported",
            );
          },
        },
      ],
      registry,
    });

    const root = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("root", {
        documentIRI: "urn:document:root",
      }),
      { maxImportDepth: 1 },
    );

    expect(root.getClassesInSignature()).toEqual(new Set([rootClass]));
    expect(
      manager.getOntology(dataFactory.getOWLOntologyID(importedOntologyIri)),
    ).toBeDefined();
  });

  it("loads transitive imports once and registers the complete closure", async () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIris = {
      leaf: IRI.create("urn:ontology:leaf"),
      middle: IRI.create("urn:ontology:middle"),
      root: IRI.create("urn:ontology:root"),
    };
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(source, transaction) {
            const name = source.getText();
            transaction.setOntologyID(
              dataFactory.getOWLOntologyID(ontologyIris[name]),
            );
            if (name === "root") {
              const declaration = dataFactory.getOWLImportsDeclaration(
                ontologyIris.middle,
              );
              transaction.addImportsDeclaration(declaration);
              transaction.addImportsDeclaration(declaration);
            } else if (name === "middle") {
              transaction.addImportsDeclaration(
                dataFactory.getOWLImportsDeclaration(ontologyIris.leaf),
              );
            }
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    let loadCalls = 0;
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        load(documentIRI) {
          loadCalls += 1;
          return documentIRI.value.slice("urn:ontology:".length);
        },
      },
      registry,
    });

    const root = await manager.loadOntologyFromOntologyDocument("root");

    expect(root.getImportsDeclarations().size).toBe(1);
    expect(loadCalls).toBe(2);
    const middle = manager.getOntology(
      dataFactory.getOWLOntologyID(ontologyIris.middle),
    );
    const leaf = manager.getOntology(
      dataFactory.getOWLOntologyID(ontologyIris.leaf),
    );
    expect(middle).toBeDefined();
    expect(leaf).toBeDefined();
    expect(manager.importsClosure(root)).toEqual([root, middle, leaf]);
    expect(manager.getImportsClosure(root)).toEqual(
      new Set([root, middle, leaf]),
    );
  });

  it("reuses one mapped document for distinct import IRIs", async () => {
    const dataFactory = new OWLDataFactory();
    const rootIri = IRI.create("urn:ontology:root");
    const firstImport = IRI.create("urn:ontology:first-import-name");
    const secondImport = IRI.create("urn:ontology:second-import-name");
    const importedIri = IRI.create("urn:ontology:document-identity");
    const sharedDocumentIri = IRI.create("urn:document:shared");
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(source, transaction) {
            if (source.getText() === "root") {
              transaction.setOntologyID(dataFactory.getOWLOntologyID(rootIri));
              transaction.addImportsDeclarations(
                [firstImport, secondImport].map((iri) =>
                  dataFactory.getOWLImportsDeclaration(iri),
                ),
              );
            } else {
              transaction.setOntologyID(
                dataFactory.getOWLOntologyID(importedIri),
              );
            }
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    let loadCalls = 0;
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        load() {
          loadCalls += 1;
          return "shared";
        },
      },
      iriMappers: [
        {
          getDocumentIRI() {
            return sharedDocumentIri;
          },
        },
      ],
      registry,
    });

    await manager.loadOntologyFromOntologyDocument("root");

    expect(loadCalls).toBe(1);
    expect(
      manager.getOntology(dataFactory.getOWLOntologyID(importedIri)),
    ).toBeDefined();
  });

  it("does not register partial state when a remote import is denied", async () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIri = IRI.create("urn:ontology:with-missing-import");
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.setOntologyID(
              dataFactory.getOWLOntologyID(ontologyIri),
            );
            transaction.addImportsDeclaration(
              dataFactory.getOWLImportsDeclaration(
                IRI.create("https://example.com/remote.owl"),
              ),
            );
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "missing-import-fixture",
        priority: 0,
      }),
    ]);
    let loadCalls = 0;
    const documentLoader = {
      load() {
        loadCalls += 1;
      },
    };
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader,
      registry,
    });

    await expect(
      manager.loadOntologyFromOntologyDocument("root"),
    ).rejects.toBeInstanceOf(MissingImportError);
    expect(loadCalls).toBe(0);
    expect(
      manager.getOntology(dataFactory.getOWLOntologyID(ontologyIri)),
    ).toBeUndefined();
  });

  it("continues past a missing import only under diagnostic handling", async () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIri = IRI.create("urn:ontology:diagnostic-root");
    const importDeclaration = dataFactory.getOWLImportsDeclaration(
      IRI.create("urn:ontology:missing"),
    );
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.setOntologyID(
              dataFactory.getOWLOntologyID(ontologyIri),
            );
            transaction.addImportsDeclaration(importDeclaration);
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({ dataFactory, registry });

    const ontology = await manager.loadOntologyFromOntologyDocument(
      "Ontology()",
      { missingImportHandling: "diagnostic" },
    );

    expect(ontology.getImportsDeclarations()).toEqual(
      new Set([importDeclaration]),
    );
    expect(manager.getOntology(ontology.getOntologyID())).toBe(ontology);
  });

  it("keeps operational import-loader failures typed and fatal", async () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIri = IRI.create("urn:ontology:loader-failure-root");
    const loaderFailure = new Error("connection reset by fixture");
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(_source, transaction) {
            transaction.setOntologyID(
              dataFactory.getOWLOntologyID(ontologyIri),
            );
            transaction.addImportsDeclaration(
              dataFactory.getOWLImportsDeclaration(
                IRI.create("urn:ontology:unloadable"),
              ),
            );
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        load() {
          throw loaderFailure;
        },
      },
      registry,
    });

    const load = manager.loadOntologyFromOntologyDocument("Ontology()", {
      missingImportHandling: "diagnostic",
    });

    await expect(load).rejects.toMatchObject({
      cause: loaderFailure,
      code: "UNLOADABLE_IMPORT",
    });
    await expect(load).rejects.toBeInstanceOf(UnloadableImportError);
    expect(
      manager.getOntology(dataFactory.getOWLOntologyID(ontologyIri)),
    ).toBeUndefined();
  });

  it("does not disguise imported-parser defects as missing imports", async () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIri = IRI.create("urn:ontology:parser-defect-root");
    const parserDefect = new TypeError("fixture parser invariant failed");
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(source, transaction) {
            if (source.getText() === "imported") {
              throw parserDefect;
            }
            transaction.setOntologyID(
              dataFactory.getOWLOntologyID(ontologyIri),
            );
            transaction.addImportsDeclaration(
              dataFactory.getOWLImportsDeclaration(
                IRI.create("urn:ontology:imported"),
              ),
            );
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        load() {
          return "imported";
        },
      },
      registry,
    });

    await expect(
      manager.loadOntologyFromOntologyDocument("root", {
        missingImportHandling: "diagnostic",
      }),
    ).rejects.toBe(parserDefect);
    expect(
      manager.getOntology(dataFactory.getOWLOntologyID(ontologyIri)),
    ).toBeUndefined();
  });

  it("returns immutable and defensive isolated closure snapshots without loading", () => {
    const dataFactory = new OWLDataFactory();
    let documentLoaderCalls = 0;
    let iriMapperCalls = 0;
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        load() {
          documentLoaderCalls += 1;
          throw new Error("closure queries must not load documents");
        },
      },
      iriMappers: [
        {
          getDocumentIRI() {
            iriMapperCalls += 1;
            throw new Error("closure queries must not map document IRIs");
          },
        },
      ],
    });
    const root = manager.createOntology(
      dataFactory.getOWLOntologyID(IRI.create("urn:closure:isolated")),
    );

    const frozenArraySnapshot = manager.importsClosure(root);
    const stableSetSnapshot = manager.getImportsClosure(root);
    const mutableSetSnapshot = manager.getImportsClosure(root);

    expect(frozenArraySnapshot).toEqual([root]);
    expect(Object.isFrozen(frozenArraySnapshot)).toBe(true);
    expect(() => frozenArraySnapshot.push(root)).toThrow(TypeError);
    expect(stableSetSnapshot).toEqual(new Set([root]));

    mutableSetSnapshot.clear();
    manager.createOntology(
      dataFactory.getOWLOntologyID(IRI.create("urn:closure:later-ontology")),
    );

    expect(frozenArraySnapshot).toEqual([root]);
    expect([...stableSetSnapshot]).toEqual([root]);
    expect(manager.getImportsClosure(root)).toEqual(new Set([root]));
    expect(documentLoaderCalls).toBe(0);
    expect(iriMapperCalls).toBe(0);
  });

  it("rejects foreign and unmanaged closure roots with operation details", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const foreignManager = new OWLOntologyManager({ dataFactory });
    const sharedOntologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:closure:structurally-equal"),
    );
    const managed = manager.createOntology(sharedOntologyID);
    const foreign = foreignManager.createOntology(sharedOntologyID);
    const unmanaged = new OWLOntology({
      ontologyID: dataFactory.getOWLOntologyID(
        IRI.create("urn:closure:unmanaged"),
      ),
    });

    expect(manager.importsClosure(managed)).toEqual([managed]);
    for (const operation of ["importsClosure", "getImportsClosure"]) {
      for (const ontology of [foreign, unmanaged]) {
        let thrown;
        try {
          manager[operation](ontology);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(OWLOntologyStateError);
        expect(thrown).toMatchObject({
          code: "ONTOLOGY_STATE_INVALID",
          ontology,
          operation,
        });
      }
    }
  });

  it("adds direct axioms atomically and updates existing closure façade objects", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const ontology = manager.createOntology(
      dataFactory.getOWLOntologyID(IRI.create("urn:mutation:ontology")),
    );
    const closureSnapshot = manager.importsClosure(ontology);
    const classA = dataFactory.getOWLClass(IRI.create("urn:mutation:A"));
    const classB = dataFactory.getOWLClass(IRI.create("urn:mutation:B"));
    const axiom = dataFactory.getOWLSubClassOfAxiom(classA, classB);

    expect(manager.addAxiom(ontology, axiom)).toBe(true);
    expect(
      manager.addAxiom(
        ontology,
        dataFactory.getOWLSubClassOfAxiom(classA, classB),
      ),
    ).toBe(false);

    expect(closureSnapshot).toEqual([ontology]);
    expect(closureSnapshot[0].getAxioms()).toEqual(new Set([axiom]));
    expect(ontology.getClassesInSignature()).toEqual(new Set([classA, classB]));
    expect(ontology.getReferencingAxioms(classA)).toEqual(new Set([axiom]));
  });

  it("materializes an axiom iterable once and commits its structural union once", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const ontology = manager.createOntology();
    const classA = dataFactory.getOWLClass(
      IRI.create("urn:mutation:iterable:A"),
    );
    const classB = dataFactory.getOWLClass(
      IRI.create("urn:mutation:iterable:B"),
    );
    const first = dataFactory.getOWLDeclarationAxiom(classA);
    const firstDuplicate = dataFactory.getOWLDeclarationAxiom(classA);
    const second = dataFactory.getOWLSubClassOfAxiom(classA, classB);
    let iteratorCreations = 0;
    const axioms = {
      [Symbol.iterator]() {
        iteratorCreations += 1;
        if (iteratorCreations > 1) {
          throw new Error("axiom iterable was consumed more than once");
        }
        return [first, firstDuplicate, second][Symbol.iterator]();
      },
    };

    expect(manager.addAxioms(ontology, axioms)).toBe(true);
    expect(iteratorCreations).toBe(1);
    expect(ontology.getAxioms()).toEqual(new Set([first, second]));
    expect(manager.addAxioms(ontology, [])).toBe(false);
  });

  it("validates every axiom before mutation and reports the offending index", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const ontology = manager.createOntology();
    const validAxiom = dataFactory.getOWLDeclarationAxiom(
      dataFactory.getOWLClass(IRI.create("urn:mutation:valid")),
    );
    const invalidAxiom = dataFactory.getOWLClass(
      IRI.create("urn:mutation:not-an-axiom"),
    );

    let thrown;
    try {
      manager.addAxioms(ontology, [validAxiom, invalidAxiom]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).toMatchObject({
      axiom: invalidAxiom,
      index: 1,
      operation: "addAxioms",
    });
    expect(ontology.getAxioms()).toEqual(new Set());

    expect(() => manager.addAxiom(ontology, invalidAxiom)).toThrow(TypeError);
    try {
      manager.addAxiom(ontology, invalidAxiom);
    } catch (error) {
      expect(error).toMatchObject({
        axiom: invalidAxiom,
        index: 0,
        operation: "addAxiom",
      });
    }
  });

  it("rejects non-iterables and foreign ontology mutations with operation details", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const foreignManager = new OWLOntologyManager({ dataFactory });
    const ontology = manager.createOntology();
    const foreignOntology = foreignManager.createOntology();
    const axiom = dataFactory.getOWLDeclarationAxiom(
      dataFactory.getOWLClass(IRI.create("urn:mutation:foreign")),
    );

    let invalidIterableError;
    try {
      manager.addAxioms(ontology, 42);
    } catch (error) {
      invalidIterableError = error;
    }
    expect(invalidIterableError).toBeInstanceOf(TypeError);
    expect(invalidIterableError).toMatchObject({ operation: "addAxioms" });

    for (const [operation, argument] of [
      ["addAxiom", axiom],
      ["addAxioms", [axiom]],
    ]) {
      let thrown;
      try {
        manager[operation](foreignOntology, argument);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OWLOntologyStateError);
      expect(thrown).toMatchObject({
        code: "ONTOLOGY_STATE_INVALID",
        ontology: foreignOntology,
        operation,
      });
    }
    expect(foreignOntology.getAxioms()).toEqual(new Set());
  });

  it("applies one change and a one-shot mixed change iterable atomically", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const originalID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:atomic:original"),
      IRI.create("urn:change:atomic:original:version"),
    );
    const replacementID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:atomic:replacement"),
      IRI.create("urn:change:atomic:replacement:version"),
    );
    const first = manager.createOntology(originalID);
    const second = manager.createOntology(
      dataFactory.getOWLOntologyID(IRI.create("urn:change:atomic:second")),
    );
    const firstAnnotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("first annotation", "en"),
    );
    const secondAnnotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("second annotation", "en"),
    );

    expect(
      manager.applyChange(new AddOntologyAnnotation(first, firstAnnotation)),
    ).toBe(true);

    let iteratorCreations = 0;
    const changes = {
      [Symbol.iterator]() {
        iteratorCreations += 1;
        if (iteratorCreations > 1) {
          throw new Error("change iterable was consumed more than once");
        }
        return [
          new SetOntologyID(first, replacementID),
          new AddOntologyAnnotation(second, secondAnnotation),
        ][Symbol.iterator]();
      },
    };

    expect(manager.applyChanges(changes)).toBe(true);
    expect(iteratorCreations).toBe(1);
    expect(first.getOntologyID()).toBe(replacementID);
    expect(first.getAnnotations()).toEqual(new Set([firstAnnotation]));
    expect(second.getAnnotations()).toEqual(new Set([secondAnnotation]));
    expect(manager.getOntology(originalID)).toBeUndefined();
    expect(manager.getOntology(replacementID)).toBe(first);
    expect(manager.applyChanges([])).toBe(false);
  });

  it("revalidates every prepared change before publishing any ontology or identity state", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const originalID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:reentrant:original"),
    );
    const replacementID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:reentrant:replacement"),
    );
    const first = manager.createOntology(originalID);
    const second = manager.createOntology();
    const secondAnnotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("outer second annotation"),
    );
    const nestedFirstAnnotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("nested first annotation"),
    );
    const originalIterator = StructuralSet.prototype[Symbol.iterator];
    let nestedChangeApplied = false;
    StructuralSet.prototype[Symbol.iterator] = function reentrantIterator() {
      if (!nestedChangeApplied && this.has(secondAnnotation)) {
        nestedChangeApplied = true;
        manager.applyChange(
          new AddOntologyAnnotation(first, nestedFirstAnnotation),
        );
      }
      return originalIterator.call(this);
    };

    try {
      expect(() =>
        manager.applyChanges([
          new SetOntologyID(first, replacementID),
          new AddOntologyAnnotation(second, secondAnnotation),
        ]),
      ).toThrow(/revision/i);
    } finally {
      StructuralSet.prototype[Symbol.iterator] = originalIterator;
    }

    expect(nestedChangeApplied).toBe(true);
    expect(first.getOntologyID()).toBe(originalID);
    expect(manager.getOntology(originalID)).toBe(first);
    expect(manager.getOntology(replacementID)).toBeUndefined();
    expect(first.getAnnotations()).toEqual(new Set([nestedFirstAnnotation]));
    expect(second.getAnnotations()).toEqual(new Set());
  });

  it("treats a structurally duplicate ontology annotation as a no-op without manufacturing an axiom", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const ontology = manager.createOntology();
    const annotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("direct ontology annotation", "en"),
    );
    const structuralDuplicate = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("direct ontology annotation", "en"),
    );

    expect(
      manager.applyChange(new AddOntologyAnnotation(ontology, annotation)),
    ).toBe(true);
    expect(
      manager.applyChange(
        new AddOntologyAnnotation(ontology, structuralDuplicate),
      ),
    ).toBe(false);
    expect(ontology.getAnnotations()).toEqual(new Set([annotation]));
    expect(ontology.getAxioms()).toEqual(new Set());
  });

  it("returns false and publishes nothing when ordered identity changes cancel out", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const originalID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:cancelled:original"),
      IRI.create("urn:change:cancelled:original:version"),
    );
    const intermediateID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:cancelled:intermediate"),
      IRI.create("urn:change:cancelled:intermediate:version"),
    );
    const ontology = manager.createOntology(originalID);
    const before = captureOntologyMutationSnapshot(manager, ontology, [
      originalID,
      intermediateID,
    ]);

    expect(
      manager.applyChanges([
        new SetOntologyID(ontology, intermediateID),
        new SetOntologyID(ontology, originalID),
      ]),
    ).toBe(false);

    expect(
      captureOntologyMutationSnapshot(manager, ontology, [
        originalID,
        intermediateID,
      ]),
    ).toEqual(before);
    expect(ontology.getOntologyID()).toBe(originalID);
  });

  it("restores closure order when one identity chain cancels inside a mixed batch", async () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const firstImportedID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:cancelled-order:first"),
    );
    const secondImportedID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:cancelled-order:second"),
    );
    const temporaryFirstImportedID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:cancelled-order:temporary"),
    );
    const replacementSecondImportedID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:cancelled-order:renamed-second"),
    );
    const anonymousFirstImportedID = dataFactory.getOWLOntologyID();
    const firstImported = manager.createOntology(firstImportedID);
    const secondImported = manager.createOntology(secondImportedID);
    const root = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        `Ontology(<urn:change:cancelled-order:root>
          Import(<urn:change:cancelled-order:first>)
          Import(<urn:change:cancelled-order:second>)
        )`,
        { fileName: "cancelled-order.ofn" },
      ),
    );
    const importedOntologyOrder = () =>
      manager
        .importsClosure(root)
        .map((ontology) =>
          ontology === root
            ? "root"
            : ontology === firstImported
              ? "first"
              : "second",
        );

    expect(importedOntologyOrder()).toEqual(["root", "first", "second"]);
    expect(
      manager.applyChange(
        new SetOntologyID(firstImported, anonymousFirstImportedID),
      ),
    ).toBe(true);
    expect(importedOntologyOrder()).toEqual(["root", "first", "second"]);

    expect(
      manager.applyChanges([
        new SetOntologyID(firstImported, temporaryFirstImportedID),
        new SetOntologyID(firstImported, anonymousFirstImportedID),
        new SetOntologyID(secondImported, replacementSecondImportedID),
      ]),
    ).toBe(true);

    expect(firstImported.getOntologyID()).toBe(anonymousFirstImportedID);
    expect(secondImported.getOntologyID()).toBe(replacementSecondImportedID);
    expect(importedOntologyOrder()).toEqual(["root", "first", "second"]);
  });

  it("rolls back a valid staged change when a later identity conflicts", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const firstID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:conflict:first"),
    );
    const secondID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:conflict:second"),
    );
    const first = manager.createOntology(firstID);
    const second = manager.createOntology(secondID);
    const annotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("must be rolled back"),
    );
    const before = Object.freeze({
      first: captureOntologyMutationSnapshot(manager, first, [
        firstID,
        secondID,
      ]),
      second: captureOntologyMutationSnapshot(manager, second, [
        firstID,
        secondID,
      ]),
    });
    const conflictingChange = new SetOntologyID(first, secondID);

    let thrown;
    try {
      manager.applyChanges([
        new AddOntologyAnnotation(first, annotation),
        conflictingChange,
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OWLOntologyStateError);
    expect(thrown).toMatchObject({
      change: conflictingChange,
      conflictingOntology: second,
      index: 1,
      ontology: first,
      ontologyID: secondID,
      operation: "applyChanges",
    });
    const after = Object.freeze({
      first: captureOntologyMutationSnapshot(manager, first, [
        firstID,
        secondID,
      ]),
      second: captureOntologyMutationSnapshot(manager, second, [
        firstID,
        secondID,
      ]),
    });
    expect(after).toEqual(before);
    expect(first.getAnnotations()).toEqual(new Set());
  });

  it("validates the complete change list before staging an earlier valid change", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const ontologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:change:invalid-later"),
    );
    const ontology = manager.createOntology(ontologyID);
    const annotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("must never be staged"),
    );
    const unsupportedChange = Object.freeze({});
    const before = captureOntologyMutationSnapshot(manager, ontology, [
      ontologyID,
    ]);

    let thrown;
    try {
      manager.applyChanges([
        new AddOntologyAnnotation(ontology, annotation),
        unsupportedChange,
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).toMatchObject({
      change: unsupportedChange,
      index: 1,
      operation: "applyChanges",
    });
    expect(
      captureOntologyMutationSnapshot(manager, ontology, [ontologyID]),
    ).toEqual(before);
  });

  it("rejects unsupported and foreign changes with precise operation details", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const foreignManager = new OWLOntologyManager({ dataFactory });
    const managed = manager.createOntology();
    const foreign = foreignManager.createOntology();
    const annotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("foreign annotation"),
    );
    const unsupportedChange = Object.freeze({});

    let unsupportedError;
    try {
      manager.applyChange(unsupportedChange);
    } catch (error) {
      unsupportedError = error;
    }
    expect(unsupportedError).toBeInstanceOf(TypeError);
    expect(unsupportedError).toMatchObject({
      change: unsupportedChange,
      index: 0,
      operation: "applyChange",
    });

    const foreignChange = new AddOntologyAnnotation(foreign, annotation);
    let foreignError;
    try {
      manager.applyChange(foreignChange);
    } catch (error) {
      foreignError = error;
    }
    expect(foreignError).toBeInstanceOf(OWLOntologyStateError);
    expect(foreignError).toMatchObject({
      change: foreignChange,
      index: 0,
      ontology: foreign,
      operation: "applyChange",
    });
    expect(managed.getAnnotations()).toEqual(new Set());
    expect(foreign.getAnnotations()).toEqual(new Set());
  });

  it("traverses a closure deeper than the JavaScript call stack without recursion", async () => {
    const ontologyCount = 12000;
    const dataFactory = new OWLDataFactory();
    const ontologyIRIAt = (index) =>
      IRI.create(`urn:closure:deep:${String(index).padStart(5, "0")}`);
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({
          parse(source, transaction) {
            const index = Number(source.getText());
            transaction.setOntologyID(
              dataFactory.getOWLOntologyID(ontologyIRIAt(index)),
            );
            if (index + 1 < ontologyCount) {
              transaction.addImportsDeclaration(
                dataFactory.getOWLImportsDeclaration(ontologyIRIAt(index + 1)),
              );
            }
          },
        }),
        detect: match,
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "deep-closure-fixture",
        priority: 0,
      }),
    ]);
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        load(documentIRI) {
          return documentIRI.value.slice("urn:closure:deep:".length);
        },
      },
      registry,
    });
    const root = await manager.loadOntologyFromOntologyDocument("0", {
      maxImportCount: ontologyCount,
      maxImportDepth: ontologyCount,
    });

    const closure = manager.importsClosure(root);

    expect(closure).toHaveLength(ontologyCount);
    expect(closure[0]).toBe(root);
    expect(closure.at(-1).getOntologyID().ontologyIRI).toEqual(
      ontologyIRIAt(ontologyCount - 1),
    );
  }, 60000);
});
