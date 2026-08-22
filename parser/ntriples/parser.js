import { OWLDocumentFormats } from "../../io/index.js";
import { createNTriplesSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";
import { RdfSyntaxParser } from "../rdf/rdfSyntaxParser.js";

export class NTriplesParser extends RdfSyntaxParser {
  constructor(options = {}) {
    super({
      documentFormat: OWLDocumentFormats.N_TRIPLES,
      syntaxAdapter: createNTriplesSyntaxAdapter(),
      ...options,
    });
  }
}
