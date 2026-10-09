import {
  OWLObjectKind as K,
  CLASS_EXPRESSION_KINDS,
} from "../../model/kinds.js";
import { isLogicalAxiom } from "../model/axiomSemantics.js";
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
export const isSyntacticallyLocal = async (
  axiom,
  order,
  signature,
  mode,
  budget,
) => {
  if (!isLogicalAxiom(axiom)) return true;
  const bottomMode = mode === "BOTTOM",
    results = new Map();
  const absent = (property) => !signature.has(named(property).structuralKey());
  const bottom = (value) => results.get(value)?.bottom ?? false;
  const top = (value) => results.get(value)?.top ?? false;
  for (const value of order) {
    await budget.checkpoint();
    if (!classes.has(value.kind)) continue;
    let b = false,
      t = false;
    const outside = value.property
      ? absent(value.property)
      : value.properties
        ? value.properties.every(absent)
        : false;
    const n = value.cardinality,
      filler = value.filler;
    switch (value.kind) {
      case K.CLASS:
        b =
          value.iri.value === OWL + "Nothing" ||
          (bottomMode &&
            value.iri.value !== OWL + "Thing" &&
            !signature.has(value.structuralKey()));
        t =
          value.iri.value === OWL + "Thing" ||
          (!bottomMode &&
            value.iri.value !== OWL + "Nothing" &&
            !signature.has(value.structuralKey()));
        break;
      case K.OBJECT_INTERSECTION_OF:
        b = !value.operands.some(bottom);
        t = !value.operands.some(top);
        break;
      case K.OBJECT_UNION_OF:
        b = value.operands.some(bottom);
        t = value.operands.some(top);
        break;
      case K.OBJECT_COMPLEMENT_OF:
        b = top(value.operand);
        t = bottom(value.operand);
        break;
      case K.OBJECT_ONE_OF:
        b = value.individuals.length === 0;
        break;
      case K.OBJECT_HAS_SELF:
      case K.OBJECT_HAS_VALUE:
        b = bottomMode && outside;
        t = !bottomMode && outside;
        break;
      case K.OBJECT_SOME_VALUES_FROM:
        b = bottomMode ? outside || bottom(filler) : bottom(filler);
        t = !bottomMode && outside && top(filler);
        break;
      case K.OBJECT_ALL_VALUES_FROM:
        b = !bottomMode && outside && bottom(filler);
        t = bottomMode ? outside || top(filler) : top(filler);
        break;
      case K.OBJECT_MIN_CARDINALITY:
        b = n > 0 && (bottomMode ? outside || bottom(filler) : bottom(filler));
        t = n === 0 || (!bottomMode && outside && top(filler));
        break;
      case K.OBJECT_MAX_CARDINALITY:
        b = !bottomMode && n > 0 && outside && top(filler);
        t = bottom(filler) || (bottomMode && outside);
        break;
      case K.OBJECT_EXACT_CARDINALITY:
        b =
          n > 0 &&
          (bottom(filler) || (bottomMode ? outside : outside && top(filler)));
        t = n === 0 && (bottom(filler) || (bottomMode && outside));
        break;
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
    results.set(value, { bottom: b, top: t });
  }
  await budget.checkpoint();
  switch (axiom.kind) {
    case K.DATATYPE_DEFINITION_AXIOM:
    case K.HAS_KEY_AXIOM:
      return true;
    case K.SUBCLASS_OF_AXIOM:
      return bottom(axiom.subClass) || top(axiom.superClass);
    case K.CLASS_ASSERTION_AXIOM:
      return top(axiom.classExpression);
    case K.DISJOINT_CLASSES_AXIOM:
      return (
        axiom.classExpressions.filter((value) => !bottom(value)).length <= 1
      );
    case K.EQUIVALENT_CLASSES_AXIOM: {
      const values = axiom.classExpressions;
      return (
        values.length < 2 ||
        (bottom(values[0]) ? values.every(bottom) : values.every(top))
      );
    }
    case K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM:
    case K.EQUIVALENT_DATA_PROPERTIES_AXIOM:
      return axiom.properties.length < 2 || axiom.properties.every(absent);
    case K.INVERSE_OBJECT_PROPERTIES_AXIOM:
      return axiom.properties.every(absent);
    case K.SYMMETRIC_OBJECT_PROPERTY_AXIOM:
    case K.TRANSITIVE_OBJECT_PROPERTY_AXIOM:
      return absent(axiom.property);
    case K.ASYMMETRIC_OBJECT_PROPERTY_AXIOM:
    case K.FUNCTIONAL_OBJECT_PROPERTY_AXIOM:
    case K.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM:
    case K.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM:
    case K.FUNCTIONAL_DATA_PROPERTY_AXIOM:
    case K.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM:
    case K.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM:
      return bottomMode && absent(axiom.property);
    case K.REFLEXIVE_OBJECT_PROPERTY_AXIOM:
    case K.OBJECT_PROPERTY_ASSERTION_AXIOM:
    case K.DATA_PROPERTY_ASSERTION_AXIOM:
      return !bottomMode && absent(axiom.property);
    case K.OBJECT_PROPERTY_DOMAIN_AXIOM:
      return top(axiom.domain) || (bottomMode && absent(axiom.property));
    case K.OBJECT_PROPERTY_RANGE_AXIOM:
      return top(axiom.range) || (bottomMode && absent(axiom.property));
    case K.SUB_OBJECT_PROPERTY_AXIOM:
      return absent(bottomMode ? axiom.subProperty : axiom.superProperty);
    case K.SUB_PROPERTY_CHAIN_AXIOM:
      return bottomMode
        ? axiom.chain.some(absent)
        : absent(axiom.superProperty);
    case K.DISJOINT_OBJECT_PROPERTIES_AXIOM:
    case K.DISJOINT_DATA_PROPERTIES_AXIOM:
      // The pinned visitor tests direct named members, not inverse expressions.
      return (
        bottomMode &&
        axiom.properties.filter(
          (property) =>
            property.kind !== K.OBJECT_INVERSE_OF && !absent(property),
        ).length <= 1
      );
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
