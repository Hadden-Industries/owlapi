const LEADING_TRIVIA = String.raw`(?:\s|;[^\r\n]*(?:\r\n?|\n))*`;
const SHARED_TOP_LEVEL_KEYWORDS = [
  "define-primitive-concept",
  "define-concept",
  "define-primitive-role",
  "transitive",
  "range",
  "instance",
  "related",
  "equal",
  "distinct",
];
const KRSS2_ONLY_TOP_LEVEL_KEYWORDS = [
  "disjoint",
  "equivalent",
  "implies",
  "define-role",
  "disjoint-roles",
  "implies-role",
  "inverse",
  "roles-equivalent",
  "role-inclusion",
];
const signature = (keywords) =>
  new RegExp(
    `^${LEADING_TRIVIA}\\(\\s*(?:${keywords.join("|")})(?=\\s|\\()`,
    "iu",
  );
const SHARED_SIGNATURE = signature(SHARED_TOP_LEVEL_KEYWORDS);
const KRSS2_ONLY_SIGNATURE = signature(KRSS2_ONLY_TOP_LEVEL_KEYWORDS);
const FOREIGN_SIGNATURES = [
  /^\s*(?:<!--[\s\S]*?-->\s*)*<\?(?:xml)\b/iu,
  /^\s*(?:<!--[\s\S]*?-->\s*)*<(?:[A-Za-z_][\w.-]*:RDF|Ontology)\b/iu,
  /^\s*@(?:base|prefix)\b/iu,
  /^\s*(?:BASE|PREFIX)\s/iu,
  /^\s*(?:Prefix|Ontology)\s*\(/u,
  /^\s*(?:Prefix|Ontology)\s*:/u,
];

const extension = (source) => {
  const fileName = source.getFileName?.();
  const index = typeof fileName === "string" ? fileName.lastIndexOf(".") : -1;
  return index < 0 ? "" : fileName.slice(index + 1).toLowerCase();
};

const preference = (source, dialect) => {
  const hint = extension(source);
  if (hint === "krss2") {
    return dialect === "krss2" ? 0 : 1;
  }
  if (hint === "krss") {
    return dialect === "krss1" ? 0 : 1;
  }
  return undefined;
};

/** Bounded KRSS-family detection; the registry supplies the bounded source. */
export const detectKRSSDialect = (source, dialect) => {
  const label = dialect.toUpperCase();
  const text = source.getText();
  if (FOREIGN_SIGNATURES.some((pattern) => pattern.test(text))) {
    return {
      reason: `A non-${label} ontology syntax signature was found`,
      reasonCode: `${label}_STRONG_NEGATIVE`,
      result: "NO_MATCH",
    };
  }
  if (KRSS2_ONLY_SIGNATURE.test(text)) {
    return dialect === "krss2"
      ? {
          reason: "A KRSS2-only top-level production was found",
          reasonCode: "KRSS2_EXCLUSIVE_TOP_LEVEL",
          result: "MATCH",
        }
      : {
          reason: "A KRSS2-only top-level production excludes KRSS1",
          reasonCode: "KRSS1_KRSS2_EXCLUSIVE_TOP_LEVEL",
          result: "NO_MATCH",
        };
  }
  if (SHARED_SIGNATURE.test(text)) {
    const selectionPriority = preference(source, dialect);
    return {
      reason: "The top-level production is shared by KRSS1 and KRSS2",
      reasonCode: `${label}_SHARED_TOP_LEVEL`,
      result: "INDETERMINATE",
      ...(selectionPriority === undefined ? {} : { selectionPriority }),
    };
  }
  if (text.trim().length === 0) {
    const selectionPriority = preference(source, dialect);
    return {
      reason: "The bounded source contains only whitespace",
      reasonCode: `${label}_EMPTY`,
      result: "INDETERMINATE",
      ...(selectionPriority === undefined ? {} : { selectionPriority }),
    };
  }
  return {
    reason: `The bounded source has no supported ${label} signature`,
    reasonCode: `${label}_SIGNATURE_ABSENT`,
    result: "NO_MATCH",
  };
};
