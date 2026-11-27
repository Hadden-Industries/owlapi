import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OWLObjectKind } from "../model/kinds.js";
import { dispatchOwlObject } from "../model/dispatch.js";
import { canonicalJson } from "../scripts/canonical-json.mjs";
import {
  javaProcessEnvironment,
  javaToolchainSelection,
  observeSelectedJavaJdk,
} from "../scripts/java-toolchain.mjs";
import {
  BEHAVIOR_PROFILES,
  BENCHMARK_DEFINITIONS,
  benchmarkImportClosureManager,
  buildAxiomBatch,
  buildProfileOntology,
  createRichOntologyFixture,
  loadBenchmarkApi,
  prepareSharedFixtureDirectory,
} from "./benchmark-owlapi-java-parity.mjs";
import { admitReleasedClasspath } from "./owlapi-reference/comparison-oracle.mjs";
import {
  ensureCachedJavaHelperBuild,
  resolveJavaHelperBuildCacheDirectory,
} from "./owlapi-reference/java-helper-build-cache.mjs";

export const API_SEMANTICS_SCHEMA_VERSION = 1;

const ROOT_DIR = fileURLToPath(new URL("../", import.meta.url));
const HARNESS_PATH = "util/owlapi-reference/VerifyBenchmarkApiSemantics.java";
const RICH_COUNT = 60;
const SAVE_FORMATS = Object.freeze([
  "functional",
  "owlxml",
  "rdfxml",
  "turtle",
]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const structuralDigest = (value) => sha256(canonicalJson(value));

const compareUtf16 = (left, right) => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const sortCanonical = (values, mapper) => {
  const entries = [...values].map((item) => {
    const ast = mapper(item);
    return { key: canonicalJson(ast), ast };
  });
  entries.sort((a, b) => compareUtf16(a.key, b.key));
  return entries.map((entry) => entry.ast);
};

const benchmarkFormats = (OWLDocumentFormats) =>
  Object.freeze({
    functional: OWLDocumentFormats.FUNCTIONAL,
    manchester: OWLDocumentFormats.MANCHESTER,
    owlxml: OWLDocumentFormats.OWL_XML,
    rdfxml: OWLDocumentFormats.RDF_XML,
    turtle: OWLDocumentFormats.TURTLE,
    ntriples: OWLDocumentFormats.N_TRIPLES,
    nquads: OWLDocumentFormats.N_QUADS,
    trig: OWLDocumentFormats.TRIG,
    jsonld: OWLDocumentFormats.JSON_LD,
    dl: OWLDocumentFormats.DL,
    krss2: OWLDocumentFormats.KRSS2,
    krss1: OWLDocumentFormats.KRSS1,
  });

const canonicalIri = (iri) => ({
  kind: OWLObjectKind.IRI,
  value: iri.value,
});

const canonicalOntologyId = (id) => ({
  kind: OWLObjectKind.ONTOLOGY_ID,
  ontologyIRI: id.ontologyIRI ? canonicalIri(id.ontologyIRI) : null,
  versionIRI: id.versionIRI ? canonicalIri(id.versionIRI) : null,
});

const canonicalImportsDecl = (decl) => ({
  kind: OWLObjectKind.IMPORTS_DECLARATION,
  iri: canonicalIri(decl.iri),
});

const ENTITY_AST_BUILDERS = Object.freeze(
  Object.fromEntries(
    [
      OWLObjectKind.CLASS,
      OWLObjectKind.DATATYPE,
      OWLObjectKind.OBJECT_PROPERTY,
      OWLObjectKind.DATA_PROPERTY,
      OWLObjectKind.ANNOTATION_PROPERTY,
      OWLObjectKind.NAMED_INDIVIDUAL,
    ].map((kind) => [
      kind,
      (value) => ({ kind, iri: canonicalIri(value.iri) }),
    ]),
  ),
);

const OBJECT_AST_HANDLERS = Object.freeze({
  ...ENTITY_AST_BUILDERS,
  [OWLObjectKind.IRI]: (value) => canonicalIri(value),
  [OWLObjectKind.ONTOLOGY_ID]: (value) => canonicalOntologyId(value),
  [OWLObjectKind.IMPORTS_DECLARATION]: (value) => canonicalImportsDecl(value),
  [OWLObjectKind.LITERAL]: (value) => ({
    kind: OWLObjectKind.LITERAL,
    lexicalForm: value.lexicalForm,
    datatype: canonicalizeOwlObject(value.datatype),
    language: value.language ?? "",
  }),
  [OWLObjectKind.ANONYMOUS_INDIVIDUAL]: (value) => ({
    kind: OWLObjectKind.ANONYMOUS_INDIVIDUAL,
    nodeID: value.nodeID,
    documentScope: value.documentScope ?? "",
  }),
  [OWLObjectKind.ANNOTATION]: (value) => ({
    kind: OWLObjectKind.ANNOTATION,
    property: canonicalizeOwlObject(value.property),
    value: canonicalizeOwlObject(value.value),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.OBJECT_INVERSE_OF]: (value) => ({
    kind: OWLObjectKind.OBJECT_INVERSE_OF,
    inverse: canonicalizeOwlObject(value.inverse),
  }),
  [OWLObjectKind.OBJECT_INTERSECTION_OF]: (value) => ({
    kind: OWLObjectKind.OBJECT_INTERSECTION_OF,
    operands: sortCanonical(value.operands, canonicalizeOwlObject),
  }),
  [OWLObjectKind.OBJECT_UNION_OF]: (value) => ({
    kind: OWLObjectKind.OBJECT_UNION_OF,
    operands: sortCanonical(value.operands, canonicalizeOwlObject),
  }),
  [OWLObjectKind.OBJECT_COMPLEMENT_OF]: (value) => ({
    kind: OWLObjectKind.OBJECT_COMPLEMENT_OF,
    operand: canonicalizeOwlObject(value.operand),
  }),
  [OWLObjectKind.OBJECT_ONE_OF]: (value) => ({
    kind: OWLObjectKind.OBJECT_ONE_OF,
    individuals: sortCanonical(value.individuals, canonicalizeOwlObject),
  }),
  [OWLObjectKind.OBJECT_SOME_VALUES_FROM]: (value) => ({
    kind: OWLObjectKind.OBJECT_SOME_VALUES_FROM,
    property: canonicalizeOwlObject(value.property),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.OBJECT_ALL_VALUES_FROM]: (value) => ({
    kind: OWLObjectKind.OBJECT_ALL_VALUES_FROM,
    property: canonicalizeOwlObject(value.property),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.OBJECT_HAS_VALUE]: (value) => ({
    kind: OWLObjectKind.OBJECT_HAS_VALUE,
    property: canonicalizeOwlObject(value.property),
    individual: canonicalizeOwlObject(value.individual),
  }),
  [OWLObjectKind.OBJECT_HAS_SELF]: (value) => ({
    kind: OWLObjectKind.OBJECT_HAS_SELF,
    property: canonicalizeOwlObject(value.property),
  }),
  [OWLObjectKind.OBJECT_MIN_CARDINALITY]: (value) => ({
    kind: OWLObjectKind.OBJECT_MIN_CARDINALITY,
    cardinality: value.cardinality,
    property: canonicalizeOwlObject(value.property),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.OBJECT_MAX_CARDINALITY]: (value) => ({
    kind: OWLObjectKind.OBJECT_MAX_CARDINALITY,
    cardinality: value.cardinality,
    property: canonicalizeOwlObject(value.property),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.OBJECT_EXACT_CARDINALITY]: (value) => ({
    kind: OWLObjectKind.OBJECT_EXACT_CARDINALITY,
    cardinality: value.cardinality,
    property: canonicalizeOwlObject(value.property),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.DATA_SOME_VALUES_FROM]: (value) => ({
    kind: OWLObjectKind.DATA_SOME_VALUES_FROM,
    properties: value.properties.map(canonicalizeOwlObject),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.DATA_ALL_VALUES_FROM]: (value) => ({
    kind: OWLObjectKind.DATA_ALL_VALUES_FROM,
    properties: value.properties.map(canonicalizeOwlObject),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.DATA_HAS_VALUE]: (value) => ({
    kind: OWLObjectKind.DATA_HAS_VALUE,
    property: canonicalizeOwlObject(value.property),
    value: canonicalizeOwlObject(value.value),
  }),
  [OWLObjectKind.DATA_MIN_CARDINALITY]: (value) => ({
    kind: OWLObjectKind.DATA_MIN_CARDINALITY,
    cardinality: value.cardinality,
    property: canonicalizeOwlObject(value.property),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.DATA_MAX_CARDINALITY]: (value) => ({
    kind: OWLObjectKind.DATA_MAX_CARDINALITY,
    cardinality: value.cardinality,
    property: canonicalizeOwlObject(value.property),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.DATA_EXACT_CARDINALITY]: (value) => ({
    kind: OWLObjectKind.DATA_EXACT_CARDINALITY,
    cardinality: value.cardinality,
    property: canonicalizeOwlObject(value.property),
    filler: canonicalizeOwlObject(value.filler),
  }),
  [OWLObjectKind.DATA_INTERSECTION_OF]: (value) => ({
    kind: OWLObjectKind.DATA_INTERSECTION_OF,
    operands: sortCanonical(value.operands, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DATA_UNION_OF]: (value) => ({
    kind: OWLObjectKind.DATA_UNION_OF,
    operands: sortCanonical(value.operands, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DATA_COMPLEMENT_OF]: (value) => ({
    kind: OWLObjectKind.DATA_COMPLEMENT_OF,
    operand: canonicalizeOwlObject(value.operand),
  }),
  [OWLObjectKind.DATA_ONE_OF]: (value) => ({
    kind: OWLObjectKind.DATA_ONE_OF,
    values: sortCanonical(value.values, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DATATYPE_RESTRICTION]: (value) => ({
    kind: OWLObjectKind.DATATYPE_RESTRICTION,
    datatype: canonicalizeOwlObject(value.datatype),
    facetRestrictions: sortCanonical(
      value.facetRestrictions,
      canonicalizeOwlObject,
    ),
  }),
  [OWLObjectKind.FACET_RESTRICTION]: (value) => ({
    kind: OWLObjectKind.FACET_RESTRICTION,
    facet: canonicalIri(value.facet),
    value: canonicalizeOwlObject(value.value),
  }),
  [OWLObjectKind.DECLARATION_AXIOM]: (value) => ({
    kind: OWLObjectKind.DECLARATION_AXIOM,
    entity: canonicalizeOwlObject(value.entity),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.SUBCLASS_OF_AXIOM]: (value) => ({
    kind: OWLObjectKind.SUBCLASS_OF_AXIOM,
    subClass: canonicalizeOwlObject(value.subClass),
    superClass: canonicalizeOwlObject(value.superClass),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.EQUIVALENT_CLASSES_AXIOM]: (value) => ({
    kind: OWLObjectKind.EQUIVALENT_CLASSES_AXIOM,
    classExpressions: sortCanonical(
      value.classExpressions,
      canonicalizeOwlObject,
    ),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DISJOINT_CLASSES_AXIOM]: (value) => ({
    kind: OWLObjectKind.DISJOINT_CLASSES_AXIOM,
    classExpressions: sortCanonical(
      value.classExpressions,
      canonicalizeOwlObject,
    ),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DISJOINT_UNION_AXIOM]: (value) => ({
    kind: OWLObjectKind.DISJOINT_UNION_AXIOM,
    owlClass: canonicalizeOwlObject(value.owlClass),
    classExpressions: sortCanonical(
      value.classExpressions,
      canonicalizeOwlObject,
    ),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM,
    subProperty: canonicalizeOwlObject(value.subProperty),
    superProperty: canonicalizeOwlObject(value.superProperty),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM]: (value) => ({
    kind: OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM,
    chain: value.chain.map(canonicalizeOwlObject),
    superProperty: canonicalizeOwlObject(value.superProperty),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM]: (value) => ({
    kind: OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM,
    properties: sortCanonical(value.properties, canonicalizeOwlObject),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM]: (value) => ({
    kind: OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM,
    properties: sortCanonical(value.properties, canonicalizeOwlObject),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM]: (value) => ({
    kind: OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM,
    property: canonicalizeOwlObject(value.property),
    domain: canonicalizeOwlObject(value.domain),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM]: (value) => ({
    kind: OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM,
    property: canonicalizeOwlObject(value.property),
    range: canonicalizeOwlObject(value.range),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM]: (value) => ({
    kind: OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM,
    properties: sortCanonical(value.properties, canonicalizeOwlObject),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    property: canonicalizeOwlObject(value.property),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    property: canonicalizeOwlObject(value.property),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM,
    property: canonicalizeOwlObject(value.property),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
    property: canonicalizeOwlObject(value.property),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM,
    property: canonicalizeOwlObject(value.property),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
    property: canonicalizeOwlObject(value.property),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM,
    property: canonicalizeOwlObject(value.property),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.SUB_DATA_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.SUB_DATA_PROPERTY_AXIOM,
    subProperty: canonicalizeOwlObject(value.subProperty),
    superProperty: canonicalizeOwlObject(value.superProperty),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.EQUIVALENT_DATA_PROPERTIES_AXIOM]: (value) => ({
    kind: OWLObjectKind.EQUIVALENT_DATA_PROPERTIES_AXIOM,
    properties: sortCanonical(value.properties, canonicalizeOwlObject),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM]: (value) => ({
    kind: OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM,
    properties: sortCanonical(value.properties, canonicalizeOwlObject),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM]: (value) => ({
    kind: OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM,
    property: canonicalizeOwlObject(value.property),
    domain: canonicalizeOwlObject(value.domain),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM]: (value) => ({
    kind: OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
    property: canonicalizeOwlObject(value.property),
    range: canonicalizeOwlObject(value.range),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM,
    property: canonicalizeOwlObject(value.property),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DATATYPE_DEFINITION_AXIOM]: (value) => ({
    kind: OWLObjectKind.DATATYPE_DEFINITION_AXIOM,
    datatype: canonicalizeOwlObject(value.datatype),
    dataRange: canonicalizeOwlObject(value.dataRange),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.HAS_KEY_AXIOM]: (value) => ({
    kind: OWLObjectKind.HAS_KEY_AXIOM,
    classExpression: canonicalizeOwlObject(value.classExpression),
    objectProperties: sortCanonical(
      value.objectProperties,
      canonicalizeOwlObject,
    ),
    dataProperties: sortCanonical(value.dataProperties, canonicalizeOwlObject),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.SAME_INDIVIDUAL_AXIOM]: (value) => ({
    kind: OWLObjectKind.SAME_INDIVIDUAL_AXIOM,
    individuals: sortCanonical(value.individuals, canonicalizeOwlObject),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM]: (value) => ({
    kind: OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM,
    individuals: sortCanonical(value.individuals, canonicalizeOwlObject),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.CLASS_ASSERTION_AXIOM]: (value) => ({
    kind: OWLObjectKind.CLASS_ASSERTION_AXIOM,
    classExpression: canonicalizeOwlObject(value.classExpression),
    individual: canonicalizeOwlObject(value.individual),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM]: (value) => ({
    kind: OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM,
    property: canonicalizeOwlObject(value.property),
    subject: canonicalizeOwlObject(value.subject),
    value: canonicalizeOwlObject(value.value),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM]: (value) => ({
    kind: OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
    property: canonicalizeOwlObject(value.property),
    subject: canonicalizeOwlObject(value.subject),
    value: canonicalizeOwlObject(value.value),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM]: (value) => ({
    kind: OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
    property: canonicalizeOwlObject(value.property),
    subject: canonicalizeOwlObject(value.subject),
    value: canonicalizeOwlObject(value.value),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM]: (value) => ({
    kind: OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
    property: canonicalizeOwlObject(value.property),
    subject: canonicalizeOwlObject(value.subject),
    value: canonicalizeOwlObject(value.value),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.ANNOTATION_ASSERTION_AXIOM]: (value) => ({
    kind: OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
    property: canonicalizeOwlObject(value.property),
    subject: canonicalizeOwlObject(value.subject),
    value: canonicalizeOwlObject(value.value),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM]: (value) => ({
    kind: OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM,
    subProperty: canonicalizeOwlObject(value.subProperty),
    superProperty: canonicalizeOwlObject(value.superProperty),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM]: (value) => ({
    kind: OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
    property: canonicalizeOwlObject(value.property),
    domain: canonicalizeOwlObject(value.domain),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
  [OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM]: (value) => ({
    kind: OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM,
    property: canonicalizeOwlObject(value.property),
    range: canonicalizeOwlObject(value.range),
    annotations: sortCanonical(value.annotations, canonicalizeOwlObject),
  }),
});

/** Project any public structural OWL object into a cross-runtime canonical JSON AST. */
export function canonicalizeOwlObject(value) {
  return dispatchOwlObject(value, OBJECT_AST_HANDLERS);
}

/** Project an OWLOntology into a canonical ontology snapshot. */
export function canonicalizeOntology(ontology) {
  return {
    ontologyID: canonicalOntologyId(ontology.getOntologyID()),
    imports: sortCanonical(
      ontology.getImportsDeclarations(),
      canonicalImportsDecl,
    ),
    annotations: sortCanonical(
      ontology.getAnnotations(),
      canonicalizeOwlObject,
    ),
    axioms: sortCanonical(ontology.getAxioms(), canonicalizeOwlObject),
  };
}

/** Project an ontology change object using only public getters. */
export function canonicalizeOntologyChange(change) {
  const changeKind = change.constructor?.name ?? "UnknownChange";
  const ontologyIRI =
    change.getOntology?.().getOntologyID()?.ontologyIRI?.value ?? null;
  if (typeof change.getAxiom === "function") {
    return {
      changeKind,
      ontologyIRI,
      axiom: canonicalizeOwlObject(change.getAxiom()),
    };
  }
  if (typeof change.getAnnotation === "function") {
    return {
      changeKind,
      ontologyIRI,
      annotation: canonicalizeOwlObject(change.getAnnotation()),
    };
  }
  return { changeKind, ontologyIRI };
}

/** Project an OWLProfileReport into a cross-runtime canonical summary. */
export function canonicalizeProfileReport(report) {
  const rawViolations = report.getViolations();
  const violations = sortCanonical(rawViolations, (violation) => ({
    axiomKind: violation.kind ?? null,
    violationCategory:
      violation.code === "PROFILE_CLASS_POSITION_NOT_ALLOWED" &&
      violation.position === "super"
        ? "NonSuperClassExpression"
        : (violation.code ?? "UnknownViolation"),
    expressionKind: violation.expressionKind ?? null,
  }));
  return {
    profileName: report.getProfile().getName(),
    inProfile: report.isInProfile(),
    violationCount: rawViolations.length,
    violations,
  };
}

/** Independently authored canonical ontology expectation for generated load.* benchmarks. */
export function expectedGeneratedLoadWorkload(name, count) {
  let ontologyIRI = null;
  let axioms;
  if (["dl", "krss2", "krss1"].includes(name)) {
    axioms = sortCanonical(
      Array.from({ length: count }, (_, i) => i),
      (i) => ({
        kind: OWLObjectKind.SUBCLASS_OF_AXIOM,
        subClass: {
          kind: OWLObjectKind.CLASS,
          iri: {
            kind: OWLObjectKind.IRI,
            value: `urn:bench:load:${name}#C${i}`,
          },
        },
        superClass: {
          kind: OWLObjectKind.CLASS,
          iri: {
            kind: OWLObjectKind.IRI,
            value: `urn:bench:load:${name}#Parent${i}`,
          },
        },
        annotations: [],
      }),
    );
  } else {
    if (["functional", "manchester", "owlxml"].includes(name)) {
      ontologyIRI = `urn:owlapi-js:benchmark:${name}`;
    }
    const stem =
      name === "jsonld"
        ? "https://example.org/benchmark#C"
        : name === "ntriples" || name === "nquads" || name === "trig"
          ? `urn:owlapi-js:benchmark:${name}#C`
          : "urn:owlapi-js:benchmark:C";
    axioms = sortCanonical(
      Array.from({ length: count }, (_, i) => i),
      (i) => ({
        kind: OWLObjectKind.DECLARATION_AXIOM,
        entity: {
          kind: OWLObjectKind.CLASS,
          iri: { kind: OWLObjectKind.IRI, value: `${stem}${i}` },
        },
        annotations: [],
      }),
    );
  }
  return {
    ontologyID: {
      kind: OWLObjectKind.ONTOLOGY_ID,
      ontologyIRI: ontologyIRI
        ? { kind: OWLObjectKind.IRI, value: ontologyIRI }
        : null,
      versionIRI: null,
    },
    imports: [],
    annotations: [],
    axioms,
  };
}

function findFirstDifference(left, right, currentPath = "$") {
  if (Object.is(left, right)) {
    return null;
  }
  if (
    left === null ||
    right === null ||
    typeof left !== typeof right ||
    typeof left !== "object"
  ) {
    return {
      path: currentPath,
      java: left === undefined ? null : left,
      js: right === undefined ? null : right,
    };
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return { path: currentPath, java: typeof left, js: typeof right };
    }
    if (left.length !== right.length) {
      return {
        path: `${currentPath}.length`,
        java: left.length,
        js: right.length,
      };
    }
    for (let i = 0; i < left.length; i += 1) {
      const diff = findFirstDifference(
        left[i],
        right[i],
        `${currentPath}[${i}]`,
      );
      if (diff) {
        return diff;
      }
    }
    return null;
  }
  const leftKeys = Object.keys(left).sort(compareUtf16);
  const rightKeys = Object.keys(right).sort(compareUtf16);
  if (canonicalJson(leftKeys) !== canonicalJson(rightKeys)) {
    return {
      path: `${currentPath}.$keys`,
      java: leftKeys,
      js: rightKeys,
    };
  }
  for (const key of leftKeys) {
    const diff = findFirstDifference(
      left[key],
      right[key],
      `${currentPath}.${key}`,
    );
    if (diff) {
      return diff;
    }
  }
  return null;
}

const collapseWhitespace = (text) => text.replaceAll(/\s+/gu, " ").trim();

const canonicalEqual = (left, right) =>
  left !== undefined &&
  right !== undefined &&
  canonicalJson(left) === canonicalJson(right);

const matchesWriterCopyPolicyDiff = (javaObs, jsObs) => {
  if (
    !canonicalEqual(javaObs?.defaults, jsObs?.defaults) ||
    !Array.isArray(javaObs?.steps) ||
    !Array.isArray(jsObs?.steps) ||
    javaObs.steps.length !== jsObs.steps.length ||
    javaObs.steps.length === 0
  ) {
    return false;
  }
  const hasExpectedResetVsPreserve = javaObs.steps.every((javaStep, i) => {
    const jsStep = jsObs.steps[i];
    return (
      javaStep?.indentSize === 4 &&
      javaStep?.useBanners === true &&
      jsStep?.indentSize === 2 + (i % 4) &&
      jsStep?.useBanners === false
    );
  });
  if (!hasExpectedResetVsPreserve) {
    return false;
  }
  const normalizedJs = {
    defaults: jsObs.defaults,
    steps: jsObs.steps.map((step) => ({
      ...step,
      indentSize: 4,
      useBanners: true,
    })),
  };
  return canonicalJson(javaObs) === canonicalJson(normalizedJs);
};

const EXPECTED_ANON_KEYS = Object.freeze(["documentScope", "kind", "nodeID"]);

const normalizeAnonymousIndividuals = (value, mapping, stats) => {
  if (value === undefined) {
    stats.invalid = true;
    return null;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      normalizeAnonymousIndividuals(item, mapping, stats),
    );
  }
  if (value.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL) {
    const keys = Object.keys(value).sort(compareUtf16);
    if (
      canonicalJson(keys) !== canonicalJson(EXPECTED_ANON_KEYS) ||
      typeof value.documentScope !== "string" ||
      typeof value.nodeID !== "string" ||
      value.nodeID.length === 0 ||
      /^bnode_\d+$/u.test(value.nodeID)
    ) {
      stats.invalid = true;
      return null;
    }
    const rawKey = canonicalJson([value.documentScope, value.nodeID]);
    let canonicalAnonId = mapping.get(rawKey);
    if (canonicalAnonId === undefined) {
      canonicalAnonId = `anon#${mapping.size}`;
      mapping.set(rawKey, canonicalAnonId);
    }
    stats.count += 1;
    return {
      kind: OWLObjectKind.ANONYMOUS_INDIVIDUAL,
      canonicalAnonId,
    };
  }
  const out = Object.create(null);
  for (const key of Object.keys(value).sort(compareUtf16)) {
    out[key] = normalizeAnonymousIndividuals(value[key], mapping, stats);
  }
  return out;
};

const matchesDuplicatorAlphaEquivalence = (javaObs, jsObs) => {
  if (
    !javaObs ||
    !jsObs ||
    typeof javaObs !== "object" ||
    typeof jsObs !== "object" ||
    canonicalJson(Object.keys(javaObs).sort(compareUtf16)) !==
      canonicalJson(["copies"]) ||
    canonicalJson(Object.keys(jsObs).sort(compareUtf16)) !==
      canonicalJson(["copies"]) ||
    !Array.isArray(javaObs.copies) ||
    !Array.isArray(jsObs.copies) ||
    javaObs.copies.length === 0 ||
    javaObs.copies.length !== jsObs.copies.length
  ) {
    return false;
  }
  const javaMap = new Map();
  const javaStats = { count: 0, invalid: false };
  const normJava = normalizeAnonymousIndividuals(javaObs, javaMap, javaStats);
  const jsMap = new Map();
  const jsStats = { count: 0, invalid: false };
  const normJs = normalizeAnonymousIndividuals(jsObs, jsMap, jsStats);
  return (
    !javaStats.invalid &&
    !jsStats.invalid &&
    javaStats.count > 0 &&
    javaStats.count === jsStats.count &&
    javaMap.size > 0 &&
    javaMap.size === jsMap.size &&
    canonicalJson(normJava) === canonicalJson(normJs)
  );
};

const isNormativeFunctionalReservedPrefixReloadError = (reload) => {
  if (
    !reload ||
    typeof reload !== "object" ||
    Array.isArray(reload) ||
    canonicalJson(Object.keys(reload)) !== canonicalJson(["reloadError"])
  ) {
    return false;
  }
  const err = reload.reloadError;
  return (
    Boolean(err) &&
    typeof err === "object" &&
    !Array.isArray(err) &&
    err.name === "OWLSyntaxError" &&
    err.code === "OWL_SYNTAX_ERROR" &&
    typeof err.message === "string" &&
    /reserved prefix owl:/u.test(err.message)
  );
};

const HEADERLESS_LOAD_JAVA_BASES = Object.freeze({
  "load.dl": /^http:\/\/www\.semanticweb\.org\/ontologies\/Ontology\d+#$/u,
  "load.krss2": /^OntologyID\(Anonymous-\d+\)#$/u,
  "load.krss1": /^http:\/\/www\.w3\.org\/2002\/07\/owl#$/u,
});

const rewriteIriPrefix = (value, fromPrefix, toPrefix) => {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteIriPrefix(item, fromPrefix, toPrefix));
  }
  if (
    value.kind === OWLObjectKind.IRI &&
    typeof value.value === "string" &&
    value.value.startsWith(fromPrefix)
  ) {
    return {
      ...value,
      value: `${toPrefix}${value.value.slice(fromPrefix.length)}`,
    };
  }
  const out = Object.create(null);
  for (const key of Object.keys(value).sort(compareUtf16)) {
    out[key] = rewriteIriPrefix(value[key], fromPrefix, toPrefix);
  }
  return out;
};

const normalizeJavaHeaderlessNamespace = (groupId, observation) => {
  const basePattern = HEADERLESS_LOAD_JAVA_BASES[groupId];
  const firstSubIri = observation?.axioms?.[0]?.subClass?.iri?.value;
  if (!basePattern || typeof firstSubIri !== "string") return undefined;
  const match = /^(.*#)C0$/u.exec(firstSubIri);
  if (!match || !basePattern.test(match[1])) return undefined;
  return rewriteIriPrefix(
    observation,
    match[1],
    `urn:bench:load:${groupId.slice("load.".length)}#`,
  );
};

const matchesLiteralLanguagePolicyDiff = (javaObs, jsObs) => {
  if (
    !Array.isArray(javaObs?.sets) ||
    !Array.isArray(jsObs?.sets) ||
    javaObs.sets.length !== jsObs.sets.length ||
    javaObs.sets.length === 0
  ) {
    return false;
  }
  const normalizedJs = {
    sets: jsObs.sets.map((row) => ({
      ...row,
      l2: {
        ...row.l2,
        language:
          typeof row.l2?.language === "string"
            ? row.l2.language.trim()
            : row.l2?.language,
      },
    })),
  };
  return canonicalJson(javaObs) === canonicalJson(normalizedJs);
};

const matchesRdfMetadataDiff = (javaObs, jsObs) => {
  if (
    !javaObs ||
    !jsObs ||
    javaObs.tripleCount === undefined ||
    javaObs.headerState === undefined ||
    javaObs.unparsedTriples === undefined ||
    javaObs.guessedDeclarations === undefined ||
    jsObs.tripleCount === undefined ||
    jsObs.headerState === undefined ||
    jsObs.unparsedTriples === undefined ||
    jsObs.guessedDeclarations === undefined
  ) {
    return false;
  }
  return (
    canonicalJson({
      tripleCount: javaObs.tripleCount,
      headerState: javaObs.headerState,
      unparsedTriples: javaObs.unparsedTriples,
    }) ===
      canonicalJson({
        tripleCount: jsObs.tripleCount,
        headerState: jsObs.headerState,
        unparsedTriples: jsObs.unparsedTriples,
      }) &&
    canonicalJson(javaObs.guessedDeclarations) !==
      canonicalJson(jsObs.guessedDeclarations)
  );
};

const matchesEntityPunningDiff = (javaObs, jsObs) => {
  if (
    !javaObs ||
    !jsObs ||
    javaObs.perClass === undefined ||
    javaObs.anonExcl === undefined ||
    javaObs.anonIncl === undefined ||
    javaObs.punnedExcl === undefined ||
    javaObs.punnedIncl === undefined ||
    jsObs.perClass === undefined ||
    jsObs.anonExcl === undefined ||
    jsObs.anonIncl === undefined ||
    jsObs.punnedExcl === undefined ||
    jsObs.punnedIncl === undefined
  ) {
    return false;
  }
  return (
    canonicalJson({
      perClass: javaObs.perClass,
      anonExcl: javaObs.anonExcl,
      anonIncl: javaObs.anonIncl,
    }) ===
      canonicalJson({
        perClass: jsObs.perClass,
        anonExcl: jsObs.anonExcl,
        anonIncl: jsObs.anonIncl,
      }) &&
    canonicalJson({
      punnedExcl: javaObs.punnedExcl,
      punnedIncl: javaObs.punnedIncl,
    }) !==
      canonicalJson({
        punnedExcl: jsObs.punnedExcl,
        punnedIncl: jsObs.punnedIncl,
      })
  );
};

const matchesRendererPresentationDiff = (javaObs, jsObs) => {
  if (
    !Array.isArray(javaObs?.axioms) ||
    !Array.isArray(jsObs?.axioms) ||
    !Array.isArray(javaObs?.complexExpressions) ||
    !Array.isArray(jsObs?.complexExpressions) ||
    javaObs.axioms.length !== jsObs.axioms.length ||
    javaObs.complexExpressions.length !== jsObs.complexExpressions.length
  ) {
    return false;
  }
  return (
    javaObs.axioms.every(
      (line, i) =>
        collapseWhitespace(line) === collapseWhitespace(jsObs.axioms[i]),
    ) &&
    javaObs.complexExpressions.every(
      (line, i) =>
        collapseWhitespace(line) ===
        collapseWhitespace(jsObs.complexExpressions[i]),
    )
  );
};

/** Classify one (groupId, behaviorProfileId) workload observation pair strictly and fail-closed. */
export function classifyApiWorkloadRow({
  groupId,
  behaviorProfileId,
  javaObservation,
  jsObservation,
  crossRuntimeReloads,
  expectedLoadOntology,
}) {
  const javaSha256 = structuralDigest(javaObservation);
  const jsSha256 = structuralDigest(jsObservation);
  // Independently allocated namespaces must both have the native form, and
  // every generated IRI must occur in the right place in the expected model.
  const javaHeaderlessLoad =
    behaviorProfileId === "java-owlapi-5.5.1" &&
    Object.hasOwn(HEADERLESS_LOAD_JAVA_BASES, groupId);
  const comparableJava = javaHeaderlessLoad
    ? normalizeJavaHeaderlessNamespace(groupId, javaObservation)
    : javaObservation;
  const comparableJs = javaHeaderlessLoad
    ? normalizeJavaHeaderlessNamespace(groupId, jsObservation)
    : jsObservation;
  const directMatch =
    comparableJava !== undefined &&
    comparableJs !== undefined &&
    canonicalEqual(comparableJava, comparableJs);

  if (directMatch) {
    if (expectedLoadOntology !== undefined) {
      if (!canonicalEqual(comparableJs, expectedLoadOntology)) {
        return {
          status: "failed",
          admission: "failed",
          reasonId: "structural-mismatch",
          semanticMatch: false,
          javaSha256,
          jsSha256,
          firstDifference: findFirstDifference(
            expectedLoadOntology,
            comparableJs,
            "$.expectedLoad",
          ),
        };
      }
    }

    if (groupId.startsWith("save.")) {
      const base = javaObservation?.sourceBefore;
      const javaReloadMatches =
        Boolean(crossRuntimeReloads) &&
        canonicalEqual(crossRuntimeReloads.javaLoadedJsSave, base);
      const jsReloadMatches =
        Boolean(crossRuntimeReloads) &&
        canonicalEqual(crossRuntimeReloads.jsLoadedJavaSave, base);
      if (!javaReloadMatches) {
        return {
          status: "failed",
          admission: "failed",
          reasonId: "structural-mismatch",
          semanticMatch: false,
          javaSha256,
          jsSha256,
          firstDifference: findFirstDifference(
            base,
            crossRuntimeReloads?.javaLoadedJsSave,
            "$.crossRuntime.javaLoadedJsSave",
          ),
        };
      }
      if (!jsReloadMatches) {
        if (
          groupId === "save.functional" &&
          behaviorProfileId === "normative-v1" &&
          isNormativeFunctionalReservedPrefixReloadError(
            crossRuntimeReloads?.jsLoadedJavaSave,
          ) &&
          canonicalEqual(crossRuntimeReloads?.jsCompatibleLoadedJavaSave, base)
        ) {
          return {
            status: "passed",
            admission: "independently-witnessed",
            reasonId: "equivalent-workload-strict-reserved-prefix-cross-reload",
            semanticMatch: true,
            javaSha256,
            jsSha256,
            firstDifference: null,
          };
        }
        return {
          status: "failed",
          admission: "failed",
          reasonId: "structural-mismatch",
          semanticMatch: false,
          javaSha256,
          jsSha256,
          firstDifference: findFirstDifference(
            base,
            crossRuntimeReloads?.jsLoadedJavaSave,
            "$.crossRuntime.jsLoadedJavaSave",
          ),
        };
      }
    }

    if (groupId === "util.OWLOntologyImportsClosureSetProvider") {
      return {
        status: "observed",
        admission: "unequal-work",
        reasonId: "closure-materialization",
        semanticMatch: true,
        javaSha256,
        jsSha256,
        firstDifference: null,
      };
    }

    return {
      status: "passed",
      admission: "independently-witnessed",
      reasonId:
        javaHeaderlessLoad && javaSha256 !== jsSha256
          ? "equivalent-workload-generated-namespace"
          : "equivalent-workload",
      semanticMatch: true,
      javaSha256,
      jsSha256,
      firstDifference: null,
    };
  }

  if (
    groupId === "util.OWLObjectDuplicator" &&
    matchesDuplicatorAlphaEquivalence(javaObservation, jsObservation)
  ) {
    return {
      status: "passed",
      admission: "independently-witnessed",
      reasonId: "equivalent-workload-alpha-bnodes",
      semanticMatch: true,
      javaSha256,
      jsSha256,
      firstDifference: null,
    };
  }

  if (
    behaviorProfileId === "normative-v1" &&
    expectedLoadOntology !== undefined &&
    canonicalEqual(jsObservation, expectedLoadOntology) &&
    canonicalEqual(
      normalizeJavaHeaderlessNamespace(groupId, javaObservation),
      expectedLoadOntology,
    )
  ) {
    return {
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "headerless-base-iri",
      semanticMatch: false,
      javaSha256,
      jsSha256,
      firstDifference: null,
    };
  }

  if (
    groupId === "config.OWLOntologyWriterConfiguration" &&
    behaviorProfileId === "normative-v1" &&
    matchesWriterCopyPolicyDiff(javaObservation, jsObservation)
  ) {
    return {
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "writer-copy-policy",
      semanticMatch: false,
      javaSha256,
      jsSha256,
      firstDifference: null,
    };
  }

  if (
    groupId === "factory.literals" &&
    behaviorProfileId === "normative-v1" &&
    matchesLiteralLanguagePolicyDiff(javaObservation, jsObservation)
  ) {
    return {
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "literal-language-policy",
      semanticMatch: false,
      javaSha256,
      jsSha256,
      firstDifference: null,
    };
  }

  if (
    groupId === "load.rdfParserMetaData" &&
    behaviorProfileId === "normative-v1" &&
    matchesRdfMetadataDiff(javaObservation, jsObservation)
  ) {
    return {
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "rdf-metadata",
      semanticMatch: false,
      javaSha256,
      jsSha256,
      firstDifference: null,
    };
  }

  if (
    groupId === "ontology.entitySignatureLookups" &&
    behaviorProfileId === "normative-v1" &&
    matchesEntityPunningDiff(javaObservation, jsObservation)
  ) {
    return {
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "entity-punning",
      semanticMatch: false,
      javaSha256,
      jsSha256,
      firstDifference: null,
    };
  }

  if (
    groupId === "renderer.ManchesterOWLSyntaxOWLObjectRendererImpl" &&
    behaviorProfileId === "normative-v1" &&
    matchesRendererPresentationDiff(javaObservation, jsObservation)
  ) {
    return {
      status: "observed",
      admission: "known-behavioral-difference",
      reasonId: "renderer-presentation",
      semanticMatch: false,
      javaSha256,
      jsSha256,
      firstDifference: null,
    };
  }

  return {
    status: "failed",
    admission: "failed",
    reasonId: "structural-mismatch",
    semanticMatch: false,
    javaSha256,
    jsSha256,
    firstDifference: findFirstDifference(javaObservation, jsObservation),
  };
}

const literalSnapshot = (lit) => ({
  lexicalForm: lit.lexicalForm,
  datatypeIRI: lit.datatype.iri.value,
  language: lit.language ?? "",
});

const writerConfigSnapshot = (cfg) => ({
  indenting: cfg.isIndenting(),
  indentSize: cfg.getIndentSize(),
  useBanners: cfg.shouldUseBanners(),
  labelsAsBanner: cfg.isLabelsAsBanner(),
  saveIdsForAllAnonymousIndividuals:
    cfg.shouldSaveIdsForAllAnonymousIndividuals(),
});

const loaderConfigSnapshot = (cfg) => ({
  strict: cfg.isStrict(),
  loadAnnotationAxioms: cfg.isLoadAnnotationAxioms(),
  connectionTimeout: cfg.getConnectionTimeout(),
  retriesToAttempt: cfg.getRetriesToAttempt(),
  followRedirects: cfg.isFollowRedirects(),
  entityExpansionLimit: cfg.getEntityExpansionLimit(),
  authorizationValue: cfg.getAuthorizationValue(),
  acceptingHTTPCompression: cfg.isAcceptingHTTPCompression(),
});

const rdfTermSnapshot = (term) => {
  if (term.termType === "Literal") {
    return {
      termType: "Literal",
      value: term.value,
      datatype: { termType: "NamedNode", value: term.datatype.value },
      language: term.language ?? "",
    };
  }
  return { termType: term.termType, value: term.value };
};

const rdfTripleSnapshot = (triple) => ({
  subject: rdfTermSnapshot(triple.subject),
  predicate: rdfTermSnapshot(triple.predicate),
  object: rdfTermSnapshot(triple.object),
});

/** Observe all 70 public API workloads semantically for one JS behavior profile without timers. */
export async function observeJsApiSemantics(
  behaviorProfileId,
  {
    fixtures,
    syntaxCount = 100,
    importClosureCount = 8,
    saveDirectory,
    publicApi,
  } = {},
) {
  const ownsFixtures = !fixtures;
  const resolvedFixtures =
    fixtures ??
    prepareSharedFixtureDirectory({ syntaxCount, importClosureCount });
  try {
    const api = publicApi ?? (await loadBenchmarkApi());
    const {
      OWLManager,
      OWLDocumentFormats,
      RDFXMLDocumentFormat,
      StringDocumentSource,
      StringDocumentTarget,
      ManchesterOWLSyntaxOWLObjectRendererImpl,
      AXIOM_KINDS,
      CLASS_EXPRESSION_KINDS,
      OWL_OBJECT_KINDS,
      AddAxiom,
      AddImport,
      AddOntologyAnnotation,
      IRI,
      OWLOntologyLoaderConfiguration,
      OWLOntologyWriterConfiguration,
      RemoveAxiom,
      RemoveImport,
      RemoveOntologyAnnotation,
      SetOntologyID,
      StructuralSet,
      dispatchAxiom,
      dispatchClassExpression,
      dispatchOwlObject,
      AxiomAnnotations,
      Imports,
      LocalityClass,
      SyntacticLocalityModuleExtractor,
      OWL2DLProfile,
      OWL2ELProfile,
      OWL2QLProfile,
      OWL2RLProfile,
      EntitySearcher,
      AnnotationValueShortFormProvider,
      OWLEntityRemover,
      OWLEntityRenamer,
      OWLObjectDuplicator,
      OWLOntologyImportsClosureSetProvider,
      OWLOntologyMerger,
      SimpleShortFormProvider,
      XSD_STRING_IRI,
      XSD_INTEGER_IRI,
      XSD_DECIMAL_IRI,
      XSD_FLOAT_IRI,
      XSD_BOOLEAN_IRI,
      MIN_INCLUSIVE_IRI,
    } = api;
    const FORMATS = benchmarkFormats(OWLDocumentFormats);
    const rich = createRichOntologyFixture(behaviorProfileId, api);
    const profileOntology = buildProfileOntology(behaviorProfileId, api);
    const createImportClosureManager = benchmarkImportClosureManager(
      behaviorProfileId,
      resolvedFixtures.importClosure,
      api,
    );
    const closureManager = createImportClosureManager();
    const loadedClosureRoot =
      await closureManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(resolvedFixtures.importClosure.rootText, {
          documentIRI: resolvedFixtures.importClosure.rootIRI,
          format: OWLDocumentFormats.FUNCTIONAL,
        }),
      );
    const rdfMetaManager = OWLManager.createOWLOntologyManager({
      behaviorProfileId,
    });
    const rdfMetaOntology =
      await rdfMetaManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(resolvedFixtures.syntaxTexts["rdf-metadata"], {
          documentIRI: "urn:bench:rdf-metadata",
          format: OWLDocumentFormats.TURTLE,
        }),
      );
    const saveManager = OWLManager.createOWLOntologyManager({
      behaviorProfileId,
    });
    const saveOntology = await saveManager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(resolvedFixtures.syntaxTexts.functional, {
        documentIRI: "urn:bench:save",
        format: OWLDocumentFormats.FUNCTIONAL,
      }),
    );
    const utilManager = OWLManager.createOWLOntologyManager({
      behaviorProfileId,
    });
    const utilDf = utilManager.getOWLDataFactory();
    const utilOntology = utilManager.createOntology(
      utilDf.getOWLOntologyID(IRI.create("urn:bench:util")),
    );
    const utilAxioms = buildAxiomBatch(
      utilDf,
      "urn:bench:util#",
      20,
      false,
      null,
      api,
    );
    utilManager.addAxioms(utilOntology, utilAxioms);
    const utilSeedEntities = [...utilOntology.getClassesInSignature()]
      .sort((left, right) => compareUtf16(left.iri.value, right.iri.value))
      .slice(0, 20);

    const workloads = {};
    const savedTexts = {};

    // 1. Manager & Configuration
    {
      const entries = [];
      for (let i = 0; i < 100; i += 1) {
        const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
        const df = m.getOWLDataFactory();
        entries.push({
          hasFactory: df !== null,
          owlThingIRI: df.getOWLClass(
            IRI.create("http://www.w3.org/2002/07/owl#Thing"),
          ).iri.value,
          rdfsLabelIRI: df.getRDFSLabel().iri.value,
        });
      }
      workloads["manager.createOWLOntologyManager"] = {
        count: entries.length,
        entries,
      };
    }

    {
      const base = new OWLOntologyLoaderConfiguration({ behaviorProfileId });
      const beforeBase = loaderConfigSnapshot(base);
      const steps = [];
      for (let i = 0; i < 500; i += 1) {
        const cfg = base
          .setStrict(true)
          .setLoadAnnotationAxioms(false)
          .setConnectionTimeout(15000 + (i % 10))
          .setRetriesToAttempt(3)
          .setFollowRedirects(false)
          .setEntityExpansionLimit("50000")
          .setAuthorizationValue("Bearer token")
          .setAcceptingHTTPCompression(false);
        steps.push(loaderConfigSnapshot(cfg));
      }
      workloads["config.OWLOntologyLoaderConfiguration"] = {
        baseUnchanged:
          canonicalJson(beforeBase) ===
          canonicalJson(loaderConfigSnapshot(base)),
        steps,
      };
    }

    {
      const base = new OWLOntologyWriterConfiguration({ behaviorProfileId });
      const defaults = writerConfigSnapshot(base);
      const steps = [];
      for (let i = 0; i < 500; i += 1) {
        const cfg = base
          .withIndenting(false)
          .withIndentSize(2 + (i % 4))
          .withBannersEnabled(false)
          .withLabelsAsBanner(true)
          .withSaveIdsForAllAnonymousIndividuals(true);
        steps.push(writerConfigSnapshot(cfg));
      }
      workloads["config.OWLOntologyWriterConfiguration"] = { defaults, steps };
    }

    {
      const src = new RDFXMLDocumentFormat();
      src.setPrefix("src:", "http://example.org/src#");
      const steps = [];
      for (let i = 0; i < 200; i += 1) {
        const fmt = new RDFXMLDocumentFormat();
        fmt.setPrefix("ex:", `http://example.org/ex${i}#`);
        fmt.setDefaultPrefix("http://example.org/def#");
        fmt.copyPrefixesFrom(src);
        const prefixMap = Object.fromEntries(
          [...fmt.getPrefixName2PrefixMap().entries()].sort(([a], [b]) =>
            compareUtf16(a, b),
          ),
        );
        const hasEx = fmt.containsPrefixMapping("ex:");
        const srcPrefix = fmt.getPrefix("src:");
        const defaultPrefix = fmt.getDefaultPrefix();
        const prefixNamesSize = fmt.getPrefixNames().size;
        fmt.unregisterNamespace("http://example.org/def#");
        const afterUnregisterDefault = fmt.getDefaultPrefix();
        fmt.clear();
        steps.push({
          prefixMap,
          prefixNamesSize,
          hasEx,
          srcPrefix,
          defaultPrefix,
          afterUnregisterDefault,
          afterClearCount: fmt.getPrefixName2PrefixMap().size,
        });
      }
      workloads["formats.RDFXMLDocumentFormat.prefixes"] = { steps };
    }

    // 2. DataFactory & Structural Model
    {
      const iris = [];
      for (let i = 0; i < 2000; i += 1) {
        iris.push(IRI.create(`http://example.org/bench/iri#${i}`).toString());
      }
      workloads["model.IRI.create"] = { iris };
    }

    {
      const df = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      }).getOWLDataFactory();
      const sets = [];
      for (let i = 0; i < 500; i += 1) {
        const iri = IRI.create(`http://example.org/factory#E${i}`);
        sets.push({
          class: canonicalizeOwlObject(df.getOWLClass(iri)),
          objectProperty: canonicalizeOwlObject(df.getOWLObjectProperty(iri)),
          dataProperty: canonicalizeOwlObject(df.getOWLDataProperty(iri)),
          annotationProperty: canonicalizeOwlObject(
            df.getOWLAnnotationProperty(iri),
          ),
          datatype: canonicalizeOwlObject(df.getOWLDatatype(iri)),
          namedIndividual: canonicalizeOwlObject(df.getOWLNamedIndividual(iri)),
          anonymousIndividual: canonicalizeOwlObject(
            df.getOWLAnonymousIndividual(`node_${i}`),
          ),
          rdfsLabel: canonicalizeOwlObject(df.getRDFSLabel()),
          ontologyID: canonicalOntologyId(df.getOWLOntologyID(iri)),
          importsDeclaration: canonicalImportsDecl(
            df.getOWLImportsDeclaration(iri),
          ),
        });
      }
      workloads["factory.entities"] = { sets };
    }

    {
      const df = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      }).getOWLDataFactory();
      const xsdInt = df.getOWLDatatype(XSD_INTEGER_IRI);
      const xsdDec = df.getOWLDatatype(XSD_DECIMAL_IRI);
      const xsdFloat = df.getOWLDatatype(XSD_FLOAT_IRI);
      const xsdBool = df.getOWLDatatype(XSD_BOOLEAN_IRI);
      const sets = [];
      for (let i = 0; i < 500; i += 1) {
        sets.push({
          l1: literalSnapshot(df.getOWLLiteral(`plain_${i}`)),
          l2: literalSnapshot(df.getOWLLiteral(`lang_${i}`, " en-GB ")),
          l3: literalSnapshot(df.getOWLLiteral(String(i), xsdInt)),
          l4: literalSnapshot(df.getOWLLiteral(`${i}.50`, xsdDec)),
          l5: literalSnapshot(df.getOWLLiteral(`${i}.25`, xsdFloat)),
          l6: literalSnapshot(
            df.getOWLLiteral(i % 2 === 0 ? "true" : "false", xsdBool),
          ),
        });
      }
      workloads["factory.literals"] = { sets };
    }

    {
      const df = rich.df;
      const xsdString = df.getOWLDatatype(XSD_STRING_IRI);
      const lit = df.getOWLLiteral("v");
      const sets = [];
      for (let i = 0; i < 200; i += 1) {
        const c = rich.classes[i % RICH_COUNT];
        const d = rich.superClasses[i % RICH_COUNT];
        const op = rich.objectProps[i % RICH_COUNT];
        const dp = rich.dataProps[i % RICH_COUNT];
        const ind = rich.individuals[i % RICH_COUNT];
        const inv = df.getOWLObjectInverseOf(op);
        sets.push({
          inv: canonicalizeOwlObject(inv),
          e1: canonicalizeOwlObject(df.getOWLObjectIntersectionOf([c, d])),
          e2: canonicalizeOwlObject(df.getOWLObjectUnionOf([c, d])),
          e3: canonicalizeOwlObject(df.getOWLObjectComplementOf(c)),
          e4: canonicalizeOwlObject(df.getOWLObjectOneOf([ind])),
          e5: canonicalizeOwlObject(df.getOWLObjectSomeValuesFrom(op, c)),
          e6: canonicalizeOwlObject(df.getOWLObjectAllValuesFrom(inv, d)),
          e7: canonicalizeOwlObject(df.getOWLObjectHasValue(op, ind)),
          e8: canonicalizeOwlObject(df.getOWLObjectHasSelf(op)),
          e9: canonicalizeOwlObject(df.getOWLObjectMinCardinality(1, op, c)),
          e10: canonicalizeOwlObject(df.getOWLObjectMaxCardinality(2, op, c)),
          e11: canonicalizeOwlObject(df.getOWLObjectExactCardinality(1, op, c)),
          e12: canonicalizeOwlObject(
            df.getOWLDataSomeValuesFrom([dp], xsdString),
          ),
          e13: canonicalizeOwlObject(
            df.getOWLDataAllValuesFrom([dp], xsdString),
          ),
          e14: canonicalizeOwlObject(df.getOWLDataHasValue(dp, lit)),
          e15: canonicalizeOwlObject(
            df.getOWLDataMinCardinality(1, dp, xsdString),
          ),
          e16: canonicalizeOwlObject(
            df.getOWLDataMaxCardinality(2, dp, xsdString),
          ),
          e17: canonicalizeOwlObject(
            df.getOWLDataExactCardinality(1, dp, xsdString),
          ),
        });
      }
      workloads["factory.classExpressions"] = { sets };
    }

    {
      const df = rich.df;
      const xsdInt = df.getOWLDatatype(XSD_INTEGER_IRI);
      const xsdDec = df.getOWLDatatype(XSD_DECIMAL_IRI);
      const sets = [];
      for (let i = 0; i < 200; i += 1) {
        const lit = df.getOWLLiteral(String(i), xsdInt);
        const facet = df.getOWLFacetRestriction(MIN_INCLUSIVE_IRI, lit);
        sets.push({
          facet: canonicalizeOwlObject(facet),
          dr1: canonicalizeOwlObject(
            df.getOWLDatatypeRestriction(xsdInt, [facet]),
          ),
          dr2: canonicalizeOwlObject(
            df.getOWLDataIntersectionOf([xsdInt, xsdDec]),
          ),
          dr3: canonicalizeOwlObject(df.getOWLDataUnionOf([xsdInt, xsdDec])),
          dr4: canonicalizeOwlObject(df.getOWLDataComplementOf(xsdInt)),
          dr5: canonicalizeOwlObject(df.getOWLDataOneOf([lit])),
        });
      }
      workloads["factory.dataRanges"] = { sets };
    }

    {
      const df = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      }).getOWLDataFactory();
      const built = buildAxiomBatch(
        df,
        "urn:bench:factory#",
        35,
        false,
        null,
        api,
      );
      workloads["factory.axioms"] = {
        ordered: built.map(canonicalizeOwlObject),
        uniqueSorted: sortCanonical(
          new StructuralSet(built),
          canonicalizeOwlObject,
        ),
      };
    }

    {
      const set = new StructuralSet();
      const perIndexChecks = [];
      const n = Math.min(1000, rich.allMainAxioms.length);
      for (let i = 0; i < n; i += 1) {
        const ax = rich.allMainAxioms[i];
        const next = rich.allMainAxioms[(i + 1) % n];
        set.add(ax);
        perIndexChecks.push({
          hasAx: set.has(ax),
          eqSelf: ax.equals(ax),
          neqNext: !ax.equals(next),
          eqIgnoreAnnSelf: ax.equalsIgnoreAnnotations(ax),
        });
      }
      workloads["model.structuralEqualityAndSet"] = {
        setSize: set.size,
        sortedMembers: sortCanonical(set, canonicalizeOwlObject),
        perIndexChecks,
      };
    }

    {
      const extra = rich.df.getOWLAnnotation(
        rich.df.getRDFSLabel(),
        rich.df.getOWLLiteral("extra"),
      );
      const anns = [extra];
      const transforms = [];
      const n = Math.min(500, rich.allMainAxioms.length);
      for (let i = 0; i < n; i += 1) {
        const ax = rich.allMainAxioms[i];
        const annotated = ax.getAnnotatedAxiom(anns);
        const stripped = annotated.getAxiomWithoutAnnotations();
        transforms.push({
          annotated: canonicalizeOwlObject(annotated),
          stripped: canonicalizeOwlObject(stripped),
          equalsIgnoreAnnotations: stripped.equalsIgnoreAnnotations(ax),
        });
      }
      workloads["model.axiomAnnotationsTransform"] = { transforms };
    }

    {
      const objHandlers = Object.freeze(
        Object.fromEntries(OWL_OBJECT_KINDS.map((k) => [k, () => k])),
      );
      const axHandlers = Object.freeze(
        Object.fromEntries(AXIOM_KINDS.map((k) => [k, () => k])),
      );
      const ceHandlers = Object.freeze(
        Object.fromEntries(CLASS_EXPRESSION_KINDS.map((k) => [k, () => k])),
      );
      const objectVisitorKinds = [];
      const axiomVisitorKinds = [];
      const classExpressionVisitorKinds = [];
      const n = Math.min(500, rich.allMainAxioms.length);
      for (let i = 0; i < n; i += 1) {
        const ax = rich.allMainAxioms[i];
        objectVisitorKinds.push(dispatchOwlObject(ax, objHandlers));
        axiomVisitorKinds.push(dispatchAxiom(ax, axHandlers));
      }
      for (const ce of rich.complexExpressions) {
        classExpressionVisitorKinds.push(
          dispatchClassExpression(ce, ceHandlers),
        );
      }
      workloads["model.dispatch"] = {
        objectVisitorKinds,
        axiomVisitorKinds,
        classExpressionVisitorKinds,
      };
    }

    // 3. Parsing & Loading
    for (const [name, fmt] of Object.entries(FORMATS)) {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = await m.loadOntologyFromOntologyDocument(
        new StringDocumentSource(resolvedFixtures.syntaxTexts[name], {
          documentIRI: `urn:bench:load:${name}`,
          format: fmt,
        }),
      );
      workloads[`load.${name}`] = canonicalizeOntology(o);
    }

    {
      const m = createImportClosureManager();
      const root = await m.loadOntologyFromOntologyDocument(
        new StringDocumentSource(resolvedFixtures.importClosure.rootText, {
          documentIRI: resolvedFixtures.importClosure.rootIRI,
          format: OWLDocumentFormats.FUNCTIONAL,
        }),
      );
      const membersByIRI = {};
      for (const ont of m.getImportsClosure(root)) {
        const key = ont.getOntologyID().ontologyIRI?.value ?? "anonymous";
        membersByIRI[key] = canonicalizeOntology(ont);
      }
      workloads["load.importsClosure"] = {
        closureSize: Object.keys(membersByIRI).length,
        membersByIRI: Object.fromEntries(
          Object.entries(membersByIRI).sort(([a], [b]) => compareUtf16(a, b)),
        ),
      };
    }

    {
      const meta = rdfMetaManager
        .getOntologyFormat(rdfMetaOntology)
        .getOntologyLoaderMetaData();
      workloads["load.rdfParserMetaData"] = {
        tripleCount: meta.getTripleCount(),
        headerState: meta.getHeaderState(),
        unparsedTriples: sortCanonical(
          meta.getUnparsedTriples(),
          rdfTripleSnapshot,
        ),
        guessedDeclarations: sortCanonical(
          meta.getGuessedDeclarations(),
          ({ iri, entityType }) => [iri.value, entityType],
        ),
      };
    }

    // 4. Ontology Lifecycle & Mutations
    {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const df = m.getOWLDataFactory();
      const ontologyIRIs = [];
      let allLookupsIdentical = true;
      for (let i = 0; i < 100; i += 1) {
        const iri = IRI.create(`urn:bench:lifecycle#${i}`);
        const id = df.getOWLOntologyID(iri);
        const o = m.createOntology(id);
        if (m.getOntology(id) !== o) {
          allLookupsIdentical = false;
        }
        ontologyIRIs.push(iri.value);
      }
      ontologyIRIs.sort(compareUtf16);
      workloads["manager.createAndGetOntology"] = {
        createdCount: ontologyIRIs.length,
        allLookupsIdentical,
        ontologyIRIs,
      };
    }

    const bulk500 = rich.allMainAxioms.slice(0, 500);
    const single200 = rich.allMainAxioms.slice(0, 200);

    {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = m.createOntology(
        m.getOWLDataFactory().getOWLOntologyID(IRI.create("urn:bench:addbulk")),
      );
      m.addAxioms(o, bulk500);
      workloads["manager.addAxioms.bulk"] = canonicalizeOntology(o);
    }

    {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = m.createOntology(
        m
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:bench:addsingle")),
      );
      for (const ax of single200) {
        m.addAxiom(o, ax);
      }
      workloads["manager.addAxiom.singleLoop"] = canonicalizeOntology(o);
    }

    {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = m.createOntology(
        m.getOWLDataFactory().getOWLOntologyID(IRI.create("urn:bench:rembulk")),
      );
      m.addAxioms(o, bulk500);
      const afterAdd = canonicalizeOntology(o);
      m.removeAxioms(o, bulk500);
      const afterRemove = canonicalizeOntology(o);
      workloads["manager.removeAxioms.bulk"] = { afterAdd, afterRemove };
    }

    {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const o = m.createOntology(
        m
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:bench:remsingle")),
      );
      m.addAxioms(o, single200);
      const afterAdd = canonicalizeOntology(o);
      for (const ax of single200) {
        m.removeAxiom(o, ax);
      }
      const afterRemove = canonicalizeOntology(o);
      workloads["manager.removeAxiom.singleLoop"] = { afterAdd, afterRemove };
    }

    {
      const m = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const df = m.getOWLDataFactory();
      const o = m.createOntology(
        df.getOWLOntologyID(IRI.create("urn:bench:mixed")),
      );
      const changes = [];
      for (let i = 0; i < 80; i += 1) {
        changes.push(new AddAxiom(o, single200[i]));
      }
      for (let i = 0; i < 40; i += 1) {
        changes.push(new RemoveAxiom(o, single200[i]));
      }
      const ann = df.getOWLAnnotation(df.getRDFSLabel(), df.getOWLLiteral("v"));
      changes.push(new AddOntologyAnnotation(o, ann));
      changes.push(new RemoveOntologyAnnotation(o, ann));
      const imp = df.getOWLImportsDeclaration(IRI.create("urn:bench:imp"));
      changes.push(new AddImport(o, imp));
      changes.push(new RemoveImport(o, imp));
      changes.push(
        new SetOntologyID(
          o,
          df.getOWLOntologyID(IRI.create("urn:bench:mixed2")),
        ),
      );
      m.applyChanges(changes);
      workloads["manager.applyChanges.mixed"] = canonicalizeOntology(o);
    }

    {
      workloads["manager.getImportsClosure"] = {
        closureIDs: sortCanonical(
          closureManager.getImportsClosure(loadedClosureRoot),
          (ont) => canonicalOntologyId(ont.getOntologyID()),
        ),
      };
    }

    // 5. Ontology Queries - General & Signature
    workloads["ontology.getAxioms.excluded"] = {
      axioms: sortCanonical(
        rich.mainOntology.getAxioms(Imports.EXCLUDED),
        canonicalizeOwlObject,
      ),
      axiomCount: rich.mainOntology.getAxiomCount(Imports.EXCLUDED),
      annotations: sortCanonical(
        rich.mainOntology.getAnnotations(),
        canonicalizeOwlObject,
      ),
      imports: sortCanonical(
        rich.mainOntology.getImportsDeclarations(),
        canonicalImportsDecl,
      ),
      ontologyID: canonicalOntologyId(rich.mainOntology.getOntologyID()),
    };

    workloads["ontology.getAxioms.included"] = {
      axioms: sortCanonical(
        rich.mainOntology.getAxioms(Imports.INCLUDED),
        canonicalizeOwlObject,
      ),
      axiomCount: rich.mainOntology.getAxiomCount(Imports.INCLUDED),
    };

    workloads["ontology.getLogicalAxioms"] = {
      excluded: sortCanonical(
        rich.mainOntology.getLogicalAxioms(Imports.EXCLUDED),
        canonicalizeOwlObject,
      ),
      included: sortCanonical(
        rich.mainOntology.getLogicalAxioms(Imports.INCLUDED),
        canonicalizeOwlObject,
      ),
      excludedCount: rich.mainOntology.getLogicalAxiomCount(Imports.EXCLUDED),
      includedCount: rich.mainOntology.getLogicalAxiomCount(Imports.INCLUDED),
    };

    {
      const byType = {};
      for (const kind of AXIOM_KINDS) {
        byType[kind] = {
          excluded: sortCanonical(
            rich.mainOntology.getAxiomsByType(kind, Imports.EXCLUDED),
            canonicalizeOwlObject,
          ),
          included: sortCanonical(
            rich.mainOntology.getAxiomsByType(kind, Imports.INCLUDED),
            canonicalizeOwlObject,
          ),
          excludedCount: rich.mainOntology.getAxiomCount(
            kind,
            Imports.EXCLUDED,
          ),
          includedCount: rich.mainOntology.getAxiomCount(
            kind,
            Imports.INCLUDED,
          ),
        };
      }
      workloads["ontology.getAxiomsByType"] = { byType };
    }

    {
      const perAxiom = [];
      for (let i = 0; i < Math.min(200, rich.allMainAxioms.length); i += 1) {
        const ax = rich.allMainAxioms[i];
        perAxiom.push({
          exactExcl: rich.mainOntology.containsAxiom(
            ax,
            Imports.EXCLUDED,
            AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS,
          ),
          exactIncl: rich.mainOntology.containsAxiom(
            ax,
            Imports.INCLUDED,
            AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS,
          ),
          ignoreExcl: rich.mainOntology.containsAxiom(
            ax,
            Imports.EXCLUDED,
            AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS,
          ),
          ignoreIncl: rich.mainOntology.containsAxiom(
            ax,
            Imports.INCLUDED,
            AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS,
          ),
          matchingExcl: sortCanonical(
            rich.mainOntology.getAxiomsIgnoreAnnotations(ax, Imports.EXCLUDED),
            canonicalizeOwlObject,
          ),
          matchingIncl: sortCanonical(
            rich.mainOntology.getAxiomsIgnoreAnnotations(ax, Imports.INCLUDED),
            canonicalizeOwlObject,
          ),
        });
      }
      workloads["ontology.containsAxiom"] = { perAxiom };
    }

    {
      const sig = {};
      for (const [label, imp] of [
        ["EXCLUDED", Imports.EXCLUDED],
        ["INCLUDED", Imports.INCLUDED],
      ]) {
        sig[label] = {
          all: sortCanonical(
            rich.mainOntology.getSignature(imp),
            canonicalizeOwlObject,
          ),
          classes: sortCanonical(
            rich.mainOntology.getClassesInSignature(imp),
            canonicalizeOwlObject,
          ),
          objectProperties: sortCanonical(
            rich.mainOntology.getObjectPropertiesInSignature(imp),
            canonicalizeOwlObject,
          ),
          dataProperties: sortCanonical(
            rich.mainOntology.getDataPropertiesInSignature(imp),
            canonicalizeOwlObject,
          ),
          annotationProperties: sortCanonical(
            rich.mainOntology.getAnnotationPropertiesInSignature(imp),
            canonicalizeOwlObject,
          ),
          individuals: sortCanonical(
            rich.mainOntology.getIndividualsInSignature(imp),
            canonicalizeOwlObject,
          ),
          datatypes: sortCanonical(
            rich.mainOntology.getDatatypesInSignature(imp),
            canonicalizeOwlObject,
          ),
        };
      }
      workloads["ontology.getSignature"] = sig;
    }

    {
      const perClass = [];
      for (let i = 0; i < RICH_COUNT; i += 1) {
        const c = rich.classes[i];
        const iri = c.iri;
        perClass.push({
          entitiesExcl: sortCanonical(
            rich.mainOntology.getEntitiesInSignature(iri, Imports.EXCLUDED),
            canonicalizeOwlObject,
          ),
          entitiesIncl: sortCanonical(
            rich.mainOntology.getEntitiesInSignature(iri, Imports.INCLUDED),
            canonicalizeOwlObject,
          ),
          containsClassExcl: rich.mainOntology.containsEntityInSignature(
            c,
            Imports.EXCLUDED,
          ),
          containsIriIncl: rich.mainOntology.containsEntityInSignature(
            iri,
            Imports.INCLUDED,
          ),
        });
      }
      workloads["ontology.entitySignatureLookups"] = {
        perClass,
        punnedExcl: sortCanonical(
          rich.mainOntology.getPunnedIRIs(Imports.EXCLUDED),
          canonicalizeOwlObject,
        ),
        punnedIncl: sortCanonical(
          rich.mainOntology.getPunnedIRIs(Imports.INCLUDED),
          canonicalizeOwlObject,
        ),
        anonExcl: sortCanonical(
          rich.mainOntology.getReferencedAnonymousIndividuals(Imports.EXCLUDED),
          canonicalizeOwlObject,
        ),
        anonIncl: sortCanonical(
          rich.mainOntology.getReferencedAnonymousIndividuals(Imports.INCLUDED),
          canonicalizeOwlObject,
        ),
      };
    }

    {
      const perClass = [];
      for (let i = 0; i < 50; i += 1) {
        const c = rich.classes[i];
        perClass.push({
          excluded: sortCanonical(
            rich.mainOntology.getReferencingAxioms(c, Imports.EXCLUDED),
            canonicalizeOwlObject,
          ),
          included: sortCanonical(
            rich.mainOntology.getReferencingAxioms(c, Imports.INCLUDED),
            canonicalizeOwlObject,
          ),
        });
      }
      workloads["ontology.getReferencingAxioms"] = { perClass };
    }

    // 6. Ontology Queries - Specific Axiom Indexes
    workloads["ontology.classAxiomIndexes"] = {
      perIndex: rich.classes.map((c, i) => {
        const d = rich.superClasses[i];
        return {
          subForSub: sortCanonical(
            rich.mainOntology.getSubClassAxiomsForSubClass(c),
            canonicalizeOwlObject,
          ),
          subForSuper: sortCanonical(
            rich.mainOntology.getSubClassAxiomsForSuperClass(d),
            canonicalizeOwlObject,
          ),
          equivalent: sortCanonical(
            rich.mainOntology.getEquivalentClassesAxioms(c),
            canonicalizeOwlObject,
          ),
          disjoint: sortCanonical(
            rich.mainOntology.getDisjointClassesAxioms(c),
            canonicalizeOwlObject,
          ),
        };
      }),
    };

    workloads["ontology.objectPropertyAxiomIndexes"] = {
      perIndex: rich.objectProps.map((op, i) => {
        const q = rich.superObjectProps[i];
        return {
          subForSub: sortCanonical(
            rich.mainOntology.getObjectSubPropertyAxiomsForSubProperty(op),
            canonicalizeOwlObject,
          ),
          subForSuper: sortCanonical(
            rich.mainOntology.getObjectSubPropertyAxiomsForSuperProperty(q),
            canonicalizeOwlObject,
          ),
          domain: sortCanonical(
            rich.mainOntology.getObjectPropertyDomainAxioms(op),
            canonicalizeOwlObject,
          ),
          range: sortCanonical(
            rich.mainOntology.getObjectPropertyRangeAxioms(op),
            canonicalizeOwlObject,
          ),
          inverse: sortCanonical(
            rich.mainOntology.getInverseObjectPropertyAxioms(op),
            canonicalizeOwlObject,
          ),
          functional: sortCanonical(
            rich.mainOntology.getFunctionalObjectPropertyAxioms(op),
            canonicalizeOwlObject,
          ),
          inverseFunctional: sortCanonical(
            rich.mainOntology.getInverseFunctionalObjectPropertyAxioms(op),
            canonicalizeOwlObject,
          ),
          symmetric: sortCanonical(
            rich.mainOntology.getSymmetricObjectPropertyAxioms(op),
            canonicalizeOwlObject,
          ),
          asymmetric: sortCanonical(
            rich.mainOntology.getAsymmetricObjectPropertyAxioms(q),
            canonicalizeOwlObject,
          ),
          reflexive: sortCanonical(
            rich.mainOntology.getReflexiveObjectPropertyAxioms(op),
            canonicalizeOwlObject,
          ),
          irreflexive: sortCanonical(
            rich.mainOntology.getIrreflexiveObjectPropertyAxioms(q),
            canonicalizeOwlObject,
          ),
          transitive: sortCanonical(
            rich.mainOntology.getTransitiveObjectPropertyAxioms(q),
            canonicalizeOwlObject,
          ),
        };
      }),
    };

    workloads["ontology.dataPropertyAxiomIndexes"] = {
      perIndex: rich.dataProps.map((dp, i) => {
        const dp2 = rich.superDataProps[i];
        return {
          subForSub: sortCanonical(
            rich.mainOntology.getDataSubPropertyAxiomsForSubProperty(dp),
            canonicalizeOwlObject,
          ),
          subForSuper: sortCanonical(
            rich.mainOntology.getDataSubPropertyAxiomsForSuperProperty(dp2),
            canonicalizeOwlObject,
          ),
          domain: sortCanonical(
            rich.mainOntology.getDataPropertyDomainAxioms(dp),
            canonicalizeOwlObject,
          ),
          range: sortCanonical(
            rich.mainOntology.getDataPropertyRangeAxioms(dp),
            canonicalizeOwlObject,
          ),
          functional: sortCanonical(
            rich.mainOntology.getFunctionalDataPropertyAxioms(dp),
            canonicalizeOwlObject,
          ),
        };
      }),
    };

    workloads["ontology.annotationAndDeclarationIndexes"] = {
      perIndex: rich.classes.map((c, i) => {
        const ap = rich.annProps[i];
        return {
          declaration: sortCanonical(
            rich.mainOntology.getDeclarationAxioms(c),
            canonicalizeOwlObject,
          ),
          annAssertionExcl: sortCanonical(
            rich.mainOntology.getAnnotationAssertionAxioms(
              c.iri,
              Imports.EXCLUDED,
            ),
            canonicalizeOwlObject,
          ),
          annAssertionIncl: sortCanonical(
            rich.mainOntology.getAnnotationAssertionAxioms(
              c.iri,
              Imports.INCLUDED,
            ),
            canonicalizeOwlObject,
          ),
          subAnn: sortCanonical(
            rich.mainOntology.getSubAnnotationPropertyOfAxioms(ap),
            canonicalizeOwlObject,
          ),
          annDomain: sortCanonical(
            rich.mainOntology.getAnnotationPropertyDomainAxioms(ap),
            canonicalizeOwlObject,
          ),
          annRange: sortCanonical(
            rich.mainOntology.getAnnotationPropertyRangeAxioms(ap),
            canonicalizeOwlObject,
          ),
        };
      }),
    };

    workloads["ontology.individualAssertionIndexes"] = {
      perIndex: rich.classes.map((c, i) => {
        const ind = rich.individuals[i];
        return {
          classByInd: sortCanonical(
            rich.mainOntology.getClassAssertionAxioms(ind),
            canonicalizeOwlObject,
          ),
          classByClass: sortCanonical(
            rich.mainOntology.getClassAssertionAxioms(c),
            canonicalizeOwlObject,
          ),
          objProp: sortCanonical(
            rich.mainOntology.getObjectPropertyAssertionAxioms(ind),
            canonicalizeOwlObject,
          ),
          dataProp: sortCanonical(
            rich.mainOntology.getDataPropertyAssertionAxioms(ind),
            canonicalizeOwlObject,
          ),
          negObjProp: sortCanonical(
            rich.mainOntology.getNegativeObjectPropertyAssertionAxioms(ind),
            canonicalizeOwlObject,
          ),
          negDataProp: sortCanonical(
            rich.mainOntology.getNegativeDataPropertyAssertionAxioms(ind),
            canonicalizeOwlObject,
          ),
          sameInd: sortCanonical(
            rich.mainOntology.getSameIndividualAxioms(ind),
            canonicalizeOwlObject,
          ),
          diffInd: sortCanonical(
            rich.mainOntology.getDifferentIndividualAxioms(ind),
            canonicalizeOwlObject,
          ),
        };
      }),
    };

    // 7. Storage / Serialization
    for (const name of SAVE_FORMATS) {
      const fmt = FORMATS[name];
      const sourceBefore = canonicalizeOntology(saveOntology);
      const target = new StringDocumentTarget();
      await saveManager.saveOntology(saveOntology, fmt, target);
      const text = target.toString();
      savedTexts[name] = text;
      if (saveDirectory) {
        writeFileSync(
          join(saveDirectory, `${behaviorProfileId}-${name}.txt`),
          text,
          "utf8",
        );
      }
      const reloadMgr = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      });
      const reloaded = await reloadMgr.loadOntologyFromOntologyDocument(
        new StringDocumentSource(text, {
          documentIRI: `urn:bench:save:reload:${name}`,
          format: fmt,
        }),
      );
      workloads[`save.${name}`] = {
        sourceBefore,
        sourceAfter: canonicalizeOntology(saveOntology),
        ownReload: canonicalizeOntology(reloaded),
      };
    }

    // 8. EntitySearcher
    const searchOntologies = [rich.mainOntology, rich.importedOntology];
    workloads["search.classHierarchyAndRelations"] = {
      perIndex: rich.classes.map((c, i) => {
        const d = rich.superClasses[i];
        return {
          superClasses: sortCanonical(
            EntitySearcher.getSuperClasses(c, searchOntologies),
            canonicalizeOwlObject,
          ),
          subClasses: sortCanonical(
            EntitySearcher.getSubClasses(d, searchOntologies),
            canonicalizeOwlObject,
          ),
          equivalentClasses: sortCanonical(
            EntitySearcher.getEquivalentClasses(c, searchOntologies),
            canonicalizeOwlObject,
          ),
          disjointClasses: sortCanonical(
            EntitySearcher.getDisjointClasses(c, searchOntologies),
            canonicalizeOwlObject,
          ),
        };
      }),
    };

    workloads["search.propertyHierarchyAndDomainsRanges"] = {
      perIndex: rich.objectProps.map((op, i) => {
        const q = rich.superObjectProps[i];
        const dp = rich.dataProps[i];
        return {
          superObjProps: sortCanonical(
            EntitySearcher.getSuperProperties(op, searchOntologies),
            canonicalizeOwlObject,
          ),
          subObjProps: sortCanonical(
            EntitySearcher.getSubProperties(q, searchOntologies),
            canonicalizeOwlObject,
          ),
          objDomains: sortCanonical(
            EntitySearcher.getDomains(op, searchOntologies),
            canonicalizeOwlObject,
          ),
          objRanges: sortCanonical(
            EntitySearcher.getRanges(op, searchOntologies),
            canonicalizeOwlObject,
          ),
          inverses: sortCanonical(
            EntitySearcher.getInverses(op, searchOntologies),
            canonicalizeOwlObject,
          ),
          dataDomains: sortCanonical(
            EntitySearcher.getDomains(dp, searchOntologies),
            canonicalizeOwlObject,
          ),
          dataRanges: sortCanonical(
            EntitySearcher.getRanges(dp, searchOntologies),
            canonicalizeOwlObject,
          ),
        };
      }),
    };

    {
      const rdfsLabel = rich.df.getRDFSLabel();
      workloads["search.annotations"] = {
        perIndex: rich.classes.map((c) => ({
          annotationAssertionAxioms: sortCanonical(
            EntitySearcher.getAnnotationAssertionAxioms(c, rich.mainOntology),
            canonicalizeOwlObject,
          ),
          annotationsMain: sortCanonical(
            EntitySearcher.getAnnotations(c, rich.mainOntology),
            canonicalizeOwlObject,
          ),
          annotationsLabelStream: sortCanonical(
            EntitySearcher.getAnnotations(c, searchOntologies, rdfsLabel),
            canonicalizeOwlObject,
          ),
          annotationObjectsMain: sortCanonical(
            EntitySearcher.getAnnotationObjects(c, rich.mainOntology),
            canonicalizeOwlObject,
          ),
          annotationObjectsLabelStream: sortCanonical(
            EntitySearcher.getAnnotationObjects(c, searchOntologies, rdfsLabel),
            canonicalizeOwlObject,
          ),
        })),
      };
    }

    workloads["search.propertyCharacteristics"] = {
      perIndex: rich.objectProps.map((op, i) => {
        const q = rich.superObjectProps[i];
        const dp = rich.dataProps[i];
        return {
          isFunctionalObject: EntitySearcher.isFunctional(op, searchOntologies),
          isFunctionalData: EntitySearcher.isFunctional(dp, searchOntologies),
          isInverseFunctional: EntitySearcher.isInverseFunctional(
            op,
            searchOntologies,
          ),
          isTransitive: EntitySearcher.isTransitive(q, searchOntologies),
          isSymmetric: EntitySearcher.isSymmetric(op, searchOntologies),
          isAsymmetric: EntitySearcher.isAsymmetric(q, searchOntologies),
          isReflexive: EntitySearcher.isReflexive(op, searchOntologies),
          isIrreflexive: EntitySearcher.isIrreflexive(q, searchOntologies),
        };
      }),
    };

    // 9. Utilities
    {
      const sfp = new SimpleShortFormProvider({ behaviorProfileId });
      workloads["util.SimpleShortFormProvider"] = {
        perIndex: rich.classes.map((c, i) => [
          sfp.getShortForm(c),
          sfp.getShortForm(rich.objectProps[i]),
          sfp.getShortForm(rich.individuals[i]),
        ]),
      };
      sfp.dispose();
    }

    {
      const rdfsLabel = rich.df.getRDFSLabel();
      const langMap = new Map([[rdfsLabel, ["en", "fr"]]]);
      const setProvider = new OWLOntologyImportsClosureSetProvider(
        rich.manager,
        rich.mainOntology,
      );
      const avsfp = new AnnotationValueShortFormProvider(
        [rdfsLabel],
        langMap,
        setProvider,
        new SimpleShortFormProvider({ behaviorProfileId }),
        { behaviorProfileId },
      );
      workloads["util.AnnotationValueShortFormProvider"] = {
        perIndex: rich.classes.map((c) => avsfp.getShortForm(c)),
      };
      avsfp.dispose();
    }

    {
      const provider = new OWLOntologyImportsClosureSetProvider(
        closureManager,
        loadedClosureRoot,
      );
      workloads["util.OWLOntologyImportsClosureSetProvider"] = {
        closureIDs: sortCanonical(provider.ontologies(), (ont) =>
          canonicalOntologyId(ont.getOntologyID()),
        ),
      };
    }

    {
      const provider = new OWLOntologyImportsClosureSetProvider(
        closureManager,
        loadedClosureRoot,
      );
      const dest = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const merged1 = new OWLOntologyMerger(
        provider,
        false,
      ).createMergedOntology(dest, IRI.create("urn:bench:merged:all"));
      const merged2 = new OWLOntologyMerger(
        provider,
        true,
      ).createMergedOntology(dest, IRI.create("urn:bench:merged:logical"));
      workloads["util.OWLOntologyMerger"] = {
        mergedAll: canonicalizeOntology(merged1),
        mergedLogical: canonicalizeOntology(merged2),
      };
    }

    {
      const entityMap = new Map([
        [rich.classes[0], IRI.create("urn:bench:dup#C0")],
      ]);
      const dup = new OWLObjectDuplicator(entityMap, rich.manager);
      const copies = [];
      for (let i = 0; i < Math.min(500, rich.allMainAxioms.length); i += 1) {
        copies.push(
          canonicalizeOwlObject(dup.duplicateObject(rich.allMainAxioms[i])),
        );
      }
      workloads["util.OWLObjectDuplicator"] = { copies };
    }

    {
      const renamer = new OWLEntityRenamer(utilManager, [utilOntology]);
      const perTarget = [];
      for (let i = 0; i < 10; i += 1) {
        const target = utilDf.getOWLClass(IRI.create(`urn:bench:util#C${i}`));
        const replacement = IRI.create(`urn:bench:util#RenamedC${i}`);
        perTarget.push({
          targetIRI: target.iri.value,
          byEntity: sortCanonical(
            renamer.changeIRI(target, replacement),
            canonicalizeOntologyChange,
          ),
          byIri: sortCanonical(
            renamer.changeIRI(target.iri, replacement),
            canonicalizeOntologyChange,
          ),
        });
      }
      workloads["util.OWLEntityRenamer"] = { perTarget };
    }

    {
      const remover = new OWLEntityRemover([utilOntology]);
      for (let i = 0; i < 20; i += 1) {
        remover.visit(utilDf.getOWLClass(IRI.create(`urn:bench:util#C${i}`)));
        remover.visit(
          utilDf.getOWLObjectProperty(IRI.create(`urn:bench:util#op${i}`)),
        );
      }
      const changes = sortCanonical(
        remover.getChanges(),
        canonicalizeOntologyChange,
      );
      remover.reset();
      workloads["util.OWLEntityRemover"] = {
        changes,
        afterResetCount: remover.getChanges().length,
      };
    }

    // 10. Manchester Object Renderer
    {
      const renderer = new ManchesterOWLSyntaxOWLObjectRendererImpl({
        behaviorProfileId,
      });
      renderer.setShortFormProvider(
        new SimpleShortFormProvider({ behaviorProfileId }),
      );
      const axioms = [];
      for (let i = 0; i < Math.min(300, rich.allMainAxioms.length); i += 1) {
        axioms.push(renderer.render(rich.allMainAxioms[i]));
      }
      workloads["renderer.ManchesterOWLSyntaxOWLObjectRendererImpl"] = {
        axioms,
        complexExpressions: rich.complexExpressions.map((ce) =>
          renderer.render(ce),
        ),
      };
    }

    // 11. Modularity / Locality
    for (const [modeName, modeValue] of [
      ["BOTTOM", LocalityClass.BOTTOM],
      ["TOP", LocalityClass.TOP],
      ["STAR", LocalityClass.STAR],
    ]) {
      const extractor = new SyntacticLocalityModuleExtractor(
        modeValue,
        utilAxioms,
        { behaviorProfileId },
      );
      const extracted = await extractor.extract(utilSeedEntities);
      workloads[`locality.extract.${modeName}`] = {
        seedEntities: sortCanonical(utilSeedEntities, canonicalizeOwlObject),
        extracted: sortCanonical(extracted, canonicalizeOwlObject),
        axiomBase: sortCanonical(extractor.axiomBase(), canonicalizeOwlObject),
        containsFirst: extractor.containsAxiom(utilAxioms[0]),
      };
    }

    // 12. OWL 2 Language Profiles
    {
      const inputOntology = canonicalizeOntology(profileOntology);
      for (const [name, profile] of [
        ["OWL2DLProfile", new OWL2DLProfile({ behaviorProfileId })],
        ["OWL2ELProfile", new OWL2ELProfile({ behaviorProfileId })],
        ["OWL2QLProfile", new OWL2QLProfile({ behaviorProfileId })],
        ["OWL2RLProfile", new OWL2RLProfile({ behaviorProfileId })],
      ]) {
        const report = await profile.checkOntology(profileOntology);
        workloads[`profiles.${name}.checkOntology`] = {
          inputOntology,
          report: canonicalizeProfileReport(report),
        };
      }
    }

    return { behaviorProfileId, workloads, savedTexts };
  } finally {
    if (ownsFixtures) {
      resolvedFixtures.cleanup();
    }
  }
}

/** Verify all 70 public API benchmark workloads across Java OWLAPI 5.5.1 and both JS profiles. */
export async function verifyBenchmarkApiSemantics({
  classpathFile,
  mavenDirectory,
  cacheDirectory,
  javaHome,
  javaSelection,
  javaBuildCacheDirectory,
  syntaxCount = 100,
  importClosureCount = 8,
  filterIds = null,
  fixtures: sharedFixtures,
  publicApi,
  javaHeapMiB,
}) {
  assert(javaHome, "javaHome is required");
  javaHome = resolve(javaHome);
  const { jars, identity: oracle } = await admitReleasedClasspath({
    classpathFile: classpathFile ? resolve(classpathFile) : undefined,
    mavenDirectory: mavenDirectory ? resolve(mavenDirectory) : undefined,
    cacheDirectory: cacheDirectory ? resolve(cacheDirectory) : undefined,
  });
  const classpath = jars.join(delimiter);
  const jdk = observeSelectedJavaJdk(
    javaHome,
    javaSelection === undefined
      ? undefined
      : javaToolchainSelection(javaSelection),
  );
  const api = publicApi ?? (await loadBenchmarkApi());
  const { OWLManager, StringDocumentSource } = api;
  const FORMATS = benchmarkFormats(api.OWLDocumentFormats);
  const fixtures =
    sharedFixtures ??
    prepareSharedFixtureDirectory({ syntaxCount, importClosureCount });
  const scratch = mkdtempSync(join(tmpdir(), "owlapi-api-semantics-"));
  let compiledClassDirectory = scratch;
  let helperBuild = {
    cacheStatus: "uncached",
    buildKey: null,
    manifestSha256: null,
  };

  const native = (program, args) => {
    const env = javaProcessEnvironment();
    const pathKey =
      Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
    env[pathKey] = `${join(javaHome, "bin")}${delimiter}${env[pathKey] ?? ""}`;
    const result = spawnSync(
      program === "java" ? jdk.javaPath : jdk.javacPath,
      [
        `${program === "javac" ? "-J" : ""}-Djava.io.tmpdir=${scratch}`,
        `${program === "javac" ? "-J" : ""}-XX:ErrorFile=${join(scratch, "hs_err_pid%p.log")}`,
        ...(program === "java" && javaHeapMiB !== undefined
          ? ["-Xmx" + javaHeapMiB + "m"]
          : []),
        ...args,
      ],
      {
        cwd: ROOT_DIR,
        encoding: "utf8",
        timeout: 180000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        env,
      },
    );
    if (result.error) {
      throw result.error;
    }
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };

  try {
    const buildCacheDir = resolveJavaHelperBuildCacheDirectory(
      javaBuildCacheDirectory ??
        (cacheDirectory
          ? join(cacheDirectory, "java-helper-builds")
          : undefined),
    );
    if (buildCacheDir) {
      const cached = await ensureCachedJavaHelperBuild({
        cacheDirectory: buildCacheDir,
        compilerIdentity: jdk.identity,
        compilerOptions: ["-encoding", "UTF-8"],
        oracleSources: [join(ROOT_DIR, HARNESS_PATH)],
        classpathEntries: jars,
        requiredOutputs: ["VerifyBenchmarkApiSemantics.class"],
        compileIntoDirectory: async (stagingClasses) => {
          native("javac", [
            "-encoding",
            "UTF-8",
            "-cp",
            classpath,
            "-d",
            stagingClasses,
            join(ROOT_DIR, HARNESS_PATH),
          ]);
          return { stderr: "" };
        },
      });
      compiledClassDirectory = cached.compiledOracleDirectory;
      helperBuild = {
        cacheStatus: cached.cacheStatus,
        buildKey: cached.buildKey,
        manifestSha256: cached.manifestSha256,
      };
    } else {
      native("javac", [
        "-encoding",
        "UTF-8",
        "-cp",
        classpath,
        "-d",
        scratch,
        join(ROOT_DIR, HARNESS_PATH),
      ]);
    }

    const saveDir = join(scratch, "saves");
    mkdirSync(saveDir, { recursive: true });
    const observeSpecPath = join(scratch, "observe-spec.json");
    const observeOutPath = join(scratch, "java-observe.json");
    writeFileSync(
      observeSpecPath,
      canonicalJson({
        mode: "observe",
        outputPath: observeOutPath,
        saveDirectory: saveDir,
        fixturesDirectory: fixtures.fixturesDir,
        importClosure: {
          rootIRI: fixtures.importClosure.rootIRI,
          files: fixtures.importClosure.files,
        },
      }),
      "utf8",
    );
    native("java", [
      "-cp",
      `${compiledClassDirectory}${delimiter}${classpath}`,
      "VerifyBenchmarkApiSemantics",
      observeSpecPath,
    ]);
    const javaObserved = JSON.parse(readFileSync(observeOutPath, "utf8"));

    const jsObservedByProfile = {};
    const reloadDocs = [];
    for (const profile of BEHAVIOR_PROFILES) {
      const observed = await observeJsApiSemantics(profile, {
        fixtures,
        syntaxCount,
        importClosureCount,
        saveDirectory: saveDir,
        publicApi: api,
      });
      jsObservedByProfile[profile] = observed;
      for (const name of SAVE_FORMATS) {
        reloadDocs.push({
          id: `${profile}:${name}`,
          format: name,
          path: join(saveDir, `${profile}-${name}.txt`),
          documentIRI: `urn:bench:save:cross-reload:${profile}:${name}`,
        });
      }
    }

    const reloadSpecPath = join(scratch, "reload-spec.json");
    const reloadOutPath = join(scratch, "java-reload.json");
    writeFileSync(
      reloadSpecPath,
      canonicalJson({
        mode: "reload",
        outputPath: reloadOutPath,
        documents: reloadDocs,
      }),
      "utf8",
    );
    native("java", [
      "-cp",
      `${compiledClassDirectory}${delimiter}${classpath}`,
      "VerifyBenchmarkApiSemantics",
      reloadSpecPath,
    ]);
    const javaReloads = JSON.parse(readFileSync(reloadOutPath, "utf8")).reloads;

    const jsLoadedJavaSaves = {};
    for (const profile of BEHAVIOR_PROFILES) {
      jsLoadedJavaSaves[profile] = {};
      for (const name of SAVE_FORMATS) {
        const text = readFileSync(join(saveDir, `java-${name}.txt`), "utf8");
        const mgr = OWLManager.createOWLOntologyManager({
          behaviorProfileId: profile,
        });
        try {
          const reloaded = await mgr.loadOntologyFromOntologyDocument(
            new StringDocumentSource(text, {
              documentIRI: `urn:bench:save:js-reload-java:${profile}:${name}`,
              format: FORMATS[name],
            }),
          );
          jsLoadedJavaSaves[profile][name] = canonicalizeOntology(reloaded);
        } catch (error) {
          jsLoadedJavaSaves[profile][name] = {
            reloadError: {
              name: error?.name ?? "Error",
              code: error?.code ?? null,
              message: String(error?.message ?? error),
            },
          };
        }
      }
    }

    const selectedDefinitions =
      filterIds && filterIds.length > 0
        ? BENCHMARK_DEFINITIONS.filter((def) => filterIds.includes(def.id))
        : BENCHMARK_DEFINITIONS;
    const rows = [];
    for (const def of selectedDefinitions) {
      const groupId = def.id;
      const javaObs = javaObserved.workloads[groupId];
      for (const profile of BEHAVIOR_PROFILES) {
        const jsObs = jsObservedByProfile[profile].workloads[groupId];
        const saveMatch = groupId.startsWith("save.")
          ? groupId.slice("save.".length)
          : null;
        const loadMatch =
          groupId.startsWith("load.") &&
          !["importsClosure", "rdfParserMetaData"].includes(
            groupId.slice("load.".length),
          )
            ? groupId.slice("load.".length)
            : null;
        const verdict = classifyApiWorkloadRow({
          groupId,
          behaviorProfileId: profile,
          javaObservation: javaObs,
          jsObservation: jsObs,
          expectedLoadOntology: loadMatch
            ? expectedGeneratedLoadWorkload(loadMatch, syntaxCount)
            : undefined,
          crossRuntimeReloads: saveMatch
            ? {
                jsLoadedJavaSave: jsLoadedJavaSaves[profile][saveMatch],
                jsCompatibleLoadedJavaSave:
                  jsLoadedJavaSaves["java-owlapi-5.5.1"][saveMatch],
                javaLoadedJsSave: javaReloads[`${profile}:${saveMatch}`],
              }
            : undefined,
        });
        rows.push({
          groupId,
          behaviorProfileId: profile,
          category: def.category,
          ...verdict,
        });
      }
    }

    const summary = {
      totalRows: rows.length,
      passed: rows.filter((r) => r.status === "passed").length,
      observed: rows.filter((r) => r.status === "observed").length,
      failed: rows.filter((r) => r.status === "failed").length,
      independentlyWitnessed: rows.filter(
        (r) => r.admission === "independently-witnessed",
      ).length,
      knownBehavioralDifference: rows.filter(
        (r) => r.admission === "known-behavioral-difference",
      ).length,
      unequalWork: rows.filter((r) => r.admission === "unequal-work").length,
    };

    const inputDigests = {
      "rdf-metadata": sha256(
        Buffer.from(fixtures.syntaxTexts["rdf-metadata"], "utf8"),
      ),
      ...Object.fromEntries(
        SAVE_FORMATS.map((name) => [
          `java-save.${name}`,
          sha256(readFileSync(join(saveDir, `java-${name}.txt`))),
        ]),
      ),
      ...Object.fromEntries(
        BEHAVIOR_PROFILES.flatMap((profile) =>
          SAVE_FORMATS.map((name) => [
            `${profile}-save.${name}`,
            sha256(readFileSync(join(saveDir, `${profile}-${name}.txt`))),
          ]),
        ),
      ),
    };

    return {
      schemaVersion: API_SEMANTICS_SCHEMA_VERSION,
      scope:
        "Untimed full 70-group canonical structural AST equivalence witness across Java OWLAPI 5.5.1 and both JS behavior profiles.",
      syntaxCount,
      importClosureCount,
      java: jdk.identity,
      helperBuild,
      classpathLockSha256: oracle.lockSha256,
      harnessSha256: sha256(readFileSync(join(ROOT_DIR, HARNESS_PATH))),
      sinkSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      fixtureGeneratorSha256: sha256(
        readFileSync(
          join(ROOT_DIR, "util/generate-owlapi-benchmark-fixtures.cjs"),
        ),
      ),
      inputSha256: inputDigests,
      summary,
      rows,
    };
  } finally {
    if (!sharedFixtures) fixtures.cleanup();
    rmSync(scratch, { recursive: true, force: true });
  }
}
