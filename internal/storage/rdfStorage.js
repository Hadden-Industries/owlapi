import RdfDataFactory from "@rdfjs/data-model/Factory.js";
import { OWLOntologyStorageError } from "../../io/errors.js";
import { OWLOntology } from "../../model/owlOntology.js";
import { OWLOntologyLoaderConfiguration } from "../../model/owlOntologyLoaderConfiguration.js";
import { OwlToRdfTranslator } from "../mapping/owlToRdfTranslator.js";
import { RdfToOwlTranslator } from "../mapping/rdfToOwlTranslator.js";
import { hasNormalizedSingleton } from "../model/setConstructs.js";
import { compareOntologies } from "../model/ontologyStructuralIsomorphism.js";

const preparations = new WeakMap();
const configurations = new WeakMap();

const sorted = (values) =>
  [...values].sort((a, b) =>
    a.structuralKey() < b.structuralKey()
      ? -1
      : a.structuralKey() > b.structuralKey()
        ? 1
        : 0,
  );

/** Isolate one committed direct revision, with stable order and no manager.
 * Reuse immutable preparation only; mapping, rendering and reverse proof still
 * execute on every save with independent blank-node allocation.
 */
export const createRdfStorageOntology = (snapshot) => {
  let ontology = preparations.get(snapshot);
  if (ontology) return ontology;
  ontology = new OWLOntology({
    ontologyID: snapshot.ontologyID,
    annotations: sorted(snapshot.directOntologyAnnotations),
    axioms: sorted(snapshot.directAxioms),
    imports: sorted(snapshot.authoredImportDeclarations),
  });
  preparations.set(snapshot, ontology);
  return ontology;
};

/** Each save owns its blank-node allocator independently of earlier parsing. */
export const mapStorageOntologyToRdf = (ontology, options) =>
  new OwlToRdfTranslator({ dataFactory: new RdfDataFactory() }).translate(
    ontology,
    options,
  );

export const rdfStorageConfiguration = (
  snapshot,
  behaviorProfileId = "normative-v1",
) => {
  let byProfile = configurations.get(snapshot);
  const existing = byProfile?.get(behaviorProfileId);
  if (existing) return existing;
  const configuration = new OWLOntologyLoaderConfiguration({
    behaviorProfileId,
    parsingMode: hasNormalizedSingleton(snapshot.directAxioms)
      ? "preserve"
      : "strict",
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
  const comparison = compareOntologies(original, ontology);
  if (!comparison.equal)
    throw new OWLOntologyStorageError(
      `${syntaxName} does not preserve the ontology's direct OWL structure`,
      { reason: "ONTOLOGY_NOT_REPRESENTABLE", mismatch: comparison.mismatch },
    );
};
