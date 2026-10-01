import { OWLManager } from "owlapi/apibinding";
import { OWLDocumentFormats } from "owlapi/formats";
import {
  OWLOntologyStorageError,
  StringDocumentSource,
  StringDocumentTarget,
} from "owlapi/io";
import {
  AddOntologyAnnotation,
  IRI,
  OWLObjectKind,
  OWLOntology,
  SetOntologyID,
} from "owlapi/model";
import { OWL2DLProfile } from "owlapi/profiles";
import {
  OWLOntologyImportsClosureSetProvider,
  OWLOntologyMerger,
} from "owlapi/util";

const requireContract = (condition, message) => {
  if (!condition) {
    throw new Error(`Import-closure contract: ${message}`);
  }
};
const keys = (values) =>
  [...values].map((value) => value.structuralKey()).sort();
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const strict = { parsingMode: "strict", collectWarnings: true };

// Hand-authored expected axioms and declarations keep this oracle independent
// of both repaired parsers. The same exercise runs from installed packages.
export const exerciseParserPreservation = async () => {
  const dlIRI = "urn:preservation:dl";
  const krssIRI = "urn:preservation:krss";
  const rootIRI = "urn:preservation:root";
  const lexicalCases = [
    ["0001", "integer"],
    ["1.00", "double"],
    ["9007199254740993", "integer"],
    ["0.10000000000000001", "double"],
    ["1.", "double"],
  ];
  const dlText = lexicalCases
    .map(([value]) => `age(alice, ${value})`)
    .join("\n");
  const declarations = `Declaration(DataProperty(<${dlIRI}#age>)) Declaration(NamedIndividual(<${dlIRI}#alice>)) Declaration(ObjectProperty(<${krssIRI}#p>)) Declaration(ObjectProperty(<${krssIRI}#q>))`;
  const rootText = `Ontology(<${rootIRI}> Import(<${dlIRI}>) Import(<${krssIRI}>) ${declarations})`;
  const profile = new OWL2DLProfile();
  const modes = [];
  for (const parsingMode of ["strict", "compatible", "preserve"]) {
    const contexts = [];
    let unsupported = false;
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        async load(documentIRI, context) {
          const iri = documentIRI.value;
          contexts.push(context);
          requireContract(
            iri === dlIRI || iri === krssIRI,
            "unexpected external import",
          );
          return new StringDocumentSource(
            iri === dlIRI
              ? dlText
              : `(define-primitive-role p q${unsupported ? " :right-identity r" : ""})`,
            { documentIRI: iri, format: iri === dlIRI ? "dl" : "krss1" },
          );
        },
      },
    });
    const source = () =>
      new StringDocumentSource(rootText, {
        documentIRI: rootIRI,
        format: "functional",
      });
    // A tolerant missing-import policy must never swallow a parser failure.
    unsupported = true;
    let failure;
    try {
      await manager.loadOntologyFromOntologyDocument(source(), {
        parsingMode,
        missingImportHandling: "diagnostic",
      });
    } catch (error) {
      failure = error;
    }
    requireContract(
      failure?.code === "UNSUPPORTED_CONSTRUCT" &&
        failure.reason === "UNSUPPORTED_KRSS1_RIGHT_IDENTITY",
      "fatal imported clause",
    );
    requireContract(
      manager.getOntology(
        manager.getOWLDataFactory().getOWLOntologyID(IRI.create(rootIRI)),
      ) === undefined,
      "failed root is never published",
    );
    unsupported = false;
    contexts.length = 0;
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      source(),
      { parsingMode },
    );
    requireContract(
      result.documents.length === 3,
      "rollback and reusable document identities",
    );
    const byFormat = new Map(
      result.documents.map((document) => [
        document.context.format.key,
        document,
      ]),
    );
    requireContract(
      same([...byFormat.keys()].sort(), ["dl", "functional", "krss1"]),
      "per-document formats",
    );
    requireContract(
      contexts.length === 2 &&
        contexts.every(
          (context) =>
            Object.isFrozen(context) &&
            context.importingDocumentIRI.value === rootIRI &&
            [dlIRI, krssIRI].includes(context.importIRI.value),
        ),
      "frozen import-parent context",
    );
    const dl = byFormat.get("dl").ontology;
    const krss = byFormat.get("krss1").ontology;
    const rootOntology = byFormat.get("functional").ontology;
    const f = manager.getOWLDataFactory();
    const dp = f.getOWLDataProperty(IRI.create(`${dlIRI}#age`));
    const alice = f.getOWLNamedIndividual(IRI.create(`${dlIRI}#alice`));
    const p = f.getOWLObjectProperty(IRI.create(`${krssIRI}#p`));
    const q = f.getOWLObjectProperty(IRI.create(`${krssIRI}#q`));
    const expected = lexicalCases.map(([lexical, type]) =>
      f.getOWLDataPropertyAssertionAxiom(
        dp,
        alice,
        f.getOWLLiteral(
          lexical,
          IRI.create(`http://www.w3.org/2001/XMLSchema#${type}`),
        ),
      ),
    );
    requireContract(
      same(keys(dl.getAxioms()), keys(expected)),
      "exact DL assertion structure",
    );
    requireContract(
      same(
        keys(krss.getAxioms()),
        keys([f.getOWLSubObjectPropertyOfAxiom(p, q)]),
      ),
      "supported parent-only KRSS structure",
    );
    requireContract(
      same(keys(dl.getDataPropertiesInSignature()), keys([dp])) &&
        same(keys(dl.getIndividualsInSignature()), keys([alice])) &&
        dl.getClassesInSignature().size === 0 &&
        dl.getObjectPropertiesInSignature().size === 0,
      "DL typed signature",
    );
    requireContract(
      same(keys(krss.getObjectPropertiesInSignature()), keys([p, q])) &&
        krss.getClassesInSignature().size === 0 &&
        krss.getIndividualsInSignature().size === 0,
      "KRSS typed signature",
    );
    requireContract(
      rootOntology.getOntologyID().ontologyIRI.value === rootIRI &&
        same(
          [...rootOntology.getImportsDeclarations()]
            .map((d) => d.iri.value)
            .sort(),
          [dlIRI, krssIRI],
        ),
      "root and import identity",
    );
    const report = await profile.checkOntology(rootOntology, {
      sourceAssessment: parsingMode === "preserve",
    });
    requireContract(
      report.status === "valid",
      "declared closure formal validity",
    );
    if (parsingMode === "preserve")
      requireContract(
        report.sourceAssessment.status === "valid",
        "package-owned source validity",
      );
    const storageManager = OWLManager.createOWLOntologyManager();
    const stored = storageManager.createOntology();
    storageManager.addAxioms(stored, [
      ...expected,
      f.getOWLDeclarationAxiom(dp),
      f.getOWLDeclarationAxiom(alice),
    ]);
    for (const format of [
      OWLDocumentFormats.FUNCTIONAL,
      OWLDocumentFormats.RDF_XML,
    ]) {
      const target = new StringDocumentTarget();
      await storageManager.saveOntology(stored, format, target);
      const reloaded =
        await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
          new StringDocumentSource(target.toString(), { format }),
          { parsingMode },
        );
      // Check the authored literal assertions explicitly, then the complete
      // declared structure, so extra axioms cannot hide in the round trip.
      const assertions = [...reloaded.getAxioms()].filter(
        (a) => a.kind !== OWLObjectKind.DECLARATION_AXIOM,
      );
      requireContract(
        same(keys(assertions), keys(expected)),
        "storage preserves literal lexical identity",
      );
      requireContract(
        same(keys(reloaded.getAxioms()), keys(stored.getAxioms())),
        "complete declared storage structure",
      );
    }
    if (parsingMode === "preserve") {
      const copy = new OWLOntology({
        axioms: dl.getAxioms(),
        documentMetadata: {
          sourceStructure: Object.freeze({ version: 1, policy: "preserve" }),
        },
      });
      const forged = await profile.checkOntology(copy, {
        sourceAssessment: true,
      });
      requireContract(
        forged.sourceAssessment.unverifiedChecks.some(
          ({ code }) => code === "SOURCE_EVIDENCE_UNVERIFIED",
        ),
        "forged evidence rejected",
      );
      manager.addAxiom(
        rootOntology,
        f.getOWLDeclarationAxiom(f.getOWLObjectProperty(dp.iri)),
      );
      const conflict = await profile.checkOntology(rootOntology, {
        sourceAssessment: true,
      });
      requireContract(
        conflict.violations.some(
          ({ code }) => code === "PROPERTY_CATEGORY_COLLISION",
        ),
        "closure-wide property conflict",
      );
      requireContract(
        conflict.sourceAssessment.unverifiedChecks.some(
          ({ code }) => code === "SOURCE_EVIDENCE_STALE",
        ),
        "mutation invalidates source evidence",
      );
    }
    modes.push(parsingMode);
  }
  const large =
    await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      new StringDocumentSource(`age(alice, ${"9".repeat(65)})`, {
        format: "dl",
      }),
      { parsingMode: "preserve" },
    );
  const numeric = await profile.checkOntology(large, {
    sourceAssessment: true,
    maxNumericDigits: 64,
  });
  requireContract(
    numeric.sourceAssessment.status === "valid",
    "plain integer lexical validation needs no rational arithmetic",
  );
  const bounded = await profile.checkOntology(large, {
    sourceAssessment: true,
    maxLiteralLength: 64,
  });
  requireContract(
    bounded.sourceAssessment.status === "unverified",
    "checker literal budget stays distinct from parser admission",
  );
  return {
    modes,
    literalCount: lexicalCases.length,
    formats: ["dl", "functional", "krss1"],
    storage: ["functional", "rdfxml"],
    fatalImport: true,
    source: "valid",
    literalBudget: "unverified",
  };
};

