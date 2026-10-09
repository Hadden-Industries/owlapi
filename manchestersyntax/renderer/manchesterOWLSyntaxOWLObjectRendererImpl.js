import { ResourceLimitError } from "../../io/errors.js";
import { ENTITY_KINDS, OWLObjectKind as K } from "../../model/kinds.js";
import { sortedDisplayObjects } from "../../internal/model/structuralDisplayOrder.js";
import { validateStructuralGraph } from "../../internal/model/structuralValidation.js";
import { SimpleShortFormProvider } from "../../util/simpleShortFormProvider.js";

const XSD = "http://www.w3.org/2001/XMLSchema#";
const MAX_OUTPUT_BYTES = 33554432;
const quoted = (value) =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const anonymousExpression = (value) => value.kind !== K.CLASS;
const enclosed = (text) => `(${text})`;
const binary = (left, keyword, right) => (value, render) =>
  `${render(value[left])} ${keyword} ${render(value[right])}`;
const characteristic = (name) => (value, render) =>
  ` ${name}: ${render(value.property)}`;
const assertion =
  (negative = false) =>
  (value, render) => {
    const text = `${render(value.subject)} ${render(value.property)} ${render(value.value)}`;
    return negative ? ` not (${text})` : text;
  };
const listAxiom =
  (field, binaryKeyword, naryKeyword, naryPrefix = "") =>
  (value, render) => {
    const values = sortedDisplayObjects(value[field]).map(render);
    return values.length === 2
      ? values.join(` ${binaryKeyword} `)
      : `${naryPrefix}${naryKeyword}: ${values.join(", ")}`;
  };
const cardinality = (keyword) => (value, render) => {
  const filler =
    value.filler === undefined
      ? ""
      : ` ${anonymousExpression(value.filler) && value.filler.kind !== K.DATATYPE ? enclosed(render(value.filler)) : render(value.filler)}`;
  return `${render(value.property)} ${keyword} ${value.cardinality}${filler}`;
};
const objectQuantifier = (keyword) => (value, render, context) => {
  const body = render(value.filler);
  const filler = anonymousExpression(value.filler)
    ? `${context.axiom ? "" : "\n    "}${enclosed(body)}`
    : body;
  return `${render(value.property)} ${keyword} ${filler}`;
};
const dataQuantifier = (keyword) => (value, render) =>
  `${sortedDisplayObjects(value.properties).map(render).join(", ")} ${keyword} ${render(value.filler)}`;
const facetNames = Object.freeze({
  minInclusive: ">=",
  maxInclusive: "<=",
  minExclusive: ">",
  maxExclusive: "<",
  length: "length",
  minLength: "minLength",
  maxLength: "maxLength",
  pattern: "pattern",
  langRange: "langRange",
  totalDigits: "totalDigits",
  fractionDigits: "fractionDigits",
});

