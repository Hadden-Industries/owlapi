import {
  OWL_VOCABULARY as OWL,
  RDF_VOCABULARY as RDF,
} from "../rdfjs/vocabulary.js";

const classConstructors = [OWL.complementOf, OWL.intersectionOf, OWL.unionOf];
const valueRestrictions = [OWL.someValuesFrom, OWL.allValuesFrom, OWL.hasSelf];
const qualifiedCardinalities = [
  OWL.minQualifiedCardinality,
  OWL.maxQualifiedCardinality,
  OWL.qualifiedCardinality,
];
const operandRoles = new Map([
  [RDF.type, "iri"],
  [OWL.onProperty, "iri"],
  [OWL.hasSelf, "literal"],
  ...qualifiedCardinalities.map((predicate) => [predicate, "literal"]),
  [OWL.someValuesFrom, "class"],
  [OWL.allValuesFrom, "class"],
  [OWL.complementOf, "class"],
  [OWL.onClass, "class"],
  [OWL.intersectionOf, "list"],
  [OWL.unionOf, "list"],
  [RDF.first, "class"],
  [RDF.rest, "list"],
]);

function isSupportedConstructor(role, values) {
  if (role === "list") {
    return values.size === 2 && values.has(RDF.first) && values.has(RDF.rest);
  }
  const type = values.get(RDF.type);
  if (type?.termType !== "NamedNode") return false;
  if (type.value === OWL.Class) {
    return (
      values.size === 2 &&
      classConstructors.some((predicate) => values.has(predicate))
    );
  }
  if (type.value !== OWL.Restriction || !values.has(OWL.onProperty))
    return false;
  if (values.size === 3)
    return valueRestrictions.some((predicate) => values.has(predicate));
  return (
    values.size === 4 &&
    values.has(OWL.onClass) &&
    qualifiedCardinalities.some((predicate) => values.has(predicate))
  );
}

function isTerminalOperand(term, role) {
  if (role === "literal") return term.termType === "Literal";
  return (
    term.termType === "NamedNode" && (role !== "list" || term.value === RDF.nil)
  );
}

/** Identify an authored class-expression tree independent of its blank node labels. */
export function repeatedClassExpression(root, outgoing, termKey, isExclusive) {
  const pending = [[root, "class"]];
  const visited = new Set();
  const tokens = [];
  const quads = [];
  while (pending.length) {
    const [term, role] = pending.pop();
    if (term.termType !== "BlankNode") {
      if (!isTerminalOperand(term, role)) return undefined;
      tokens.push(termKey(term));
      continue;
    }
    if (
      (role !== "class" && role !== "list") ||
      visited.has(term.value) ||
      (isExclusive && !isExclusive(term))
    )
      return undefined;
    visited.add(term.value);
    const statements = outgoing(term);
    const values = new Map(
      statements.map(({ predicate, object }) => [predicate.value, object]),
    );
    if (
      values.size !== statements.length ||
      !isSupportedConstructor(role, values)
    )
      return undefined;
    const predicates = [...values.keys()].sort();
    tokens.push(predicates);
    for (const predicate of [...predicates].reverse())
      pending.push([values.get(predicate), operandRoles.get(predicate)]);
    for (const statement of statements) quads.push(statement);
  }
  return { signature: JSON.stringify(tokens), quads };
}
