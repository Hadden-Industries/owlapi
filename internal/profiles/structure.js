import {
  OWLObjectKind as K,
  AXIOM_KINDS,
  ENTITY_KINDS,
} from "../../model/kinds.js";
import { IRI, OWLStructuralObject } from "../../model/structural.js";
import {
  OWLDataFactory,
  createSourcePreservingDataFactory,
} from "../../model/owlDataFactory.js";
import {
  minimumTwoSetFields,
  repeatSingleton,
} from "../model/setConstructs.js";

const fields = new Map();
const register = (kinds, names) => {
  for (const kind of kinds) fields.set(kind, names);
};
register(ENTITY_KINDS, ["iri"]);
register([K.IRI], ["value"]);
register([K.LITERAL], ["lexicalForm", "datatype", "language"]);
register([K.ANONYMOUS_INDIVIDUAL], ["nodeID", "documentScope"]);
register([K.ONTOLOGY_ID], ["ontologyIRI", "versionIRI"]);
register([K.IMPORTS_DECLARATION], ["iri"]);
register([K.ANNOTATION], ["property", "value", "annotations"]);
register([K.OBJECT_INVERSE_OF], ["inverse"]);
register(
  [
    K.OBJECT_INTERSECTION_OF,
    K.OBJECT_UNION_OF,
    K.DATA_INTERSECTION_OF,
    K.DATA_UNION_OF,
  ],
  ["operands"],
);
register([K.OBJECT_COMPLEMENT_OF, K.DATA_COMPLEMENT_OF], ["operand"]);
register(
  [K.OBJECT_ONE_OF, K.SAME_INDIVIDUAL_AXIOM, K.DIFFERENT_INDIVIDUALS_AXIOM],
  ["individuals"],
);
register(
  [K.OBJECT_SOME_VALUES_FROM, K.OBJECT_ALL_VALUES_FROM],
  ["property", "filler"],
);
register(
  [K.DATA_SOME_VALUES_FROM, K.DATA_ALL_VALUES_FROM],
  ["properties", "filler"],
);
register([K.OBJECT_HAS_VALUE], ["property", "individual"]);
register([K.DATA_HAS_VALUE], ["property", "value"]);
register(
  [
    K.OBJECT_MIN_CARDINALITY,
    K.OBJECT_MAX_CARDINALITY,
    K.OBJECT_EXACT_CARDINALITY,
    K.DATA_MIN_CARDINALITY,
    K.DATA_MAX_CARDINALITY,
    K.DATA_EXACT_CARDINALITY,
  ],
  ["cardinality", "property", "filler"],
);
register([K.DATA_ONE_OF], ["values"]);
register([K.DATATYPE_RESTRICTION], ["datatype", "facetRestrictions"]);
register([K.FACET_RESTRICTION], ["facet", "value"]);
register([K.DECLARATION_AXIOM], ["entity"]);
register([K.SUBCLASS_OF_AXIOM], ["subClass", "superClass"]);
register(
  [K.EQUIVALENT_CLASSES_AXIOM, K.DISJOINT_CLASSES_AXIOM],
  ["classExpressions"],
);
register([K.DISJOINT_UNION_AXIOM], ["owlClass", "classExpressions"]);
register(
  [
    K.SUB_OBJECT_PROPERTY_AXIOM,
    K.SUB_DATA_PROPERTY_AXIOM,
    K.SUB_ANNOTATION_PROPERTY_AXIOM,
  ],
  ["subProperty", "superProperty"],
);
register([K.SUB_PROPERTY_CHAIN_AXIOM], ["chain", "superProperty"]);
register(
  [
    K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM,
    K.DISJOINT_OBJECT_PROPERTIES_AXIOM,
    K.INVERSE_OBJECT_PROPERTIES_AXIOM,
    K.EQUIVALENT_DATA_PROPERTIES_AXIOM,
    K.DISJOINT_DATA_PROPERTIES_AXIOM,
  ],
  ["properties"],
);
register(
  [
    K.OBJECT_PROPERTY_DOMAIN_AXIOM,
    K.DATA_PROPERTY_DOMAIN_AXIOM,
    K.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
  ],
  ["property", "domain"],
);
register(
  [
    K.OBJECT_PROPERTY_RANGE_AXIOM,
    K.DATA_PROPERTY_RANGE_AXIOM,
    K.ANNOTATION_PROPERTY_RANGE_AXIOM,
  ],
  ["property", "range"],
);
register(
  [
    K.OBJECT_HAS_SELF,
    K.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    K.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    K.REFLEXIVE_OBJECT_PROPERTY_AXIOM,
    K.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
    K.SYMMETRIC_OBJECT_PROPERTY_AXIOM,
    K.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
    K.TRANSITIVE_OBJECT_PROPERTY_AXIOM,
    K.FUNCTIONAL_DATA_PROPERTY_AXIOM,
  ],
  ["property"],
);
register([K.DATATYPE_DEFINITION_AXIOM], ["datatype", "dataRange"]);
register(
  [K.HAS_KEY_AXIOM],
  ["classExpression", "objectProperties", "dataProperties"],
);
register([K.CLASS_ASSERTION_AXIOM], ["classExpression", "individual"]);
register(
  [
    K.OBJECT_PROPERTY_ASSERTION_AXIOM,
    K.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
    K.DATA_PROPERTY_ASSERTION_AXIOM,
    K.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
    K.ANNOTATION_ASSERTION_AXIOM,
  ],
  ["property", "subject", "value"],
);
for (const kind of AXIOM_KINDS)
  fields.set(kind, [...fields.get(kind), "annotations"]);

