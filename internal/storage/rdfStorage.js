import RdfDataFactory from "@rdfjs/data-model/Factory.js";
import {
  OWLOntologyStorageError,
  OWLParserError,
  ResourceLimitError,
} from "../../io/errors.js";
import { OWLOntologyLoaderConfiguration } from "../../model/owlOntologyLoaderConfiguration.js";
import { OWLDataFactory } from "../../model/owlDataFactory.js";
import {
  OWL_OBJECT_KINDS,
  OWL_OBJECT_KINDS_WITH_SWRL,
  OWLObjectKind,
} from "../../model/kinds.js";
import { OwlToRdfTranslator } from "../mapping/owlToRdfTranslator.js";
import { RdfToOwlTranslator } from "../mapping/rdfToOwlTranslator.js";
import { hasNormalizedSingleton } from "../model/setConstructs.js";
import { compareStoredOntology } from "../model/ontologyStructuralIsomorphism.js";
import { checkStructuralGraphLimits } from "../model/structuralValidation.js";
import { isCompactRdfGraph } from "../rdfjs/compactRdfGraph.js";
import { rdfDataFactory } from "../rdfjs/environment.js";
import {
  BUILT_IN_DATA_PROPERTIES,
  BUILT_IN_OBJECT_PROPERTIES,
  OWL1_OBJECT_PROPERTY_TYPES,
  OWL_VOCABULARY,
  RDF_VOCABULARY,
  RDFS_VOCABULARY,
} from "../rdfjs/vocabulary.js";
import { snapshotAxioms, sortedStructuralValues } from "./snapshotValues.js";

const configurations = new WeakMap();
const normativeKinds = new Set(OWL_OBJECT_KINDS);
const swrlKinds = new Set(OWL_OBJECT_KINDS_WITH_SWRL);
const builtInLogicalProperties = new Set([
  ...BUILT_IN_DATA_PROPERTIES,
  ...BUILT_IN_OBJECT_PROPERTIES,
]);
const rdfLogicalPropertyTypes = new Set([
  OWL_VOCABULARY.DatatypeProperty,
  OWL_VOCABULARY.ObjectProperty,
  ...OWL1_OBJECT_PROPERTY_TYPES,
]);

/** Bound recursive mapping before sorting the snapshot or allocating its RDF graph. */
const checkRdfStorageLimits = (snapshot, configuration, policy) => {
  const axioms = snapshotAxioms(snapshot);
  if (axioms.length > configuration.maxAxioms)
    throw new ResourceLimitError("RDF storage axiom limit exceeded", {
      resource: "maxAxioms",
      limit: configuration.maxAxioms,
    });
  const kinds = policy.supportsScopedSwrl ? swrlKinds : normativeKinds;
  for (const values of [
    [snapshot.ontologyID],
    snapshot.authoredImportDeclarations,
    snapshot.directOntologyAnnotations,
    axioms,
  ])
    for (const value of values)
      checkStructuralGraphLimits(
        value,
        kinds,
        policy.maxStructureDepth,
        policy.maxAnnotationDepth,
      );
};

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

const hasPotentialLogicalRuleAnnotation = (
  dataset,
  predicates,
  logicalProperties,
) => {
  const type = rdfDataFactory.namedNode(RDF_VOCABULARY.type);
  const subPropertyOf = rdfDataFactory.namedNode(RDFS_VOCABULARY.subPropertyOf);
  const compact = isCompactRdfGraph(dataset);
  const hasSubPropertyTerm =
    !compact || dataset.namedNodeId(subPropertyOf.value) !== undefined;
  // The Java RDF reader allows a declared role to propagate over a named
  // subproperty component. Visiting each reachable IRI once proves that
  // components without a logical property role need no reconstruction.
  for (const iri of predicates) {
    if (logicalProperties.has(iri)) return true;
    const node = rdfDataFactory.namedNode(iri);
    for (const { object } of dataset.match(node, type)) {
      if (
        object.termType === "NamedNode" &&
        rdfLogicalPropertyTypes.has(object.value)
      )
        return true;
    }
    if (!hasSubPropertyTerm) continue;
    for (const { object } of dataset.match(node, subPropertyOf))
      if (object.termType === "NamedNode") predicates.add(object.value);
    // A predicate-and-object match uses the predicate index. An object-only
    // match instead examines each reachable IRI's incoming rows once.
    const incoming = compact
      ? dataset.match(undefined, undefined, node)
      : dataset.match(undefined, subPropertyOf, node);
    for (const { subject, predicate } of incoming)
      if (
        subject.termType === "NamedNode" &&
        (!compact || predicate.value === subPropertyOf.value)
      )
        predicates.add(subject.value);
  }
  return false;
};

