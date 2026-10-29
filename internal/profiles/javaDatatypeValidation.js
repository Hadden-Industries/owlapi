import { javaDatatypeDefinitions } from "../behavior/javaDatatypePolicy.js";

// Java compiles these public patterns with DOTALL and ASCII predefined classes.
// Java Matcher.matches consumes the whole value, including any trailing newline.
const literalPatterns = new Map(
  Object.entries(javaDatatypeDefinitions).map(([iri, { pattern }]) => [
    iri,
    new RegExp(
      `^(?:${pattern.replaceAll("[^\\s]", "[^\\t\\n\\x0B\\f\\r ]").replaceAll("\\s", "[\\t\\n\\x0B\\f\\r ]")})(?![\\s\\S])`,
      "su",
    ),
  ]),
);

const validLiteral = Object.freeze({
  status: "valid",
  rule: "LITERAL_LEXICAL_SPACE",
});
const invalidLiteral = Object.freeze({
  status: "invalid",
  rule: "LITERAL_LEXICAL_SPACE",
});
const definedDatatypeLiteral = Object.freeze({
  status: "invalid",
  rule: "DEFINED_DATATYPE_LITERAL",
});
const validFacet = Object.freeze({
  status: "valid",
  rule: "FACET_NOT_IN_DATATYPE_MAP",
});
const invalidFacet = Object.freeze({
  status: "invalid",
  rule: "FACET_NOT_IN_DATATYPE_MAP",
});

/** Apply the released Java lexical admission rule; it does not check value bounds. */
export function inspectJavaLiteral(literal) {
  const pattern = literalPatterns.get(literal.datatype.iri.value);
  return pattern
    ? pattern.test(literal.lexicalForm)
      ? validLiteral
      : invalidLiteral
    : definedDatatypeLiteral;
}

/** Java checks facet membership; each facet literal is visited independently. */
export function inspectJavaFacet(datatype, restriction) {
  return javaDatatypeDefinitions[datatype.iri.value]?.facets.includes(
    restriction.facet.value,
  )
    ? validFacet
    : invalidFacet;
}
