import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../io/index.js";
import { OWLManager } from "../manager/index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";

// A bare `rdf:Property` is not an OWL property. OWL 2 requires every property to
// be declared object, data or annotation, and `x rdf:type rdf:Property` matches
// no declaration pattern in OWL 2 Mapping to RDF Graphs - so a document relying
// on it is not OWL 2 DL.
//
// Real vocabularies rely on it heavily. `doap.rdf` declares all 43 of its
// properties this way and no OWL property at all, and `dcat3.rdf` mixes 18 of
// them in among typed ones. Emitting nothing for them loses the entire
// vocabulary, so compatible mode recovers.
//
// The category comes from the same evidence ADR 0005 uses for punning: a literal
// range means a data property, a class range an object property. That is also
// what the oracle does - `doap:audience` ranges over `rdfs:Literal` and renders
// as a datatype property, while `doap:blog` ranges over `rdfs:Resource` and
// `sioct:Weblog` and renders as an object property.
const document = (body) => `
  <rdf:RDF xmlns:rdf="${RDF}" xmlns:rdfs="${RDFS}" xmlns:owl="${OWL}">
    <owl:Ontology rdf:about="urn:test:untyped"/>
    <owl:Class rdf:about="urn:test:Target"/>
    ${body}
  </rdf:RDF>
`;

const load = (body, parsingMode = "compatible") =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(document(body), {
      contentType: "application/rdf+xml",
      fileName: "untyped.rdf",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode }),
  );

const declaredCategories = (ontology) => {
  const categories = new Set();
  for (const axiom of ontology.getAxioms()) {
    const entity = axiom.entity;
    if (entity?.iri?.value === "urn:test:untypedProperty") {
      categories.add(entity.kind);
    }
  }
  return [...categories];
};

describe("bare rdf:Property declarations", () => {
  it("recovers a literal-ranged property as a data property", async () => {
    const { ontology } = await load(
      `<rdf:Property rdf:about="urn:test:untypedProperty">
         <rdfs:range rdf:resource="${RDFS}Literal"/>
       </rdf:Property>`,
    );

    expect(declaredCategories(ontology)).toEqual(["OWLDataProperty"]);
  });

  it("recovers a class-ranged property as an object property", async () => {
    const { ontology } = await load(
      `<rdf:Property rdf:about="urn:test:untypedProperty">
         <rdfs:range rdf:resource="urn:test:Target"/>
       </rdf:Property>`,
    );

    expect(declaredCategories(ontology)).toEqual(["OWLObjectProperty"]);
  });

  it("records the recovery as a diagnostic", async () => {
    const { documents } = await load(
      `<rdf:Property rdf:about="urn:test:untypedProperty">
         <rdfs:range rdf:resource="${RDFS}Literal"/>
       </rdf:Property>`,
    );

    expect(documents[0].context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_UNTYPED_PROPERTY",
        iri: "urn:test:untypedProperty",
        resolvedCategory: "data",
        severity: "warning",
      }),
    );
  });

  // `doap:blog` ranges over `rdfs:Resource` and `sioct:Weblog`, neither declared
  // as a class in the document. A range that is not a data range still cannot
  // belong to a data property, so it implies an object property whether or not
  // the range IRI happens to carry a local class declaration.
  it("recovers an object property from a range that is not declared locally", async () => {
    const { ontology } = await load(
      `<rdf:Property rdf:about="urn:test:untypedProperty">
         <rdfs:range rdf:resource="${RDFS}Resource"/>
       </rdf:Property>`,
    );

    expect(declaredCategories(ontology)).toEqual(["OWLObjectProperty"]);
  });

  // Several corpus properties declare both a literal and a class range. Taking
  // whichever arrives first would make the answer depend on serialisation order,
  // so the rule is stated over the set: a literal range can only belong to a data
  // property, and it decides regardless of what else is present or of the order
  // the ranges appear in.
  it("resolves contradictory ranges the same way whatever their order", async () => {
    const literalFirst = await load(
      `<rdf:Property rdf:about="urn:test:untypedProperty">
         <rdfs:range rdf:resource="${RDFS}Literal"/>
         <rdfs:range rdf:resource="urn:test:Target"/>
       </rdf:Property>`,
    );
    const classFirst = await load(
      `<rdf:Property rdf:about="urn:test:untypedProperty">
         <rdfs:range rdf:resource="urn:test:Target"/>
         <rdfs:range rdf:resource="${RDFS}Literal"/>
       </rdf:Property>`,
    );

    expect(declaredCategories(literalFirst.ontology)).toEqual([
      "OWLDataProperty",
    ]);
    expect(declaredCategories(classFirst.ontology)).toEqual(
      declaredCategories(literalFirst.ontology),
    );
  });

  it("leaves an already-typed property alone", async () => {
    const { documents } = await load(
      `<owl:ObjectProperty rdf:about="urn:test:untypedProperty">
         <rdf:type rdf:resource="${RDF}Property"/>
       </owl:ObjectProperty>`,
    );

    expect(documents[0].context.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "RDF_UNTYPED_PROPERTY" }),
    );
  });
});
