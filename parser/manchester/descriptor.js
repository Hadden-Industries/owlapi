import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";

import { OWLManchesterSyntaxOWLParser } from "./parser.js";

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

const detectsKeyword = (text, offset, keyword) =>
  text.startsWith(`${keyword}:`, offset);

export const detectManchesterSyntax = (source) => {
  const text = source.getText();
  const offset = skipTrivia(text, 0);
  if (detectsKeyword(text, offset, "Prefix")) {
    return {
      reason: "A Manchester Syntax prefix declaration was found",
      reasonCode: "MANCHESTER_PREFIX",
      result: "MATCH",
    };
  }
  if (detectsKeyword(text, offset, "Ontology")) {
    return {
      reason: "A Manchester Syntax ontology header was found",
      reasonCode: "MANCHESTER_ONTOLOGY",
      result: "MATCH",
    };
  }
  if (offset === text.length) {
    return {
      reason: "The bounded source contains only whitespace or comments",
      reasonCode: "MANCHESTER_EMPTY",
      result: "INDETERMINATE",
    };
  }
  return {
    reason: "The bounded source does not begin with Prefix: or Ontology:",
    reasonCode: "MANCHESTER_ROOT_ABSENT",
    result: "NO_MATCH",
  };
};

export const manchesterSyntaxParserDescriptor = new ParserDescriptor({
  createParser: () => new OWLManchesterSyntaxOWLParser(),
  detect: detectManchesterSyntax,
  format: OWLDocumentFormats.MANCHESTER,
  id: "owl-manchester",
  priority: 20,
  supportsCompatibleRecovery: true,
});
