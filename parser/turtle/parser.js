import { OWLDocumentFormats } from "../../io/index.js";
import { RdfToOwlTranslator } from "../../rdf/index.js";
import { createTurtleSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

const defaultTranslatorFactory = (dataFactory) =>
  new RdfToOwlTranslator({ dataFactory });

export class TurtleParser {
  #createTranslator;
  #syntaxAdapter;

  constructor({
    createTranslator = defaultTranslatorFactory,
    syntaxAdapter = createTurtleSyntaxAdapter(),
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

    const { dataset, prefixes } = await this.#syntaxAdapter.parse(
      source,
      configuration,
    );
    const translator = this.#createTranslator(transaction.getOWLDataFactory());
    if (!translator || typeof translator.translate !== "function") {
      throw new TypeError("createTranslator must return a translator");
    }
    const documentIRI = source.getDocumentIRI()?.value;
    const translated = await translator.translate(dataset, {
      baseIRI: documentIRI,
      configuration,
      documentIRI,
    });
    const { context, ontology } = translated;

    transaction.setOntologyID(ontology.getOntologyID());
    transaction.addAnnotations(ontology.getAnnotations());
    transaction.addImportsDeclarations(ontology.getImportsDeclarations());
    transaction.addAxioms(ontology.getAxioms());
    for (const diagnostic of context.diagnostics) {
      transaction.addDiagnostic(diagnostic);
    }
    transaction.setPrefixes(prefixes);
    transaction.setDocumentFormat(OWLDocumentFormats.TURTLE);
    return OWLDocumentFormats.TURTLE;
  }
}
