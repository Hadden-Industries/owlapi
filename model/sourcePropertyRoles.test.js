import { OWLManager, OWL2DLProfile, StringDocumentSource } from "../index.js";

const prefixes = `@prefix : <urn:roles:> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`;
const load = (body, mode = "preserve") =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(`${prefixes}\n${body}`, { format: "turtle" }),
    { parsingMode: mode },
  );
const punned =
  ":p a owl:ObjectProperty, owl:DatatypeProperty . :A a owl:Class .";
test.each([false, true])(
  "retains every explicit property category (reverse=%s)",
  async (reverse) => {
    const statements = [
      ":p a owl:ObjectProperty .",
      ":p a owl:DatatypeProperty .",
      ":p a owl:AnnotationProperty .",
    ];
    if (reverse) statements.reverse();
    const ontology = await load(statements.join("\n"));
    expect(
      [...ontology.getAxioms()].map((axiom) => axiom.entity.kind).sort(),
    ).toEqual([
      "OWLAnnotationProperty",
      "OWLDataProperty",
      "OWLObjectProperty",
    ]);
    const report = await new OWL2DLProfile().checkOntology(ontology, {
      sourceAssessment: true,
    });
    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: "PROPERTY_CATEGORY_COLLISION" }),
    );
    expect(report.sourceAssessment.status).toBe("invalid");
  },
);
test.each([
  [':i :p "value" .', "OWLDataPropertyAssertionAxiom"],
  [":i :p :j .", "OWLObjectPropertyAssertionAxiom"],
  [
    ':A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:hasValue "value" ] .',
    "OWLDataHasValue",
  ],
  [
    ":A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:hasValue :i ] .",
    "OWLObjectHasValue",
  ],
  [
    ":A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:someValuesFrom xsd:string ] .",
    "OWLDataSomeValuesFrom",
  ],
  [
    ":A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :A ] .",
    "OWLObjectSomeValuesFrom",
  ],
  [
    ':A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger; owl:onClass :A ] .',
    "OWLObjectMinCardinality",
  ],
  [
    ':A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger; owl:onDataRange xsd:string ] .',
    "OWLDataMinCardinality",
  ],
  [":p rdfs:range :A .", "OWLObjectPropertyRangeAxiom"],
  [":p rdfs:range xsd:string .", "OWLDataPropertyRangeAxiom"],
  [
    ":q a owl:ObjectProperty . :p rdfs:subPropertyOf :q .",
    "OWLSubObjectPropertyOfAxiom",
  ],
  [
    ":q a owl:DatatypeProperty . :p owl:equivalentProperty :q .",
    "OWLEquivalentDataPropertiesAxiom",
  ],
])(
  "uses explicit structural position without discarding competing roles: %s",
  async (body, kind) => {
    const ontology = await load(`${punned} ${body}`);
    const found = new Set();
    const pending = [...ontology.getAxioms()];
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== "object") continue;
      found.add(value.kind);
      pending.push(...Object.values(value));
    }
    expect(found.has(kind)).toBe(true);
    expect(
      [...ontology.getAxioms()].filter(
        (axiom) =>
          axiom.kind === "OWLDeclarationAxiom" &&
          axiom.entity.iri.value === "urn:roles:p",
      ),
    ).toHaveLength(2);
  },
);
test.each([
  ":p rdfs:domain :A .",
  ":p a owl:FunctionalProperty .",
  ":q a owl:ObjectProperty, owl:DatatypeProperty . :p rdfs:subPropertyOf :q .",
  ":A owl:hasKey (:p) .",
  ':A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:minCardinality "1"^^xsd:nonNegativeInteger ] .',
  ":A rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :Unknown ] .",
  ':p a owl:AnnotationProperty . :i :p "value" .',
])("fails on an unresolved multi-role use: %s", async (body) => {
  await expect(load(`${punned} ${body}`)).rejects.toMatchObject({
    reason: "RDF_AMBIGUOUS_PROPERTY_ROLE",
  });
});
test("keeps legacy mode policies distinct", async () => {
  await expect(load(punned, "strict")).rejects.toThrow(
    "conflicting OWL property categories",
  );
  const compatible = await load(`${punned} :i :p "value" .`, "compatible");
  expect(
    [...compatible.getAxioms()].some(
      (axiom) => axiom.kind === "OWLDataPropertyAssertionAxiom",
    ),
  ).toBe(true);
});
test("does not fabricate a declaration from a property characteristic", async () => {
  const ontology = await load(":p a owl:TransitiveProperty .");
  expect([...ontology.getAxioms()].map((axiom) => axiom.kind)).toEqual([
    "OWLTransitiveObjectPropertyAxiom",
  ]);
  const report = await new OWL2DLProfile().checkOntology(ontology, {
    sourceAssessment: true,
  });
  expect(report.status).toBe("invalid");
  expect(report.sourceAssessment.status).toBe("valid");
});
test.each([
  ['"+001"^^xsd:nonNegativeInteger', 1],
  ['"-000"^^xsd:integer', 0],
  ['"3.000"^^xsd:decimal', 3],
  ['"6/3"^^owl:rational', 2],
  ['"9007199254740993"^^xsd:integer', "9007199254740993"],
])("preserves exact NN_INT values from %s", async (literal, cardinality) => {
  const ontology = await load(
    `:A a owl:Class; rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:minCardinality ${literal} ] . :p a owl:ObjectProperty .`,
  );
  expect(
    [...ontology.getAxioms()].find(({ kind }) => kind === "OWLSubClassOfAxiom")
      .superClass.cardinality,
  ).toBe(cardinality);
});
test.each([
  '" 3 "^^xsd:integer',
  '"300"^^xsd:byte',
  '"3.0"^^xsd:integer',
  '"3.5"^^xsd:decimal',
  '"-1"^^xsd:integer',
  '"3"^^xsd:float',
  '"3"^^xsd:double',
  '"3"^^xsd:string',
  '"3"@en',
])("refuses invalid NN_INT operands without coercion: %s", async (literal) => {
  await expect(
    load(
      `:A a owl:Class; rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:minCardinality ${literal} ] . :p a owl:ObjectProperty .`,
    ),
  ).rejects.toThrow("non-negative integer literal");
});
test.each([
  ":A a owl:Class; owl:unionOf (:A :A) .",
  ":A a owl:Class; rdfs:subClassOf [ owl:oneOf () ] .",
  ":A a owl:Class; rdfs:subClassOf [ owl:intersectionOf (:A) ] .",
])("refuses legacy constructor recovery: %s", async (body) => {
  await expect(load(body)).rejects.toThrow();
});

