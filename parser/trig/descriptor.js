import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";

import { TriGParser } from "./parser.js";

const skipTrivia = (text) => {
  let offset = 0;
  while (offset < text.length) {
    if (/\s/u.test(text[offset])) {
      offset += 1;
      continue;
    }
    if (text[offset] !== "#") {
      break;
    }
    while (offset < text.length && !["\n", "\r"].includes(text[offset])) {
      offset += 1;
    }
  }
  return offset;
};

const scanStructuralTokens = (text) => {
  let quote;
  let longQuote = false;
  let escaped = false;
  let inComment = false;
  let inIri = false;
  let graphBlockBrace = false;
  let n3Implication = false;

  // A brace is decisive only outside comments, RDF string literals, and IRI
  // references. Complete graph-block grammar remains the strict parser's job.
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inComment) {
      if (["\n", "\r"].includes(character)) {
        inComment = false;
      }
      continue;
    }
    if (inIri) {
      if (character === ">" && !escaped) {
        inIri = false;
      }
      escaped = character === "\\" && !escaped;
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (
        character === quote &&
        (!longQuote || text.slice(index, index + 3) === quote.repeat(3))
      ) {
        index += longQuote ? 2 : 0;
        quote = undefined;
        longQuote = false;
      }
      continue;
    }
    if (character === "#") {
      inComment = true;
    } else if (
      (character === "=" && text[index + 1] === ">") ||
      (character === "<" && text[index + 1] === "=")
    ) {
      // Formula implication is part of the broader N3 language, not TriG.
      // Record it before treating a '<' as the start of an IRI reference.
      n3Implication = true;
      index += 1;
    } else if (character === "<" && text[index + 1] !== "<") {
      inIri = true;
      escaped = false;
    } else if (['"', "'"].includes(character)) {
      quote = character;
      longQuote = text.slice(index, index + 3) === character.repeat(3);
      index += longQuote ? 2 : 0;
    } else if (character === "{") {
      graphBlockBrace = true;
    }
  }
  return { graphBlockBrace, n3Implication };
};

export const detectTriG = (source) => {
  const text = source.getText();
  const offset = skipTrivia(text);
  const remaining = text.slice(offset);
  if (offset === text.length) {
    return {
      reason: "The bounded source contains only whitespace or comments",
      reasonCode: "TRIG_EMPTY",
      result: "INDETERMINATE",
    };
  }
  if (
    /^(?:<\?xml\b|<!--|<!DOCTYPE\b|<[^>]+\sxmlns(?::[A-Za-z_][\w.-]*)?\s*=)/iu.test(
      remaining,
    )
  ) {
    return {
      reason: "An XML declaration or namespace-bearing root element was found",
      reasonCode: "TRIG_XML",
      result: "NO_MATCH",
    };
  }
  if (/^\{\s*(?:"|\})/u.test(remaining)) {
    return {
      reason: "A JSON object signature was found instead of a graph block",
      reasonCode: "TRIG_JSON",
      result: "NO_MATCH",
    };
  }
  const structuralTokens = scanStructuralTokens(remaining);
  if (structuralTokens.n3Implication) {
    return {
      reason: "Notation3 implication syntax was found outside an RDF term",
      reasonCode: "TRIG_N3_LANGUAGE",
      result: "NO_MATCH",
    };
  }
  if (structuralTokens.graphBlockBrace) {
    return {
      reason: "A TriG graph-block opening brace was found",
      reasonCode: "TRIG_GRAPH_BLOCK",
      result: "MATCH",
    };
  }
  if (/^(?:@(?:base|prefix)\b|(?:BASE|PREFIX)\s)/iu.test(remaining)) {
    return {
      reason: "Turtle directives were found without a TriG graph block",
      reasonCode: "TRIG_TURTLE_DOCUMENT",
      result: "NO_MATCH",
    };
  }
  if (
    /^(?:<[^>\r\n]+>|_:[^\s]+)\s+<[^>\r\n]+>\s+[\s\S]+\s+(?:<[^>\r\n]+>|_:[^\s]+)\s*\./u.test(
      remaining,
    )
  ) {
    return {
      reason: "A line-oriented RDF dataset statement was found",
      reasonCode: "TRIG_LINE_DATASET",
      result: "NO_MATCH",
    };
  }
  return {
    reason: "The bounded source has no decisive TriG graph-block signature",
    reasonCode: "TRIG_SIGNATURE_ABSENT",
    result: "NO_MATCH",
  };
};

export const triGParserDescriptor = new ParserDescriptor({
  createParser: () => new TriGParser(),
  detect: detectTriG,
  format: OWLDocumentFormats.TRIG,
  id: "trig",
  priority: 22,
  supportsCompatibleRecovery: false,
});
