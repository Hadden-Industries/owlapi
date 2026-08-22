import { RdfToOwlTranslator } from "../../rdf/index.js";

const defaultTranslatorFactory = (dataFactory) =>
  new RdfToOwlTranslator({ dataFactory });

/**
 * Commits one RDF graph-or-dataset syntax result through the shared RDF-to-OWL seam.
 * Format-specific parsers stay deliberately thin: syntax recognition and RDF
 * parsing belong to their descriptor/adapter, while OWL reconstruction remains
 * identical for Turtle, N-Triples, and later governed RDF syntaxes.
 */
export class RdfSyntaxParser {
  #createTranslator;
  #documentFormat;
  #syntaxAdapter;

  constructor({
    createTranslator = defaultTranslatorFactory,
    documentFormat,
    syntaxAdapter,
  }) {
    if (typeof createTranslator !== "function") {
      throw new TypeError("createTranslator must be a function");
    }
    if (!documentFormat || typeof documentFormat.key !== "string") {
      throw new TypeError("documentFormat must be an OWL document format");
    }
    if (!syntaxAdapter || typeof syntaxAdapter.parse !== "function") {
      throw new TypeError("syntaxAdapter must implement parse()");
    }
    this.#createTranslator = createTranslator;
    this.#documentFormat = documentFormat;
    this.#syntaxAdapter = syntaxAdapter;
  }

  async parse(source, transaction, configuration) {
    if (!transaction || typeof transaction.getOWLDataFactory !== "function") {
      throw new TypeError(
        "transaction must implement the parser transaction contract",
      );
    }

    const { dataset, jsonLdContexts, prefixes } =
      await this.#syntaxAdapter.parse(source, configuration);
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
    transaction.setRdfDatasetContext({
      merged: context.merged,
      selectedGraph: context.selectedGraph,
    });
    transaction.setPrefixes(prefixes);
    if (jsonLdContexts !== undefined) {
      transaction.setJsonLdContexts(jsonLdContexts);
    }
    // A caller-selected format can carry immutable parser parameters. Preserve
    // that exact metadata after parsing; replacing it with the registry's base
    // format would make the completed load impossible to reproduce or inspect.
    const selectedDocumentFormat =
      configuration?.format &&
      typeof configuration.format === "object" &&
      configuration.format.key === this.#documentFormat.key
        ? configuration.format
        : this.#documentFormat;
    transaction.setDocumentFormat(selectedDocumentFormat);
    return selectedDocumentFormat;
  }
}
