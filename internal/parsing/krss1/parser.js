import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { KRSSParserCore } from "../krss/parserCore.js";

import { SHARED_TOP_LEVEL_KEYWORDS } from "../krss/dialect.js";
const KRSS1_TOP_LEVEL_KEYWORDS = new Set(SHARED_TOP_LEVEL_KEYWORDS);

const KRSS1_POLICY = Object.freeze({
  anonymousNamespacePrefix: "urn:owlapi-js:krss1-document:",
  cardinalityFillerRequired: true,
  format: OWLDocumentFormats.KRSS1,
  fullIriNames: false,
  inverseRoleExpressions: false,
  label: "KRSS1",
  minimumBooleanOperands: 2,
  namePattern: /^[A-Za-z0-9]+$/u,
  primitiveConceptRequiresParent: true,
  primitiveRoleGrammar: "krss1",
  topLevelKeywords: KRSS1_TOP_LEVEL_KEYWORDS,
});

/** Public original-KRSS adapter with a grammar stricter than KRSS2. */
export class OWLKRSS1SyntaxOWLParser extends KRSSParserCore {
  constructor() {
    super(KRSS1_POLICY);
  }
}