// A finite dispatch table prevents an added model kind from acquiring accidental
// renderer support. Native layout quirks and omissions are retained explicitly.
const renderers = Object.freeze({
  [K.IRI]: (value) => `<${value.value}>`,
  [K.ANONYMOUS_INDIVIDUAL]: (value, _render, context) =>
    context.anonymous(value),
  [K.LITERAL]: (value, render) => {
    if (value.language) return `${quoted(value.lexicalForm)}@${value.language}`;
    const datatype = value.datatype.iri.value;
    if (datatype === XSD + "string") return quoted(value.lexicalForm);
    if (
      ["integer", "decimal", "boolean"].some((name) => datatype === XSD + name)
    )
      return value.lexicalForm;
    return `${quoted(value.lexicalForm)}^^${render(value.datatype)}`;
  },
  [K.ANNOTATION]: (value, render) => {
    const body = `${render(value.property)} ${render(value.value)}`;
    return value.annotations.length
      ? `\nAnnotations: ${sortedDisplayObjects(value.annotations).map(render).join(", ")}\n            \n            ${body}`
      : body;
  },
  [K.OBJECT_INVERSE_OF]: (value, render) =>
    ` inverse (${render(value.inverse)})`,
  [K.OBJECT_INTERSECTION_OF]: (value, render, context) =>
    sortedDisplayObjects(value.operands)
      .map((operand) =>
        anonymousExpression(operand)
          ? enclosed(render(operand))
          : render(operand),
      )
      .join(context.axiom ? " and " : "\n and "),
  [K.OBJECT_UNION_OF]: (value, render) =>
    sortedDisplayObjects(value.operands)
      .map((operand) =>
        anonymousExpression(operand)
          ? enclosed(render(operand))
          : render(operand),
      )
      .join(" or "),
  [K.OBJECT_COMPLEMENT_OF]: (value, render) => `not (${render(value.operand)})`,
  [K.OBJECT_ONE_OF]: (value, render) =>
    `{${sortedDisplayObjects(value.individuals).map(render).join(" , ")}}`,
  [K.OBJECT_SOME_VALUES_FROM]: objectQuantifier("some"),
  [K.OBJECT_ALL_VALUES_FROM]: objectQuantifier("only"),
  [K.OBJECT_HAS_VALUE]: binary("property", "value", "individual"),
  [K.OBJECT_HAS_SELF]: (value, render) => `${render(value.property)} Self `,
  [K.OBJECT_MIN_CARDINALITY]: cardinality("min"),
  [K.OBJECT_MAX_CARDINALITY]: cardinality("max"),
  [K.OBJECT_EXACT_CARDINALITY]: cardinality("exactly"),
  [K.DATA_SOME_VALUES_FROM]: dataQuantifier("some"),
  [K.DATA_ALL_VALUES_FROM]: dataQuantifier("only"),
  [K.DATA_HAS_VALUE]: binary("property", "value", "value"),
  [K.DATA_MIN_CARDINALITY]: cardinality("min"),
  [K.DATA_MAX_CARDINALITY]: cardinality("max"),
  [K.DATA_EXACT_CARDINALITY]: cardinality("exactly"),
  [K.DATA_INTERSECTION_OF]: (value, render) =>
    enclosed(sortedDisplayObjects(value.operands).map(render).join(" and ")),
  [K.DATA_UNION_OF]: (value, render) =>
    enclosed(sortedDisplayObjects(value.operands).map(render).join(" or ")),
  [K.DATA_COMPLEMENT_OF]: (value, render) => ` not ${render(value.operand)}`,
  [K.DATA_ONE_OF]: (value, render) =>
    `{${sortedDisplayObjects(value.values).map(render).join(" , ")}}`,
  [K.DATATYPE_RESTRICTION]: (value, render) =>
    `${render(value.datatype)}[${sortedDisplayObjects(value.facetRestrictions).map(render).join(", ")}]`,
  [K.FACET_RESTRICTION]: (value, render) => {
    const local = value.facet.value.slice(
      value.facet.value.lastIndexOf("#") + 1,
    );
    if (!Object.hasOwn(facetNames, local))
      throw new TypeError("Unsupported Manchester facet");
    return `${facetNames[local]} ${render(value.value)}`;
  },
  [K.DECLARATION_AXIOM]: (value, render) => {
    const names = {
      [K.CLASS]: "Class",
      [K.OBJECT_PROPERTY]: "ObjectProperty",
      [K.DATA_PROPERTY]: "DataProperty",
      [K.ANNOTATION_PROPERTY]: "AnnotationProperty",
      [K.NAMED_INDIVIDUAL]: "Individual",
    };
    return value.entity.kind === K.DATATYPE
      ? render(value.entity)
      : `${names[value.entity.kind]}: ${render(value.entity)}`;
  },
  [K.SUBCLASS_OF_AXIOM]: binary("subClass", "SubClassOf", "superClass"),
  [K.EQUIVALENT_CLASSES_AXIOM]: listAxiom(
    "classExpressions",
    "EquivalentTo",
    "EquivalentClasses",
    " ",
  ),
  [K.DISJOINT_CLASSES_AXIOM]: listAxiom(
    "classExpressions",
    "DisjointWith",
    "DisjointClasses",
    " ",
  ),
  [K.DISJOINT_UNION_AXIOM]: (value, render) =>
    `${render(value.owlClass)} DisjointUnionOf ${sortedDisplayObjects(value.classExpressions).map(render).join(", ")}`,
  [K.SUB_OBJECT_PROPERTY_AXIOM]: binary(
    "subProperty",
    "SubPropertyOf:",
    "superProperty",
  ),
  [K.SUB_PROPERTY_CHAIN_AXIOM]: (value, render) =>
    `${value.chain.map(render).join(" o ")} SubPropertyOf: ${render(value.superProperty)}`,
  [K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM]: listAxiom(
    "properties",
    "EquivalentTo",
    "EquivalentProperties",
  ),
  [K.DISJOINT_OBJECT_PROPERTIES_AXIOM]: listAxiom(
    "properties",
    "DisjointWith",
    "DisjointProperties",
  ),
  [K.OBJECT_PROPERTY_DOMAIN_AXIOM]: binary("property", "Domain", "domain"),
  [K.OBJECT_PROPERTY_RANGE_AXIOM]: binary("property", "Range", "range"),
  [K.INVERSE_OBJECT_PROPERTIES_AXIOM]: (value, render) =>
    sortedDisplayObjects(value.properties).map(render).join(" InverseOf "),
  [K.FUNCTIONAL_OBJECT_PROPERTY_AXIOM]: characteristic("Functional"),
  [K.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM]:
    characteristic("InverseFunctional"),
  [K.REFLEXIVE_OBJECT_PROPERTY_AXIOM]: characteristic("Reflexive"),
  [K.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM]: characteristic("Irreflexive"),
  [K.SYMMETRIC_OBJECT_PROPERTY_AXIOM]: characteristic("Symmetric"),
  [K.ASYMMETRIC_OBJECT_PROPERTY_AXIOM]: characteristic("Asymmetric"),
  [K.TRANSITIVE_OBJECT_PROPERTY_AXIOM]: characteristic("Transitive"),
  [K.SUB_DATA_PROPERTY_AXIOM]: binary(
    "subProperty",
    "SubPropertyOf:",
    "superProperty",
  ),
  [K.EQUIVALENT_DATA_PROPERTIES_AXIOM]: (value, render) =>
    `EquivalentProperties: ${sortedDisplayObjects(value.properties).map(render).join(", ")}`,
  [K.DISJOINT_DATA_PROPERTIES_AXIOM]: listAxiom(
    "properties",
    "DisjointWith",
    "DisjointProperties",
  ),
  [K.DATA_PROPERTY_DOMAIN_AXIOM]: binary("property", "Domain", "domain"),
  [K.DATA_PROPERTY_RANGE_AXIOM]: binary("property", "Range:", "range"),
  [K.FUNCTIONAL_DATA_PROPERTY_AXIOM]: characteristic("Functional"),
  // The pinned Java object renderer emits no DatatypeDefinition text. It is
  // deliberately not replaced with another concrete syntax or invented output.
  [K.DATATYPE_DEFINITION_AXIOM]: () => "",
  [K.HAS_KEY_AXIOM]: (value, render) =>
    `${render(value.classExpression)} HasKey ${sortedDisplayObjects(value.objectProperties).map(render).join(" , ")}${sortedDisplayObjects(value.dataProperties).map(render).join(" , ")}`,
  [K.SAME_INDIVIDUAL_AXIOM]: listAxiom(
    "individuals",
    "SameAs",
    "SameIndividual",
  ),
  [K.DIFFERENT_INDIVIDUALS_AXIOM]: listAxiom(
    "individuals",
    "DifferentFrom",
    "DifferentIndividuals",
  ),
  [K.CLASS_ASSERTION_AXIOM]: binary("individual", "Type", "classExpression"),
  [K.OBJECT_PROPERTY_ASSERTION_AXIOM]: assertion(),
  [K.DATA_PROPERTY_ASSERTION_AXIOM]: assertion(),
  [K.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM]: assertion(true),
  [K.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM]: assertion(true),
  [K.ANNOTATION_ASSERTION_AXIOM]: assertion(),
  [K.SUB_ANNOTATION_PROPERTY_AXIOM]: binary(
    "subProperty",
    "SubPropertyOf:",
    "superProperty",
  ),
  [K.ANNOTATION_PROPERTY_DOMAIN_AXIOM]: binary("property", "Domain", "domain"),
  [K.ANNOTATION_PROPERTY_RANGE_AXIOM]: binary("property", "Range", "range"),
});

