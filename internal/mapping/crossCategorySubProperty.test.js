import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../index.js";
import { OWLManager } from "../../index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const LABEL = `${RDFS}label`;

// `rdfs:subPropertyOf` is parsed by three patterns, one per property category,
// and each requires both ends to be in that category: `SubObjectPropertyOf`
// needs OPE(x) != e and OPE(y) != e, `SubDataPropertyOf` needs DPE on both, and
// `SubAnnotationPropertyOf` needs AP on both. A triple whose two ends sit in
// different categories therefore matches no pattern at all.
//
// It cannot be repaired by moving one end, because OWL 2 Mapping to RDF Graphs
// section 3.2.1 states that at most one of OPE(x), DPE(x) and AP(x) is defined
// for any x. Reading the super-property as an object property would define
// OPE(x) for an IRI that already has AP(x), which is precisely what that
// sentence forbids.
//
// `rdfs:label` is the case that matters in practice: the OWL 2 Structural
// Specification makes it a built-in annotation property, so AP(rdfs:label) is
// defined before any triple is read and no document can change that.
// `schemaorg.owl` states `schema:name rdfs:subPropertyOf rdfs:label` while
// declaring `schema:name` an `owl:ObjectProperty`, which promoted `rdfs:label`
// to an object property and drew it as a property node of its own.
//
// The declared category of the subject is what the specification makes
// authoritative, so it is kept and only the unparseable triple is discarded -
// the same resolution the 186 reclassified `schemaorg.owl` properties get.
const document = (body) => `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}" xmlns:owl="${OWL}">
    <owl:Ontology rdf:about="urn:test:subproperty"/>
    ${body}
  </rdf:RDF>
`;

const load = (body, parsingMode = "compatible") =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(document(body), {
      contentType: "application/rdf+xml",
      fileName: "subproperty.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode }),
  );

const kinds = (ontology) =>
  [...ontology.getAxioms()].map((axiom) => axiom.kind);

const objectPropertySubPropertyOf = `
  <owl:ObjectProperty rdf:about="urn:test:name">
    <rdfs:subPropertyOf rdf:resource="${LABEL}"/>
  </owl:ObjectProperty>`;

describe("rdfs:subPropertyOf across two property categories", () => {
  it("does not make a built-in annotation property an object property", async () => {
    const { ontology } = await load(objectPropertySubPropertyOf);

    expect(kinds(ontology)).not.toContain("OWLSubObjectPropertyOfAxiom");
    expect(
      [...ontology.getAxioms()].some(
        (axiom) =>
          axiom.kind === "OWLDeclarationAxiom" &&
          axiom.entity.iri.value === LABEL &&
          axiom.entity.kind !== "OWLAnnotationProperty",
      ),
    ).toBe(false);
  });

  // The subject was declared, and a declaration is the one thing the mapping
  // treats as authoritative, so it survives the triple that could not be parsed.
  it("keeps the declared category of the sub-property", async () => {
    const { ontology } = await load(objectPropertySubPropertyOf);

    expect(
      [...ontology.getAxioms()].some(
        (axiom) =>
          axiom.kind === "OWLDeclarationAxiom" &&
          axiom.entity.kind === "OWLObjectProperty" &&
          axiom.entity.iri.value === "urn:test:name",
      ),
    ).toBe(true);
  });

  it("reports the discarded triple", async () => {
    const { documents } = await load(objectPropertySubPropertyOf);

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_CROSS_CATEGORY_SUBPROPERTY",
        severity: "warning",
        subProperty: "urn:test:name",
        superProperty: LABEL,
      }),
    );
  });

  // Nothing about the rule is special to the built-in properties; a document
  // that declares its own annotation property reaches the same contradiction.
  it("applies to an annotation property the document declares itself", async () => {
    const { ontology } = await load(`
      <owl:AnnotationProperty rdf:about="urn:test:note"/>
      <owl:ObjectProperty rdf:about="urn:test:remark">
        <rdfs:subPropertyOf rdf:resource="urn:test:note"/>
      </owl:ObjectProperty>`);

    expect(kinds(ontology)).not.toContain("OWLSubObjectPropertyOfAxiom");
  });

  // Both ends in one category is the ordinary, well-formed case and must keep
  // working - the rule discards contradictions, not sub-property axioms.
  it("keeps a sub-property axiom whose ends share a category", async () => {
    const { ontology } = await load(`
      <owl:ObjectProperty rdf:about="urn:test:parent"/>
      <owl:ObjectProperty rdf:about="urn:test:child">
        <rdfs:subPropertyOf rdf:resource="urn:test:parent"/>
      </owl:ObjectProperty>`);

    expect(kinds(ontology)).toContain("OWLSubObjectPropertyOfAxiom");
  });

  // Strict mode claims OWL 2 DL conformance and the typing constraints forbid
  // one IRI being both an object and an annotation property, so the document is
  // rejected rather than repaired. The rejection comes from the strict property
  // accessors, which is where it came from before this rule existed - only the
  // compatible-mode recovery is changed by it.
  it("rejects the document in strict mode", async () => {
    await expect(
      load(objectPropertySubPropertyOf, "strict"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });
});
