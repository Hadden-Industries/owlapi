import {
  AddOntologyAnnotation,
  IRI,
  OWLDataFactory,
  OWLObjectKind,
  OWLOntologyManager,
  StringDocumentSource,
} from "../index.js";

import { OWLOntologyMerger } from "./owlOntologyMerger.js";

const providerOf = (...ontologies) => ({
  ontologies: () => new Set(ontologies),
});

const ontologyIDFor = (dataFactory, ontologyIRI) =>
  dataFactory.getOWLOntologyID(ontologyIRI);

describe("OWLOntologyMerger", () => {
  it("creates the structural union and retains non-logical axioms by default", () => {
    const dataFactory = new OWLDataFactory();
    const sourceManager = new OWLOntologyManager({ dataFactory });
    const first = sourceManager.createOntology();
    const second = sourceManager.createOntology();
    const classA = dataFactory.getOWLClass(IRI.create("urn:merger:union:A"));
    const classB = dataFactory.getOWLClass(IRI.create("urn:merger:union:B"));
    const firstSubclassAxiom = dataFactory.getOWLSubClassOfAxiom(
      classA,
      classB,
    );
    const duplicateSubclassAxiom = dataFactory.getOWLSubClassOfAxiom(
      classA,
      classB,
    );
    const declarationAxiom = dataFactory.getOWLDeclarationAxiom(classA);
    sourceManager.addAxioms(first, [firstSubclassAxiom, declarationAxiom]);
    sourceManager.addAxiom(second, duplicateSubclassAxiom);
    const outputManager = new OWLOntologyManager({ dataFactory });
    const targetIRI = IRI.create("urn:merger:union:target");

    const merged = new OWLOntologyMerger(
      providerOf(first, second),
    ).createMergedOntology(outputManager, targetIRI);

    expect(merged.getOntologyID()).toEqual(
      ontologyIDFor(dataFactory, targetIRI),
    );
    expect(merged.getAxioms().size).toBe(2);
    expect(merged.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM).size).toBe(
      1,
    );
    expect(merged.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM).size).toBe(
      1,
    );
  });

  it("copies only logical axioms when the explicit constructor option is true", () => {
    const dataFactory = new OWLDataFactory();
    const sourceManager = new OWLOntologyManager({ dataFactory });
    const source = sourceManager.createOntology();
    const classA = dataFactory.getOWLClass(IRI.create("urn:merger:logical:A"));
    const classB = dataFactory.getOWLClass(IRI.create("urn:merger:logical:B"));
    sourceManager.addAxioms(source, [
      dataFactory.getOWLDeclarationAxiom(classA),
      dataFactory.getOWLSubClassOfAxiom(classA, classB),
      dataFactory.getOWLAnnotationAssertionAxiom(
        dataFactory.getRDFSLabel(),
        classA.iri,
        dataFactory.getOWLLiteral("non-logical"),
      ),
    ]);
    const outputManager = new OWLOntologyManager({ dataFactory });

    const merged = new OWLOntologyMerger(
      providerOf(source),
      true,
    ).createMergedOntology(outputManager);

    expect(merged.getOntologyID().ontologyIRI).toBeUndefined();
    expect(merged.getAxioms().size).toBe(1);
    expect(merged.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM).size).toBe(
      1,
    );
  });

  it("copies only direct axioms and omits source identity, imports, and ontology annotations", async () => {
    const dataFactory = new OWLDataFactory();
    const importedIRI = IRI.create("urn:merger:direct:imported");
    const rootIRI = IRI.create("urn:merger:direct:root");
    const sourceManager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        load(documentIRI) {
          expect(documentIRI.equals(importedIRI)).toBe(true);
          return new StringDocumentSource(
            `Ontology(<${importedIRI.value}>
              Declaration(Class(<urn:merger:direct:Imported>))
            )`,
            { documentIRI: importedIRI, fileName: "imported.ofn" },
          );
        },
      },
    });
    const root = await sourceManager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        `Ontology(<${rootIRI.value}>
          Import(<${importedIRI.value}>)
          Declaration(Class(<urn:merger:direct:Root>))
        )`,
        { documentIRI: rootIRI, fileName: "root.ofn" },
      ),
    );
    const ontologyAnnotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("source-only ontology annotation"),
    );
    sourceManager.applyChange(
      new AddOntologyAnnotation(root, ontologyAnnotation),
    );
    const outputManager = new OWLOntologyManager({ dataFactory });

    const merged = new OWLOntologyMerger(providerOf(root)).createMergedOntology(
      outputManager,
    );

    expect(root.getImportsDeclarations().size).toBe(1);
    expect(root.getAnnotations()).toEqual(new Set([ontologyAnnotation]));
    expect(sourceManager.getImportsClosure(root).size).toBe(2);
    expect(merged.getOntologyID().ontologyIRI).toBeUndefined();
    expect(merged.getImportsDeclarations()).toEqual(new Set());
    expect(merged.getAnnotations()).toEqual(new Set());
    expect(merged.getAxioms()).toEqual(root.getAxioms());
  });

  it("preserves source-local anonymous sharing while standardizing equal labels apart", async () => {
    const dataFactory = new OWLDataFactory();
    const sourceManager = new OWLOntologyManager({ dataFactory });
    const loadSource = (sourceName) =>
      sourceManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(
          `Ontology(<urn:merger:anonymous:${sourceName}>
            ClassAssertion(<urn:merger:anonymous:${sourceName}:First> _:same)
            ClassAssertion(<urn:merger:anonymous:${sourceName}:Second> _:same)
          )`,
          {
            documentIRI: `urn:merger:anonymous:${sourceName}:document`,
            fileName: `${sourceName}.ofn`,
          },
        ),
      );
    const [firstSource, secondSource] = await Promise.all([
      loadSource("first"),
      loadSource("second"),
    ]);
    const outputManager = new OWLOntologyManager({ dataFactory });

    const merged = new OWLOntologyMerger(
      providerOf(firstSource, secondSource),
    ).createMergedOntology(outputManager);
    const assertions = [
      ...merged.getAxiomsByType(OWLObjectKind.CLASS_ASSERTION_AXIOM),
    ];
    const occurrenceCountByIndividual = new Map();
    for (const { individual } of assertions) {
      const structuralKey = individual.structuralKey();
      occurrenceCountByIndividual.set(
        structuralKey,
        (occurrenceCountByIndividual.get(structuralKey) ?? 0) + 1,
      );
      expect(individual.nodeID).toBe("_:same");
    }

    expect(assertions).toHaveLength(4);
    expect(occurrenceCountByIndividual.size).toBe(2);
    expect([...occurrenceCountByIndividual.values()].sort()).toEqual([2, 2]);
    expect(
      new Set(assertions.map(({ individual }) => individual.documentScope)),
    ).toEqual(
      new Set([
        "urn:merger:anonymous:first:document",
        "urn:merger:anonymous:second:document",
      ]),
    );
  });

  it("materializes and validates the complete provider result before creating a target", () => {
    const dataFactory = new OWLDataFactory();
    const sourceManager = new OWLOntologyManager({ dataFactory });
    const source = sourceManager.createOntology();
    const outputManager = new OWLOntologyManager({ dataFactory });
    const invalidElementTargetIRI = IRI.create(
      "urn:merger:validation:invalid-element",
    );
    const failedIterationTargetIRI = IRI.create(
      "urn:merger:validation:failed-iteration",
    );

    expect(() =>
      new OWLOntologyMerger(providerOf(source, {})).createMergedOntology(
        outputManager,
        invalidElementTargetIRI,
      ),
    ).toThrow(/ontologies\[1\] must be an OWLOntology/);
    expect(
      outputManager.getOntology(
        ontologyIDFor(dataFactory, invalidElementTargetIRI),
      ),
    ).toBeUndefined();

    const iterationFailure = new Error("provider iteration failed");
    const failingProvider = {
      ontologies() {
        return {
          *[Symbol.iterator]() {
            yield source;
            throw iterationFailure;
          },
        };
      },
    };
    expect(() =>
      new OWLOntologyMerger(failingProvider).createMergedOntology(
        outputManager,
        failedIterationTargetIRI,
      ),
    ).toThrow(iterationFailure);
    expect(
      outputManager.getOntology(
        ontologyIDFor(dataFactory, failedIterationTargetIRI),
      ),
    ).toBeUndefined();
  });

  it("reads the provider at creation time and lets identity collisions fail before mutation", () => {
    const dataFactory = new OWLDataFactory();
    const sourceManager = new OWLOntologyManager({ dataFactory });
    const firstSource = sourceManager.createOntology();
    const secondSource = sourceManager.createOntology();
    const classA = dataFactory.getOWLClass(IRI.create("urn:merger:live:A"));
    const classB = dataFactory.getOWLClass(IRI.create("urn:merger:live:B"));
    sourceManager.addAxiom(
      firstSource,
      dataFactory.getOWLDeclarationAxiom(classA),
    );
    sourceManager.addAxiom(
      secondSource,
      dataFactory.getOWLDeclarationAxiom(classB),
    );
    let suppliedOntologies = new Set([firstSource]);
    let providerReads = 0;
    const merger = new OWLOntologyMerger({
      ontologies() {
        providerReads += 1;
        return suppliedOntologies;
      },
    });
    const outputManager = new OWLOntologyManager({ dataFactory });
    const firstMerged = merger.createMergedOntology(outputManager);
    suppliedOntologies = new Set([secondSource]);
    const secondMerged = merger.createMergedOntology(outputManager);

    expect(providerReads).toBe(2);
    expect(firstMerged.getClassesInSignature()).toEqual(new Set([classA]));
    expect(secondMerged.getClassesInSignature()).toEqual(new Set([classB]));

    const conflictingIRI = IRI.create("urn:merger:collision");
    const existing = outputManager.createOntology(
      ontologyIDFor(dataFactory, conflictingIRI),
    );
    const before = existing.getAxioms();
    expect(() =>
      merger.createMergedOntology(outputManager, conflictingIRI),
    ).toThrow(/ontology with this ID already exists/i);
    expect(existing.getAxioms()).toEqual(before);
  });

  it("rejects unsupported constructor and target shapes without adding public helpers", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const source = manager.createOntology();

    expect(() => new OWLOntologyMerger(undefined)).toThrow(
      /ontologySetProvider must implement ontologies/,
    );
    expect(() => new OWLOntologyMerger({})).toThrow(
      /ontologySetProvider must implement ontologies/,
    );
    expect(() => new OWLOntologyMerger(providerOf(source), "logical")).toThrow(
      /mergeOnlyLogicalAxioms must be a boolean/,
    );
    expect(() =>
      new OWLOntologyMerger(providerOf(source)).createMergedOntology(
        manager,
        "urn:merger:not-an-iri",
      ),
    ).toThrow(/ontologyIRI must be an IRI/);
    expect(
      Object.getOwnPropertyNames(OWLOntologyMerger.prototype).sort(),
    ).toEqual(["constructor", "createMergedOntology"]);
  });
});
