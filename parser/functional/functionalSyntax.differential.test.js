import { readFileSync } from "node:fs";

import { OWLOntologyLoaderConfiguration } from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";

const FIXTURE_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/functional/phase2-structural.ofn",
  import.meta.url,
);
const JAVA_SNAPSHOT_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/functional/phase2-structural.java.json",
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
    classes: iris(ontology.getClassesInSignature()),
    objectProperties: iris(ontology.getObjectPropertiesInSignature()),
    dataProperties: iris(ontology.getDataPropertiesInSignature()),
    annotationProperties: iris(ontology.getAnnotationPropertiesInSignature()),
    individuals: iris(ontology.getIndividualsInSignature()),
    datatypes: iris(ontology.getDatatypesInSignature()),
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

const visit = (value, visitor, visited = new Set()) => {
  if (!value || typeof value !== "object" || visited.has(value)) {
    return;
  }
  visited.add(value);
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, visitor, visited);
    }
    return;
  }
  for (const field of Object.keys(value)) {
    visit(value[field], visitor, visited);
  }
};

const containsKind = (value, kind) => {
  let found = false;
  visit(value, (item) => {
    found ||= item.kind === kind;
  });
  return found;
};

describe("Functional Syntax OWLAPI 5.5.1 structural differential", () => {
  it("matches the pinned Java snapshot without semantic exceptions", async () => {
    const fixture = readFileSync(FIXTURE_URL, "utf8");
    const expectedDocument = JSON.parse(
      readFileSync(JAVA_SNAPSHOT_URL, "utf8"),
    );
    const expected = expectedDocument.snapshot;
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      fixture,
      new OWLOntologyLoaderConfiguration({
        missingImportHandling: "diagnostic",
      }),
    );
    const ontologyID = ontology.getOntologyID();

    expect(expectedDocument.oracle).toMatchObject({
      revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
      version: "5.5.1",
    });
    expect({
      ontologyIRI: ontologyID.ontologyIRI?.value || null,
      versionIRI: ontologyID.versionIRI?.value || null,
      imports: [...ontology.getImportsDeclarations()]
        .map(({ iri }) => iri.value)
        .sort(),
      ontologyAnnotations: [...ontology.getAnnotations()]
        .map(renderAnnotation)
        .sort(),
      axiomTypeCounts: typeCounts(ontology.getAxioms()),
      signature: signature(ontology),
    }).toEqual({
      ontologyIRI: expected.ontologyIRI,
      versionIRI: expected.versionIRI,
      imports: expected.imports,
      ontologyAnnotations: expected.ontologyAnnotations,
      axiomTypeCounts: canonicalJavaCounts(expected.axiomTypeCounts),
      signature: expected.signature,
    });
    expect(ontology.getAxioms()).toHaveProperty("size", expected.axioms.length);

    const javaAnonymousIds = new Set(
      expected.axioms.flatMap((axiom) => axiom.match(/_:[A-Za-z0-9]+/gu) || []),
    );
    const jsAnonymousKeys = new Set();
    for (const axiom of ontology.getAxioms()) {
      visit(axiom, (value) => {
        if (value.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL) {
          jsAnonymousKeys.add(value.structuralKey());
        }
      });
    }
    expect(javaAnonymousIds).toHaveProperty("size", 1);
    expect(jsAnonymousKeys).toHaveProperty("size", 1);
    expect(
      expected.axioms.filter((axiom) => /_:[A-Za-z0-9]+/u.test(axiom)),
    ).toHaveLength(7);
    expect(
      [...ontology.getAxioms()].filter((axiom) =>
        containsKind(axiom, OWLObjectKind.ANONYMOUS_INDIVIDUAL),
      ),
    ).toHaveLength(7);

    const [subClassAxiom] = ontology.getAxiomsByType(
      OWLObjectKind.SUBCLASS_OF_AXIOM,
    );
    const [annotationAssertion] = ontology.getAxiomsByType(
      OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
    );
    const [dataAssertion] = ontology.getAxiomsByType(
      OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
    );
    expect(expected.axioms).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^SubClassOf\(Annotation\(/u),
        expect.stringMatching(/^AnnotationAssertion\(Annotation\(/u),
        expect.stringContaining('"01"^^xsd:integer'),
      ]),
    );
    expect(subClassAxiom.annotations[0].value.lexicalForm).toBe(
      "annotated axiom",
    );
    expect(annotationAssertion.annotations[0].value.lexicalForm).toBe(
      "axiom metadata",
    );
    expect(dataAssertion.value).toMatchObject({
      lexicalForm: "01",
      language: "",
    });
    expect(dataAssertion.value.datatype.iri.value).toBe(
      "http://www.w3.org/2001/XMLSchema#integer",
    );
  });
});
