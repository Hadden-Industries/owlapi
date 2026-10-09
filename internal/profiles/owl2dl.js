import { parseIri } from "@hyperjump/uri";
import { ResourceLimitError } from "../../io/errors.js";
import { ENTITY_KINDS, OWLObjectKind as K } from "../../model/kinds.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import {
  readProfileClosure,
  readSourceEvidence,
} from "../model/sourceEvidence.js";
import { readSourceArity } from "../model/sourceArity.js";
import { minimumTwoSetFields } from "../model/setConstructs.js";
import {
  OWL_NAMESPACE as OWL,
  RDF_NAMESPACE as RDF,
  RDFS_NAMESPACE as RDFS,
  XSD_NAMESPACE as XSD,
} from "../rdfjs/vocabulary.js";
import { createProfileBudget } from "./budget.js";
import { inspectProfileRules } from "./profileRules.js";
import { inspectLiteral, isBuiltinDatatype } from "./datatypes.js";
import { inspectFacet } from "./facets.js";
import {
  inspectPropertyHierarchy,
  propertyKey,
  reachable,
} from "./propertyHierarchy.js";
import { inspectAnonymousGraph } from "./anonymousIndividuals.js";
import { inspectSourceStructure } from "./sourceStructure.js";
import {
  createStructuralValidator,
  validateStructuralShape,
  StructuralValidationError,
} from "../model/structuralValidation.js";

const entityKinds = new Set(ENTITY_KINDS);
const propertyKinds = [
  K.OBJECT_PROPERTY,
  K.DATA_PROPERTY,
  K.ANNOTATION_PROPERTY,
];
const reserved = (iri) =>
  [OWL, RDF, RDFS, XSD].some((namespace) => iri.startsWith(namespace));
const permitted = new Map([
  [K.CLASS, new Set([OWL + "Thing", OWL + "Nothing"])],
  [
    K.OBJECT_PROPERTY,
    new Set([OWL + "topObjectProperty", OWL + "bottomObjectProperty"]),
  ],
  [
    K.DATA_PROPERTY,
    new Set([OWL + "topDataProperty", OWL + "bottomDataProperty"]),
  ],
  [
    K.ANNOTATION_PROPERTY,
    new Set([
      ...["label", "comment", "seeAlso", "isDefinedBy"].map(
        (value) => RDFS + value,
      ),
      ...[
        "deprecated",
        "versionInfo",
        "priorVersion",
        "backwardCompatibleWith",
        "incompatibleWith",
      ].map((value) => OWL + value),
    ]),
  ],
]);
const builtin = (value) =>
  value.kind === K.DATATYPE
    ? isBuiltinDatatype(value.iri.value)
    : Boolean(permitted.get(value.kind)?.has(value.iri.value));
const needsSimple = new Set([
  K.OBJECT_MIN_CARDINALITY,
  K.OBJECT_MAX_CARDINALITY,
  K.OBJECT_EXACT_CARDINALITY,
  K.OBJECT_HAS_SELF,
  K.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
  K.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
  K.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
  K.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
  K.DISJOINT_OBJECT_PROPERTIES_AXIOM,
]);
const forbidsAnonymous = new Set([
  K.SAME_INDIVIDUAL_AXIOM,
  K.DIFFERENT_INDIVIDUALS_AXIOM,
  K.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
  K.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
  K.OBJECT_ONE_OF,
  K.OBJECT_HAS_VALUE,
]);
const statusOf = (violations, unresolved) =>
  violations.length ? "invalid" : unresolved.length ? "unverified" : "valid";
const frozen = (entries) =>
  Object.freeze(entries.map((entry) => Object.freeze(entry)));

