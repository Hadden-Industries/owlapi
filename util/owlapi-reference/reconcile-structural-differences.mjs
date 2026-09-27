/** Policy matching only: OWLAPI owns OWL equality; JSONPath and RDFC own their formats. */
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import jsonld from "jsonld";
import { paths as selectJsonPaths } from "jsonpath-rfc9535";
import { isDeepStrictEqual } from "node:util";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const text = { type: "string", minLength: 1 };
const count = { type: "integer", minimum: 0 };
const list = (items) => ({ type: "array", items });
const identity = object({
  ontologyIRI: { type: ["string", "null"] },
  versionIRI: { type: ["string", "null"] },
});
const sides = (items) => object({ javaOnly: list(items), jsOnly: list(items) });
const validateDifferences = ajv.compile(
  object({
    ontologyId: {
      anyOf: [{ type: "null" }, object({ java: identity, js: identity })],
    },
    imports: sides(text),
    annotations: sides(text),
    axioms: sides(text),
    anonymousIndividualGraphs: sides(
      object({
        anonymousIndividuals: { type: "integer", minimum: 1 },
        statements: {
          ...list(
            object({
              category: { enum: ["AXIOM", "ONTOLOGY_ANNOTATION"] },
              value: text,
            }),
          ),
          minItems: 1,
        },
      }),
    ),
    anonymousIndividualComparison: {
      enum: ["NOT_REQUIRED", "MATCH", "MISMATCH"],
    },
  }),
);
const cardinalitySchema = {
  oneOf: [
    object({ form: { const: "exact" }, value: count }),
    object({ form: { const: "range" }, min: count, max: count }),
    object({ form: { enum: ["zero-or-one", "zero-or-more", "one-or-more"] } }),
  ],
};
const validateRule = ajv.compile({
  type: "object",
  required: [
    "id",
    "artifactType",
    "fixture",
    "referenceRevision",
    "differenceCategory",
    "differenceType",
    "side",
    "selector",
    "javaValue",
    "jsValue",
    "cardinality",
    "rationale",
    "authority",
  ],
  properties: {
    id: text,
    artifactType: text,
    fixture: text,
    referenceRevision: text,
    differenceCategory: text,
    differenceType: {
      enum: ["EXTRA", "MISSING", "VALUE_CHANGED", "TYPE_CHANGED"],
    },
    side: { enum: ["Java", "JS"] },
    selector: text,
    javaValue: {},
    jsValue: {},
    cardinality: cardinalitySchema,
    rationale: text,
    authority: { type: "string", format: "uri", minLength: 1 },
  },
});
const requireValid = (validate, value) => {
  if (!validate(value))
    throw new Error(
      `Invalid reconciliation evidence: ${ajv.errorsText(validate.errors)}`,
    );
};
const cardinalityBounds = ({ form, value, min, max }) => {
  switch (form) {
    case "exact":
      return [value, value];
    case "range":
      if (min > max)
        throw new Error("Expected-difference minimum exceeds maximum");
      return [min, max];
    case "zero-or-one":
      return [0, 1];
    case "zero-or-more":
      return [0, Infinity];
    case "one-or-more":
      return [1, Infinity];
    default:
      throw new Error("Unsupported expected-difference cardinality");
  }
};

const reconcileAtoms = (
  value,
  atoms,
  { artifactType, fixture, referenceRevision, rules },
) => {
  const applicable = rules.filter(
    (rule) => rule.artifactType === artifactType && rule.fixture === fixture,
  );
  const ruleIds = new Set();
  const selected = applicable.map((rule) => {
    requireValid(validateRule, rule);
    if (rule.referenceRevision !== referenceRevision || ruleIds.has(rule.id)) {
      throw new Error(
        `Unbound or duplicate expected-difference rule: ${rule.id}`,
      );
    }
    ruleIds.add(rule.id);
    const paths = new Set(selectJsonPaths(value, rule.selector));
    return {
      rule,
      paths,
      bounds: cardinalityBounds(rule.cardinality),
      count: 0,
    };
  });
  const unmatched = [];
  const ambiguous = [];
  const matches = [];
  for (const atom of atoms) {
    const candidates = selected.filter(
      ({ rule, paths }) =>
        paths.has(atom.selector) &&
        rule.differenceType === atom.differenceType &&
        rule.side === atom.side &&
        isDeepStrictEqual(rule.javaValue, atom.javaValue) &&
        isDeepStrictEqual(rule.jsValue, atom.jsValue),
    );
    for (const candidate of candidates) candidate.count++;
    if (candidates.length === 0) unmatched.push(atom);
    else if (candidates.length > 1)
      ambiguous.push({
        ...atom,
        ruleIds: candidates.map(({ rule }) => rule.id),
      });
    else matches.push({ ...atom, ruleId: candidates[0].rule.id });
  }
  const unsatisfied = selected
    .filter(({ count, bounds: [min, max] }) => count < min || count > max)
    .map(({ rule, count }) => ({
      ruleId: rule.id,
      observed: count,
      cardinality: rule.cardinality,
    }));
  return {
    status:
      unmatched.length || ambiguous.length || unsatisfied.length
        ? "FAIL"
        : "PASS",
    unmatched,
    ambiguous,
    unsatisfied,
    matches,
  };
};

export const reconcileStructuralDifferences = (differences, context) => {
  requireValid(validateDifferences, differences);
  const atoms = [];
  if (differences.ontologyId)
    atoms.push({
      selector: "$['ontologyId']",
      differenceType: "VALUE_CHANGED",
      side: "Java",
      javaValue: differences.ontologyId.java,
      jsValue: differences.ontologyId.js,
    });
  for (const field of [
    "imports",
    "annotations",
    "axioms",
    "anonymousIndividualGraphs",
  ]) {
    for (const [key, side] of [
      ["javaOnly", "Java"],
      ["jsOnly", "JS"],
    ]) {
      differences[field][key].forEach((value, index) =>
        atoms.push({
          selector: `$['${field}']['${key}'][${index}]`,
          differenceType: "EXTRA",
          side,
          javaValue: side === "Java" ? value : null,
          jsValue: side === "JS" ? value : null,
        }),
      );
    }
  }
  return reconcileAtoms(differences, atoms, {
    ...context,
    artifactType: "OWL native structural differences",
  });
};

export const reconcileUnparsedRdf = async (nquads, context) => {
  if (typeof nquads !== "string")
    throw new Error("Missing native unparsed RDF evidence");
  const unparsedNQuads = await jsonld.canonize(nquads, {
    inputFormat: "application/n-quads",
    format: "application/n-quads",
    canonizeOptions: { algorithm: "RDFC-1.0" },
  });
  const atoms = unparsedNQuads
    ? [
        {
          selector: "$['unparsedNQuads']",
          differenceType: "EXTRA",
          side: "Java",
          javaValue: unparsedNQuads,
          jsValue: null,
        },
      ]
    : [];
  return {
    unparsedNQuads,
    reconciliation: reconcileAtoms({ unparsedNQuads }, atoms, {
      ...context,
      artifactType: "RDF parsing diagnostics",
    }),
  };
};
