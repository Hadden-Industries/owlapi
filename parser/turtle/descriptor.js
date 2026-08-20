import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";

import { TurtleParser } from "./parser.js";

const skipTrivia = (text) => {
  let offset = 0;
  while (offset < text.length) {
    const character = text[offset];
    if (/\s/u.test(character)) {
      offset += 1;
      continue;
    }
    if (character !== "#") {
      break;
    }
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

export const detectTurtle = (source) => {
  const text = source.getText();
  const offset = skipTrivia(text);
  const remaining = text.slice(offset);

  if (
    /^<\?xml\b/iu.test(remaining) ||
    /^<!--/u.test(remaining) ||
    /^<!DOCTYPE\b/iu.test(remaining) ||
    /^<[^>]+\sxmlns(?::[A-Za-z_][\w.-]*)?\s*=/iu.test(remaining)
  ) {
    return {
      reason: "An XML declaration or namespace-bearing root element was found",
      reasonCode: "TURTLE_XML",
      result: "NO_MATCH",
    };
  }
  if (/^(?:Prefix|Ontology)\s*\(/u.test(remaining)) {
    return {
      reason: "A Functional-Style Syntax declaration was found",
      reasonCode: "TURTLE_FUNCTIONAL",
      result: "NO_MATCH",
    };
  }
  if (/^(?:Prefix|Ontology)\s*:/u.test(remaining)) {
    return {
      reason: "A Manchester Syntax declaration was found",
      reasonCode: "TURTLE_MANCHESTER",
      result: "NO_MATCH",
    };
  }

  if (/^@(base|prefix)\b/iu.test(remaining)) {
    return {
      reason: "A Turtle @base or @prefix directive was found",
      reasonCode: "TURTLE_AT_DIRECTIVE",
      result: "MATCH",
    };
  }
  if (/^(BASE|PREFIX)\s/iu.test(remaining)) {
    return {
      reason: "A SPARQL-style Turtle BASE or PREFIX directive was found",
      reasonCode: "TURTLE_SPARQL_DIRECTIVE",
      result: "MATCH",
    };
  }
  if (
    /^(?:<[^>\r\n]+>|_:[^\s]+|\[\s*\]|\()\s+(?:a\b|<[^>\r\n]+>|(?:[A-Za-z_][\w.-]*)?:[^\s;,.]+)/u.test(
      remaining,
    )
  ) {
    return {
      reason: "A Turtle subject and predicate were found",
      reasonCode: "TURTLE_TRIPLE",
      result: "MATCH",
    };
  }
  if (offset === text.length) {
    return {
      reason: "The bounded source contains only whitespace or comments",
      reasonCode: "TURTLE_EMPTY",
      result: "INDETERMINATE",
    };
  }
  return {
    reason: "The bounded source has no decisive Turtle signature",
    reasonCode: "TURTLE_SIGNATURE_ABSENT",
    result: "NO_MATCH",
  };
};

export const turtleParserDescriptor = new ParserDescriptor({
  createParser: () => new TurtleParser(),
  detect: detectTurtle,
  format: OWLDocumentFormats.TURTLE,
  id: "turtle",
  priority: 25,
  supportsCompatibleRecovery: false,
});