const checkModel = async (
  ontology,
  budget,
  closure,
  members,
  includeSource,
  profile,
) => {
  const violations = [],
    unverified = [],
    qualifications = [];
  const violate = (code, detail = {}, qualified = false) => {
    const entry = { code, ...detail };
    violations.push(entry);
    if (qualified) qualifications.push(entry);
  };
  const unresolved = (code, detail = {}) =>
    unverified.push({ code, ...detail });
  if (!closure.complete) unresolved("IMPORT_CLOSURE_INCOMPLETE");
  const axioms = [],
    nodes = [],
    anonymous = [];
  const declarations = new Set(),
    entities = new Map(),
    definitions = new Map(),
    datatypeDependencies = new Map();
  try {
    const sourceRoots = includeSource
      ? await inspectSourceStructure(members, budget, violate)
      : new Map();
    for (const member of members) {
      const { snapshot, scope } = member;
      for (const axiom of snapshot.directAxioms) {
        await budget.checkpoint();
        axioms.push({ value: axiom, scope });
      }
      const pending = [
        snapshot.ontologyID,
        snapshot.authoredImportDeclarations,
        snapshot.directOntologyAnnotations,
        snapshot.directAxioms,
        ...(sourceRoots.get(scope) ?? []),
      ].map((value) => ({ value, depth: 0 }));
      while (pending.length) {
        await budget.checkpoint();
        const entry = pending.pop(),
          value = entry.value;
        if (!value || typeof value !== "object") continue;
        budget.depth(entry.depth);
        validateStructuralShape(value);
        if (Array.isArray(value)) {
          for (const child of value) {
            budget.check();
            pending.push({ ...entry, value: child, depth: entry.depth + 1 });
          }
          continue;
        }
        const node = {
          ...entry,
          scope,
          value,
          sourceVerified: member.status === "verified",
        };
        nodes.push(node);
        if (
          value.kind === K.LITERAL &&
          typeof value.lexicalForm === "string" &&
          value.lexicalForm.length > budget.configuration.maxLiteralLength
        )
          throw new ResourceLimitError(
            "Literal validation size limit exceeded",
            {
              resource: "profileLiteralLength",
              limit: budget.configuration.maxLiteralLength,
            },
          );
        for (const [field, child] of Object.entries(value)) {
          if (!child || typeof child !== "object") continue;
          pending.push({
            value: child,
            parent: value,
            field,
            annotationContext:
              entry.annotationContext ||
              value.kind === K.ANNOTATION ||
              (value.kind === K.ANNOTATION_ASSERTION_AXIOM &&
                field === "value"),
            depth: entry.depth + 1,
            anonymousForbidden:
              entry.anonymousForbidden ??
              (forbidsAnonymous.has(value.kind) ? value.kind : undefined),
            definition:
              value.kind === K.DATATYPE_DEFINITION_AXIOM &&
              field === "dataRange"
                ? value.datatype
                : entry.definition,
          });
        }
      }
    }
    const validateStructure = createStructuralValidator();
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      await budget.checkpoint();
      validateStructure(nodes[index].value);
    }
    if (profile !== "DL")
      await inspectProfileRules(profile, axioms, nodes, budget, violate);
    for (const { value: axiom } of axioms) {
      await budget.checkpoint();
      if (axiom.kind === K.DECLARATION_AXIOM)
        declarations.add(axiom.entity.structuralKey());
      if (axiom.kind === K.DATATYPE_DEFINITION_AXIOM) {
        const iri = axiom.datatype.iri.value;
        if (!definitions.has(iri)) definitions.set(iri, new Set());
        definitions.get(iri).add(axiom.structuralKey());
      }
    }
    for (const node of nodes) {
      await budget.checkpoint();
      const { value, scope } = node;
      if (value.kind === K.ONTOLOGY_ID)
        for (const iri of [value.ontologyIRI, value.versionIRI]) {
          if (iri && reserved(iri.value))
            violate("RESERVED_ONTOLOGY_IRI", { scope, iri: iri.value });
        }
      if (value.kind === K.IRI) {
        try {
          if (!value.value.isWellFormed()) throw new Error();
          parseIri(value.value);
        } catch {
          violate("IRI_INVALID", { scope });
        }
      }
      if (entityKinds.has(value.kind)) {
        const iri = value.iri.value;
        if (!entities.has(iri)) entities.set(iri, new Set());
        entities.get(iri).add(value.kind);
        if (reserved(iri) && !builtin(value))
          violate("RESERVED_ENTITY_IRI", { scope, iri, kind: value.kind });
        if (value.kind === K.DATATYPE && node.definition) {
          const definition = node.definition.iri.value;
          if (!datatypeDependencies.has(definition))
            datatypeDependencies.set(definition, new Set());
          datatypeDependencies.get(definition).add(iri);
        }
      }
      if (value.kind === K.ANONYMOUS_INDIVIDUAL) {
        anonymous.push(node);
        if (node.anonymousForbidden)
          violate("ANONYMOUS_INDIVIDUAL_POSITION", {
            scope,
            kind: node.anonymousForbidden,
          });
      }
      const setField = minimumTwoSetFields.get(value.kind);
      if (setField && value[setField].length < 2) {
        const original = readSourceArity(value);
        violate(
          "SET_CONSTRUCTOR_ARITY",
          { scope, kind: value.kind },
          node.sourceVerified &&
            original?.field === setField &&
            original.originalCount >= original.minimum,
        );
      }
      if (
        value.kind === K.DATA_PROPERTY &&
        value.iri.value === OWL + "topDataProperty" &&
        !(
          node.parent?.kind === K.SUB_DATA_PROPERTY_AXIOM &&
          node.field === "superProperty"
        )
      )
        violate("TOP_DATA_PROPERTY_POSITION", { scope });
      if (
        (value.kind === K.DATA_SOME_VALUES_FROM ||
          value.kind === K.DATA_ALL_VALUES_FROM) &&
        value.properties.length !== 1
      )
        violate("DATA_RANGE_ARITY", { scope, kind: value.kind });
    }
    for (const [iri, kinds] of entities) {
      await budget.checkpoint();
      if (propertyKinds.filter((kind) => kinds.has(kind)).length > 1)
        violate("PROPERTY_CATEGORY_COLLISION", { iri });
      if (kinds.has(K.CLASS) && kinds.has(K.DATATYPE))
        violate("CLASS_DATATYPE_COLLISION", { iri });
      if (kinds.has(K.DATATYPE)) {
        const count = definitions.get(iri)?.size ?? 0;
        if (isBuiltinDatatype(iri) ? count !== 0 : count !== 1)
          violate("DATATYPE_DEFINITION_COUNT", { iri, count });
      }
    }
    for (const from of datatypeDependencies.keys())
      if (
        (await reachable(datatypeDependencies, from, budget, false)).has(from)
      )
        violate("CYCLIC_DATATYPE_DEFINITION", { iri: from });
    const nonsimple = await inspectPropertyHierarchy(axioms, budget, violate);
    const checkedLiterals = new Set(),
      checkedEntities = new Set();
    for (const node of nodes) {
      await budget.checkpoint();
      const { value, scope } = node;
      if (
        entityKinds.has(value.kind) &&
        value.kind !== K.NAMED_INDIVIDUAL &&
        !builtin(value) &&
        !declarations.has(value.structuralKey())
      ) {
        const key = `${scope}:${value.structuralKey()}`;
        if (!checkedEntities.has(key))
          violate(
            "UNDECLARED_ENTITY",
            { scope, iri: value.iri.value, kind: value.kind },
            node.sourceVerified,
          );
        checkedEntities.add(key);
      }
      if (needsSimple.has(value.kind)) {
        for (const property of value.properties ?? [value.property]) {
          if (nonsimple.has(propertyKey(property)))
            violate("NONSIMPLE_OBJECT_PROPERTY", {
              scope,
              kind: value.kind,
              property: propertyKey(property),
            });
        }
      }
      if (
        value.kind === K.LITERAL &&
        !checkedLiterals.has(value.structuralKey())
      ) {
        checkedLiterals.add(value.structuralKey());
        if (definitions.has(value.datatype.iri.value))
          violate("DEFINED_DATATYPE_LITERAL", {
            scope,
            datatype: value.datatype.iri.value,
          });
        else {
          const result = await inspectLiteral(
            value,
            budget.configuration,
            budget,
          );
          if (result.status === "invalid")
            violate(result.rule, { scope, datatype: value.datatype.iri.value });
          if (result.status === "unverified")
            unresolved(result.rule, {
              scope,
              datatype: value.datatype.iri.value,
            });
        }
      }
      if (value.kind === K.DATATYPE_RESTRICTION) {
        if (!isBuiltinDatatype(value.datatype.iri.value))
          violate("DEFINED_DATATYPE_RESTRICTION", {
            scope,
            datatype: value.datatype.iri.value,
          });
        else
          for (const facet of value.facetRestrictions) {
            await budget.checkpoint();
            const result = await inspectFacet(
              value.datatype,
              facet,
              budget.configuration,
              budget,
            );
            if (result.status === "invalid")
              violate(result.rule, {
                scope,
                datatype: value.datatype.iri.value,
                facet: facet.facet.value,
              });
            if (result.status === "unverified")
              unresolved(result.rule, {
                scope,
                datatype: value.datatype.iri.value,
                facet: facet.facet.value,
              });
          }
      }
    }
    await inspectAnonymousGraph(axioms, anonymous, budget, violate);
  } catch (error) {
    if (error instanceof StructuralValidationError)
      violate("STRUCTURAL_OBJECT_INVALID");
    else if (error instanceof ResourceLimitError)
      unresolved("RESOURCE_LIMIT_EXCEEDED", {
        resource: error.resource,
        limit: error.limit,
      });
    else throw error;
  }
  const currentClosure = readProfileClosure(ontology);
  if (
    currentClosure.complete !== closure.complete ||
    currentClosure.ontologies.length !== members.length ||
    members.some(
      (member) =>
        !currentClosure.ontologies.includes(member.ontology) ||
        readOntologySnapshot(member.ontology).revision !==
          member.snapshot.revision,
    )
  )
    unresolved("ONTOLOGY_CHANGED_DURING_CHECK");
  const qualified = new Set(qualifications);
  const sourceViolations = violations.filter(
    (violation) => !qualified.has(violation),
  );
  const sourceUnverified = [...unverified];
  for (const member of members)
    if (member.status !== "verified")
      sourceUnverified.push({
        code:
          member.status === "stale"
            ? "SOURCE_EVIDENCE_STALE"
            : "SOURCE_EVIDENCE_UNVERIFIED",
        scope: member.scope,
      });
  return Object.freeze({
    status: statusOf(violations, unverified),
    violations: frozen(violations),
    unverifiedChecks: frozen(unverified),
    closure: frozen(
      members.map(({ scope, snapshot }) => ({
        scope,
        revision: snapshot.revision,
        ontologyIRI: snapshot.ontologyID.ontologyIRI?.value,
      })),
    ),
    sourceAssessment: budget.configuration.sourceAssessment
      ? Object.freeze({
          status: statusOf(sourceViolations, sourceUnverified),
          violations: frozen(sourceViolations),
          unverifiedChecks: frozen(sourceUnverified),
          qualifications: frozen(qualifications),
        })
      : undefined,
  });
};

