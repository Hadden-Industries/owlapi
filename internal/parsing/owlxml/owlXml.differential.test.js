import { readFileSync } from "node:fs";

import { OWLManager, StringDocumentSource } from "../../../index.js";
import { OWLObjectKind } from "../../../model/index.js";

const OWLXML_FIXTURE_URL = new URL(
  "../../../util/owlapi-reference/fixtures/owlxml/phase4-structural.owx",
  import.meta.url,
);
const FUNCTIONAL_FIXTURE_URL = new URL(
  "../../../util/owlapi-reference/fixtures/owlxml/phase4-structural.ofn",
  import.meta.url,
);
const JAVA_SNAPSHOT_URL = new URL(
  "../../../util/owlapi-reference/fixtures/owlxml/phase4-structural.java.json",
  import.meta.url,
);
const JAVA_COUNT_ALIASES = Object.freeze({
  AnnotationPropertyRangeOf: "AnnotationPropertyRange",
  IrrefexiveObjectProperty: "IrreflexiveObjectProperty",
});

const axiomTypeName = ({ kind }) =>
  kind.replace(/^OWL/u, "").replace(/Axiom$/u, "");

const typeCounts = (axioms) => {
  const counts = {};
  for (const axiom of axioms) {
    const name = axiomTypeName(axiom);
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
};

const canonicalJavaCounts = (counts) =>
  Object.fromEntries(
    Object.entries(counts)
      .map(([name, count]) => [JAVA_COUNT_ALIASES[name] || name, count])
      .sort(([left], [right]) => left.localeCompare(right)),
  );

const signature = (ontology) => {
  const iris = (entities) => [...entities].map(({ iri }) => iri.value).sort();
  return {
    annotationProperties: iris(ontology.getAnnotationPropertiesInSignature()),
    classes: iris(ontology.getClassesInSignature()),
    dataProperties: iris(ontology.getDataPropertiesInSignature()),
    datatypes: iris(ontology.getDatatypesInSignature()),
    individuals: iris(ontology.getIndividualsInSignature()),
    objectProperties: iris(ontology.getObjectPropertiesInSignature()),
  };
};

const shortIri = (iri) => {
  const prefixes = [
    ["http://www.w3.org/2000/01/rdf-schema#", "rdfs:"],
    ["http://www.w3.org/2001/XMLSchema#", "xsd:"],
  ];
  for (const [namespace, prefix] of prefixes) {
    if (iri.value.startsWith(namespace)) {
      return `${prefix}${iri.value.slice(namespace.length)}`;
    }
  }
  return `<${iri.value}>`;
};

const renderLiteral = (literal) => {
  const lexicalForm = JSON.stringify(literal.lexicalForm);
  return literal.language
    ? `${lexicalForm}@${literal.language}`
    : `${lexicalForm}^^${shortIri(literal.datatype.iri)}`;
};

const renderAnnotationValue = (value) =>
  value.kind === OWLObjectKind.LITERAL ? renderLiteral(value) : shortIri(value);

const renderAnnotation = (annotation) => {
  const nested = annotation.annotations.map(renderAnnotation).sort().join("");
  return `Annotation(${nested}${shortIri(annotation.property.iri)} ${renderAnnotationValue(annotation.value)})`;
};

const structuralKeys = (values) =>
  [...values].map((value) => value.structuralKey()).sort();

const structuralSnapshot = (ontology) => {
  const ontologyId = ontology.getOntologyID();
  return {
    annotations: structuralKeys(ontology.getAnnotations()),
    axioms: structuralKeys(ontology.getAxioms()),
    imports: structuralKeys(ontology.getImportsDeclarations()),
    ontologyIRI: ontologyId.ontologyIRI?.value || null,
    signature: signature(ontology),
    versionIRI: ontologyId.versionIRI?.value || null,
  };
};

const javaAnonymousOperandCount = (axioms) => {
  const rendered = axioms.find((axiom) => axiom.startsWith("DisjointUnion("));
  const operands = rendered?.match(/ObjectOneOf\(([^)]*)\)/u)?.[1];
  if (operands === undefined) {
    throw new Error("Pinned Java snapshot has no DisjointUnion ObjectOneOf");
  }
  return (operands.match(/_:[^\s)]+/gu) || []).length;
};

