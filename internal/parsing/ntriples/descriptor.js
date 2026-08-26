import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { ParserDescriptor } from "../parserRegistry.js";

import { NTriplesParser } from "./parser.js";

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
  // The scheme is essential here: accepting an arbitrary `<...>` token makes
  // XML declarations and element tags look like an N-Triples subject/predicate.
  if (
    /^(?:<[A-Za-z][A-Za-z0-9+.-]*:[^>\r\n]*>|_:[A-Za-z0-9_][A-Za-z0-9._-]*)\s+<[A-Za-z][A-Za-z0-9+.-]*:[^>\r\n]*>\s+(?:<[A-Za-z][A-Za-z0-9+.-]*:[^>\r\n]*>|_:[A-Za-z0-9_][A-Za-z0-9._-]*|"(?:[^"\\\r\n]|\\.)*"(?:@[A-Za-z]+(?:-[A-Za-z0-9]+)*|\^\^<[A-Za-z][A-Za-z0-9+.-]*:[^>\r\n]*>)?)\s+(?:<[A-Za-z][A-Za-z0-9+.-]*:[^>\r\n]*>|_:[A-Za-z0-9_][A-Za-z0-9._-]*)\s*\./u.test(
      remaining,
    ) ||
    // RDF 1.2 triple terms may contain nested terms, so detect the decisive
    // graph label at the end instead of trying to parse that recursive object.
    /<<\([\s\S]*\)>>\s*(?:<[A-Za-z][A-Za-z0-9+.-]*:[^>\r\n]*>|_:[A-Za-z0-9_][A-Za-z0-9._-]*)\s*\./u.test(
      remaining,
    )
  ) {
    return {
      reason: "An N-Quads graph term was found after the RDF object",
      reasonCode: "NTRIPLES_NQUADS_STATEMENT",
      result: "NO_MATCH",
    };
  }
  if (
    /^(?:<[A-Za-z][A-Za-z0-9+.-]*:[^>\r\n]*>|_:[A-Za-z0-9_][A-Za-z0-9._-]*)\s+<[A-Za-z][A-Za-z0-9+.-]*:[^>\r\n]*>\s+/u.test(
      remaining,
    )
  ) {
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
