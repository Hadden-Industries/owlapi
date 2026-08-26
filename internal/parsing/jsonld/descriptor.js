import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { ParserDescriptor } from "../parserRegistry.js";

import { JsonLdParser } from "./parser.js";

const JSON_LD_KEYWORD = /"@(context|graph|id|type)"\s*:/u;
const detection = (reason, reasonCode, result) => ({
  reason,
  reasonCode,
  result,
});

export const detectJsonLd = (source) => {
  const text = source.getText();
  const remaining = text.trimStart();
  const contentType = source
    .getContentType()
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType === "application/ld+json") {
    return detection(
      "The source has the authoritative JSON-LD media type",
      "JSON_LD_CONTENT_TYPE",
      "MATCH",
    );
  }
  if (remaining.length === 0) {
    return detection(
      "The bounded source contains only whitespace",
      "JSON_LD_EMPTY",
      "INDETERMINATE",
    );
  }
  if (/^(?:<\?xml\b|<!--|<!DOCTYPE\b|<[A-Za-z_][\w.:-]*\b)/iu.test(remaining)) {
    return detection(
      "XML markup was found before any JSON value",
      "JSON_LD_XML",
      "NO_MATCH",
    );
  }
  if (
    /^(?:@(?:base|prefix)\b|(?:BASE|PREFIX|Ontology|Prefix:)\b|\()/iu.test(
      remaining,
    )
  ) {
    return detection(
      "A non-JSON ontology syntax signature was found",
      "JSON_LD_OTHER_SYNTAX",
      "NO_MATCH",
    );
  }
  if (!["{", "["].includes(remaining[0])) {
    return detection(
      "The source does not begin with a JSON object or array",
      "JSON_LD_NOT_JSON",
      "NO_MATCH",
    );
  }
  if (JSON_LD_KEYWORD.test(remaining)) {
    return detection(
      "A characteristic JSON-LD keyword was found",
      "JSON_LD_KEYWORD",
      "MATCH",
    );
  }
  return detection(
    "A JSON value without a decisive JSON-LD keyword was found",
    "JSON_LD_PLAIN_JSON",
    "NO_MATCH",
  );
};

export const jsonLdParserDescriptor = new ParserDescriptor({
  createParser: (services) => new JsonLdParser(services),
  detect: detectJsonLd,
  format: OWLDocumentFormats.JSON_LD,
  id: "jsonld",
  priority: 8,
  supportsCompatibleRecovery: false,
});
