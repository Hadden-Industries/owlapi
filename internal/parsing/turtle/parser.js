import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { createTurtleSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";
import { RdfSyntaxParser } from "../rdf/rdfSyntaxParser.js";

export class TurtleParser extends RdfSyntaxParser {
  constructor(options = {}) {
    super({
      documentFormat: OWLDocumentFormats.TURTLE,
      syntaxAdapter: createTurtleSyntaxAdapter(),
      ...options,
    });
  }
}
