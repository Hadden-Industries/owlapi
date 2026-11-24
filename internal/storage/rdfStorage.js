import RdfDataFactory from "@rdfjs/data-model/Factory.js";
import { OWLOntologyStorageError } from "../../io/errors.js";
import { OWLOntologyLoaderConfiguration } from "../../model/owlOntologyLoaderConfiguration.js";
import { OwlToRdfTranslator } from "../mapping/owlToRdfTranslator.js";
import { RdfToOwlTranslator } from "../mapping/rdfToOwlTranslator.js";
import { hasNormalizedSingleton } from "../model/setConstructs.js";
import { compareStoredOntology } from "../model/ontologyStructuralIsomorphism.js";
import { snapshotAxioms, sortedStructuralValues } from "./snapshotValues.js";

const configurations = new WeakMap();

/** Stable traversal of the captured revision without cloning its model or publication sets. */
export const createRdfStorageOntology = (snapshot) => {
  const direct = {
    ontologyID: snapshot.ontologyID,
    annotations: sortedStructuralValues(snapshot.directOntologyAnnotations),
    axioms: sortedStructuralValues(snapshotAxioms(snapshot)),
    imports: sortedStructuralValues(snapshot.authoredImportDeclarations),
  };
  return {
    direct,
    getOntologyID: () => direct.ontologyID,
    getAnnotations: () => direct.annotations,
    getAxioms: () => direct.axioms,
    getImportsDeclarations: () => direct.imports,
    getAxiomsByType: (kind) =>
      direct.axioms.values().filter((axiom) => axiom.kind === kind),
  };
};

/** Each save owns its blank-node allocator independently of earlier parsing. */
export const mapStorageOntologyToRdf = (ontology, options) =>
  new OwlToRdfTranslator({
    dataFactory: new RdfDataFactory(),
  }).translateForStorage(ontology, options);

export const rdfStorageConfiguration = (
  snapshot,
  behaviorProfileId = "normative-v1",
) => {
  let byProfile = configurations.get(snapshot);
  const existing = byProfile?.get(behaviorProfileId);
  if (existing) return existing;
  let parsingMode = "strict";
  for (const axiom of snapshotAxioms(snapshot)) {
    if (hasNormalizedSingleton(axiom)) {
      parsingMode = "preserve";
      break;
    }
  }
  const configuration = new OWLOntologyLoaderConfiguration({
    behaviorProfileId,
    parsingMode,
    loadAnnotationAxioms: true,
    rdfDatasetGraphPolicy: "requireSingleGraph",
    collectWarnings: true,
    remoteImports: false,
    remoteJsonLdContexts: false,
  });
  if (!byProfile) configurations.set(snapshot, (byProfile = new Map()));
  byProfile.set(behaviorProfileId, configuration);
  return configuration;
};

/** Reject a lossy RDF reverse mapping before the registry can publish text. */
export const verifyRdfStorage = async (
  original,
  dataset,
  configuration,
  syntaxName,
) => {
  const { ontology, context } = await new RdfToOwlTranslator().translate(
    dataset,
    { configuration },
  );
  if (
    context.diagnostics.length ||
    context.merged ||
    context.selectedGraph?.termType !== "DefaultGraph"
  )
    throw new OWLOntologyStorageError(
      `${syntaxName} reconstruction must be a diagnostic-free default graph`,
      { reason: "ONTOLOGY_NOT_REPRESENTABLE" },
    );
  const comparison = compareStoredOntology(original.direct, ontology);
  if (!comparison.equal)
    throw new OWLOntologyStorageError(
      `${syntaxName} does not preserve the ontology's direct OWL structure`,
      { reason: "ONTOLOGY_NOT_REPRESENTABLE", mismatch: comparison.mismatch },
    );
};
