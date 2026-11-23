import {
  OWLManager,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
  IRI,
} from "../../index.js";

const NS = "urn:example:property-role#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const JAVA_PROFILE = "java-owlapi-5.5.1";
const NORMATIVE_PROFILE = "normative-v1";

function fixture({
  reversed = false,
  publisherValue = "R",
  logicalUse = "",
} = {}) {
  const pTriples = [
    '<rdf:type rdf:resource="http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"/>',
    `<rdfs:domain rdf:resource="${NS}C"/>`,
    `<ex:dataType rdf:resource="${NS}${publisherValue}"/>`,
  ];
  if (reversed) pTriples.reverse();

  const p = `<rdf:Description rdf:about="${NS}P">
    ${pTriples.join("\n    ")}
  </rdf:Description>`;

  return `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:ex="${NS}">
  <owl:Ontology rdf:about="urn:example:property-role:ontology"/>
  ${reversed ? "" : p}
  <owl:Class rdf:about="${NS}C"/>
  <owl:Class rdf:about="${NS}R"/>
  <owl:Class rdf:about="${NS}S"/>
  <rdf:Property rdf:about="${NS}numeric">
    <rdfs:range rdf:resource="${XSD}integer"/>
  </rdf:Property>
  <rdf:Property rdf:about="${NS}link">
    <rdfs:range rdf:resource="${NS}R"/>
  </rdf:Property>
  <owl:ObjectProperty rdf:about="${NS}explicitLink">
    <rdf:type rdf:resource="http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"/>
  </owl:ObjectProperty>
  ${reversed ? p : ""}
  ${logicalUse}
</rdf:RDF>`;
}

async function loadAxioms(behaviorProfileId, options) {
  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
  const configuration = new OWLOntologyLoaderConfiguration({
    behaviorProfileId,
    parsingMode: "compatible",
  });
  const source = new StringDocumentSource(fixture(options), {
    documentIRI: IRI.create("urn:example:property-role:document"),
    contentType: "application/rdf+xml",
  });
  const { ontology } = await manager.loadOntologyGraphFromOntologyDocument(
    source,
    configuration,
  );
  return [...ontology.getAxioms()];
}

const iri = (value) => expect.objectContaining({ value });
const named = (value) => expect.objectContaining({ iri: iri(value) });

function declaration(localName, kind) {
  return expect.objectContaining({
    kind: "OWLDeclarationAxiom",
    entity: expect.objectContaining({
      iri: iri(`${NS}${localName}`),
      ...(kind === undefined ? {} : { kind }),
    }),
  });
}

function propertyRange(kind, localName, rangeIRI) {
  return expect.objectContaining({
    kind,
    property: named(`${NS}${localName}`),
    range: named(rangeIRI),
  });
}

const pDomain = expect.objectContaining({
  kind: "OWLAnnotationPropertyDomainAxiom",
  property: named(`${NS}P`),
  domain: iri(`${NS}C`),
});

function publisherAssertion(localName) {
  return expect.objectContaining({
    kind: "OWLAnnotationAssertionAxiom",
    property: named(`${NS}dataType`),
    subject: iri(`${NS}P`),
    value: iri(`${NS}${localName}`),
  });
}

describe.each([JAVA_PROFILE, NORMATIVE_PROFILE])(
  "CGMES property roles: %s",
  (profile) => {
    test.each([
      ["P first, type before domain and metadata", false],
      ["P last, metadata and domain before type", true],
    ])("preserves exact property roles with %s", async (_order, reversed) => {
      const axioms = await loadAxioms(profile, { reversed });

      for (const className of ["C", "R", "S"]) {
        expect(axioms).toContainEqual(declaration(className, "OWLClass"));
      }
      expect(axioms).toContainEqual(
        declaration("explicitLink", "OWLObjectProperty"),
      );
      expect(axioms).toContainEqual(
        propertyRange("OWLDataPropertyRangeAxiom", "numeric", `${XSD}integer`),
      );
      expect(axioms).toContainEqual(
        propertyRange("OWLObjectPropertyRangeAxiom", "link", `${NS}R`),
      );

      if (profile === JAVA_PROFILE) {
        expect(axioms).toContainEqual(pDomain);
        expect(axioms).toContainEqual(publisherAssertion("R"));
        for (const property of ["P", "numeric", "link"]) {
          expect(axioms).not.toContainEqual(declaration(property));
        }
      } else {
        expect(axioms).not.toContainEqual(pDomain);
        expect(axioms).not.toContainEqual(publisherAssertion("R"));
        expect(axioms).toContainEqual(
          declaration("numeric", "OWLDataProperty"),
        );
        expect(axioms).toContainEqual(declaration("link", "OWLObjectProperty"));
      }
    });
  },
);

test(`${JAVA_PROFILE}: changing only the publisher IRI changes the assertion identity`, async () => {
  const original = await loadAxioms(JAVA_PROFILE);
  const mutated = await loadAxioms(JAVA_PROFILE, { publisherValue: "S" });

  expect(original).toContainEqual(publisherAssertion("R"));
  expect(original).not.toContainEqual(publisherAssertion("S"));
  expect(mutated).toContainEqual(publisherAssertion("S"));
  expect(mutated).not.toContainEqual(publisherAssertion("R"));
  expect(mutated).toContainEqual(pDomain);
  expect(mutated).toHaveLength(original.length);
});

test("a generic property can still participate in an explicit inverse relation", async () => {
  const logicalUse =
    '<owl:ObjectProperty rdf:about="' +
    NS +
    'inverse"><owl:inverseOf rdf:resource="' +
    NS +
    'P"/></owl:ObjectProperty>';
  const axioms = await loadAxioms(JAVA_PROFILE, { logicalUse });
  const inverse = axioms.find(
    (axiom) => axiom.kind === "OWLInverseObjectPropertiesAxiom",
  );
  expect(
    inverse.properties.map((property) => property.iri.value).sort(),
  ).toEqual([NS + "P", NS + "inverse"].sort());
  expect(axioms).not.toContainEqual(pDomain);
});

test("an existential restriction still identifies the generic property as its object property", async () => {
  const logicalUse =
    '<owl:Class rdf:about="' +
    NS +
    'Restricted"><rdfs:subClassOf><owl:Restriction><owl:onProperty rdf:resource="' +
    NS +
    'P"/><owl:someValuesFrom rdf:resource="' +
    NS +
    'C"/></owl:Restriction></rdfs:subClassOf></owl:Class>';
  const axioms = await loadAxioms(JAVA_PROFILE, { logicalUse });
  const subclass = axioms.find(
    (axiom) =>
      axiom.kind === "OWLSubClassOfAxiom" &&
      axiom.subClass?.iri?.value === NS + "Restricted",
  );
  expect(subclass.superClass.kind).toBe("OWLObjectSomeValuesFrom");
  expect(subclass.superClass.property.iri.value).toBe(NS + "P");
  expect(subclass.superClass.filler.iri.value).toBe(NS + "C");
  expect(axioms).toContainEqual(pDomain);
});

test("subproperty inference leaves a generic property's annotation domain intact", async () => {
  const logicalUse = `<rdf:Description rdf:about="${NS}P">
    <rdfs:subPropertyOf rdf:resource="${NS}Parent"/>
  </rdf:Description>
  <owl:ObjectProperty rdf:about="${NS}Parent"/>`;
  const axioms = await loadAxioms(JAVA_PROFILE, { logicalUse });
  expect(axioms).toContainEqual(pDomain);
  expect(axioms).toContainEqual(
    expect.objectContaining({
      kind: "OWLSubObjectPropertyOfAxiom",
    }),
  );
});
