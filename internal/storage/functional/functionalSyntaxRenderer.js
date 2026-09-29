import { parseIri } from "@hyperjump/uri";
import { parse as parseLanguageTag } from "bcp-47";
import { OWLOntologyStorageError } from "../../../io/errors.js";
import { OWLObjectKind } from "../../../model/kinds.js";

const notRepresentable = (message) => {
  throw new OWLOntologyStorageError(message, {
    reason: "ONTOLOGY_NOT_REPRESENTABLE",
  });
};

const fullIri = (iri) => {
  // RFC 3987 IRI includes fragments; absolute-IRI specifically excludes them.
  // Validate, never normalize: lexical IRI identity is part of OWL structure.
  if (typeof iri.value !== "string" || !iri.value.isWellFormed()) {
    notRepresentable("Functional Syntax requires a well-formed full IRI");
  }
  try {
    parseIri(iri.value);
  } catch {
    notRepresentable("Functional Syntax requires a well-formed full IRI");
  }
  return `<${iri.value}>`;
};

const renderLiteral = (literal, render) => {
  const { lexicalForm, language } = literal;
  if (typeof lexicalForm !== "string" || !lexicalForm.isWellFormed()) {
    notRepresentable("A literal must contain well-formed Unicode characters");
  }
  // W3C OWL 2 quotedString escapes only quote and backslash. JSON escaping
  // would change the value of literal tabs and line breaks on OWL reload.
  const quoted = `"${lexicalForm.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  if (typeof language !== "string")
    notRepresentable("Invalid literal language");
  if (!language) return `${quoted}^^${render(literal.datatype)}`;
  let invalid = false;
  const parsed = parseLanguageTag(language, {
    normalize: false,
    forgiving: false,
    warning() {
      invalid = true;
    },
  });
  // OWL names the BCP 47 langtag production, not the separate privateuse or
  // irregular grandfathered alternatives. Regular grandfathered tags already
  // satisfy langtag and must retain their original spelling.
  if (invalid || !(parsed.language || parsed.regular)) {
    notRepresentable("The literal language does not match BCP 47 langtag");
  }
  return `${quoted}@${language}`;
};

const renderFields = (object, fields, render) =>
  fields.flatMap((field) => {
    const value = object[field];
    return Array.isArray(value) ? value.map(render) : [render(value)];
  });

const form =
  (name, fields, annotated = false) =>
  (object, render) => {
    const values = annotated ? object.annotations.map(render) : [];
    values.push(...renderFields(object, fields, render));
    return `${name}(${values.join(" ")})`;
  };

const cardinality = (name) => (object, render) =>
  `${name}(${object.cardinality} ${render(object.property)} ${render(object.filler)})`;

const entityNames = Object.freeze({
  [OWLObjectKind.CLASS]: "Class",
  [OWLObjectKind.DATATYPE]: "Datatype",
  [OWLObjectKind.OBJECT_PROPERTY]: "ObjectProperty",
  [OWLObjectKind.DATA_PROPERTY]: "DataProperty",
  [OWLObjectKind.ANNOTATION_PROPERTY]: "AnnotationProperty",
  [OWLObjectKind.NAMED_INDIVIDUAL]: "NamedIndividual",
});
const entity = (object, render) => render(object.iri);

// Explicit OWL grammar production mappings: a future model kind cannot become
// accidentally supported through a kind-name transformation or a fallback.
const renderers = Object.freeze({
  [OWLObjectKind.IRI]: fullIri,
  [OWLObjectKind.LITERAL]: renderLiteral,
  [OWLObjectKind.ANONYMOUS_INDIVIDUAL]: (object, _render, labels) => {
    const key = object.structuralKey();
    if (!labels.has(key)) labels.set(key, `_:genid${labels.size}`);
    return labels.get(key);
  },
  [OWLObjectKind.ANNOTATION]: form("Annotation", ["property", "value"], true),
  [OWLObjectKind.IMPORTS_DECLARATION]: form("Import", ["iri"]),
  [OWLObjectKind.ONTOLOGY_ID]: (object, render) =>
    [object.ontologyIRI, object.versionIRI]
      .filter((value) => value !== undefined)
      .map(render)
      .join(" "),
  [OWLObjectKind.CLASS]: entity,
  [OWLObjectKind.DATATYPE]: entity,
  [OWLObjectKind.OBJECT_PROPERTY]: entity,
  [OWLObjectKind.DATA_PROPERTY]: entity,
  [OWLObjectKind.ANNOTATION_PROPERTY]: entity,
  [OWLObjectKind.NAMED_INDIVIDUAL]: entity,
  [OWLObjectKind.OBJECT_INVERSE_OF]: form("ObjectInverseOf", ["inverse"]),
  [OWLObjectKind.OBJECT_INTERSECTION_OF]: form("ObjectIntersectionOf", [
    "operands",
  ]),
  [OWLObjectKind.OBJECT_UNION_OF]: form("ObjectUnionOf", ["operands"]),
  [OWLObjectKind.OBJECT_COMPLEMENT_OF]: form("ObjectComplementOf", ["operand"]),
  [OWLObjectKind.OBJECT_ONE_OF]: form("ObjectOneOf", ["individuals"]),
  [OWLObjectKind.OBJECT_SOME_VALUES_FROM]: form("ObjectSomeValuesFrom", [
    "property",
    "filler",
  ]),
  [OWLObjectKind.OBJECT_ALL_VALUES_FROM]: form("ObjectAllValuesFrom", [
    "property",
    "filler",
  ]),
  [OWLObjectKind.OBJECT_HAS_VALUE]: form("ObjectHasValue", [
    "property",
    "individual",
  ]),
  [OWLObjectKind.OBJECT_HAS_SELF]: form("ObjectHasSelf", ["property"]),
  [OWLObjectKind.OBJECT_MIN_CARDINALITY]: cardinality("ObjectMinCardinality"),
  [OWLObjectKind.OBJECT_MAX_CARDINALITY]: cardinality("ObjectMaxCardinality"),
  [OWLObjectKind.OBJECT_EXACT_CARDINALITY]: cardinality(
    "ObjectExactCardinality",
  ),
  [OWLObjectKind.DATA_SOME_VALUES_FROM]: form("DataSomeValuesFrom", [
    "properties",
    "filler",
  ]),
  [OWLObjectKind.DATA_ALL_VALUES_FROM]: form("DataAllValuesFrom", [
    "properties",
    "filler",
  ]),
  [OWLObjectKind.DATA_HAS_VALUE]: form("DataHasValue", ["property", "value"]),
  [OWLObjectKind.DATA_MIN_CARDINALITY]: cardinality("DataMinCardinality"),
  [OWLObjectKind.DATA_MAX_CARDINALITY]: cardinality("DataMaxCardinality"),
  [OWLObjectKind.DATA_EXACT_CARDINALITY]: cardinality("DataExactCardinality"),
  [OWLObjectKind.DATA_INTERSECTION_OF]: form("DataIntersectionOf", [
    "operands",
  ]),
  [OWLObjectKind.DATA_UNION_OF]: form("DataUnionOf", ["operands"]),
  [OWLObjectKind.DATA_COMPLEMENT_OF]: form("DataComplementOf", ["operand"]),
  [OWLObjectKind.DATA_ONE_OF]: form("DataOneOf", ["values"]),
  [OWLObjectKind.DATATYPE_RESTRICTION]: form("DatatypeRestriction", [
    "datatype",
    "facetRestrictions",
  ]),
  [OWLObjectKind.FACET_RESTRICTION]: (object, render) =>
    `${render(object.facet)} ${render(object.value)}`,
  [OWLObjectKind.DECLARATION_AXIOM]: (object, render) => {
    const name = entityNames[object.entity.kind];
    if (!name) notRepresentable("A declaration requires an OWL entity");
    return `Declaration(${[...object.annotations.map(render), `${name}(${render(object.entity)})`].join(" ")})`;
  },
  [OWLObjectKind.SUBCLASS_OF_AXIOM]: form(
    "SubClassOf",
    ["subClass", "superClass"],
    true,
  ),
  [OWLObjectKind.EQUIVALENT_CLASSES_AXIOM]: form(
    "EquivalentClasses",
    ["classExpressions"],
    true,
  ),
  [OWLObjectKind.DISJOINT_CLASSES_AXIOM]: form(
    "DisjointClasses",
    ["classExpressions"],
    true,
  ),
  [OWLObjectKind.DISJOINT_UNION_AXIOM]: form(
    "DisjointUnion",
    ["owlClass", "classExpressions"],
    true,
  ),
  [OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM]: form(
    "SubObjectPropertyOf",
    ["subProperty", "superProperty"],
    true,
  ),
  [OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM]: (object, render) =>
    `SubObjectPropertyOf(${[...object.annotations.map(render), `ObjectPropertyChain(${object.chain.map(render).join(" ")})`, render(object.superProperty)].join(" ")})`,
  [OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM]: form(
    "EquivalentObjectProperties",
    ["properties"],
    true,
  ),
  [OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM]: form(
    "DisjointObjectProperties",
    ["properties"],
    true,
  ),
  [OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM]: form(
    "ObjectPropertyDomain",
    ["property", "domain"],
    true,
  ),
  [OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM]: form(
    "ObjectPropertyRange",
    ["property", "range"],
    true,
  ),
  [OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM]: form(
    "InverseObjectProperties",
    ["properties"],
    true,
  ),
  [OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM]: form(
    "FunctionalObjectProperty",
    ["property"],
    true,
  ),
  [OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM]: form(
    "InverseFunctionalObjectProperty",
    ["property"],
    true,
  ),
  [OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM]: form(
    "ReflexiveObjectProperty",
    ["property"],
    true,
  ),
  [OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM]: form(
    "IrreflexiveObjectProperty",
    ["property"],
    true,
  ),
  [OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM]: form(
    "SymmetricObjectProperty",
    ["property"],
    true,
  ),
  [OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM]: form(
    "AsymmetricObjectProperty",
    ["property"],
    true,
  ),
  [OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM]: form(
    "TransitiveObjectProperty",
    ["property"],
    true,
  ),
  [OWLObjectKind.SUB_DATA_PROPERTY_AXIOM]: form(
    "SubDataPropertyOf",
    ["subProperty", "superProperty"],
    true,
  ),
  [OWLObjectKind.EQUIVALENT_DATA_PROPERTIES_AXIOM]: form(
    "EquivalentDataProperties",
    ["properties"],
    true,
  ),
  [OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM]: form(
    "DisjointDataProperties",
    ["properties"],
    true,
  ),
  [OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM]: form(
    "DataPropertyDomain",
    ["property", "domain"],
    true,
  ),
  [OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM]: form(
    "DataPropertyRange",
    ["property", "range"],
    true,
  ),
  [OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM]: form(
    "FunctionalDataProperty",
    ["property"],
    true,
  ),
  [OWLObjectKind.DATATYPE_DEFINITION_AXIOM]: form(
    "DatatypeDefinition",
    ["datatype", "dataRange"],
    true,
  ),
  [OWLObjectKind.HAS_KEY_AXIOM]: (object, render) =>
    `HasKey(${[...object.annotations.map(render), render(object.classExpression), `(${object.objectProperties.map(render).join(" ")})`, `(${object.dataProperties.map(render).join(" ")})`].join(" ")})`,
  [OWLObjectKind.SAME_INDIVIDUAL_AXIOM]: form(
    "SameIndividual",
    ["individuals"],
    true,
  ),
  [OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM]: form(
    "DifferentIndividuals",
    ["individuals"],
    true,
  ),
  [OWLObjectKind.CLASS_ASSERTION_AXIOM]: form(
    "ClassAssertion",
    ["classExpression", "individual"],
    true,
  ),
  [OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM]: form(
    "ObjectPropertyAssertion",
    ["property", "subject", "value"],
    true,
  ),
  [OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM]: form(
    "NegativeObjectPropertyAssertion",
    ["property", "subject", "value"],
    true,
  ),
  [OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM]: form(
    "DataPropertyAssertion",
    ["property", "subject", "value"],
    true,
  ),
  [OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM]: form(
    "NegativeDataPropertyAssertion",
    ["property", "subject", "value"],
    true,
  ),
  [OWLObjectKind.ANNOTATION_ASSERTION_AXIOM]: form(
    "AnnotationAssertion",
    ["property", "subject", "value"],
    true,
  ),
  [OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM]: form(
    "SubAnnotationPropertyOf",
    ["subProperty", "superProperty"],
    true,
  ),
  [OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM]: form(
    "AnnotationPropertyDomain",
    ["property", "domain"],
    true,
  ),
  [OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM]: form(
    "AnnotationPropertyRange",
    ["property", "range"],
    true,
  ),
});

export const FUNCTIONAL_SYNTAX_RENDERER_KINDS = Object.freeze(
  Object.keys(renderers),
);

const sorted = (values) =>
  [...values].sort((left, right) => {
    const a = left.structuralKey();
    const b = right.structuralKey();
    return a < b ? -1 : a > b ? 1 : 0;
  });

/** Render only a committed direct ontology snapshot, without I/O or inference. */
export const renderFunctionalSyntax = (snapshot) => {
  const labels = new Map();
  const render = (object) => {
    if (!object || !Object.hasOwn(renderers, object.kind)) {
      notRepresentable(
        `No Functional Syntax rendering for structural kind ${object?.kind}`,
      );
    }
    return renderers[object.kind](object, render, labels);
  };
  const header = render(snapshot.ontologyID);
  const body = [
    snapshot.authoredImportDeclarations,
    snapshot.directOntologyAnnotations,
    snapshot.directAxioms,
  ].flatMap((values) => sorted(values).map(render));
  return `Ontology(${header}\n${body.length ? `${body.join("\n")}\n` : ""})\n`;
};
