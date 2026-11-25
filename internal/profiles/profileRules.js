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
import { readSnapshotAxioms } from "../model/ontologyState.js";
import { createScopedNodeCursor } from "./modelTraversal.js";

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

const exprValues = [];
const exprPositions = [];
const exprDepths = [];
let exprBusy = false;
const excludedDatatypesByPolicy = new WeakMap();

const expressionAllowedFromStack = (
  pendingValues,
  pendingPositions,
  pendingDepths,
  profile,
  budget,
) => {
  while (pendingValues.length) {
    budget.check();
    const value = pendingValues.pop();
    const at = pendingPositions.pop();
    const depth = pendingDepths.pop();
    budget.depth(depth);
    if (value.kind === K.CLASS) {
      if (profile === "RL" && thing(value)) return false;
      continue;
    }
    if (profile === "QL") {
      if (at === "super" && value.kind === K.OBJECT_INTERSECTION_OF) {
        const operands = value.operands;
        for (let i = 0; i < operands.length; i++) {
          pendingValues.push(operands[i]);
          pendingPositions.push(at);
          pendingDepths.push(depth + 1);
        }
        continue;
      }
      if (at === "super" && value.kind === K.OBJECT_COMPLEMENT_OF) {
        pendingValues.push(value.operand);
        pendingPositions.push("sub");
        pendingDepths.push(depth + 1);
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
      const operands = value.operands;
      for (let i = 0; i < operands.length; i++) {
        pendingValues.push(operands[i]);
        pendingPositions.push(at);
        pendingDepths.push(depth + 1);
      }
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
        if (!thing(value.filler)) {
          pendingValues.push(value.filler);
          pendingPositions.push(at);
          pendingDepths.push(depth + 1);
        }
        continue;
      }
    }
    if (at === "super") {
      if (value.kind === K.OBJECT_COMPLEMENT_OF) {
        pendingValues.push(value.operand);
        pendingPositions.push("sub");
        pendingDepths.push(depth + 1);
        continue;
      }
      if (value.kind === K.OBJECT_ALL_VALUES_FROM) {
        pendingValues.push(value.filler);
        pendingPositions.push(at);
        pendingDepths.push(depth + 1);
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
        ) {
          pendingValues.push(value.filler);
          pendingPositions.push("sub");
          pendingDepths.push(depth + 1);
        }
        continue;
      }
    }
    return false;
  }
  return true;
};

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
  if (exprBusy) {
    return expressionAllowedFromStack([root], [position], [0], profile, budget);
  }
  exprBusy = true;
  exprValues.length = 0;
  exprPositions.length = 0;
  exprDepths.length = 0;
  exprValues.push(root);
  exprPositions.push(position);
  exprDepths.push(0);
  try {
    return expressionAllowedFromStack(
      exprValues,
      exprPositions,
      exprDepths,
      profile,
      budget,
    );
  } finally {
    exprValues.length = 0;
    exprPositions.length = 0;
    exprDepths.length = 0;
    exprBusy = false;
  }
};

const elKey = (value, nativeKeys) => {
  if (nativeKeys && value.kind === K.OBJECT_PROPERTY) {
    return "P:" + value.iri.value;
  }
  if (nativeKeys && value.kind === K.CLASS) {
    return "C:" + value.iri.value;
  }
  return value.structuralKey();
};

const finishImposedRanges = async (
  ranges,
  parents,
  imposed,
  budget,
  key,
  result,
  visited,
  pending,
  current,
  firstRange,
  rangeIter,
  firstParent,
  parentIter,
) => {
  await budget.yieldTurn();
  if (rangeIter) {
    result.add(firstRange);
    for (let rStep = rangeIter.next(); !rStep.done; rStep = rangeIter.next()) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      result.add(rStep.value);
    }
    for (const parent of parents.get(current) ?? []) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      pending.push(parent);
    }
  } else if (parentIter) {
    pending.push(firstParent);
    for (
      let pStep = parentIter.next();
      !pStep.done;
      pStep = parentIter.next()
    ) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      pending.push(pStep.value);
    }
  }
  while (pending.length) {
    budget.check();
    if (budget.shouldYield()) await budget.yieldTurn();
    const node = pending.pop();
    if (visited.has(node)) continue;
    visited.add(node);
    for (const range of ranges.get(node) ?? []) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      result.add(range);
    }
    for (const parent of parents.get(node) ?? []) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      pending.push(parent);
    }
  }
  imposed.set(key, result);
  return result;
};

