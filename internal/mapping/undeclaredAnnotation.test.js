import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../index.js";
import { OWLManager } from "../../index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const VS = "http://www.w3.org/2003/06/sw-vocab-status/ns#";

// OWL 2 Mapping to RDF Graphs admits an annotation assertion only where the
// predicate is a declared annotation property - the pattern carries the
// condition `AP(x) != e`. A document that annotates with an undeclared property
// therefore has triples that match no pattern, and strict mode is right to leave
// them unreconstructed.
//
// Real vocabularies annotate this way constantly. `spatial.rdf` states
// `<vs:term_status>testing</vs:term_status>` on sixteen properties and one class
// without declaring `vs:term_status` anywhere, and it declares no annotation
// property at all. Dropping those loses every annotation in the document.
//
// A literal object cannot belong to an object property, and a data property
// assertion would be nonsense on a class. An annotation assertion is the reading
// that keeps the statement while asserting nothing logically, which is what the
// pinned oracle produces.
const document = (body) => `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}" xmlns:owl="${OWL}"
           xmlns:vs="${VS}">
    <owl:Ontology rdf:about="urn:test:undeclared"/>
    <owl:Class rdf:about="urn:test:Feature">
      ${body}
    </owl:Class>
  </rdf:RDF>
`;

const load = (body, parsingMode = "compatible") =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(document(body), {
      contentType: "application/rdf+xml",
      fileName: "undeclared.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode }),
  );

const annotationValues = (ontology) => {
  const values = [];
  for (const axiom of ontology.getAxioms()) {
    if (axiom.kind === "OWLAnnotationAssertionAxiom") {
      values.push(
        `${axiom.property.iri.value} = ${axiom.value.lexicalForm ?? axiom.value.value}`,
      );
    }
  }
  return values;
};

describe("assertions using an undeclared annotation property", () => {
  it("keeps a literal-valued assertion as an annotation", async () => {
    const { ontology } = await load("<vs:term_status>testing</vs:term_status>");

    expect(annotationValues(ontology)).toContain(`${VS}term_status = testing`);
  });

  // Recovering the first assertion declares the property, so a guard that asks
  // whether the property is declared will refuse every assertion after the
  // first. `spatial.rdf` uses `vs:term_status` seventeen times, so recovering
  // only one is barely better than recovering none.
  it("keeps every assertion using the same undeclared property", async () => {
    const { ontology } = await load(
      `<vs:term_status>testing</vs:term_status>
       <rdfs:subClassOf rdf:resource="urn:test:Other"/>
     </owl:Class>
     <owl:Class rdf:about="urn:test:Other">
       <vs:term_status>stable</vs:term_status>`,
    );

    expect(annotationValues(ontology)).toEqual(
      expect.arrayContaining([
        `${VS}term_status = testing`,
        `${VS}term_status = stable`,
      ]),
    );
  });

  // An IRI object is ambiguous where the subject is an individual, because an
  // object property assertion is then a real reading and recovering the wrong
  // one would invent logical content. It is not ambiguous where the subject is
  // a class: an object property assertion on a class requires punning the class
  // into an individual, which changes the ontology's structure, while an
  // annotation asserts nothing at all.
  //
  // `dcmitype.rdf` is the case in the corpus. Every one of its twelve classes
  // carries `dcam:memberOf` pointing at `dcterms:DCMIType`, with `dcam:memberOf`
  // declared nowhere, and dropping it lost an annotation on every class.
  it("keeps an IRI-valued assertion on a class as an annotation", async () => {
    const { ontology } = await load(
      `<vs:memberOf rdf:resource="urn:test:Collection"/>`,
    );

    expect(annotationValues(ontology)).toContain(
      `${VS}memberOf = urn:test:Collection`,
    );
  });

  // The recovery invents a declaration, and OWL 2 reserves the RDF, RDFS and
  // OWL namespaces: an IRI from them cannot be given a meaning the standard did
  // not give it. A triple using an unrecognised term from those namespaces is
  // genuinely unreconstructable and must be reported as such rather than
  // quietly turned into an annotation.
  it("does not recover a predicate from the reserved namespaces", async () => {
    const { ontology, documents } = await load(
      `<owl:unsupportedMappingPredicate>x</owl:unsupportedMappingPredicate>`,
    );

    expect(annotationValues(ontology)).toEqual([]);
    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({ code: "RDF_UNCONSUMED_OWL_TRIPLE" }),
    );
  });

  // The recovery has to happen before axioms are read, not after. An `owl:Axiom`
  // reification names the assertion it annotates through `owl:annotatedSource`,
  // `owl:annotatedProperty` and `owl:annotatedTarget`, and it can only attach to
  // an assertion that exists by the time reifications are indexed. Recovering
  // the assertion at the end of parsing, once the unconsumed triples are swept
  // up, is far too late: the reification has already failed to find it and its
  // own annotations are lost.
  //
  // `universal_reference-data_20260714` is the case. It declares eight
  // annotation properties and uses dozens, so almost every `skos:definition`
  // assertion is recovered - and 144 `dcterms:source`, `skos:note` and position
  // annotations hanging off those assertions were dropped with them.
  it("lets an owl:Axiom reification annotate a recovered assertion", async () => {
    const { ontology } = await load(
      `<vs:definition>A definition</vs:definition>
     </owl:Class>
     <owl:Axiom>
       <owl:annotatedSource rdf:resource="urn:test:Feature"/>
       <owl:annotatedProperty rdf:resource="${VS}definition"/>
       <owl:annotatedTarget>A definition</owl:annotatedTarget>
       <vs:source rdf:resource="urn:test:Cambridge"/>
     </owl:Axiom>
     <owl:Class rdf:about="urn:test:Other">`,
    );

    const definition = [...ontology.getAxioms()].find(
      (axiom) =>
        axiom.kind === "OWLAnnotationAssertionAxiom" &&
        axiom.property.iri.value === `${VS}definition`,
    );

    expect(
      definition.annotations.map(
        (annotation) =>
          `${annotation.property.iri.value} = ${annotation.value.value}`,
      ),
    ).toEqual([`${VS}source = urn:test:Cambridge`]);
  });

  it("records the recovery as a diagnostic", async () => {
    const { documents } = await load(
      "<vs:term_status>testing</vs:term_status>",
    );

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_UNDECLARED_ANNOTATION_PROPERTY",
        iri: `${VS}term_status`,
        severity: "warning",
      }),
    );
  });

  // Strict mode claims OWL 2 DL conformance, and the triple matches no pattern
  // in the mapping, so the document is rejected rather than recovered.
  it("rejects the document in strict mode", async () => {
    await expect(
      load("<vs:term_status>testing</vs:term_status>", "strict"),
    ).rejects.toMatchObject({
      predicate: `${VS}term_status`,
    });
  });
});
