import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { RdfToOwlTranslator } from "../../mapping/rdfToOwlTranslator.js";
import {
  acceptsOntologyBuild,
  publishRdfTranslation,
  registerRdfDocumentPreparation,
} from "../rdf/rdfDocumentPreparation.js";

import {
  RdfXmlSyntaxAdapter,
  readRdfXmlSourcePrefixes,
  readRdfXmlDocumentBase,
} from "./rdfXmlSyntaxAdapter.js";

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
    const dataset = await this.#syntaxAdapter.parse(source, configuration);
    const translator = this.#createTranslator(transaction.getOWLDataFactory());
    if (!translator || typeof translator.translate !== "function") {
      throw new TypeError("createTranslator must return a translator");
    }
    const retrievalIRI = source.getDocumentIRI()?.value;
    return {
      dataset,
      translator,
      options: {
        // Per RFC 3986 section 5.1 an embedded base outranks the retrieval URI, so
        // this is what the document calls itself. It decides which of several
        // ontology headers is the one the document *is*.
        baseIRI: readRdfXmlDocumentBase(dataset) ?? retrievalIRI,
        configuration,
        documentIRI: retrievalIRI,
      },
    };
  }

  async #prepare(source, transaction, configuration) {
    let syntax = await this.#readSyntax(source, transaction, configuration);
    const prefixes = Object.fromEntries(
      readRdfXmlSourcePrefixes(syntax.dataset),
    );
    const preparation = syntax.translator.prepare(
      syntax.dataset,
      syntax.options,
      acceptsOntologyBuild(transaction),
    );
    // eslint-disable-next-line no-useless-assignment -- Release this reference while declaration discovery runs on the projected graph.
    syntax = undefined;
    const prepared = await preparation;
    if (!prepared.deferOntologyIdentity)
      transaction.setOntologyID(prepared.ontology.getOntologyID());
    await transaction.addImportsDeclarations(
      prepared.ontology.getImportsDeclarations(),
    );
    transaction.setDocumentFormat(OWLDocumentFormats.RDF_XML);
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
          prefixes,
        ),
    };
  }

  async parse(source, transaction, configuration) {
    let syntax = await this.#readSyntax(source, transaction, configuration);
    const prefixes = Object.fromEntries(
      readRdfXmlSourcePrefixes(syntax.dataset),
    );
    const translation = syntax.translator.translate(
      syntax.dataset,
      syntax.options,
    );
    // eslint-disable-next-line no-useless-assignment -- Release this reference while OWL reconstruction runs on the projected graph.
    syntax = undefined;
    return this.#populateTransaction(await translation, transaction, prefixes);
  }

  async #populateTransaction(translated, transaction, prefixes) {
    const { context } = translated;
    await publishRdfTranslation(translated, transaction);
    transaction.setPrefixes(prefixes);
    const documentFormat = OWLDocumentFormats.RDF_XML;
    const loadedFormat = context.loaderMetaData
      ? documentFormat.withOntologyLoaderMetaData(context.loaderMetaData)
      : documentFormat;
    transaction.setDocumentFormat(loadedFormat);
    return loadedFormat;
  }
}