const inspectELRangesAsync = async (state, resume) => {
  const {
    members,
    ranges,
    rangeNodes,
    parents,
    imposed,
    budget,
    violate,
    validationPolicy,
    nativeKeys,
  } = state;
  let { hasSubChains } = state;
  const {
    pendingIter,
    pendingRange,
    pendingResult,
    pendingLastSet,
    pendingHeadPromise,
    pendingLastPromise,
  } = resume;
  let { inSecondPass, startM, startA } = resume;
  const yieldFirst = resume.yieldFirst !== false;
  const imposedRanges = async (property) => {
    const key = elKey(property, nativeKeys);
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
  const edge = (sub, sup) => {
    const key = elKey(sub, nativeKeys);
    let set = parents.get(key);
    if (!set) {
      set = new Set();
      parents.set(key, set);
    }
    set.add(elKey(sup, nativeKeys));
  };
  const handleRangeAxiom = async (value) => {
    const kind = value.kind;
    if (kind === K.SUB_PROPERTY_CHAIN_AXIOM) {
      hasSubChains = true;
    } else if (kind === K.SUB_OBJECT_PROPERTY_AXIOM) {
      edge(value.subProperty, value.superProperty);
    } else if (kind === K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM) {
      const props = value.properties;
      for (let i = 0; i < props.length; i++) {
        budget.check();
        if (budget.shouldYield()) await budget.yieldTurn();
        edge(props[i], props[0]);
        edge(props[0], props[i]);
      }
    } else if (kind === K.OBJECT_PROPERTY_RANGE_AXIOM) {
      const key = elKey(value.property, nativeKeys);
      let set = ranges.get(key);
      if (!set) {
        set = new Set();
        ranges.set(key, set);
      }
      const rKey = elKey(value.range, nativeKeys);
      set.add(rKey);
      if (!rangeNodes.has(rKey)) rangeNodes.set(rKey, value.range);
    }
  };
  if (!inSecondPass) {
    if (yieldFirst) await budget.yieldTurn();
    for (let m = startM; m < members.length; m++) {
      const stored = readSnapshotAxioms(members[m].snapshot);
      for (let a = m === startM ? startA : 0; a < stored.length; a++) {
        if (!yieldFirst || m !== startM || a !== startA) {
          budget.check();
          if (budget.shouldYield()) await budget.yieldTurn();
        }
        await handleRangeAxiom(stored.valueAt(a));
      }
    }
    startM = 0;
    startA = 0;
  }
  for (let m = startM; m < members.length; m++) {
    const { scope, snapshot } = members[m];
    const stored = readSnapshotAxioms(snapshot);
    if (!hasSubChains) {
      for (let a = m === startM ? startA : 0; a < stored.length; a++) {
        if (!(inSecondPass && m === resume.startM && a === resume.startA)) {
          budget.check();
          if (budget.shouldYield()) await budget.yieldTurn();
        } else {
          await budget.yieldTurn();
        }
      }
      continue;
    }
    for (let a = m === startM ? startA : 0; a < stored.length; a++) {
      const value = stored.valueAt(a);
      if (inSecondPass && m === resume.startM && a === resume.startA) {
        inSecondPass = false;
        if (pendingIter) {
          await budget.yieldTurn();
          const lastSet = pendingLastSet;
          if (pendingRange !== undefined && !lastSet.has(pendingRange)) {
            violate("EL_CHAIN_RANGE_NOT_IMPOSED_ON_LAST_PROPERTY", {
              profile: "EL",
              scope,
              range:
                rangeNodes.get(pendingRange)?.structuralKey() ?? pendingRange,
            });
          }
          for (
            let step = pendingIter.next();
            !step.done;
            step = pendingIter.next()
          ) {
            budget.check();
            if (budget.shouldYield()) await budget.yieldTurn();
            if (!lastSet.has(step.value))
              violate("EL_CHAIN_RANGE_NOT_IMPOSED_ON_LAST_PROPERTY", {
                profile: "EL",
                scope,
                range:
                  rangeNodes.get(step.value)?.structuralKey() ?? step.value,
              });
          }
          continue;
        }
        let headRanges, lastRanges;
        if (pendingHeadPromise) {
          headRanges = await pendingHeadPromise;
          lastRanges = validationPolicy.elLastChainPropertyInheritsRanges
            ? await imposedRanges(value.chain.at(-1))
            : (ranges.get(elKey(value.chain.at(-1), nativeKeys)) ?? new Set());
        } else if (pendingLastPromise) {
          headRanges = pendingResult;
          lastRanges = await pendingLastPromise;
        } else {
          await budget.yieldTurn();
          if (value.kind !== K.SUB_PROPERTY_CHAIN_AXIOM) continue;
          headRanges = await imposedRanges(value.superProperty);
          lastRanges = validationPolicy.elLastChainPropertyInheritsRanges
            ? await imposedRanges(value.chain.at(-1))
            : (ranges.get(elKey(value.chain.at(-1), nativeKeys)) ?? new Set());
        }
        for (const range of headRanges) {
          budget.check();
          if (budget.shouldYield()) await budget.yieldTurn();
          if (!lastRanges.has(range))
            violate("EL_CHAIN_RANGE_NOT_IMPOSED_ON_LAST_PROPERTY", {
              profile: "EL",
              scope,
              range: rangeNodes.get(range)?.structuralKey() ?? range,
            });
        }
        continue;
      }
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      if (value.kind !== K.SUB_PROPERTY_CHAIN_AXIOM) continue;
      const headRanges = await imposedRanges(value.superProperty);
      const lastRanges = validationPolicy.elLastChainPropertyInheritsRanges
        ? await imposedRanges(value.chain.at(-1))
        : (ranges.get(elKey(value.chain.at(-1), nativeKeys)) ?? new Set());
      for (const range of headRanges) {
        budget.check();
        if (budget.shouldYield()) await budget.yieldTurn();
        if (!lastRanges.has(range))
          violate("EL_CHAIN_RANGE_NOT_IMPOSED_ON_LAST_PROPERTY", {
            profile: "EL",
            scope,
            range: rangeNodes.get(range)?.structuralKey() ?? range,
          });
      }
    }
  }
};

const inspectELRanges = (
  axioms,
  budget,
  violate,
  validationPolicy,
  members,
  nativeKeys = false,
) => {
  // RC2-PRF-DIFF-003: imposed ranges follow zero or more subproperty steps;
  // equivalence contributes both directions. Cycles never restart traversal.
  const ranges = new Map(),
    rangeNodes = new Map(),
    parents = new Map(),
    imposed = new Map();
  const edge = (sub, sup) => {
    const key = elKey(sub, nativeKeys);
    let set = parents.get(key);
    if (!set) {
      set = new Set();
      parents.set(key, set);
    }
    set.add(elKey(sup, nativeKeys));
  };
  let hasSubChains = false;
  const makeState = () => ({
    members,
    ranges,
    rangeNodes,
    parents,
    imposed,
    hasSubChains,
    budget,
    violate,
    validationPolicy,
    nativeKeys,
  });
  for (let m = 0; m < members.length; m++) {
    const stored = readSnapshotAxioms(members[m].snapshot);
    for (let a = 0; a < stored.length; a++) {
      const value = stored.valueAt(a);
      budget.check();
      if (budget.shouldYield()) {
        return inspectELRangesAsync(makeState(), {
          inSecondPass: false,
          startM: m,
          startA: a,
          yieldFirst: true,
        });
      }
      const kind = value.kind;
      if (kind === K.SUB_PROPERTY_CHAIN_AXIOM) {
        hasSubChains = true;
      } else if (kind === K.SUB_OBJECT_PROPERTY_AXIOM) {
        edge(value.subProperty, value.superProperty);
      } else if (kind === K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM) {
        // A bidirectional star represents the same transitive equivalence closure
        // with linear storage instead of a quadratic complete edge inventory.
        const props = value.properties;
        for (let i = 0; i < props.length; i++) {
          budget.check();
          if (budget.shouldYield()) {
            return (async () => {
              await budget.yieldTurn();
              for (let k = i; k < props.length; k++) {
                if (k !== i) {
                  budget.check();
                  if (budget.shouldYield()) await budget.yieldTurn();
                }
                edge(props[k], props[0]);
                edge(props[0], props[k]);
              }
              return inspectELRangesAsync(makeState(), {
                inSecondPass: false,
                startM: a + 1 < stored.length ? m : m + 1,
                startA: a + 1 < stored.length ? a + 1 : 0,
                yieldFirst: false,
              });
            })();
          }
          edge(props[i], props[0]);
          edge(props[0], props[i]);
        }
      } else if (kind === K.OBJECT_PROPERTY_RANGE_AXIOM) {
        const key = elKey(value.property, nativeKeys);
        let set = ranges.get(key);
        if (!set) {
          set = new Set();
          ranges.set(key, set);
        }
        const rKey = elKey(value.range, nativeKeys);
        set.add(rKey);
        if (!rangeNodes.has(rKey)) rangeNodes.set(rKey, value.range);
      }
    }
  }
  if (!hasSubChains) {
    for (let m = 0; m < members.length; m++) {
      const stored = readSnapshotAxioms(members[m].snapshot);
      for (let a = 0; a < stored.length; a++) {
        budget.check();
        if (budget.shouldYield()) {
          return inspectELRangesAsync(makeState(), {
            inSecondPass: true,
            startM: m,
            startA: a,
            yieldFirst: true,
          });
        }
      }
    }
    return undefined;
  }
  const imposedRangesSync = (property) => {
    const key = elKey(property, nativeKeys);
    if (imposed.has(key)) return imposed.get(key);
    const result = new Set(),
      visited = new Set(),
      pending = [key];
    while (pending.length) {
      budget.check();
      if (budget.shouldYield()) {
        return finishImposedRanges(
          ranges,
          parents,
          imposed,
          budget,
          key,
          result,
          visited,
          pending,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        );
      }
      const current = pending.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      const rangeSet = ranges.get(current);
      if (rangeSet) {
        const rangeIter = rangeSet[Symbol.iterator]();
        for (
          let rStep = rangeIter.next();
          !rStep.done;
          rStep = rangeIter.next()
        ) {
          budget.check();
          if (budget.shouldYield()) {
            return finishImposedRanges(
              ranges,
              parents,
              imposed,
              budget,
              key,
              result,
              visited,
              pending,
              current,
              rStep.value,
              rangeIter,
              undefined,
              undefined,
            );
          }
          result.add(rStep.value);
        }
      }
      const parentSet = parents.get(current);
      if (parentSet) {
        const parentIter = parentSet[Symbol.iterator]();
        for (
          let pStep = parentIter.next();
          !pStep.done;
          pStep = parentIter.next()
        ) {
          budget.check();
          if (budget.shouldYield()) {
            return finishImposedRanges(
              ranges,
              parents,
              imposed,
              budget,
              key,
              result,
              visited,
              pending,
              undefined,
              undefined,
              undefined,
              pStep.value,
              parentIter,
            );
          }
          pending.push(pStep.value);
        }
      }
    }
    imposed.set(key, result);
    return result;
  };
  for (let m = 0; m < members.length; m++) {
    const { scope, snapshot } = members[m];
    const stored = readSnapshotAxioms(snapshot);
    for (let a = 0; a < stored.length; a++) {
      const value = stored.valueAt(a);
      budget.check();
      if (budget.shouldYield()) {
        return inspectELRangesAsync(makeState(), {
          inSecondPass: true,
          startM: m,
          startA: a,
          yieldFirst: true,
        });
      }
      if (value.kind !== K.SUB_PROPERTY_CHAIN_AXIOM) continue;
      const headRanges = imposedRangesSync(value.superProperty);
      if (!(headRanges instanceof Set)) {
        return inspectELRangesAsync(makeState(), {
          inSecondPass: true,
          startM: m,
          startA: a,
          yieldFirst: true,
          pendingHeadPromise: headRanges,
        });
      }
      const lastRanges = validationPolicy.elLastChainPropertyInheritsRanges
        ? imposedRangesSync(value.chain.at(-1))
        : (ranges.get(elKey(value.chain.at(-1), nativeKeys)) ?? new Set());
      if (!(lastRanges instanceof Set)) {
        return inspectELRangesAsync(makeState(), {
          inSecondPass: true,
          startM: m,
          startA: a,
          yieldFirst: true,
          pendingResult: headRanges,
          pendingLastPromise: lastRanges,
        });
      }
      const iter = headRanges[Symbol.iterator]();
      for (let step = iter.next(); !step.done; step = iter.next()) {
        budget.check();
        if (budget.shouldYield()) {
          return inspectELRangesAsync(makeState(), {
            inSecondPass: true,
            startM: m,
            startA: a,
            yieldFirst: true,
            pendingIter: iter,
            pendingRange: step.value,
            pendingResult: headRanges,
            pendingLastSet: lastRanges,
          });
        }
        const range = step.value;
        if (!lastRanges.has(range))
          violate("EL_CHAIN_RANGE_NOT_IMPOSED_ON_LAST_PROPERTY", {
            profile: "EL",
            scope,
            range: rangeNodes.get(range)?.structuralKey() ?? range,
          });
      }
    }
  }
  return undefined;
};

export const createProfileNodeInspector = (
  profile,
  budget,
  violate,
  validationPolicy,
) => {
  const datatypes = profile === "RL" ? rlDatatypes : elqlDatatypes;
  let excludedDatatypes;
  if (profile === "RL") {
    excludedDatatypes = excludedDatatypesByPolicy.get(validationPolicy);
    if (!excludedDatatypes) {
      excludedDatatypes = new Set(
        validationPolicy.rlExcludedDatatypeNames.map((name) => XSD + name),
      );
      excludedDatatypesByPolicy.set(validationPolicy, excludedDatatypes);
    }
  }
  const nodeViolation = (code, value, scope, extra) =>
    violate(code, { profile, scope, kind: value.kind, ...extra });
  return (node) => {
    const { value, scope, annotationContext } = node;
    // Annotation values retain the common lexical/structural checks, but are
    // outside the logical profile's data-range and individual productions.
    if (
      annotationContext ||
      value.kind === K.IRI ||
      value.kind === K.CLASS ||
      value.kind === K.NAMED_INDIVIDUAL
    )
      return;
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
  };
};

/** Apply profile-specific grammar and global constraints after common DL
 * structure validation. Entries retain closure scope and the offending kind.
 */
export const inspectProfileRules = (
  profile,
  axioms,
  nodes,
  budget,
  violate,
  validationPolicy,
  context,
) => {
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
  const visitNode = context.skipNodes
    ? undefined
    : createProfileNodeInspector(profile, budget, violate, validationPolicy);
  const visitAxiom = (value, scope) => {
    if (forbiddenAxioms[profile].has(value.kind))
      nodeViolation("PROFILE_AXIOM_NOT_ALLOWED", value, scope);
    if (profile === "EL") return;
    switch (value.kind) {
      case K.SUBCLASS_OF_AXIOM:
        check(value.subClass, "sub", scope, value.kind);
        check(value.superClass, "super", scope, value.kind);
        break;
      case K.EQUIVALENT_CLASSES_AXIOM: {
        const exprs = value.classExpressions;
        const pos = profile === "RL" ? "equiv" : "sub";
        for (let i = 0; i < exprs.length; i++)
          check(exprs[i], pos, scope, value.kind);
        break;
      }
      case K.DISJOINT_CLASSES_AXIOM: {
        const exprs = value.classExpressions;
        const pos =
          profile === "RL" ? validationPolicy.rlDisjointOperandPosition : "sub";
        for (let i = 0; i < exprs.length; i++)
          check(exprs[i], pos, scope, value.kind);
        break;
      }
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
  };
  const finishAxiomsAsync = async (startM, startA, yieldFirst = true) => {
    if (yieldFirst) await budget.yieldTurn();
    for (let m = startM; m < context.members.length; m++) {
      const { scope, snapshot } = context.members[m];
      const stored = readSnapshotAxioms(snapshot);
      for (let a = m === startM ? startA : 0; a < stored.length; a++) {
        if (!yieldFirst || m !== startM || a !== startA) {
          budget.check();
          if (budget.shouldYield()) await budget.yieldTurn();
        }
        visitAxiom(stored.valueAt(a), scope);
      }
    }
    if (profile === "EL") {
      const el = inspectELRanges(
        axioms,
        budget,
        violate,
        validationPolicy,
        context.members,
        context.allTrusted === true,
      );
      if (el) await el;
    }
  };
  if (visitNode) {
    const nodeCursor = createScopedNodeCursor(
      context.members,
      context.sourceRoots,
      validationPolicy,
    );
    let cursorClosed = false;
    try {
      for (
        let node = nodeCursor.next();
        node !== undefined;
        node = nodeCursor.next()
      ) {
        budget.check();
        if (budget.shouldYield()) {
          cursorClosed = true;
          return (async () => {
            try {
              await budget.yieldTurn();
              visitNode(node);
              for (
                let nextNode = nodeCursor.next();
                nextNode !== undefined;
                nextNode = nodeCursor.next()
              ) {
                budget.check();
                if (budget.shouldYield()) await budget.yieldTurn();
                visitNode(nextNode);
              }
            } finally {
              nodeCursor.close();
            }
            await finishAxiomsAsync(0, 0, false);
          })();
        }
        visitNode(node);
      }
    } finally {
      if (!cursorClosed) nodeCursor.close();
    }
  }
  for (let m = 0; m < context.members.length; m++) {
    const { scope, snapshot } = context.members[m];
    const stored = readSnapshotAxioms(snapshot);
    for (let a = 0; a < stored.length; a++) {
      const value = stored.valueAt(a);
      budget.check();
      if (budget.shouldYield()) {
        return finishAxiomsAsync(m, a);
      }
      visitAxiom(value, scope);
    }
  }
  if (profile === "EL")
    return inspectELRanges(
      axioms,
      budget,
      violate,
      validationPolicy,
      context.members,
      context.allTrusted === true,
    );
  return undefined;
};
