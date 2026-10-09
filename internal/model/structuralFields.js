import {
  OWLObjectKind as K,
  AXIOM_KINDS,
  ENTITY_KINDS,
} from "../../model/kinds.js";
export const structuralFields = new Map();
const register = (kinds, names) => {
  for (const kind of kinds) structuralFields.set(kind, names);
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
  structuralFields.set(kind, [...structuralFields.get(kind), "annotations"]);
