/** Generator-only RDF vocabulary and tuples, independent of product parsing. */
export const MF = "http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#";
export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const RDFT = "http://www.w3.org/ns/rdftest#";

/** Preserve language, direction and nested RDF/JS quad terms in fixture tuples. */
export const encodeTerm = (term) => {
  switch (term.termType) {
    case "NamedNode":
      return ["N", term.value];
    case "BlankNode":
      return ["B", term.value];
    case "Literal":
      return [
        "L",
        term.value,
        term.language,
        term.direction || "",
        term.datatype.value,
      ];
    case "DefaultGraph":
      return ["D"];
    case "Quad":
      return [
        "Q",
        encodeTerm(term.subject),
        encodeTerm(term.predicate),
        encodeTerm(term.object),
        encodeTerm(term.graph),
      ];
    default:
      throw new TypeError(`Unsupported RDF fixture term: ${term.termType}`);
  }
};
export const encodeQuad = (quad) => [
  encodeTerm(quad.subject),
  encodeTerm(quad.predicate),
  encodeTerm(quad.object),
  encodeTerm(quad.graph),
];