const jsAnonymousOperandCount = (ontology) => {
  const [axiom] = ontology.getAxiomsByType(OWLObjectKind.DISJOINT_UNION_AXIOM);
  const oneOf = [...axiom.classExpressions].find(
    ({ kind }) => kind === OWLObjectKind.OBJECT_ONE_OF,
  );
  if (!oneOf) {
    throw new Error("OWL/XML snapshot has no DisjointUnion ObjectOneOf");
  }
  return [...oneOf.individuals].filter(
    ({ kind }) => kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL,
  ).length;
};

const loadFixture = (fixture, fileName, behaviorProfileId) => {
  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
  return manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(readFileSync(fixture, "utf8"), {
      documentIRI: "urn:owlapi-js:phase4:document",
      fileName,
    }),
    manager.getOntologyLoaderConfiguration().with({
      missingImportHandling: "diagnostic",
    }),
  );
};

describe("OWL/XML structural differential", () => {
  it("matches the Functional counterpart under the normative profile", async () => {
    const owlXmlOntology = await loadFixture(
      OWLXML_FIXTURE_URL,
      "phase4-structural.owx",
      "normative-v1",
    );
    const functionalOntology = await loadFixture(
      FUNCTIONAL_FIXTURE_URL,
      "phase4-structural.ofn",
      "normative-v1",
    );

    expect(structuralSnapshot(owlXmlOntology)).toEqual(
      structuralSnapshot(functionalOntology),
    );
    expect(jsAnonymousOperandCount(owlXmlOntology)).toBe(1);
  });

  it("matches the pinned Java OWLAPI summary under the Java compatibility profile", async () => {
    const owlXmlOntology = await loadFixture(
      OWLXML_FIXTURE_URL,
      "phase4-structural.owx",
      "java-owlapi-5.5.1",
    );
    const expectedDocument = JSON.parse(
      readFileSync(JAVA_SNAPSHOT_URL, "utf8"),
    );
    const expected = expectedDocument.snapshot;

    expect(expectedDocument).toMatchObject({
      fixture: "util/owlapi-reference/fixtures/owlxml/phase4-structural.owx",
      oracle: {
        revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
        version: "5.5.1",
      },
    });
    expect({
      axiomTypeCounts: typeCounts(owlXmlOntology.getAxioms()),
      imports: [...owlXmlOntology.getImportsDeclarations()]
        .map(({ iri }) => iri.value)
        .sort(),
      ontologyAnnotations: [...owlXmlOntology.getAnnotations()]
        .map(renderAnnotation)
        .sort(),
      ontologyIRI: owlXmlOntology.getOntologyID().ontologyIRI?.value || null,
      signature: signature(owlXmlOntology),
      versionIRI: owlXmlOntology.getOntologyID().versionIRI?.value || null,
    }).toEqual({
      axiomTypeCounts: canonicalJavaCounts(expected.axiomTypeCounts),
      imports: expected.imports,
      ontologyAnnotations: expected.ontologyAnnotations,
      ontologyIRI: expected.ontologyIRI,
      signature: expected.signature,
      versionIRI: expected.versionIRI,
    });
    expect(owlXmlOntology.getAxioms()).toHaveProperty(
      "size",
      expected.axioms.length,
    );

    const [subClassAxiom] = owlXmlOntology.getAxiomsByType(
      OWLObjectKind.SUBCLASS_OF_AXIOM,
    );
    const [rangeAxiom] = owlXmlOntology.getAxiomsByType(
      OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
    );
    expect(subClassAxiom).toMatchObject({
      subClass: { kind: OWLObjectKind.OBJECT_UNION_OF },
      superClass: { kind: OWLObjectKind.OBJECT_INTERSECTION_OF },
    });
    expect(rangeAxiom.range.facetRestrictions).toHaveLength(1);
    expect(rangeAxiom.range.facetRestrictions[0]).toMatchObject({
      facet: { value: "http://www.w3.org/2001/XMLSchema#minInclusive" },
      value: { lexicalForm: "0" },
    });

    expect(jsAnonymousOperandCount(owlXmlOntology)).toBe(
      javaAnonymousOperandCount(expected.axioms),
    );
  });
});
