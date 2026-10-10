/** Immutable dialect facts; adapters own private membership indexes. */
export const KRSSDialect = Object.freeze({
  KRSS1: "krss1",
  KRSS2: "krss2",
});

export const SHARED_TOP_LEVEL_KEYWORDS = Object.freeze([
  "define-primitive-concept",
  "define-concept",
  "define-primitive-role",
  "transitive",
  "range",
  "instance",
  "related",
  "equal",
  "distinct",
]);

export const KRSS2_ONLY_TOP_LEVEL_KEYWORDS = Object.freeze([
  "define-role",
  "disjoint",
  "equivalent",
  "implies",
  "disjoint-roles",
  "implies-role",
  "inverse",
  "roles-equivalent",
  "role-inclusion",
]);

/**
 * Classifies public grammar vocabulary for the separate executable adapters.
 * Sharing this policy cannot widen KRSS1 to the larger KRSS2 production union.
 */
export function keywordSupportedByDialect(keyword, dialect) {
  const normalizedKeyword =
    typeof keyword === "string" ? keyword.toLowerCase() : "";

  if (dialect === KRSSDialect.KRSS1) {
    return SHARED_TOP_LEVEL_KEYWORDS.includes(normalizedKeyword);
  }

  if (dialect === KRSSDialect.KRSS2) {
    return (
      SHARED_TOP_LEVEL_KEYWORDS.includes(normalizedKeyword) ||
      KRSS2_ONLY_TOP_LEVEL_KEYWORDS.includes(normalizedKeyword)
    );
  }

  throw new TypeError(`Unsupported KRSS dialect: ${String(dialect)}`);
}
