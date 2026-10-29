import {
  CLASS_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  OWLObjectKind as K,
} from "../../model/kinds.js";
import {
  OWL_NAMESPACE as OWL,
  RDF_NAMESPACE as RDF,
  RDFS_NAMESPACE as RDFS,
  XSD_NAMESPACE as XSD,
} from "../rdfjs/vocabulary.js";

const classKinds = new Set(CLASS_EXPRESSION_KINDS);
const dataKinds = new Set(DATA_RANGE_KINDS);
const OWL_THING = OWL + "Thing";
const rlForbiddenObjectProperties = new Set([
  OWL + "topObjectProperty",
  OWL + "bottomObjectProperty",
]);
const rlForbiddenDataProperties = new Set([
  OWL + "topDataProperty",
  OWL + "bottomDataProperty",
]);
const commonDatatypes = [
  RDF + "PlainLiteral",
  RDF + "XMLLiteral",
  RDFS + "Literal",
  ...[
    "decimal",
    "integer",
    "nonNegativeInteger",
    "string",
    "normalizedString",
    "token",
    "Name",
    "NCName",
    "NMTOKEN",
    "hexBinary",
    "base64Binary",
    "anyURI",
    "dateTime",
    "dateTimeStamp",
  ].map((name) => XSD + name),
];
const elqlDatatypes = new Set([
  ...commonDatatypes,
  OWL + "real",
  OWL + "rational",
]);
const rlDatatypes = new Set([
  ...commonDatatypes,
  ...[
    "nonPositiveInteger",
    "positiveInteger",
    "negativeInteger",
    "long",
    "int",
    "short",
    "byte",
    "unsignedLong",
    "unsignedInt",
    "unsignedShort",
    "unsignedByte",
    "float",
    "double",
    "language",
    "boolean",
  ].map((name) => XSD + name),
]);
const elClasses = new Set([
  K.CLASS,
  K.OBJECT_INTERSECTION_OF,
  K.OBJECT_SOME_VALUES_FROM,
  K.OBJECT_HAS_SELF,
  K.OBJECT_HAS_VALUE,
  K.OBJECT_ONE_OF,
  K.DATA_SOME_VALUES_FROM,
  K.DATA_HAS_VALUE,
]);
const forbiddenAxioms = {
  EL: new Set([
    K.DISJOINT_UNION_AXIOM,
    K.DISJOINT_OBJECT_PROPERTIES_AXIOM,
    K.INVERSE_OBJECT_PROPERTIES_AXIOM,
    K.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    K.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    K.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
    K.SYMMETRIC_OBJECT_PROPERTY_AXIOM,
    K.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
    K.DISJOINT_DATA_PROPERTIES_AXIOM,
  ]),
  QL: new Set([
    K.DISJOINT_UNION_AXIOM,
    K.SUB_PROPERTY_CHAIN_AXIOM,
    K.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    K.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    K.TRANSITIVE_OBJECT_PROPERTY_AXIOM,
    K.FUNCTIONAL_DATA_PROPERTY_AXIOM,
    K.HAS_KEY_AXIOM,
    K.SAME_INDIVIDUAL_AXIOM,
    K.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
    K.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
  ]),
  RL: new Set([
    K.DISJOINT_UNION_AXIOM,
    K.REFLEXIVE_OBJECT_PROPERTY_AXIOM,
    K.DATATYPE_DEFINITION_AXIOM,
  ]),
};
const thing = (value) =>
  value?.kind === K.CLASS && value.iri.value === OWL_THING;

/** W3C profile productions are position dependent. Evaluate them as a finite
 * state grammar, not a list of globally forbidden expression kinds. The shared
 * assessment budget bounds every expansion, including repeated DAG paths.
 */
