import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";

import { NQuadsParser } from "./parser.js";

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

const ABSOLUTE_IRI = "<[A-Za-z][A-Za-z0-9+.-]*:[^>\\r\\n]*>";
const BLANK_NODE = "_:[A-Za-z0-9_][A-Za-z0-9._-]*";
const SUBJECT = `(?:${ABSOLUTE_IRI}|${BLANK_NODE})`;
const PREDICATE = ABSOLUTE_IRI;
const LITERAL =
  '"(?:[^"\\\\\\r\\n]|\\\\.)*"(?:@[A-Za-z]+(?:-[A-Za-z0-9]+)*|\\^\\^' +
  `${ABSOLUTE_IRI})?`;
const OBJECT = `(?:${ABSOLUTE_IRI}|${BLANK_NODE}|${LITERAL})`;
const GRAPH = `(?:${ABSOLUTE_IRI}|${BLANK_NODE})`;
const LINE_START = "^[\\t ]*";
const QUAD_STATEMENT = new RegExp(
  `${LINE_START}${SUBJECT}\\s+${PREDICATE}\\s+${OBJECT}\\s+${GRAPH}\\s*\\.`,
  "mu",
);
const TRIPLE_STATEMENT = new RegExp(
  `${LINE_START}${SUBJECT}\\s+${PREDICATE}\\s+${OBJECT}\\s*\\.`,
  "mu",
);
const TRIPLE_TERM_QUAD = new RegExp(
  `${LINE_START}${SUBJECT}\\s+${PREDICATE}\\s+<<\\([^\\r\\n]*\\)>>\\s+${GRAPH}\\s*\\.`,
  "mu",
);

export const detectNQuads = (source) => {
  const text = source.getText();
  const offset = skipTrivia(text);
  const remaining = text.slice(offset);

  if (/^(?:@(?:base|prefix)\b|(?:BASE|PREFIX)\s)/iu.test(remaining)) {
    return {
      reason: "A Turtle base or prefix directive was found",
      reasonCode: "NQUADS_TURTLE_DIRECTIVE",
      result: "NO_MATCH",
    };
  }
  // Detection identifies only the decisive graph-name position. Exact N-Quads
  // grammar validation remains the responsibility of the strict adapter.
  if (QUAD_STATEMENT.test(remaining) || TRIPLE_TERM_QUAD.test(remaining)) {
    return {
      reason: "An N-Quads graph term was found after the RDF object",
      reasonCode: "NQUADS_QUAD",
      result: "MATCH",
    };
  }
  if (TRIPLE_STATEMENT.test(remaining)) {
    return {
      reason: "The RDF statement has no N-Quads graph term",
      reasonCode: "NQUADS_NTRIPLES_STATEMENT",
      result: "NO_MATCH",
    };
  }
  if (offset === text.length) {
    return {
      reason: "The bounded source contains only whitespace or comments",
      reasonCode: "NQUADS_EMPTY",
      result: "INDETERMINATE",
    };
  }
  return {
    reason: "The bounded source has no decisive N-Quads signature",
    reasonCode: "NQUADS_SIGNATURE_ABSENT",
    result: "NO_MATCH",
  };
};

export const nQuadsParserDescriptor = new ParserDescriptor({
  createParser: () => new NQuadsParser(),
  detect: detectNQuads,
  format: OWLDocumentFormats.N_QUADS,
  id: "nquads",
  // Dataset statements are also near-matches for the graph-only syntaxes, so
  // the fourth-term descriptor must make the narrower decision first.
  priority: 23,
  supportsCompatibleRecovery: false,
});