export class ProfileStructureError extends Error {}
const fail = () => {
  throw new ProfileStructureError("Not an immutable package structural model");
};
const key = (object) =>
  OWLStructuralObject.prototype.structuralKey.call(object);

export const validateStructuralShape = (value) => {
  if (!Object.isFrozen(value)) return fail();
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return fail();
    if (Reflect.ownKeys(value).length !== value.length + 1) return fail();
    for (let index = 0; index < value.length; index += 1)
      if (
        !Object.hasOwn(
          Object.getOwnPropertyDescriptor(value, index) ?? {},
          "value",
        )
      )
        return fail();
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== IRI.prototype &&
    prototype !== OWLStructuralObject.prototype
  )
    return fail();
  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kind || !Object.hasOwn(kind, "value")) return fail();
  const names = fields.get(kind.value);
  if (!names || Reflect.ownKeys(value).length !== names.length + 1)
    return fail();
  for (const name of ["kind", ...names])
    if (
      !Object.hasOwn(
        Object.getOwnPropertyDescriptor(value, name) ?? {},
        "value",
      )
    )
      return fail();
  try {
    key(value);
  } catch {
    return fail();
  }
};

/** Recheck factory invariants and stored-key/field agreement after every child
 * has passed the data-only shape check. Public OWLStructuralObject constructors
 * cannot manufacture a false-valid report by supplying different key tuples.
 */
export const createStructuralValidator = () => {
  const factory = createSourcePreservingDataFactory(new OWLDataFactory());
  return (value) => {
    let rebuilt;
    try {
      if (value.kind === K.IRI) rebuilt = IRI.create(value.value);
      else if (value.kind === K.LITERAL)
        rebuilt = factory.getOWLLiteral(
          value.lexicalForm,
          value.language || value.datatype,
        );
      else if (value.kind === K.INVERSE_OBJECT_PROPERTIES_AXIOM) {
        if (value.properties.length !== 2) return fail();
        rebuilt = factory.getOWLInverseObjectPropertiesAxiom(
          value.properties[0],
          value.properties[1],
          value.annotations,
        );
      } else if (
        value.kind === K.ONTOLOGY_ID &&
        value.ontologyIRI === undefined
      ) {
        if (value.versionIRI !== undefined) return fail();
        return;
      } else {
        const setField = minimumTwoSetFields.get(value.kind);
        const args = fields
          .get(value.kind)
          .map((field) =>
            field === setField ? repeatSingleton(value[field]) : value[field],
          );
        rebuilt = factory[`get${value.kind}`](...args);
      }
      if (key(rebuilt) !== key(value)) return fail();
    } catch (error) {
      if (
        error instanceof TypeError ||
        error instanceof RangeError ||
        error instanceof ProfileStructureError
      )
        return fail();
      throw error;
    }
  };
};
