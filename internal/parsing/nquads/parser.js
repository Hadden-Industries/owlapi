import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { createNQuadsSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";
import { RdfSyntaxParser } from "../rdf/rdfSyntaxParser.js";

export class NQuadsParser extends RdfSyntaxParser {
  constructor(options = {}) {
    super({
      documentFormat: OWLDocumentFormats.N_QUADS,
      syntaxAdapter: createNQuadsSyntaxAdapter(),
      ...options,
    });
  }
}
