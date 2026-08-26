import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { KRSSParserCore } from "../krss/parserCore.js";

const KRSS2_TOP_LEVEL_KEYWORDS = new Set([
  "define-primitive-concept",
  "define-concept",
  "implies",
  "equivalent",
  "disjoint",
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
]);

const KRSS2_POLICY = Object.freeze({
  anonymousNamespacePrefix: "urn:owlapi-js:krss2-document:",
  cardinalityFillerRequired: false,
  format: OWLDocumentFormats.KRSS2,
  fullIriNames: true,
  inverseRoleExpressions: true,
  label: "KRSS2",
  minimumBooleanOperands: 2,
  primitiveConceptRequiresParent: false,
  primitiveRoleGrammar: "krss2",
  topLevelKeywords: KRSS2_TOP_LEVEL_KEYWORDS,
});

/** Public KRSS2 adapter; dialect policy remains separate from shared parsing. */
export class OWLKRSS2SyntaxOWLParser extends KRSSParserCore {
  constructor() {
    super(KRSS2_POLICY);
  }
}