/** Check the ambiguous rule predicates with the same role resolution as RDF load. */
export async function verifyScopedSwrlRdfStorage(
  rules,
  dataset,
  behaviorProfileId,
  importContext,
) {
  const predicates = new Set();
  for (const rule of rules) {
    for (const annotation of rule.annotations)
      predicates.add(annotation.property.iri.value);
  }
  if (!predicates.size) return;
  const logicalProperties = importContext
    ? new Set(builtInLogicalProperties)
    : builtInLogicalProperties;
  if (importContext) {
    for (const { kind, iri } of importContext.declarationEntities)
      if (
        kind === OWLObjectKind.DATA_PROPERTY ||
        kind === OWLObjectKind.OBJECT_PROPERTY
      )
        logicalProperties.add(iri.value);
    for (const { type, iri } of importContext.sourceRoles)
      if (iri !== undefined && rdfLogicalPropertyTypes.has(type))
        logicalProperties.add(iri);
  }
  if (
    !hasPotentialLogicalRuleAnnotation(dataset, predicates, logicalProperties)
  )
    return;

  const expected = new Set(rules.map((rule) => rule.structuralKey()));
  const configuration = new OWLOntologyLoaderConfiguration({
    behaviorProfileId,
    parsingMode: "compatible",
    loadAnnotationAxioms: true,
    rdfDatasetGraphPolicy: "requireSingleGraph",
    collectWarnings: false,
    remoteImports: false,
    remoteJsonLdContexts: false,
  });
  const dataFactory = new OWLDataFactory({ behaviorProfileId });
  let reconstructed;
  try {
    const { ontology } = await new RdfToOwlTranslator({
      dataFactory,
    }).translate(dataset, { configuration, ...importContext });
    reconstructed = ontology.getAxiomsByType(OWLObjectKind.SWRL_RULE);
  } catch (cause) {
    if (!(cause instanceof OWLParserError)) throw cause;
    throw new OWLOntologyStorageError(
      "The RDF graph cannot reconstruct the scoped SWRL rules",
      { reason: "ONTOLOGY_NOT_REPRESENTABLE", cause },
    );
  }
  if (
    reconstructed.size !== expected.size ||
    reconstructed.values().some((rule) => !expected.has(rule.structuralKey()))
  )
    throw new OWLOntologyStorageError(
      "An RDF logical property role changes a SWRL rule annotation",
      { reason: "ONTOLOGY_NOT_REPRESENTABLE" },
    );
}

export const prepareRdfStorageConfiguration = (
  snapshot,
  behaviorProfileId,
  policy,
) => {
  let byProfile = configurations.get(snapshot);
  const existing = byProfile?.get(behaviorProfileId);
  let configuration =
    existing ??
    new OWLOntologyLoaderConfiguration({
      behaviorProfileId,
      parsingMode: "strict",
      loadAnnotationAxioms: true,
      rdfDatasetGraphPolicy: "requireSingleGraph",
      collectWarnings: true,
      remoteImports: false,
      remoteJsonLdContexts: false,
    });
  checkRdfStorageLimits(snapshot, configuration, policy);
  if (!policy.requiresLosslessRdfRoundTrip || existing) return configuration;
  for (const axiom of snapshotAxioms(snapshot)) {
    if (hasNormalizedSingleton(axiom)) {
      configuration = configuration.withParsingMode("preserve");
      break;
    }
  }
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
