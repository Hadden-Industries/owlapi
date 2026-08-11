import { readFileSync } from "node:fs";

import { OWLOntologyLoaderConfiguration } from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";

const FIXTURE_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/manchester/phase3-structural.omn",
  import.meta.url,
);
const JAVA_SNAPSHOT_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/manchester/phase3-structural.java.json",
  import.meta.url,
);
const EXPECTED_DIFFERENCES_URL = new URL(
  "../../../../docs/owlapi-js/compatibility/expected-differences.json",
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

const selectorName = (name) =>
  `['${name.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}']`;

const atomicDifferences = (javaValue, jsValue, selector = "$") => {
  if (Object.is(javaValue, jsValue)) {
    return [];
  }
  if (javaValue === undefined) {
    return [{ differenceType: "EXTRA", side: "JS", selector, jsValue }];
  }
  if (jsValue === undefined) {
    return [{ differenceType: "MISSING", side: "Java", selector, javaValue }];
  }
  if (
    javaValue === null ||
    jsValue === null ||
    typeof javaValue !== "object" ||
    typeof jsValue !== "object"
  ) {
    return [
      {
        differenceType:
          typeof javaValue === typeof jsValue
            ? "VALUE_CHANGED"
            : "TYPE_CHANGED",
        side: "Java",
        selector,
        javaValue,
        jsValue,
      },
    ];
  }
  const keys = [
    ...new Set([...Object.keys(javaValue), ...Object.keys(jsValue)]),
  ].sort();
  return keys.flatMap((key) =>
    atomicDifferences(
      javaValue[key],
      jsValue[key],
      `${selector}${selectorName(key)}`,
    ),
  );
};

const ruleMatches = (rule, difference, fixture) =>
  rule.artifactType === "OWL structural snapshot" &&
  rule.fixture === fixture &&
  rule.parser === "Manchester Syntax" &&
  rule.capability === "parser.manchester" &&
  rule.differenceType === difference.differenceType &&
  rule.side === difference.side &&
  rule.selector === difference.selector &&
  Object.is(rule.javaValue, difference.javaValue) &&
  Object.is(rule.jsValue, difference.jsValue);

const exactCardinality = (rule) =>
  rule.cardinality?.form === "exact" ? rule.cardinality.value : undefined;

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

    const differences = atomicDifferences(
      javaRangeSnapshot(expected.axioms),
      jsRangeSnapshot(ontology),
    );
    const scopedRules = differenceManifest.rules.filter(
      (rule) => rule.fixture === expectedDocument.fixture,
    );
    const matches = new Map(scopedRules.map((rule) => [rule.id, 0]));

    for (const difference of differences) {
      const matchingRules = scopedRules.filter((rule) =>
        ruleMatches(rule, difference, expectedDocument.fixture),
      );
      if (matchingRules.length !== 1) {
        throw new Error(
          `Expected one governed rule for ${JSON.stringify(difference)}, found ${matchingRules.length}`,
        );
      }
      matches.set(matchingRules[0].id, matches.get(matchingRules[0].id) + 1);
    }
    expect(differences).toHaveLength(2);
    for (const rule of scopedRules) {
      expect(matches.get(rule.id)).toBe(exactCardinality(rule));
    }
  });
});
