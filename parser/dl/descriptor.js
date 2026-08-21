import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";

import { OWLDLSyntaxOWLParser } from "./parser.js";

const STRONG_NEGATIVES = [
  /^\s*(?:<!--[\s\S]*?-->\s*)*<\?(?:xml)\b/iu,
  /^\s*(?:<!--[\s\S]*?-->\s*)*<(?:[A-Za-z_][\w.-]*:RDF|Ontology)\b/iu,
  /^\s*@(?:base|prefix)\b/iu,
  /^\s*(?:BASE|PREFIX)\s/iu,
  /^\s*(?:Prefix|Ontology)\s*\(/u,
  /^\s*(?:Prefix|Ontology)\s*:/u,
  /^\s*(?:<[^>\r\n]+>|_:[^\s]+|(?:[A-Za-z][\w-]*:|:)[^\s]+)\s+(?:<[^>\r\n]+>|a|(?:[A-Za-z][\w-]*:|:)[^\s]+)\s+(?:<|_:|["'])/u,
];
const AXIOM_OPERATOR =
  /(?:(?:\s|^)(?:⊑|->|sub|\\sqsubseteq|≡|==|\\equiv|≠|!=|\\not=)(?=\s|$)|(?:^|[\r\n])\s*[^\s()[\]{},]+\s+(?:=|equal)\s+[^\s()[\]{},]+(?=\s|$)|(?:^|[\r\n])\s*:\s*[^\s()[\]{},]+\s+(?:in|∈)\s+(?:trans|transitive|R⁺)(?=\s|$))/u;
const ASSERTION_SHAPE =
  /^\s*[^\s()[\]{},]+\s*\(\s*[^\s()[\]{},]+(?:\s*,\s*[^\s()[\]{},]+)?\s*\)/u;

export const detectDLSyntax = (source) => {
  const text = source.getText();
  if (STRONG_NEGATIVES.some((pattern) => pattern.test(text))) {
    return {
      reason: "A non-DL ontology syntax signature was found",
      reasonCode: "DL_STRONG_NEGATIVE",
      result: "NO_MATCH",
    };
  }
  if (AXIOM_OPERATOR.test(text)) {
    return {
      reason: "A DL Syntax axiom operator was found",
      reasonCode: "DL_AXIOM_OPERATOR",
      result: "MATCH",
    };
  }
  if (ASSERTION_SHAPE.test(text)) {
    return {
      reason: "A DL Syntax assertion shape was found",
      reasonCode: "DL_ASSERTION",
      result: "MATCH",
    };
  }
  if (text.trim().length === 0) {
    return {
      reason: "The bounded source contains only whitespace",
      reasonCode: "DL_EMPTY",
      result: "INDETERMINATE",
    };
  }
  return {
    reason: "The bounded source has no decisive DL Syntax signature",
    reasonCode: "DL_SIGNATURE_ABSENT",
    result: "NO_MATCH",
  };
};

export const dlSyntaxParserDescriptor = new ParserDescriptor({
  createParser: () => new OWLDLSyntaxOWLParser(),
  detect: detectDLSyntax,
  format: OWLDocumentFormats.DL,
  id: "owl-dl",
  priority: 15,
  supportsCompatibleRecovery: true,
});
