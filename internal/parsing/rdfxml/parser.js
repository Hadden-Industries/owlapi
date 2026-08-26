import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { RdfToOwlTranslator } from "../../mapping/rdfToOwlTranslator.js";

import { documentBaseIRI, RdfXmlSyntaxAdapter } from "./rdfXmlSyntaxAdapter.js";

const defaultTranslatorFactory = (dataFactory) =>
  new RdfToOwlTranslator({ dataFactory });

export class RDFXMLParser {
  #createTranslator;
  #syntaxAdapter;

  constructor({
    createTranslator = defaultTranslatorFactory,
    syntaxAdapter = new RdfXmlSyntaxAdapter(),
  } = {}) {
    if (typeof createTranslator !== "function") {
      throw new TypeError("createTranslator must be a function");
    }
    if (!syntaxAdapter || typeof syntaxAdapter.parse !== "function") {
      throw new TypeError("syntaxAdapter must implement parse()");
    }
    this.#createTranslator = createTranslator;
    this.#syntaxAdapter = syntaxAdapter;
  }

  async parse(source, transaction, configuration) {
    if (!transaction || typeof transaction.getOWLDataFactory !== "function") {
      throw new TypeError(
        "transaction must implement the parser transaction contract",
      );
    }
    const dataset = await this.#syntaxAdapter.parse(source, configuration);
    const translator = this.#createTranslator(transaction.getOWLDataFactory());
    if (!translator || typeof translator.translate !== "function") {
      throw new TypeError("createTranslator must return a translator");
    }
    const retrievalIRI = source.getDocumentIRI()?.value;
    const translated = await translator.translate(dataset, {
      // Per RFC 3986 section 5.1 an embedded base outranks the retrieval URI, so
      // this is what the document calls itself. It decides which of several
      // ontology headers is the one the document *is*.
      baseIRI:
        typeof source.getText === "function"
          ? documentBaseIRI(source.getText(), retrievalIRI)
          : retrievalIRI,
      configuration,
      documentIRI: retrievalIRI,
    });
    const { context, ontology } = translated;

    transaction.setOntologyID(ontology.getOntologyID());
    transaction.addAnnotations(ontology.getAnnotations());
    transaction.addImportsDeclarations(ontology.getImportsDeclarations());
    transaction.addAxioms(ontology.getAxioms());
    for (const diagnostic of context.diagnostics) {
      transaction.addDiagnostic(diagnostic);
    }
    transaction.setDocumentFormat(OWLDocumentFormats.RDF_XML);
    return OWLDocumentFormats.RDF_XML;
  }
}