const expressionAllowed = (root, profile, position, budget) => {
  // Common shape admission has already proved an immutable data-only kind.
  // Atomic classes need the same charges, without a temporary traversal frame.
  if (root.kind === K.CLASS) {
    budget.check();
    budget.depth(0);
    return profile !== "RL" || !thing(root);
  }
  const pending = [{ value: root, position, depth: 0 }];
  while (pending.length) {
    budget.check();
    const { value, position: at, depth } = pending.pop();
    budget.depth(depth);
    const push = (child, next = at) =>
      pending.push({ value: child, position: next, depth: depth + 1 });
    if (value.kind === K.CLASS) {
      if (profile === "RL" && thing(value)) return false;
      continue;
    }
    if (profile === "QL") {
      if (at === "super" && value.kind === K.OBJECT_INTERSECTION_OF) {
        for (const child of value.operands) push(child);
        continue;
      }
      if (at === "super" && value.kind === K.OBJECT_COMPLEMENT_OF) {
        push(value.operand, "sub");
        continue;
      }
      if (
        value.kind === K.OBJECT_SOME_VALUES_FROM &&
        (at === "sub" ? thing(value.filler) : value.filler.kind === K.CLASS)
      )
        continue;
      if (value.kind === K.DATA_SOME_VALUES_FROM) continue;
      return false;
    }
    if (
      value.kind === K.OBJECT_INTERSECTION_OF ||
      (at === "sub" && value.kind === K.OBJECT_UNION_OF)
    ) {
      for (const child of value.operands) push(child);
      continue;
    }
    if (value.kind === K.OBJECT_HAS_VALUE || value.kind === K.DATA_HAS_VALUE)
      continue;
    if (at === "sub") {
      if (
        value.kind === K.OBJECT_ONE_OF ||
        value.kind === K.DATA_SOME_VALUES_FROM
      )
        continue;
      if (value.kind === K.OBJECT_SOME_VALUES_FROM) {
        if (!thing(value.filler)) push(value.filler);
        continue;
      }
    }
    if (at === "super") {
      if (value.kind === K.OBJECT_COMPLEMENT_OF) {
        push(value.operand, "sub");
        continue;
      }
      if (value.kind === K.OBJECT_ALL_VALUES_FROM) {
        push(value.filler);
        continue;
      }
      if (value.kind === K.DATA_ALL_VALUES_FROM) continue;
      if (
        (value.kind === K.OBJECT_MAX_CARDINALITY ||
          value.kind === K.DATA_MAX_CARDINALITY) &&
        value.cardinality <= 1
      ) {
        if (
          value.kind === K.OBJECT_MAX_CARDINALITY &&
          value.filler &&
          !thing(value.filler)
        )
          push(value.filler, "sub");
        continue;
      }
    }
    return false;
  }
  return true;
};

const inspectELRanges = async (axioms, budget, violate, validationPolicy) => {
  // RC2-PRF-DIFF-003: imposed ranges follow zero or more subproperty steps;
  // equivalence contributes both directions. Cycles never restart traversal.
  const ranges = new Map(),
    parents = new Map(),
    imposed = new Map();
  const edge = (sub, sup) => {
    const key = sub.structuralKey();
    if (!parents.has(key)) parents.set(key, new Set());
    parents.get(key).add(sup.structuralKey());
  };
  for (const { value } of axioms) {
    budget.check();
    if (budget.shouldYield()) await budget.yieldTurn();
    if (value.kind === K.SUB_OBJECT_PROPERTY_AXIOM)
      edge(value.subProperty, value.superProperty);
    if (value.kind === K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM) {
      // A bidirectional star represents the same transitive equivalence closure
      // with linear storage instead of a quadratic complete edge inventory.
      for (const property of value.properties) {
        budget.check();
        if (budget.shouldYield()) await budget.yieldTurn();
        edge(property, value.properties[0]);
        edge(value.properties[0], property);
      }
    }
    if (value.kind !== K.OBJECT_PROPERTY_RANGE_AXIOM) continue;
    const key = value.property.structuralKey();
    if (!ranges.has(key)) ranges.set(key, new Set());
    ranges.get(key).add(value.range.structuralKey());
  }
  const imposedRanges = async (property) => {
    const key = property.structuralKey();
    if (imposed.has(key)) return imposed.get(key);
    const result = new Set(),
      visited = new Set(),
      pending = [key];
    while (pending.length) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      const current = pending.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      for (const range of ranges.get(current) ?? []) {
        budget.check();
        if (budget.shouldYield()) await budget.yieldTurn();
        result.add(range);
      }
      for (const parent of parents.get(current) ?? []) {
        budget.check();
        if (budget.shouldYield()) await budget.yieldTurn();
        pending.push(parent);
      }
    }
    imposed.set(key, result);
    return result;
  };
  for (const { value, scope } of axioms) {
    budget.check();
    if (budget.shouldYield()) await budget.yieldTurn();
    if (value.kind !== K.SUB_PROPERTY_CHAIN_AXIOM) continue;
    const headRanges = await imposedRanges(value.superProperty);
    const lastRanges = validationPolicy.elLastChainPropertyInheritsRanges
      ? await imposedRanges(value.chain.at(-1))
      : (ranges.get(value.chain.at(-1).structuralKey()) ?? new Set());
    for (const range of headRanges) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      if (!lastRanges.has(range))
        violate("EL_CHAIN_RANGE_NOT_IMPOSED_ON_LAST_PROPERTY", {
          profile: "EL",
          scope,
          range,
        });
    }
  }
};

/** Apply profile-specific grammar and global constraints after common DL
 * structure validation. Entries retain closure scope and the offending kind.
 */
