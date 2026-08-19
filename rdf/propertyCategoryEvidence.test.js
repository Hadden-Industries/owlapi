import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../io/index.js";
import { OWLManager } from "../manager/index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const PUNNED = "urn:test:punned";

// ADR 0005 originally resolved cross-category punning by a fixed precedence,
// data > object > annotation. That reproduced the pinned oracle on FOAF but not
// on SIOC, and inspecting both showed why: every punned property in the corpus
// declares `rdfs:range rdfs:Literal`, and the oracle honours it on FOAF while
// discarding it on SIOC, where it renders an object property whose range edge
// points at `owl:Thing` instead of the literal the author declared.
//
// So neither the oracle's rule nor a fixed precedence is principled. Both throw
// away the author's most direct statement about what the property relates. The
// amended algorithm asks the ontology instead:
//
//   1. direct evidence about the property, with `rdfs:range` outranking a
//      characteristic when the two disagree;
//   2. evidence inferred by bounded propagation across `rdfs:subPropertyOf` and
//      `owl:equivalentProperty` - syntactic traversal of two relations, not DL
//      reasoning;
//   3. the ADR 0005 precedence as a deterministic, diagnosed fallback.
//
// Every step is a function of the ontology graph rather than of serialisation
// order, which document-order resolution cannot claim.
const document = (body) => `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}" xmlns:owl="${OWL}">
    <owl:Ontology rdf:about="urn:test:evidence"/>
    <owl:Class rdf:about="urn:test:Target"/>
    <owl:DatatypeProperty rdf:about="${PUNNED}"/>
    <owl:ObjectProperty rdf:about="${PUNNED}"/>
    ${body}
  </rdf:RDF>
`;

const load = (body) =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(document(body), {
      contentType: "application/rdf+xml",
      fileName: "evidence.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode: "compatible" }),
  );

const resolutionOf = async (body) => {
  const { documents } = await load(body);
  return documents[0].context.diagnostics.find(
    (diagnostic) =>
      diagnostic.iri === PUNNED &&
      /PROPERTY_CATEGORY_PUNNING/.test(diagnostic.code),
  );
};

describe("evidence-based property category resolution", () => {
  it("resolves to a data property when the range is a literal", async () => {
    const resolution = await resolutionOf(
      `<rdf:Description rdf:about="${PUNNED}">
         <rdfs:range rdf:resource="${RDFS}Literal"/>
       </rdf:Description>`,
    );

    expect(resolution).toMatchObject({
      evidence: "range",
      resolvedCategory: "data",
    });
  });

  // The case that shows evidence outranks the table: the fixed precedence would
  // answer "data" here, and it would be wrong - a class range is only meaningful
  // for an object property.
  it("resolves to an object property when the range is a class", async () => {
    const resolution = await resolutionOf(
      `<rdf:Description rdf:about="${PUNNED}">
         <rdfs:range rdf:resource="urn:test:Target"/>
       </rdf:Description>`,
    );

    expect(resolution).toMatchObject({
      evidence: "range",
      resolvedCategory: "object",
    });
  });

  it("resolves from an object-only characteristic when no range is declared", async () => {
    const resolution = await resolutionOf(
      `<rdf:Description rdf:about="${PUNNED}">
         <rdf:type rdf:resource="${OWL}SymmetricProperty"/>
       </rdf:Description>`,
    );

    expect(resolution).toMatchObject({
      evidence: "characteristic",
      resolvedCategory: "object",
    });
  });

  // Choice (b): the range is the author's most direct statement about what the
  // property relates, so it outranks a characteristic that disagrees rather than
  // both being discarded as contradictory.
  it("prefers a literal range over a conflicting object-only characteristic", async () => {
    const resolution = await resolutionOf(
      `<rdf:Description rdf:about="${PUNNED}">
         <rdfs:range rdf:resource="${RDFS}Literal"/>
         <rdf:type rdf:resource="${OWL}SymmetricProperty"/>
       </rdf:Description>`,
    );

    expect(resolution).toMatchObject({
      evidence: "range",
      resolvedCategory: "data",
    });
  });

  it("infers the category from an unambiguous super-property", async () => {
    const resolution = await resolutionOf(
      `<owl:ObjectProperty rdf:about="urn:test:super"/>
       <rdf:Description rdf:about="${PUNNED}">
         <rdfs:subPropertyOf rdf:resource="urn:test:super"/>
       </rdf:Description>`,
    );

    expect(resolution).toMatchObject({
      evidence: "inferred",
      resolvedCategory: "object",
    });
  });

  it("falls back to the fixed precedence when the ontology offers nothing", async () => {
    const resolution = await resolutionOf("");

    expect(resolution).toMatchObject({
      evidence: "precedence",
      resolvedCategory: "data",
    });
  });
});
