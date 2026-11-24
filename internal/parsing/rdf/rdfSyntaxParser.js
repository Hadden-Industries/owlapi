import { RdfToOwlTranslator } from "../../mapping/rdfToOwlTranslator.js";
import {
  acceptsOntologyBuild,
  publishRdfTranslation,
  registerRdfDocumentPreparation,
} from "./rdfDocumentPreparation.js";

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
    registerRdfDocumentPreparation(this, (source, transaction, configuration) =>
      this.#prepare(source, transaction, configuration),
    );
  }

  async #readSyntax(source, transaction, configuration) {
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
    return {
      dataset,
      jsonLdContexts,
      prefixes,
      translator,
      options: { baseIRI: documentIRI, configuration, documentIRI },
    };
  }

  async #prepare(source, transaction, configuration) {
    let syntax = await this.#readSyntax(source, transaction, configuration);
    const { prefixes, jsonLdContexts } = syntax;
    const preparation = syntax.translator.prepare(
      syntax.dataset,
      syntax.options,
      acceptsOntologyBuild(transaction),
    );
    // eslint-disable-next-line no-useless-assignment -- Retain syntax metadata only in the CP 3 closure.
    syntax = undefined;
    const prepared = await preparation;
    if (!prepared.deferOntologyIdentity)
      transaction.setOntologyID(prepared.ontology.getOntologyID());
    await transaction.addImportsDeclarations(
      prepared.ontology.getImportsDeclarations(),
    );
    transaction.setDocumentFormat(this.#documentFormat);
    const reconstruct = acceptsOntologyBuild(transaction)
      ? prepared.reconstruct
      : prepared.reconstruct.bind(prepared);
    return {
      declarations: prepared.declarations,
      sourceComplete: prepared.sourceComplete,
      sourceRoles: prepared.sourceRoles,
      discoverSourceRoles: prepared.discoverSourceRoles,
      reconstruct: async (declarations, completedTransaction, sourceRoles) =>
        this.#populateTransaction(
          await reconstruct(
            declarations,
            sourceRoles,
            acceptsOntologyBuild(completedTransaction),
          ),
          completedTransaction,
          configuration,
          { prefixes, jsonLdContexts },
        ),
    };
  }

  async parse(source, transaction, configuration) {
    const syntax = await this.#readSyntax(source, transaction, configuration);
    return this.#populateTransaction(
      await syntax.translator.translate(syntax.dataset, syntax.options),
      transaction,
      configuration,
      syntax,
    );
  }

  async #populateTransaction(
    translated,
    transaction,
    configuration,
    { prefixes, jsonLdContexts },
  ) {
    const { context } = translated;
    await publishRdfTranslation(translated, transaction);
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
    const loadedFormat = context.loaderMetaData
      ? selectedDocumentFormat.withOntologyLoaderMetaData(
          context.loaderMetaData,
        )
      : selectedDocumentFormat;
    transaction.setDocumentFormat(loadedFormat);
    return loadedFormat;
  }
}
