import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../index.js";
import { OWLManager } from "../../index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";

// OWL 2 DL forbids an IRI being declared in more than one property category
// (OWL 2 Structural Specification, typing constraints: no IRI is declared "to
// be both object and data, object and annotation, or data and annotation
// property"). Strict mode must therefore keep rejecting these documents.
//
// Compatible mode explicitly does not claim OWL 2 DL conformance, so it recovers
// instead, choosing one category deterministically and recording the choice as
// a diagnostic. Without a deterministic winner the three category predicates
// would each report true and dispatch would depend on evaluation order.
const punnedDocument = (firstType, secondType) => `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:owl="${OWL}">
    <owl:Ontology rdf:about="urn:test:punning"/>
    <${firstType} rdf:about="urn:test:punned"/>
    <${secondType} rdf:about="urn:test:punned"/>
  </rdf:RDF>
`;

const load = (text, parsingMode) =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(text, {
      contentType: "application/rdf+xml",
      fileName: "punning.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode }),
  );

describe("cross-category property declarations", () => {
  it.each([
    ["owl:DatatypeProperty", "owl:ObjectProperty"],
    ["owl:AnnotationProperty", "owl:DatatypeProperty"],
    ["owl:AnnotationProperty", "owl:ObjectProperty"],
  ])("rejects %s with %s in strict mode", async (first, second) => {
    await expect(
      load(punnedDocument(first, second), "strict"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("resolves a data and object declaration to the data property", async () => {
    const { documents } = await load(
      punnedDocument("owl:DatatypeProperty", "owl:ObjectProperty"),
      "compatible",
    );

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_PROPERTY_CATEGORY_PUNNING",
        resolvedCategory: "data",
        severity: "warning",
      }),
    );
  });

  it("resolves an annotation and data declaration to the data property", async () => {
    const { documents } = await load(
      punnedDocument("owl:AnnotationProperty", "owl:DatatypeProperty"),
      "compatible",
    );

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_PROPERTY_CATEGORY_PUNNING",
        resolvedCategory: "data",
        severity: "warning",
      }),
    );
  });

  // FOAF declares `mbox_sha1sum` as a datatype property, an object property and
  // an inverse-functional property. Once punning resolves it to data, building
  // the characteristic axiom still needs an object property expression. Axiom
  // construction has a recovery-capable entry point for exactly this; the strict
  // one rejects the whole document instead.
  //
  // The `rdfs:range` matters and mirrors the real vocabulary: under the amended
  // ADR 0005 the declared literal range is what resolves the IRI to data. Without
  // it the inverse-functional characteristic would be the only evidence present
  // and would resolve the IRI to an object property, leaving nothing to recover.
  it("builds a property characteristic axiom over a punned property", async () => {
    const document = `
      <rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}" xmlns:owl="${OWL}">
        <owl:Ontology rdf:about="urn:test:punning"/>
        <owl:DatatypeProperty rdf:about="urn:test:punned"/>
        <owl:ObjectProperty rdf:about="urn:test:punned"/>
        <owl:InverseFunctionalProperty rdf:about="urn:test:punned"/>
        <rdf:Description rdf:about="urn:test:punned">
          <rdfs:range rdf:resource="${RDFS}Literal"/>
        </rdf:Description>
      </rdf:RDF>
    `;

    const { documents, ontology } = await load(document, "compatible");

    expect(ontology.getAxioms().size).toBeGreaterThan(0);
    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({ code: "RDF_PROPERTY_CATEGORY_REUSE" }),
    );
  });

  // No corpus ontology exercises this pair, so the winner is chosen for
  // determinism rather than derived from observed behaviour. The distinct
  // diagnostic code makes the first real occurrence announce itself instead of
  // letting an unevidenced guess harden into an assumption.
  it("flags an unevidenced annotation and object resolution distinctly", async () => {
    const { documents } = await load(
      punnedDocument("owl:AnnotationProperty", "owl:ObjectProperty"),
      "compatible",
    );

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_PROPERTY_CATEGORY_PUNNING_UNEVIDENCED",
        resolvedCategory: "object",
        severity: "warning",
      }),
    );
  });
});
