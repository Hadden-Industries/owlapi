import { ABSOLUTE_RDF_IRI_REFERENCE as ABSOLUTE_IRI } from "../iriCharacters.js";
import { skipTrivia } from "../unicodeLeadingTrivia.js";
import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { ParserDescriptor } from "../parserRegistry.js";

import { NTriplesParser } from "./parser.js";

const RESOURCE = `(?:${ABSOLUTE_IRI}|_:[A-Za-z0-9_][A-Za-z0-9._-]*)`;
const LITERAL = String.raw`"(?:[^"\\\r\n]|\\.)*"(?:@[A-Za-z]+(?:-[A-Za-z0-9]+)*|\^\^${ABSOLUTE_IRI})?`;
const TRIPLE_PREFIX = new RegExp(
  String.raw`^${RESOURCE}\s+${ABSOLUTE_IRI}\s+`,
  "u",
);
const QUAD_STATEMENT = new RegExp(
  String.raw`${TRIPLE_PREFIX.source}(?:${RESOURCE}|${LITERAL})\s+${RESOURCE}\s*\.`,
  "u",
);
// A triple term can be nested. Check the graph label after the closing term.
const TRIPLE_TERM_QUAD = new RegExp(
  String.raw`<<\([\s\S]*\)>>\s*${RESOURCE}\s*\.`,
  "u",
);

export const detectNTriples = (source) => {
  const text = source.getText();
  const offset = skipTrivia(text);
  const remaining = text.slice(offset);

  if (/^(?:@(?:base|prefix)\b|(?:BASE|PREFIX)\s)/iu.test(remaining)) {
    return {
      reason: "A Turtle base or prefix directive was found",
      reasonCode: "NTRIPLES_TURTLE_DIRECTIVE",
      result: "NO_MATCH",
    };
  }
  if (QUAD_STATEMENT.test(remaining) || TRIPLE_TERM_QUAD.test(remaining)) {
    return {
      reason: "An N-Quads graph term was found after the RDF object",
      reasonCode: "NTRIPLES_NQUADS_STATEMENT",
      result: "NO_MATCH",
    };
  }
  if (TRIPLE_PREFIX.test(remaining)) {
    return {
      reason: "An N-Triples subject and absolute-IRI predicate were found",
      reasonCode: "NTRIPLES_TRIPLE",
      result: "MATCH",
    };
  }
  if (offset === text.length) {
    return {
      reason: "The bounded source contains only whitespace or comments",
      reasonCode: "NTRIPLES_EMPTY",
      result: "INDETERMINATE",
    };
  }
  return {
    reason: "The bounded source has no decisive N-Triples signature",
    reasonCode: "NTRIPLES_SIGNATURE_ABSENT",
    result: "NO_MATCH",
  };
};

export const nTriplesParserDescriptor = new ParserDescriptor({
  createParser: () => new NTriplesParser(),
  detect: detectNTriples,
  format: OWLDocumentFormats.N_TRIPLES,
  id: "ntriples",
  priority: 24,
  supportsCompatibleRecovery: false,
});
