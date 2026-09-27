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
  SetOntologyID,
} from "owlapi/model";
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
