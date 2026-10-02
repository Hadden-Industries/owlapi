import { ENTITY_KINDS } from "../model/kinds.js";
import { IRI } from "../model/structural.js";

/** Java RDFOntologyHeaderStatus values, as an immutable JavaScript vocabulary. */
export const RDFOntologyHeaderStatus = Object.freeze({
  PARSED_ZERO_HEADERS: "PARSED_ZERO_HEADERS",
  PARSED_ONE_HEADER: "PARSED_ONE_HEADER",
  PARSED_MULTIPLE_HEADERS: "PARSED_MULTIPLE_HEADERS",
});

const snapshotTerm = (term, allowed) => {
  if (
    !term ||
    !allowed.includes(term.termType) ||
    typeof term.value !== "string"
  )
    throw new TypeError("RDF metadata requires RDF term records");
  const result = { termType: term.termType, value: term.value };
  if (term.termType === "Literal") {
    if (typeof term.language !== "string")
      throw new TypeError("RDF literal metadata requires a language string");
    result.datatype = snapshotTerm(term.datatype, ["NamedNode"]);
    result.language = term.language;
    if (term.direction) {
      if (!["ltr", "rtl"].includes(term.direction))
        throw new TypeError("RDF literal direction must be ltr or rtl");
      result.direction = term.direction;
    }
  }
  return Object.freeze(result);
};

/**
 * Immutable result of one RDF parse, following Java's loader-metadata seam.
 * Arrays replace Java streams/multimaps; triples contain RDF/JS-shaped term
 * records, and guessed declarations use package IRIs and OWLObjectKind values.
 * Blank-node labels are local to this document. This is historical parse data,
 * not a source-to-axiom ledger or certification of later ontology revisions.
 */
export class RDFParserMetaData {
  #tripleCount;
  #headerState;
  #unparsedTriples;
  #guessedDeclarations;

  constructor({
    tripleCount,
    headerState,
    unparsedTriples = [],
    guessedDeclarations = [],
  }) {
    if (!Number.isSafeInteger(tripleCount) || tripleCount < 0)
      throw new TypeError("tripleCount must be a non-negative safe integer");
    if (!Object.values(RDFOntologyHeaderStatus).includes(headerState))
      throw new TypeError("headerState must be an RDFOntologyHeaderStatus");
    const triples = new Map();
    for (const triple of unparsedTriples) {
      const copy = Object.freeze({
        subject: snapshotTerm(triple.subject, ["NamedNode", "BlankNode"]),
        predicate: snapshotTerm(triple.predicate, ["NamedNode"]),
        object: snapshotTerm(triple.object, [
          "NamedNode",
          "BlankNode",
          "Literal",
        ]),
      });
      triples.set(JSON.stringify(copy), copy);
    }
    const declarations = new Map();
    for (const { iri, entityType } of guessedDeclarations) {
      if (!ENTITY_KINDS.includes(entityType))
        throw new TypeError("guessed declarations require an OWL entity kind");
      const copy = Object.freeze({ iri: IRI.create(iri), entityType });
      declarations.set(JSON.stringify([copy.iri.value, entityType]), copy);
    }
    this.#tripleCount = tripleCount;
    this.#headerState = headerState;
    this.#unparsedTriples = Object.freeze([...triples.values()]);
    this.#guessedDeclarations = Object.freeze([...declarations.values()]);
    Object.freeze(this);
  }

  getTripleCount() {
    return this.#tripleCount;
  }
  getHeaderState() {
    return this.#headerState;
  }
  getUnparsedTriples() {
    return this.#unparsedTriples;
  }
  getGuessedDeclarations() {
    return this.#guessedDeclarations;
  }
}
