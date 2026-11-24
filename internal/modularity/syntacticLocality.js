import {
  OWLObjectKind as K,
  CLASS_EXPRESSION_KINDS,
} from "../../model/kinds.js";
import {
  OWL_BUILT_IN_DATATYPES,
  OWL_NAMESPACE as OWL,
  RDFS_NAMESPACE as RDFS,
  XSD_NAMESPACE as XSD,
} from "../rdfjs/vocabulary.js";

const classes = new Set(CLASS_EXPRESSION_KINDS);
const finite = new Set(
  [
    "language",
    "long",
    "int",
    "short",
    "byte",
    "unsignedLong",
    "unsignedInt",
    "unsignedShort",
    "unsignedByte",
    "double",
    "float",
    "boolean",
  ].map((name) => XSD + name),
);
const builtin = new Set([...OWL_BUILT_IN_DATATYPES, RDFS + "Literal"]);
const topDatatype = (value) =>
  value?.kind === K.DATATYPE && value.iri.value === RDFS + "Literal";
const inhabited = (value) =>
  value?.kind === K.DATATYPE && builtin.has(value.iri.value);
const infinite = (value) => inhabited(value) && !finite.has(value.iri.value);
const named = (property) =>
  property.kind === K.OBJECT_INVERSE_OF ? property.inverse : property;

/** Evaluate the pinned Java public syntactic-locality contract in children-first
 * order. In particular its intersection uses !any and its union uses any for
 * both equivalence tests; preserve these observed rules rather than substitute
 * a different literature evaluator. No recursive visitor or depth cap is used.
 */