test.each([
  ":p a owl:FunctionalProperty .",
  ":p a rdf:Property, owl:FunctionalProperty .",
  ":A a owl:Class; owl:hasKey (:p) .",
  ':A a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:minCardinality "1"^^xsd:integer] .',
  ":A a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :Unknown] .",
])(
  "rejects unresolved absent roles instead of defaulting to object: %s",
  async (body) => {
    await expect(load(body)).rejects.toMatchObject({
      reason: "RDF_AMBIGUOUS_PROPERTY_ROLE",
    });
  },
);

test.each([
  ["owl:someValuesFrom xsd:string", "OWLDataSomeValuesFrom"],
  ["owl:allValuesFrom xsd:string", "OWLDataAllValuesFrom"],
  ["owl:someValuesFrom :A", "OWLObjectSomeValuesFrom"],
  [
    'owl:minQualifiedCardinality "1"^^xsd:integer; owl:onDataRange xsd:string',
    "OWLDataMinCardinality",
  ],
  [
    'owl:minQualifiedCardinality "1"^^xsd:integer; owl:onClass :A',
    "OWLObjectMinCardinality",
  ],
])(
  "uses an unambiguous typed position without a redundant declaration: %s",
  async (restriction, kind) => {
    const ontology = await load(
      `:A a owl:Class; rdfs:subClassOf [a owl:Restriction; owl:onProperty :p; ${restriction}] .`,
    );
    expect(
      [...ontology.getAxioms()].find(
        ({ kind }) => kind === "OWLSubClassOfAxiom",
      ).superClass.kind,
    ).toBe(kind);
    const report = await new OWL2DLProfile().checkOntology(ontology, {
      sourceAssessment: true,
    });
    expect(report.violations).toContainEqual(
      expect.objectContaining({ code: "UNDECLARED_ENTITY" }),
    );
    expect(report.sourceAssessment.status).toBe("valid");
  },
);
