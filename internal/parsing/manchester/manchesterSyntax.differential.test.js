import { readFileSync } from "node:fs";
import { reconcileStructuralSnapshots } from "../../../util/owlapi-reference/reconcile-structural-differences.mjs";

import { OWLOntologyLoaderConfiguration } from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLObjectKind } from "../../../model/index.js";

const FIXTURE_URL = new URL(
  "../../../util/owlapi-reference/fixtures/manchester/phase3-structural.omn",
  import.meta.url,
);
const JAVA_SNAPSHOT_URL = new URL(
  "../../../util/owlapi-reference/fixtures/manchester/phase3-structural.java.json",
  import.meta.url,
);
const EXPECTED_DIFFERENCES_URL = new URL(
  "../../../docs/compatibility/expected-differences.json",
  import.meta.url,
);
const XSD = "http://www.w3.org/2001/XMLSchema#";
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
    [XSD, "xsd:"],
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

const expandJavaIri = (value) =>
  value.startsWith("xsd:") ? `${XSD}${value.slice(4)}` : value;

const javaRangeSnapshot = (axioms) => {
  const rendered = axioms.find((axiom) =>
    axiom.startsWith("DataPropertyRange("),
  );
  const range = rendered?.match(
    /^DataPropertyRange\(<([^>]+)> DatatypeRestriction\(([^ ]+) (.+)\)\)$/u,
  );
  if (!range) {
    throw new Error("Pinned Java snapshot has no canonical datatype range");
  }
  const facets = {};
  const facetPattern = /facetRestriction\(([^ ]+) "([^"]*)"\^\^([^)]+)\)/gu;
  for (const match of range[3].matchAll(facetPattern)) {
    facets[match[2]] = {
      facet: `${XSD}${match[1]}`,
      valueDatatype: expandJavaIri(match[3]),
    };
  }
  return {
    dataPropertyRanges: {
      [range[1]]: {
        datatype: expandJavaIri(range[2]),
        facets,
      },
    },
  };
};

const jsRangeSnapshot = (ontology) => {
  const [axiom] = ontology.getAxiomsByType(
    OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
  );
  const facets = {};
  for (const restriction of axiom.range.facetRestrictions) {
    facets[restriction.value.lexicalForm] = {
      facet: restriction.facet.value,
      valueDatatype: restriction.value.datatype.iri.value,
    };
  }
  return {
    dataPropertyRanges: {
      [axiom.property.iri.value]: {
        datatype: axiom.range.datatype.iri.value,
        facets,
      },
    },
  };
};

describe("Manchester Syntax OWLAPI 5.5.1 structural differential", () => {
  it("matches the pinned Java snapshot with only exact governed differences", async () => {
    const fixture = readFileSync(FIXTURE_URL, "utf8");
    const expectedDocument = JSON.parse(
      readFileSync(JAVA_SNAPSHOT_URL, "utf8"),
    );
    const differenceManifest = JSON.parse(
      readFileSync(EXPECTED_DIFFERENCES_URL, "utf8"),
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
    expect(jsAnonymousKeys).toHaveProperty("size", javaAnonymousIds.size);
    expect(
      [...ontology.getAxioms()].filter((axiom) =>
        containsKind(axiom, OWLObjectKind.ANONYMOUS_INDIVIDUAL),
      ),
    ).toHaveLength(
      expected.axioms.filter((axiom) => /_:[A-Za-z0-9]+/u.test(axiom)).length,
    );

    const reconciliation = reconcileStructuralSnapshots(
      javaRangeSnapshot(expected.axioms),
      jsRangeSnapshot(ontology),
      {
        fixture: expectedDocument.fixture,
        referenceRevision: expectedDocument.oracle.revision,
        parser: "Manchester Syntax",
        capability: "parser.manchester",
        rules: differenceManifest.rules,
      },
    );
    expect(reconciliation).toMatchObject({
      status: "PASS",
      unmatched: [],
      ambiguous: [],
      unsatisfied: [],
    });
    expect(reconciliation.matches).toHaveLength(2);
  });
});
