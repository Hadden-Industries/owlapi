import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";

import { OWLFunctionalSyntaxOWLParser } from "./parser.js";

const skipTrivia = (text, start) => {
  let offset = start;
  while (offset < text.length) {
    const character = text[offset];
    if (
      character === " " ||
      character === "\t" ||
      character === "\n" ||
      character === "\r"
    ) {
      offset += 1;
      continue;
    }
    if (character !== "#") {
      break;
    }
    offset += 1;
    while (
      offset < text.length &&
      text[offset] !== "\n" &&
      text[offset] !== "\r"
    ) {
      offset += 1;
    }
  }
  return offset;
};

const detectsKeyword = (text, offset, keyword) => {
  if (!text.startsWith(keyword, offset)) {
    return false;
  }
  return text[skipTrivia(text, offset + keyword.length)] === "(";
};

export const detectFunctionalSyntax = (source) => {
  const text = source.getText();
  const offset = skipTrivia(text, 0);
  if (detectsKeyword(text, offset, "Prefix")) {
    return {
      reason: "A Functional-Style Syntax prefix declaration was found",
      reasonCode: "FUNCTIONAL_PREFIX",
      result: "MATCH",
    };
  }
  if (detectsKeyword(text, offset, "Ontology")) {
    return {
      reason: "A Functional-Style Syntax ontology declaration was found",
      reasonCode: "FUNCTIONAL_ONTOLOGY",
      result: "MATCH",
    };
  }
  if (offset === text.length) {
    return {
      reason: "The bounded source contains only whitespace or comments",
      reasonCode: "FUNCTIONAL_EMPTY",
      result: "INDETERMINATE",
    };
  }
  return {
    reason: "The bounded source does not begin with Prefix or Ontology",
    reasonCode: "FUNCTIONAL_ROOT_ABSENT",
    result: "NO_MATCH",
  };
};

export const functionalSyntaxParserDescriptor = new ParserDescriptor({
  createParser: () => new OWLFunctionalSyntaxOWLParser(),
  detect: detectFunctionalSyntax,
  format: OWLDocumentFormats.FUNCTIONAL,
  id: "owl-functional",
  priority: 10,
  supportsCompatibleRecovery: true,
});
