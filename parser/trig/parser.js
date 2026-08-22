import { OWLDocumentFormats } from "../../io/index.js";
import { createTriGSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";
import { RdfSyntaxParser } from "../rdf/rdfSyntaxParser.js";

export class TriGParser extends RdfSyntaxParser {
  constructor(options = {}) {
    super({
      documentFormat: OWLDocumentFormats.TRIG,
      syntaxAdapter: createTriGSyntaxAdapter(),
      ...options,
    });
  }
}
