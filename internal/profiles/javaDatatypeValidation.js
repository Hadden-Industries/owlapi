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

/** Apply the released Java lexical admission rule; it does not check value bounds. */
export function inspectJavaLiteral(literal) {
  const pattern = literalPatterns.get(literal.datatype.iri.value);
  return Object.freeze({
    status: pattern?.test(literal.lexicalForm) ? "valid" : "invalid",
    rule: pattern ? "LITERAL_LEXICAL_SPACE" : "DEFINED_DATATYPE_LITERAL",
  });
}

/** Java checks facet membership; each facet literal is visited independently. */
export function inspectJavaFacet(datatype, restriction) {
  return Object.freeze({
    status: javaDatatypeDefinitions[datatype.iri.value]?.facets.includes(
      restriction.facet.value,
    )
      ? "valid"
      : "invalid",
    rule: "FACET_NOT_IN_DATATYPE_MAP",
  });
}