/**
 * Fixture-specific oracle, not a general isomorphism algorithm. Each anonymous
 * individual has exactly one unique urn:lifecycle:origin literal. Those authored
 * anchors establish one bijection for every occurrence in the full public tuples.
 * No package-private comparator or normalizer can mask a storage regression.
 */
const fixtureOntologyStructure = (ontology) => {
  const anchors = new Map();
  const origins = new Set();
  for (const axiom of ontology.getAxioms()) {
    if (
      axiom.kind !== OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM ||
      axiom.property.iri.value !== "urn:lifecycle:origin"
    ) {
      continue;
    }
    requireContract(
      axiom.subject.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL,
      "an origin anchor must identify an anonymous individual",
    );
    const key = axiom.subject.structuralKey();
    const origin = axiom.value.lexicalForm;
    requireContract(
      !anchors.has(key) && !origins.has(origin),
      "origin anchors must form a bijection",
    );
    anchors.set(key, origin);
    origins.add(origin);
  }
  const anchoredTuple = (tuple) => {
    if (!Array.isArray(tuple)) {
      return tuple;
    }
    if (tuple[0] === OWLObjectKind.ANONYMOUS_INDIVIDUAL) {
      const key = JSON.stringify(tuple);
      requireContract(
        anchors.has(key),
        "an anonymous individual has no origin anchor",
      );
      return [OWLObjectKind.ANONYMOUS_INDIVIDUAL, anchors.get(key)];
    }
    return tuple.map(anchoredTuple);
  };
  const projectSet = (values) =>
    [...values]
      .map((value) => JSON.stringify(anchoredTuple(value.toStructuralTuple())))
      .sort();
  return {
    ontologyID: ontology.getOntologyID().toStructuralTuple(),
    annotations: projectSet(ontology.getAnnotations()),
    imports: projectSet(ontology.getImportsDeclarations()),
    axioms: projectSet(ontology.getAxioms()),
    anonymousIndividualCount: anchors.size,
  };
};