const supportedKinds = new Set([...ENTITY_KINDS, ...Object.keys(renderers)]);

/** Render the finite approved inventory as plain text. Provider and anonymous
 * display allocation are captured per call; no document or network is read.
 */
export class ManchesterOWLSyntaxOWLObjectRendererImpl {
  #provider = new SimpleShortFormProvider();
  setShortFormProvider(provider) {
    if (typeof provider?.getShortForm !== "function")
      throw new TypeError("provider must implement getShortForm()");
    this.#provider = provider;
  }
  render(object) {
    try {
      validateStructuralGraph(object, supportedKinds);
    } catch (cause) {
      if (cause instanceof ResourceLimitError || cause instanceof TypeError)
        throw cause;
      throw new TypeError("Invalid Manchester structural input", { cause });
    }
    const provider = this.#provider;
    const getShortForm = provider.getShortForm;
    const labels = new Map();
    const usedLabels = new Set();
    let nextAnonymousLabel = 0;
    const context = {
      axiom: object.kind.endsWith("Axiom"),
      anonymous(value) {
        const key = value.structuralKey();
        if (!labels.has(key)) {
          let label = value.nodeID.replace(/^_:/u, "");
          while (usedLabels.has(label)) label = `genid${nextAnonymousLabel++}`;
          labels.set(key, label);
          usedLabels.add(label);
        }
        return `_:${labels.get(key)}`;
      },
    };
    const encoder = new TextEncoder();
    const render = (value) => {
      const text = ENTITY_KINDS.includes(value.kind)
        ? getShortForm.call(provider, value)
        : renderers[value.kind](value, render, context);
      if (typeof text !== "string")
        throw new TypeError(
          "short-form providers must return a string synchronously",
        );
      if (
        text.length > MAX_OUTPUT_BYTES ||
        encoder.encode(text).byteLength > MAX_OUTPUT_BYTES
      )
        throw new ResourceLimitError("Manchester output byte limit exceeded", {
          resource: "outputBytes",
          limit: MAX_OUTPUT_BYTES,
        });
      return text;
    };
    return render(object);
  }
}
