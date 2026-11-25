import { parseIri } from "@hyperjump/uri";
import { SIMPLE_ASCII_IRI } from "../parsing/iriCharacters.js";
import { ResourceLimitError } from "../../io/errors.js";
import { ENTITY_KINDS, OWLObjectKind as K } from "../../model/kinds.js";
import {
  readOntologySnapshot,
  readProfileClosure,
  readOntologyBehaviorDefinition,
} from "../../model/owlOntology.js";
import { readSourceEvidence } from "../model/sourceEvidence.js";
import { readSourceArity } from "../model/sourceArity.js";
import { minimumTwoSetFields } from "../model/setConstructs.js";
import {
  OWL_NAMESPACE as OWL,
  RDF_NAMESPACE as RDF,
  RDFS_NAMESPACE as RDFS,
  XSD_NAMESPACE as XSD,
} from "../rdfjs/vocabulary.js";
import { createProfileBudget } from "./budget.js";
import {
  createProfileStepCursor,
  createScopedNodeCursor,
  scopedProfileAxioms,
} from "./modelTraversal.js";
import { usesNativeStructuralKeys } from "../../model/structural.js";
import { readSnapshotAxioms } from "../model/ontologyState.js";
import {
  createProfileNodeInspector,
  inspectProfileRules,
} from "./profileRules.js";
import { defaultBehaviorProfileDefinition } from "../behavior/ontologyBehaviorContext.js";
import { inspectLiteral, isBuiltinDatatype } from "./datatypes.js";
import { inspectFacet } from "./facets.js";
import {
  inspectJavaFacet,
  inspectJavaLiteral,
} from "./javaDatatypeValidation.js";
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
const reserved = (iri) =>
  iri.startsWith(OWL) ||
  iri.startsWith(RDF) ||
  iri.startsWith(RDFS) ||
  iri.startsWith(XSD);
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
const statusOf = (violations, unresolved) =>
  violations.length ? "invalid" : unresolved.length ? "unverified" : "valid";
const frozen = (entries) =>
  Object.freeze(entries.map((entry) => Object.freeze(entry)));
const validIriStrings = new Set();

const isValidProfileIri = (iriString) => {
  if (SIMPLE_ASCII_IRI.test(iriString) || validIriStrings.has(iriString))
    return true;
  try {
    if (!iriString.isWellFormed()) return false;
    parseIri(iriString);
    if (validIriStrings.size < 50000) validIriStrings.add(iriString);
    return true;
  } catch {
    return false;
  }
};

const ENTITY_BITS = new Map([
  [K.CLASS, 1],
  [K.DATATYPE, 2],
  [K.OBJECT_PROPERTY, 4],
  [K.DATA_PROPERTY, 8],
  [K.ANNOTATION_PROPERTY, 16],
]);

