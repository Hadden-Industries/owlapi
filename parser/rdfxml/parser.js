import { OWLDocumentFormats } from "../../io/index.js";
import { RdfToOwlTranslator } from "../../rdf/index.js";

import { RdfXmlSyntaxAdapter } from "./rdfXmlSyntaxAdapter.js";

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
    const translated = await translator.translate(dataset, {
      configuration,
      documentIRI: source.getDocumentIRI()?.value,
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
