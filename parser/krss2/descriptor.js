import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";

import { OWLKRSS2SyntaxOWLParser } from "./parser.js";

const LEADING_TRIVIA = String.raw`(?:\s|;[^\r\n]*(?:\r\n?|\n))*`;
const TOP_LEVEL_KEYWORDS = [
  "define-primitive-concept",
  "define-concept",
  "disjoint",
  "equivalent",
  "implies",
  "define-role",
  "define-primitive-role",
  "disjoint-roles",
  "implies-role",
  "inverse",
  "roles-equivalent",
  "role-inclusion",
  "transitive",
  "range",
  "instance",
  "related",
  "equal",
  "distinct",
];
const TOP_LEVEL_SIGNATURE = new RegExp(
  `^${LEADING_TRIVIA}\\(\\s*(?:${TOP_LEVEL_KEYWORDS.join("|")})(?=\\s|\\()`,
  "iu",
);
const FOREIGN_SIGNATURES = [
  /^\s*(?:<!--[\s\S]*?-->\s*)*<\?(?:xml)\b/iu,
  /^\s*(?:<!--[\s\S]*?-->\s*)*<(?:[A-Za-z_][\w.-]*:RDF|Ontology)\b/iu,
  /^\s*@(?:base|prefix)\b/iu,
  /^\s*(?:BASE|PREFIX)\s/iu,
  /^\s*(?:Prefix|Ontology)\s*\(/u,
  /^\s*(?:Prefix|Ontology)\s*:/u,
];

export const detectKRSS2 = (source) => {
  const text = source.getText();
  if (FOREIGN_SIGNATURES.some((pattern) => pattern.test(text))) {
    return {
      reason: "A non-KRSS2 ontology syntax signature was found",
      reasonCode: "KRSS2_STRONG_NEGATIVE",
      result: "NO_MATCH",
    };
  }
  if (TOP_LEVEL_SIGNATURE.test(text)) {
    return {
      reason: "A supported KRSS2 top-level production was found",
      reasonCode: "KRSS2_TOP_LEVEL",
      result: "MATCH",
    };
  }
  if (text.trim().length === 0) {
    return {
      reason: "The bounded source contains only whitespace",
      reasonCode: "KRSS2_EMPTY",
      result: "INDETERMINATE",
    };
  }
  return {
    reason: "The bounded source has no supported KRSS2 signature",
    reasonCode: "KRSS2_SIGNATURE_ABSENT",
    result: "NO_MATCH",
  };
};

export const krss2ParserDescriptor = new ParserDescriptor({
  createParser: () => new OWLKRSS2SyntaxOWLParser(),
  detect: detectKRSS2,
  format: OWLDocumentFormats.KRSS2,
  id: "owl-krss2",
  priority: 16,
  // KRSS2 has no compatible-recovery branch. Marking this true prevents an
  // indeterminate sniff result from making the strict parser a fallback.
  supportsCompatibleRecovery: true,
});
