import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { AXIOM_KINDS } from "../../model/index.js";

import { OWLXML_GRAMMAR } from "./grammar.js";

const OWLXML_FIXTURE_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/owlxml/phase4-structural.owx",
  import.meta.url,
);
const FUNCTIONAL_FIXTURE_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/owlxml/phase4-structural.ofn",
  import.meta.url,
);
const FIXTURE_SHA256 = Object.freeze({
  functional:
    "c6b4282cf7e88d7328d9e85e43fc7a2f8671183c1c8ce91ff184d9941cdfa4b8",
  owlxml: "9b1e106ec9e6151cf3fe9a16b8b749914a2e0ff3b6606623c4c9319389909c25",
});

const expectUnique = (values) => {
  expect(new Set(values)).toHaveProperty("size", values.length);
  expect(Object.isFrozen(values)).toBe(true);
};

describe("W3C OWL/XML grammar coverage", () => {
  it("pins the project-owned OWL/XML and Functional structural pair", () => {
    const owlXml = readFileSync(OWLXML_FIXTURE_URL);
    const functional = readFileSync(FUNCTIONAL_FIXTURE_URL);

    expect(createHash("sha256").update(owlXml).digest("hex")).toBe(
      FIXTURE_SHA256.owlxml,
    );
    expect(createHash("sha256").update(functional).digest("hex")).toBe(
      FIXTURE_SHA256.functional,
    );
  });

  it("pins the complete finite structural production inventory", () => {
    expect(OWLXML_GRAMMAR.classExpressions).toEqual([
      "Class",
      "ObjectIntersectionOf",
      "ObjectUnionOf",
      "ObjectComplementOf",
      "ObjectOneOf",
      "ObjectSomeValuesFrom",
      "ObjectAllValuesFrom",
      "ObjectHasValue",
      "ObjectHasSelf",
      "ObjectMinCardinality",
      "ObjectMaxCardinality",
      "ObjectExactCardinality",
      "DataSomeValuesFrom",
      "DataAllValuesFrom",
      "DataHasValue",
      "DataMinCardinality",
      "DataMaxCardinality",
      "DataExactCardinality",
    ]);
    expect(OWLXML_GRAMMAR.dataRanges).toEqual([
      "Datatype",
      "DataIntersectionOf",
      "DataUnionOf",
      "DataComplementOf",
      "DataOneOf",
      "DatatypeRestriction",
    ]);
    expect(OWLXML_GRAMMAR.objectPropertyExpressions).toEqual([
      "ObjectProperty",
      "ObjectInverseOf",
    ]);
    expect(OWLXML_GRAMMAR.dataPropertyExpressions).toEqual(["DataProperty"]);
    expect(OWLXML_GRAMMAR.entities).toEqual([
      "Class",
      "Datatype",
      "ObjectProperty",
      "DataProperty",
      "AnnotationProperty",
      "NamedIndividual",
    ]);
    expect(OWLXML_GRAMMAR.annotationSubjects).toEqual([
      "IRI",
      "AbbreviatedIRI",
      "AnonymousIndividual",
    ]);
    expect(OWLXML_GRAMMAR.annotationValues).toEqual([
      "IRI",
      "AbbreviatedIRI",
      "AnonymousIndividual",
      "Literal",
    ]);
    expect(OWLXML_GRAMMAR.ontologyChildren).toEqual([
      "Prefix",
      "Import",
      "Annotation",
      "Axiom",
    ]);
  });

  it("records the complete axiom inventory including the property-chain alternative", () => {
    expect(OWLXML_GRAMMAR.axioms).toEqual([
      "Declaration",
      "SubClassOf",
      "EquivalentClasses",
      "DisjointClasses",
      "DisjointUnion",
      "SubObjectPropertyOf",
      "EquivalentObjectProperties",
      "DisjointObjectProperties",
      "InverseObjectProperties",
      "ObjectPropertyDomain",
      "ObjectPropertyRange",
      "FunctionalObjectProperty",
      "InverseFunctionalObjectProperty",
      "ReflexiveObjectProperty",
      "IrreflexiveObjectProperty",
      "SymmetricObjectProperty",
      "AsymmetricObjectProperty",
      "TransitiveObjectProperty",
      "SubDataPropertyOf",
      "EquivalentDataProperties",
      "DisjointDataProperties",
      "DataPropertyDomain",
      "DataPropertyRange",
      "FunctionalDataProperty",
      "DatatypeDefinition",
      "HasKey",
      "SameIndividual",
      "DifferentIndividuals",
      "ClassAssertion",
      "ObjectPropertyAssertion",
      "NegativeObjectPropertyAssertion",
      "DataPropertyAssertion",
      "NegativeDataPropertyAssertion",
      "AnnotationAssertion",
      "SubAnnotationPropertyOf",
      "AnnotationPropertyDomain",
      "AnnotationPropertyRange",
    ]);
    expect(OWLXML_GRAMMAR.axioms).toHaveLength(37);
    expect(AXIOM_KINDS).toHaveLength(38);
    expect(OWLXML_GRAMMAR.axioms).toContain("SubObjectPropertyOf");
  });

  it("keeps every grammar category immutable and duplicate-free", () => {
    expect(Object.isFrozen(OWLXML_GRAMMAR)).toBe(true);
    for (const values of Object.values(OWLXML_GRAMMAR)) {
      expectUnique(values);
    }
  });
});