export const isSyntacticallyLocal = (
  axiom,
  order,
  contains,
  mode,
  budget,
  results = new Map(),
  checkCount = order.length + 1,
) => {
  const bottomMode = mode === "BOTTOM";
  if (
    axiom.kind === K.SUBCLASS_OF_AXIOM &&
    axiom.subClass.kind === K.CLASS &&
    axiom.superClass.kind === K.CLASS
  ) {
    budget.check(checkCount);
    const sub = axiom.subClass;
    const subIri = sub.iri.value;
    if (
      subIri === OWL + "Nothing" ||
      (bottomMode && subIri !== OWL + "Thing" && !contains(sub))
    ) {
      return true;
    }
    const sup = axiom.superClass;
    const supIri = sup.iri.value;
    return (
      supIri === OWL + "Thing" ||
      (!bottomMode && supIri !== OWL + "Nothing" && !contains(sup))
    );
  }
  budget.check(checkCount);
  if (order.length > 0) {
    results.clear();
  }
  for (let o = 0; o < order.length; o++) {
    const value = order[o];
    if (!classes.has(value.kind)) continue;
    let b = false,
      t = false;
    let outside = false;
    if (value.property) {
      outside = !contains(named(value.property));
    } else if (value.properties) {
      const props = value.properties;
      outside = true;
      for (let i = 0; i < props.length; i++) {
        if (contains(named(props[i]))) {
          outside = false;
          break;
        }
      }
    }
    const n = value.cardinality,
      filler = value.filler;
    switch (value.kind) {
      case K.CLASS: {
        const iri = value.iri.value;
        b =
          iri === OWL + "Nothing" ||
          (bottomMode && iri !== OWL + "Thing" && !contains(value));
        t =
          iri === OWL + "Thing" ||
          (!bottomMode && iri !== OWL + "Nothing" && !contains(value));
        break;
      }
      case K.OBJECT_INTERSECTION_OF: {
        const operands = value.operands;
        b = true;
        t = true;
        for (let i = 0; i < operands.length; i++) {
          const code = results.get(operands[i]);
          if (code % 2 === 1) b = false;
          if (code >= 2) t = false;
          if (!b && !t) break;
        }
        break;
      }
      case K.OBJECT_UNION_OF: {
        const operands = value.operands;
        for (let i = 0; i < operands.length; i++) {
          const code = results.get(operands[i]);
          if (code % 2 === 1) b = true;
          if (code >= 2) t = true;
          if (b && t) break;
        }
        break;
      }
      case K.OBJECT_COMPLEMENT_OF: {
        const opCode = results.get(value.operand);
        b = opCode >= 2;
        t = opCode % 2 === 1;
        break;
      }
      case K.OBJECT_ONE_OF:
        b = value.individuals.length === 0;
        break;
      case K.OBJECT_HAS_SELF:
      case K.OBJECT_HAS_VALUE:
        b = bottomMode && outside;
        t = !bottomMode && outside;
        break;
      case K.OBJECT_SOME_VALUES_FROM: {
        const fCode = results.get(filler);
        const fBottom = fCode % 2 === 1;
        b = bottomMode ? outside || fBottom : fBottom;
        t = !bottomMode && outside && fCode >= 2;
        break;
      }
      case K.OBJECT_ALL_VALUES_FROM: {
        const fCode = results.get(filler);
        const fTop = fCode >= 2;
        b = !bottomMode && outside && fCode % 2 === 1;
        t = bottomMode ? outside || fTop : fTop;
        break;
      }
      case K.OBJECT_MIN_CARDINALITY: {
        const fCode = results.get(filler);
        const fBottom = fCode % 2 === 1;
        b = n > 0 && (bottomMode ? outside || fBottom : fBottom);
        t = n === 0 || (!bottomMode && outside && fCode >= 2);
        break;
      }
      case K.OBJECT_MAX_CARDINALITY: {
        const fCode = results.get(filler);
        b = !bottomMode && n > 0 && outside && fCode >= 2;
        t = fCode % 2 === 1 || (bottomMode && outside);
        break;
      }
      case K.OBJECT_EXACT_CARDINALITY: {
        const fCode = results.get(filler);
        const fBottom = fCode % 2 === 1;
        b =
          n > 0 && (fBottom || (bottomMode ? outside : outside && fCode >= 2));
        t = n === 0 && (fBottom || (bottomMode && outside));
        break;
      }
      case K.DATA_HAS_VALUE:
        b = bottomMode && outside;
        t = !bottomMode && outside;
        break;
      case K.DATA_SOME_VALUES_FROM:
        t = !bottomMode && outside && inhabited(filler);
        break;
      case K.DATA_ALL_VALUES_FROM:
        b = !bottomMode && outside && !topDatatype(filler);
        t = topDatatype(filler) || (bottomMode && outside);
        break;
      case K.DATA_MIN_CARDINALITY:
        b = bottomMode && n > 0 && outside;
        t =
          n === 0 ||
          (outside && (n === 1 ? inhabited(filler) : infinite(filler)));
        break;
      case K.DATA_MAX_CARDINALITY:
        b = !bottomMode && outside && n <= 1 && inhabited(filler);
        t = bottomMode && outside;
        break;
      case K.DATA_EXACT_CARDINALITY:
        b = bottomMode
          ? n > 0 && outside
          : outside && (n === 0 ? inhabited(filler) : infinite(filler));
        t = bottomMode && n === 0 && outside;
        break;
      default:
        throw new TypeError("Unsupported locality class expression");
    }
    results.set(value, Number(b) + 2 * Number(t));
  }
  switch (axiom.kind) {
    case K.DATATYPE_DEFINITION_AXIOM:
    case K.HAS_KEY_AXIOM:
      return true;
    case K.SUBCLASS_OF_AXIOM:
      return (
        results.get(axiom.subClass) % 2 === 1 ||
        results.get(axiom.superClass) >= 2
      );
    case K.CLASS_ASSERTION_AXIOM:
      return results.get(axiom.classExpression) >= 2;
    case K.DISJOINT_CLASSES_AXIOM: {
      const exprs = axiom.classExpressions;
      let nonBottom = 0;
      for (let i = 0; i < exprs.length; i++) {
        if (results.get(exprs[i]) % 2 !== 1 && ++nonBottom > 1) return false;
      }
      return true;
    }
    case K.EQUIVALENT_CLASSES_AXIOM: {
      const values = axiom.classExpressions;
      if (values.length < 2) return true;
      const checkBottom = results.get(values[0]) % 2 === 1;
      for (let i = 0; i < values.length; i++) {
        const code = results.get(values[i]);
        if (checkBottom ? code % 2 !== 1 : !(code >= 2)) return false;
      }
      return true;
    }
    case K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM:
    case K.EQUIVALENT_DATA_PROPERTIES_AXIOM: {
      const props = axiom.properties;
      if (props.length < 2) return true;
      for (let i = 0; i < props.length; i++) {
        if (contains(named(props[i]))) return false;
      }
      return true;
    }
    case K.INVERSE_OBJECT_PROPERTIES_AXIOM: {
      const props = axiom.properties;
      for (let i = 0; i < props.length; i++) {
        if (contains(named(props[i]))) return false;
      }
      return true;
    }
    case K.SYMMETRIC_OBJECT_PROPERTY_AXIOM:
    case K.TRANSITIVE_OBJECT_PROPERTY_AXIOM:
      return !contains(named(axiom.property));
    case K.ASYMMETRIC_OBJECT_PROPERTY_AXIOM:
    case K.FUNCTIONAL_OBJECT_PROPERTY_AXIOM:
    case K.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM:
    case K.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM:
    case K.FUNCTIONAL_DATA_PROPERTY_AXIOM:
    case K.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM:
    case K.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM:
      return bottomMode && !contains(named(axiom.property));
    case K.REFLEXIVE_OBJECT_PROPERTY_AXIOM:
    case K.OBJECT_PROPERTY_ASSERTION_AXIOM:
    case K.DATA_PROPERTY_ASSERTION_AXIOM:
      return !bottomMode && !contains(named(axiom.property));
    case K.OBJECT_PROPERTY_DOMAIN_AXIOM:
      return (
        results.get(axiom.domain) >= 2 ||
        (bottomMode && !contains(named(axiom.property)))
      );
    case K.OBJECT_PROPERTY_RANGE_AXIOM:
      return (
        results.get(axiom.range) >= 2 ||
        (bottomMode && !contains(named(axiom.property)))
      );
    case K.SUB_OBJECT_PROPERTY_AXIOM:
      return !contains(
        named(bottomMode ? axiom.subProperty : axiom.superProperty),
      );
    case K.SUB_PROPERTY_CHAIN_AXIOM: {
      if (!bottomMode) return !contains(named(axiom.superProperty));
      const chain = axiom.chain;
      for (let i = 0; i < chain.length; i++) {
        if (!contains(named(chain[i]))) return true;
      }
      return false;
    }
    case K.DISJOINT_OBJECT_PROPERTIES_AXIOM:
    case K.DISJOINT_DATA_PROPERTIES_AXIOM: {
      // The pinned visitor tests direct named members, not inverse expressions.
      if (!bottomMode) return false;
      const props = axiom.properties;
      let presentNamed = 0;
      for (let i = 0; i < props.length; i++) {
        const property = props[i];
        if (
          property.kind !== K.OBJECT_INVERSE_OF &&
          contains(named(property))
        ) {
          if (++presentNamed > 1) return false;
        }
      }
      return true;
    }
    // These logical axioms retain the native visitor's non-local default.
    case K.DISJOINT_UNION_AXIOM:
    case K.SUB_DATA_PROPERTY_AXIOM:
    case K.DATA_PROPERTY_DOMAIN_AXIOM:
    case K.DATA_PROPERTY_RANGE_AXIOM:
    case K.SAME_INDIVIDUAL_AXIOM:
    case K.DIFFERENT_INDIVIDUALS_AXIOM:
      return false;
    default:
      throw new TypeError("Unsupported locality axiom");
  }
};
