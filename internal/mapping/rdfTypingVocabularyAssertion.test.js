import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../index.js";
import { OWLManager } from "../../index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";

// `rdf:type` is read as a class assertion once the object is not one of the
// typing terms, and the set of those terms covers the OWL vocabulary -
// `owl:Class`, `owl:ObjectProperty`, `owl:DatatypeProperty`,
// `owl:AnnotationProperty` and the rest - but omits the two RDF and RDFS terms
// that mean the same thing. `x rdf:type rdf:Property` was therefore
// reconstructed as `ClassAssertion(rdf:Property x)`, which makes `rdf:Property`
// a class.
//
// It cannot be one. `rdf:Property` and `rdfs:Class` are reserved vocabulary,
// and OWL 2 admits only `owl:Thing` and `owl:Nothing` from the reserved set as
// class names. Asserting an individual into `rdf:Property` also says something
// the document does not: these triples type a property, they do not place an
// individual in a class.
//
// `dc.rdf` is the case in the corpus. It types its fifteen elements
// `rdf:Property`, and the extra class node reached the rendering, where the
// pinned oracle draws no class at all.
const document = (body) => `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}" xmlns:owl="${OWL}">
    <owl:Ontology rdf:about="urn:test:typing"/>
    ${body}
  </rdf:RDF>
`;

const load = (body, parsingMode = "compatible") =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(document(body), {
      contentType: "application/rdf+xml",
      fileName: "typing.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode }),
  );

const assertedClasses = (ontology) =>
  [...ontology.getAxioms()]
    .filter((axiom) => axiom.kind === "OWLClassAssertionAxiom")
    .map((axiom) => axiom.classExpression.iri?.value);

describe("RDF and RDFS typing vocabulary as an rdf:type object", () => {
  it("does not make rdf:Property a class", async () => {
    const { ontology } = await load(`
      <rdf:Description rdf:about="urn:test:creator">
        <rdf:type rdf:resource="${RDF}Property"/>
        <rdfs:label>Creator</rdfs:label>
      </rdf:Description>`);

    expect(assertedClasses(ontology)).not.toContain(`${RDF}Property`);
  });

  // `rdfs:Class` is the RDFS spelling of `owl:Class`, which the set already
  // covers, so it reaches a class assertion by the same omission.
  it("does not make rdfs:Class a class", async () => {
    const { ontology } = await load(`
      <rdf:Description rdf:about="urn:test:Document">
        <rdf:type rdf:resource="${RDFS}Class"/>
      </rdf:Description>`);

    expect(assertedClasses(ontology)).not.toContain(`${RDFS}Class`);
  });

  // The statement the document does make is still worth keeping: the label on
  // the typed subject must survive, so nothing is lost by refusing the class.
  it("keeps what the typed subject states about itself", async () => {
    const { ontology } = await load(`
      <rdf:Description rdf:about="urn:test:creator">
        <rdf:type rdf:resource="${RDF}Property"/>
        <rdfs:label>Creator</rdfs:label>
      </rdf:Description>`);

    expect(
      [...ontology.getAxioms()].some(
        (axiom) =>
          axiom.kind === "OWLAnnotationAssertionAxiom" &&
          axiom.property.iri.value === `${RDFS}label` &&
          axiom.value.lexicalForm === "Creator",
      ),
    ).toBe(true);
  });

  // Refusing the class assertion is only half the reading. `rdfs:Class` is the
  // RDFS spelling of `owl:Class` and OWL 1 admitted it, so the triple does say
  // the subject is a class - it simply says it in a way OWL 2 has no pattern
  // for. Dropping it would discard the vocabulary rather than repair it:
  // `dcmitype.rdf` types all twelve of its classes this way and declares no
  // `owl:Class` at all.
  it("declares a class typed rdfs:Class", async () => {
    const { ontology } = await load(
      `<rdf:Description rdf:about="urn:test:Collection">
         <rdf:type rdf:resource="${RDFS}Class"/>
       </rdf:Description>`,
    );

    expect(
      [...ontology.getAxioms()].some(
        (axiom) =>
          axiom.kind === "OWLDeclarationAxiom" &&
          axiom.entity.kind === "OWLClass" &&
          axiom.entity.iri.value === "urn:test:Collection",
      ),
    ).toBe(true);
  });

  it("records the recovered class declaration", async () => {
    const { documents } = await load(
      `<rdf:Description rdf:about="urn:test:Collection">
         <rdf:type rdf:resource="${RDFS}Class"/>
       </rdf:Description>`,
    );

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_RDFS_CLASS",
        iri: "urn:test:Collection",
        severity: "warning",
      }),
    );
  });

  // Strict mode claims OWL 2 DL conformance, where the only class declaration
  // pattern is `owl:Class`, so the document is rejected rather than recovered.
  it("does not recover an rdfs:Class declaration in strict mode", async () => {
    await expect(
      load(
        `<rdf:Description rdf:about="urn:test:Collection">
           <rdf:type rdf:resource="${RDFS}Class"/>
         </rdf:Description>`,
        "strict",
      ),
    ).rejects.toBeDefined();
  });

  // A genuine class assertion must keep working - the omission is about the
  // typing vocabulary, not about class assertions in general.
  it("still reconstructs a class assertion into a declared class", async () => {
    const { ontology } = await load(`
      <owl:Class rdf:about="urn:test:Person"/>
      <owl:NamedIndividual rdf:about="urn:test:alice">
        <rdf:type rdf:resource="urn:test:Person"/>
      </owl:NamedIndividual>`);

    expect(assertedClasses(ontology)).toContain("urn:test:Person");
  });
});