export const inspectProfileRules = async (
  profile,
  axioms,
  nodes,
  budget,
  violate,
  validationPolicy,
) => {
  const datatypes = profile === "RL" ? rlDatatypes : elqlDatatypes;
  const excludedDatatypes =
    profile === "RL"
      ? new Set(
          validationPolicy.rlExcludedDatatypeNames.map((name) => XSD + name),
        )
      : undefined;
  const nodeViolation = (code, value, scope, extra) =>
    violate(code, { profile, scope, kind: value.kind, ...extra });
  const check = (expression, position, scope, kind) => {
    if (!expressionAllowed(expression, profile, position, budget))
      violate("PROFILE_CLASS_POSITION_NOT_ALLOWED", {
        profile,
        scope,
        kind,
        position,
        expressionKind: expression.kind,
      });
  };
  for (const { value, scope, annotationContext } of nodes) {
    budget.check();
    if (budget.shouldYield()) await budget.yieldTurn();
    // Annotation values retain the common lexical/structural checks, but are
    // outside the logical profile's data-range and individual productions.
    if (annotationContext || value.kind === K.IRI) continue;
    // RC2-PRF-DIFF-002: the RL property production excludes all four built-ins.
    if (
      profile === "RL" &&
      !validationPolicy.rlAllowsTopAndBottomProperties &&
      ((value.kind === K.OBJECT_PROPERTY &&
        rlForbiddenObjectProperties.has(value.iri.value)) ||
        (value.kind === K.DATA_PROPERTY &&
          rlForbiddenDataProperties.has(value.iri.value)))
    )
      nodeViolation("PROFILE_PROPERTY_NOT_ALLOWED", value, scope, {
        iri: value.iri.value,
      });
    if (
      value.kind === K.DATATYPE &&
      (!datatypes.has(value.iri.value) ||
        (profile === "RL" && excludedDatatypes.has(value.iri.value)))
    )
      nodeViolation("PROFILE_DATATYPE_NOT_ALLOWED", value, scope, {
        iri: value.iri.value,
      });
    if (
      dataKinds.has(value.kind) &&
      value.kind !== K.DATATYPE &&
      value.kind !== K.DATA_INTERSECTION_OF &&
      !(profile === "EL" && value.kind === K.DATA_ONE_OF)
    )
      nodeViolation("PROFILE_DATA_RANGE_NOT_ALLOWED", value, scope);
    if (
      profile === "EL" &&
      value.kind === K.DATA_ONE_OF &&
      value.values.length !== 1
    )
      nodeViolation("PROFILE_DATA_ENUMERATION_NOT_SINGLETON", value, scope);
    if (profile !== "RL" && value.kind === K.ANONYMOUS_INDIVIDUAL)
      nodeViolation("PROFILE_ANONYMOUS_INDIVIDUAL_NOT_ALLOWED", value, scope);
    if (profile === "EL") {
      if (value.kind === K.OBJECT_INVERSE_OF)
        nodeViolation("PROFILE_INVERSE_PROPERTY_NOT_ALLOWED", value, scope);
      if (classKinds.has(value.kind) && !elClasses.has(value.kind))
        nodeViolation("PROFILE_CLASS_EXPRESSION_NOT_ALLOWED", value, scope);
      if (value.kind === K.OBJECT_ONE_OF && value.individuals.length !== 1)
        nodeViolation("PROFILE_OBJECT_ENUMERATION_NOT_SINGLETON", value, scope);
    }
  }
  for (const { value, scope } of axioms) {
    budget.check();
    if (budget.shouldYield()) await budget.yieldTurn();
    if (forbiddenAxioms[profile].has(value.kind))
      nodeViolation("PROFILE_AXIOM_NOT_ALLOWED", value, scope);
    if (profile === "EL") continue;
    switch (value.kind) {
      case K.SUBCLASS_OF_AXIOM:
        check(value.subClass, "sub", scope, value.kind);
        check(value.superClass, "super", scope, value.kind);
        break;
      case K.EQUIVALENT_CLASSES_AXIOM:
        for (const expression of value.classExpressions)
          check(
            expression,
            profile === "RL" ? "equiv" : "sub",
            scope,
            value.kind,
          );
        break;
      case K.DISJOINT_CLASSES_AXIOM:
        for (const expression of value.classExpressions)
          check(
            expression,
            profile === "RL"
              ? validationPolicy.rlDisjointOperandPosition
              : "sub",
            scope,
            value.kind,
          );
        break;
      case K.OBJECT_PROPERTY_DOMAIN_AXIOM:
      case K.DATA_PROPERTY_DOMAIN_AXIOM:
        check(value.domain, "super", scope, value.kind);
        break;
      case K.OBJECT_PROPERTY_RANGE_AXIOM:
        check(value.range, "super", scope, value.kind);
        break;
      case K.CLASS_ASSERTION_AXIOM:
        if (profile === "QL") {
          if (value.classExpression.kind !== K.CLASS)
            nodeViolation("PROFILE_CLASS_ASSERTION_NOT_ATOMIC", value, scope);
        } else check(value.classExpression, "super", scope, value.kind);
        break;
      case K.HAS_KEY_AXIOM:
        if (profile === "RL")
          check(value.classExpression, "sub", scope, value.kind);
        break;
    }
    if (budget.shouldYield()) await budget.yieldTurn();
  }
  if (profile === "EL")
    await inspectELRanges(axioms, budget, violate, validationPolicy);
};
