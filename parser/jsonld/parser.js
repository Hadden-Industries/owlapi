import { OWLDocumentFormats } from "../../io/index.js";
import { RdfSyntaxParser } from "../rdf/rdfSyntaxParser.js";

import { JsonLdSyntaxAdapter } from "./jsonLdSyntaxAdapter.js";

export class JsonLdParser extends RdfSyntaxParser {
  constructor(options = {}) {
    super({
      documentFormat: OWLDocumentFormats.JSON_LD,
      syntaxAdapter: new JsonLdSyntaxAdapter({
        documentLoader: options.documentLoader,
      }),
      ...options,
    });
  }
}