export const verifyCollapsedText = async (text, expectedStructure) => {
  let loaderCalls = 0;
  const manager = OWLManager.createOWLOntologyManager({
    documentLoader: {
      load() {
        loaderCalls += 1;
        throw new Error("Collapsed storage must not load another document");
      },
    },
  });
  const graph = await manager.loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(text),
    strict,
  );
  requireContract(loaderCalls === 0, "reload invoked a document loader");
  requireContract(
    graph.importsClosure.length === 1,
    "reload has more than one closure member",
  );
  requireContract(
    graph.documents.length === 1,
    "reload has more than one document",
  );
  const diagnosticCount = graph.documents.reduce(
    (count, { context }) => count + context.diagnostics.length,
    0,
  );
  requireContract(diagnosticCount === 0, "reload produced diagnostics");
  requireContract(
    graph.ontology.getImportsDeclarations().size === 0,
    "reload retained imports",
  );
  requireContract(
    same(fixtureOntologyStructure(graph.ontology), expectedStructure),
    "reloaded ontology structure differs",
  );
  return { loaderCalls, diagnosticCount };
};

export const exerciseImportClosureStorage = async (documents) => {
  const loadedIRIs = [];
  const documentNames = new Map([
    ["urn:lifecycle:left", "left"],
    ["urn:lifecycle:right", "right"],
    ["urn:lifecycle:leaf", "leaf"],
    ["urn:lifecycle:leaf:v1", "leaf"],
  ]);
  const inputManager = OWLManager.createOWLOntologyManager({
    documentLoader: {
      load(documentIRI) {
        const name = documentNames.get(documentIRI.value);
        requireContract(
          name !== undefined,
          `unexpected import ${documentIRI.value}`,
        );
        loadedIRIs.push(documentIRI.value);
        return new StringDocumentSource(documents[name], { documentIRI });
      },
    },
  });
  const source = new StringDocumentSource(documents.root, {
    documentIRI: IRI.create("urn:lifecycle:root-document"),
  });
  requireContract(
    source.getText() === documents.root,
    "StringDocumentSource.getText() changed",
  );
  const graph = await inputManager.loadOntologyGraphFromOntologyDocument(
    source,
    strict,
  );
  const root = graph.ontology;
  const closure = [...inputManager.getImportsClosure(root)];
  requireContract(
    same(
      closure
        .map((ontology) => ontology.getOntologyID().ontologyIRI.value)
        .sort(),
      [
        "urn:lifecycle:leaf",
        "urn:lifecycle:left",
        "urn:lifecycle:right",
        "urn:lifecycle:root",
      ],
    ),
    "diamond/cycle membership differs",
  );
  requireContract(
    loadedIRIs.length === 3,
    "shared/cyclic imports were reloaded",
  );
  requireContract(
    root.getImportsDeclarations().size === 2,
    "repeated declarations were not deduplicated",
  );
  requireContract(
    graph.documents.every(({ context }) => context.diagnostics.length === 0),
    "input has diagnostics",
  );

  const provider = new OWLOntologyImportsClosureSetProvider(inputManager, root);
  const merger = new OWLOntologyMerger(provider, false);
  const outputManager = OWLManager.createOWLOntologyManager();
  const rootID = root.getOntologyID();
  const collapsed = merger.createMergedOntology(
    outputManager,
    rootID.ontologyIRI,
  );
  outputManager.applyChange(new SetOntologyID(collapsed, rootID));
  outputManager.applyChanges(
    [...root.getAnnotations()].map(
      (annotation) => new AddOntologyAnnotation(collapsed, annotation),
    ),
  );
  requireContract(
    collapsed.getOntologyID().equals(rootID),
    "complete root identity was not restored",
  );
  requireContract(
    same(keys(collapsed.getAnnotations()), keys(root.getAnnotations())),
    "non-root ontology annotations were copied",
  );
  requireContract(
    collapsed.getImportsDeclarations().size === 0,
    "merged result retained imports",
  );
  const union = [
    ...new Set(closure.flatMap((ontology) => keys(ontology.getAxioms()))),
  ].sort();
  requireContract(
    same(keys(collapsed.getAxioms()), union),
    "merged axioms differ from the direct structural set union",
  );
  const structure = fixtureOntologyStructure(collapsed);
  requireContract(
    structure.anonymousIndividualCount === 4,
    "document-scoped anonymous identity was lost",
  );
  const outputDocuments = {};
  const target = new StringDocumentTarget();
  requireContract(
    target.getText === undefined,
    "target exposes the retired getText method",
  );
  let reloadLoaderCalls = 0;
  let diagnosticCount = 0;
  for (const format of [
    OWLDocumentFormats.FUNCTIONAL,
    OWLDocumentFormats.RDF_XML,
  ]) {
    await outputManager.saveOntology(collapsed, format, target);
    const text = target.toString();
    outputDocuments[format.key] = text;
    const evidence = await verifyCollapsedText(text, structure);
    reloadLoaderCalls += evidence.loaderCalls;
    diagnosticCount += evidence.diagnosticCount;
  }

  const successfulText = target.toString();
  const factory = outputManager.getOWLDataFactory();
  // The same RDF triple now plays an ontology-annotation role and an axiom role.
  // RDF/XML cannot reconstruct both, and must preserve the previous publication.
  const note = factory.getOWLAnnotationProperty(
    IRI.create("urn:lifecycle:note"),
  );
  outputManager.addAxiom(
    collapsed,
    factory.getOWLAnnotationAssertionAxiom(
      note,
      rootID.ontologyIRI,
      factory.getOWLLiteral("root metadata"),
    ),
  );
  let rejected = false;
  try {
    await outputManager.saveOntology(
      collapsed,
      OWLDocumentFormats.RDF_XML,
      target,
    );
  } catch (error) {
    requireContract(
      error instanceof OWLOntologyStorageError &&
        error.reason === "ONTOLOGY_NOT_REPRESENTABLE",
      "non-injective RDF/XML failure changed its public error contract",
    );
    rejected = true;
  }
  requireContract(rejected, "non-injective RDF/XML save succeeded");
  requireContract(
    target.toString() === successfulText,
    "failed save replaced prior target text",
  );
  return {
    summary: {
      closureCount: closure.length,
      importLoadCount: loadedIRIs.length,
      directAxiomCount: structure.axioms.length,
      rootAnnotationCount: structure.annotations.length,
      anonymousIndividualCount: structure.anonymousIndividualCount,
      formats: Object.keys(outputDocuments),
      reloadLoaderCalls,
      diagnosticCount,
      retainedTargetAfterFailure: true,
      sourceReaderPreserved: true,
    },
    documents: outputDocuments,
    structure,
  };
};