const checkModel = async (
  ontology,
  budget,
  closure,
  members,
  includeSource,
  profile,
  validationPolicy,
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
  const axioms = scopedProfileAxioms(members);
  const anonymous = [];
  const declarations = new Set(),
    declaredObjects = new Set(),
    entities = new Map(),
    definitions = new Map(),
    datatypeDependencies = new Map();
  try {
    const startYield = budget.checkpointSync(0);
    if (startYield) await startYield;
    const sourceRoots = includeSource
      ? await inspectSourceStructure(members, budget, violate)
      : new Map();
    let nodeCount = 0;
    const noInterrupts =
      budget.configuration.signal === undefined &&
      budget.configuration.timeoutMs === null;
    const untrusted = [];
    for (const member of members) {
      const stored = readSnapshotAxioms(member.snapshot);
      if (noInterrupts) {
        budget.check(stored.length);
      } else {
        for (let i = 0; i < stored.length; i++) {
          budget.check();
          if (budget.shouldYield()) await budget.yieldTurn();
        }
      }
      const stepCursor = createProfileStepCursor(
        member,
        sourceRoots,
        validationPolicy,
        { pooled: true },
      );
      try {
        for (
          let step = stepCursor.next();
          step !== undefined;
          step = stepCursor.next()
        ) {
          budget.check();
          if (budget.shouldYield()) await budget.yieldTurn();
          if (step.skipped) continue;
          budget.depth(step.depth);
          if (!step.trusted && !step.virtual)
            validateStructuralShape(step.value);
          if (step.sequence) {
            for (let i = 0; i < step.value.length; i++) budget.check();
            continue;
          }
          if (!step.trusted)
            untrusted.push({ index: nodeCount, value: step.value });
          nodeCount++;
          if (
            step.value.kind === K.LITERAL &&
            typeof step.value.lexicalForm === "string" &&
            step.value.lexicalForm.length >
              budget.configuration.maxLiteralLength
          )
            throw new ResourceLimitError(
              "Literal validation size limit exceeded",
              {
                resource: "profileLiteralLength",
                limit: budget.configuration.maxLiteralLength,
              },
            );
        }
      } finally {
        stepCursor.close();
      }
    }
    // Preserve reverse admission and cancellation points. Factory-proven
    // snapshots need no retained per-node validation records.
    const validateStructure = createStructuralValidator();
    if (untrusted.length > 0) {
      for (let index = nodeCount - 1; index >= 0; index--) {
        budget.check();
        if (budget.shouldYield()) await budget.yieldTurn();
        if (untrusted.at(-1)?.index === index)
          validateStructure(untrusted.pop().value);
      }
    } else if (noInterrupts) {
      budget.check(nodeCount);
    } else {
      for (let index = nodeCount - 1; index >= 0; index--) {
        budget.check();
        if (budget.shouldYield()) await budget.yieldTurn();
      }
    }
    const allTrusted = untrusted.length === 0 && usesNativeStructuralKeys();
    const entityLookupKey = (entity) =>
      allTrusted
        ? `${entity.kind}\0${entity.iri.value}`
        : entity.structuralKey();
    const literalLookupKey = (literal) =>
      allTrusted
        ? `${literal.datatype.iri.value}\0${literal.language}\0${literal.lexicalForm}`
        : literal.structuralKey();
    const rulesStart = violations.length;
    const fuseProfileNodes = profile !== "DL";
    if (profile !== "DL") {
      const rules = inspectProfileRules(
        profile,
        axioms,
        undefined,
        budget,
        violate,
        validationPolicy,
        { members, sourceRoots, allTrusted, skipNodes: fuseProfileNodes },
      );
      if (rules) await rules;
    }
    const profileNodeViolations = [];
    const profileNodeVisitor = fuseProfileNodes
      ? createProfileNodeInspector(
          profile,
          budget,
          (code, detail = {}) =>
            profileNodeViolations.push({ code, ...detail }),
          validationPolicy,
        )
      : undefined;
    for (let m = 0; m < members.length; m++) {
      const stored = readSnapshotAxioms(members[m].snapshot);
      for (let i = 0; i < stored.length; i++) {
        const axiom = stored.valueAt(i);
        budget.check();
        if (budget.shouldYield()) await budget.yieldTurn();
        if (axiom.kind === K.DECLARATION_AXIOM) {
          if (allTrusted) declaredObjects.add(axiom.entity);
          declarations.add(entityLookupKey(axiom.entity));
        }
        if (axiom.kind === K.DATATYPE_DEFINITION_AXIOM) {
          const iri = axiom.datatype.iri.value;
          if (!definitions.has(iri)) definitions.set(iri, new Set());
          definitions.get(iri).add(axiom.structuralKey());
        }
      }
    }
    const firstNodeCursor = createScopedNodeCursor(
      members,
      sourceRoots,
      validationPolicy,
    );
    try {
      for (
        let node = firstNodeCursor.next();
        node !== undefined;
        node = firstNodeCursor.next()
      ) {
        budget.check(fuseProfileNodes ? 2 : 1);
        if (budget.shouldYield()) await budget.yieldTurn();
        const { value, scope } = node;
        if (value.kind === K.ONTOLOGY_ID) {
          if (value.ontologyIRI && reserved(value.ontologyIRI.value))
            violate("RESERVED_ONTOLOGY_IRI", {
              scope,
              iri: value.ontologyIRI.value,
            });
          if (value.versionIRI && reserved(value.versionIRI.value))
            violate("RESERVED_ONTOLOGY_IRI", {
              scope,
              iri: value.versionIRI.value,
            });
        }
        if (value.kind === K.IRI) {
          if (!isValidProfileIri(value.value))
            violate("IRI_INVALID", { scope });
          continue;
        }
        if (profileNodeVisitor) profileNodeVisitor(node);
        if (entityKinds.has(value.kind)) {
          const iri = value.iri.value;
          const bit = ENTITY_BITS.get(value.kind);
          const prev = entities.get(iri) ?? 0;
          if (Math.floor(prev / bit) % 2 === 0) entities.set(iri, prev + bit);
          if (
            reserved(iri) &&
            !builtin(value) &&
            !(
              value.kind === K.DATATYPE &&
              validationPolicy.allowsUnknownXsdDatatypes &&
              iri.startsWith(XSD)
            )
          )
            violate("RESERVED_ENTITY_IRI", { scope, iri, kind: value.kind });
          if (value.kind === K.DATATYPE && node.definition) {
            const definition = node.definition.iri.value;
            if (!datatypeDependencies.has(definition))
              datatypeDependencies.set(definition, new Set());
            datatypeDependencies.get(definition).add(iri);
          }
        }
        if (value.kind === K.ANONYMOUS_INDIVIDUAL) {
          if (validationPolicy.checksAnonymousStructure)
            anonymous.push({ value, scope });
          if (
            validationPolicy.checksAnonymousStructure &&
            node.anonymousForbidden
          )
            violate("ANONYMOUS_INDIVIDUAL_POSITION", {
              scope,
              kind: node.anonymousForbidden,
            });
        }
        const setField = minimumTwoSetFields.get(value.kind);
        if (value.kind === K.OBJECT_ONE_OF && value.individuals.length === 0)
          violate("SET_CONSTRUCTOR_ARITY", { scope, kind: value.kind });
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
          (validationPolicy.topDataPropertyRestriction === "not-sub-property"
            ? node.parent?.kind === K.SUB_DATA_PROPERTY_AXIOM &&
              node.field === "subProperty"
            : !(
                node.parent?.kind === K.SUB_DATA_PROPERTY_AXIOM &&
                node.field === "superProperty"
              ))
        )
          violate("TOP_DATA_PROPERTY_POSITION", { scope });
        if (
          validationPolicy.requiresUnaryDataRanges &&
          (value.kind === K.DATA_SOME_VALUES_FROM ||
            value.kind === K.DATA_ALL_VALUES_FROM) &&
          value.properties.length !== 1
        )
          violate("DATA_RANGE_ARITY", { scope, kind: value.kind });
      }
    } finally {
      firstNodeCursor.close?.();
      if (profileNodeViolations.length > 0) {
        const tail = violations.slice(rulesStart);
        violations.length = rulesStart;
        for (let i = 0; i < profileNodeViolations.length; i++)
          violations.push(profileNodeViolations[i]);
        for (let i = 0; i < tail.length; i++) violations.push(tail[i]);
      }
    }
    for (const [iri, mask] of entities) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      const hasObject = mask % 8 >= 4;
      const hasData = mask % 16 >= 8;
      const hasAnnotation = mask >= 16;
      if (Number(hasObject) + Number(hasData) + Number(hasAnnotation) > 1)
        violate("PROPERTY_CATEGORY_COLLISION", { iri });
      if (mask % 2 === 1 && mask % 4 >= 2)
        violate("CLASS_DATATYPE_COLLISION", { iri });
      if (mask % 4 >= 2) {
        const count = definitions.get(iri)?.size ?? 0;
        if (
          validationPolicy.requiresUniqueDatatypeDefinition
            ? isBuiltinDatatype(iri)
              ? count !== 0
              : count !== 1
            : reserved(iri) && count !== 0
        )
          violate("DATATYPE_DEFINITION_COUNT", { iri, count });
      }
    }
    for (const from of datatypeDependencies.keys()) {
      let dep = reachable(datatypeDependencies, from, budget, false);
      if (!(dep instanceof Set)) dep = await dep;
      if (dep.has(from)) violate("CYCLIC_DATATYPE_DEFINITION", { iri: from });
    }
    let nonsimple = inspectPropertyHierarchy(axioms, budget, violate, members);
    if (!(nonsimple instanceof Set)) nonsimple = await nonsimple;
    const checkedLiterals = new Set(),
      checkedEntities = new Set();
    const secondNodeCursor = createScopedNodeCursor(
      members,
      sourceRoots,
      validationPolicy,
      { skipIris: true },
    );
    try {
      for (
        let node = secondNodeCursor.next();
        node !== undefined;
        node = secondNodeCursor.next()
      ) {
        budget.check(1 + secondNodeCursor.drainSkipped());
        if (budget.shouldYield()) await budget.yieldTurn();
        const { value, scope } = node;
        if (value.kind === K.IRI) continue;
        if (
          entityKinds.has(value.kind) &&
          value.kind !== K.NAMED_INDIVIDUAL &&
          !(allTrusted && declaredObjects.has(value)) &&
          !builtin(value)
        ) {
          const eKey = entityLookupKey(value);
          if (!declarations.has(eKey)) {
            const key = `${scope}:${eKey}`;
            if (!checkedEntities.has(key))
              violate(
                "UNDECLARED_ENTITY",
                { scope, iri: value.iri.value, kind: value.kind },
                node.sourceVerified,
              );
            checkedEntities.add(key);
          }
        }
        if (nonsimple.size > 0 && needsSimple.has(value.kind)) {
          if (value.properties) {
            for (let i = 0; i < value.properties.length; i++) {
              const pKey = propertyKey(value.properties[i]);
              if (nonsimple.has(pKey))
                violate("NONSIMPLE_OBJECT_PROPERTY", {
                  scope,
                  kind: value.kind,
                  property: pKey,
                });
            }
          } else {
            const pKey = propertyKey(value.property);
            if (nonsimple.has(pKey))
              violate("NONSIMPLE_OBJECT_PROPERTY", {
                scope,
                kind: value.kind,
                property: pKey,
              });
          }
        }
        if (value.kind === K.LITERAL) {
          const lKey = literalLookupKey(value);
          if (!checkedLiterals.has(lKey)) {
            checkedLiterals.add(lKey);
            if (definitions.has(value.datatype.iri.value)) {
              violate("DEFINED_DATATYPE_LITERAL", {
                scope,
                datatype: value.datatype.iri.value,
              });
            } else {
              let result =
                validationPolicy.literalValidation === "java-pattern"
                  ? inspectJavaLiteral(value)
                  : inspectLiteral(value, budget.configuration, budget);
              // Inspectors return an own status record or asynchronous XML work.
              // The global Promise constructor can be replaced by instrumentation.
              if (!Object.hasOwn(result, "status")) result = await result;
              if (result.status === "invalid")
                violate(result.rule, {
                  scope,
                  datatype: value.datatype.iri.value,
                });
              if (result.status === "unverified")
                unresolved(result.rule, {
                  scope,
                  datatype: value.datatype.iri.value,
                });
            }
          }
        }
        if (value.kind === K.DATATYPE_RESTRICTION) {
          if (
            !isBuiltinDatatype(value.datatype.iri.value) &&
            validationPolicy.definedDatatypeRestrictionOutcome === "exception"
          )
            throw new RangeError(
              "The restricted datatype is not a built in datatype",
            );
          if (!isBuiltinDatatype(value.datatype.iri.value)) {
            violate("DEFINED_DATATYPE_RESTRICTION", {
              scope,
              datatype: value.datatype.iri.value,
            });
          } else {
            for (const facet of value.facetRestrictions) {
              budget.check();
              if (budget.shouldYield()) await budget.yieldTurn();
              const result = validationPolicy.checksFacetValueSpace
                ? await inspectFacet(
                    value.datatype,
                    facet,
                    budget.configuration,
                    budget,
                  )
                : inspectJavaFacet(value.datatype, facet);
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
      }
      const tailSkipped = secondNodeCursor.drainSkipped();
      if (tailSkipped > 0) budget.check(tailSkipped);
    } finally {
      secondNodeCursor.close();
    }
    if (validationPolicy.checksAnonymousStructure) {
      const anon = inspectAnonymousGraph(
        axioms,
        anonymous,
        budget,
        violate,
        members,
      );
      if (anon) await anon;
    }
    await budget.checkpoint(0);
    await Promise.resolve();
    budget.check(0);
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
export const checkOWL2Profile = async (
  ontology,
  options,
  profile = "DL",
  behaviorProfileDefinition = defaultBehaviorProfileDefinition,
) => {
  const budget = createProfileBudget(options, behaviorProfileDefinition);
  const closure = readProfileClosure(ontology);
  if (
    closure.ontologies.some((member) => {
      const definition = readOntologyBehaviorDefinition(member);
      return definition && definition !== behaviorProfileDefinition;
    })
  )
    throw new TypeError(
      "OWL profile checker and imported ontology behavior profiles must match",
    );
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
    behaviorProfileDefinition.owlLanguageProfilePolicy,
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
    behaviorProfileDefinition.owlLanguageProfilePolicy,
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

export const checkOWL2DL = (ontology, options, behaviorProfileDefinition) =>
  checkOWL2Profile(ontology, options, "DL", behaviorProfileDefinition);