/** Read and inspect one complete, root-inclusive closure before any consumer filter. */
export const checkOWL2Profile = async (ontology, options, profile = "DL") => {
  const budget = createProfileBudget(options);
  const closure = readProfileClosure(ontology);
  const members = closure.ontologies.map((member, scope) => ({
    ontology: member,
    scope,
    ...readSourceEvidence(member),
  }));
  const formal = await checkModel(
    ontology,
    budget,
    closure,
    members,
    false,
    profile,
  );
  if (
    !budget.configuration.sourceAssessment ||
    !members.some(
      ({ structure }) =>
        structure?.roles.length ||
        structure?.statements.length ||
        structure?.expressions?.length,
    )
  )
    return formal;
  const source = await checkModel(
    ontology,
    budget,
    closure,
    members,
    true,
    profile,
  );
  // Both passes assess the same captured revision. A source-only unsupported
  // construct leaves formal validity separate, but mutation invalidates that
  // shared snapshot and therefore cannot leave the formal verdict certified.
  const changed = source.unverifiedChecks.find(
    ({ code }) => code === "ONTOLOGY_CHANGED_DURING_CHECK",
  );
  const unverifiedChecks =
    changed &&
    !formal.unverifiedChecks.some(({ code }) => code === changed.code)
      ? frozen([...formal.unverifiedChecks, changed])
      : formal.unverifiedChecks;
  return Object.freeze({
    ...formal,
    status: statusOf(formal.violations, unverifiedChecks),
    unverifiedChecks,
    sourceAssessment: source.sourceAssessment,
  });
};

export const checkOWL2DL = (ontology, options) =>
  checkOWL2Profile(ontology, options);
