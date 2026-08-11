import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";

const OWLXML_FIXTURE_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/owlxml/phase4-structural.owx",
  import.meta.url,
);
const FUNCTIONAL_FIXTURE_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/owlxml/phase4-structural.ofn",
  import.meta.url,
);
const JAVA_SNAPSHOT_URL = new URL(
  "../../../../util/owlapi-reference/fixtures/owlxml/phase4-structural.java.json",
  import.meta.url,
);
const EXPECTED_DIFFERENCES_URL = new URL(
  "../../../../docs/owlapi-js/compatibility/expected-differences.json",
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

const javaObjectOneOfSnapshot = (axioms) => {
  const rendered = axioms.find((axiom) => axiom.startsWith("DisjointUnion("));
  const operands = rendered?.match(/ObjectOneOf\(([^)]*)\)/u)?.[1];
  if (operands === undefined) {
    throw new Error("Pinned Java snapshot has no DisjointUnion ObjectOneOf");
  }
  return {
    disjointUnion: {
      objectOneOf: {
        anonymousIndividualCount: (operands.match(/_:[^\s)]+/gu) || []).length,
      },
    },
  };
};

const jsObjectOneOfSnapshot = (ontology) => {
  const [axiom] = ontology.getAxiomsByType(OWLObjectKind.DISJOINT_UNION_AXIOM);
  const oneOf = [...axiom.classExpressions].find(
    ({ kind }) => kind === OWLObjectKind.OBJECT_ONE_OF,
  );
  if (!oneOf) {
    throw new Error("OWL/XML snapshot has no DisjointUnion ObjectOneOf");
  }
  return {
    disjointUnion: {
      objectOneOf: {
        anonymousIndividualCount: [...oneOf.individuals].filter(
          ({ kind }) => kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL,
        ).length,
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
  rule.parser === "OWL/XML" &&
  rule.capability === "parser.owlxml" &&
  rule.differenceType === difference.differenceType &&
  rule.side === difference.side &&
  rule.selector === difference.selector &&
  Object.is(rule.javaValue, difference.javaValue) &&
  Object.is(rule.jsValue, difference.jsValue);

describe("OWL/XML structural differential", () => {
  it("matches the Functional counterpart and pinned Java OWLAPI summary", async () => {
    const owlXmlFixture = readFileSync(OWLXML_FIXTURE_URL, "utf8");
    const functionalFixture = readFileSync(FUNCTIONAL_FIXTURE_URL, "utf8");
    const expectedDocument = JSON.parse(
      readFileSync(JAVA_SNAPSHOT_URL, "utf8"),
    );
    const differenceManifest = JSON.parse(
      readFileSync(EXPECTED_DIFFERENCES_URL, "utf8"),
    );
    const configuration = new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    });
    const documentIRI = "urn:owlapi-js:phase4:document";
    const owlXmlManager = OWLManager.createOWLOntologyManager();
    const functionalManager = OWLManager.createOWLOntologyManager();
    const owlXmlOntology = await owlXmlManager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(owlXmlFixture, {
        documentIRI,
        fileName: "phase4-structural.owx",
      }),
      configuration,
    );
    const functionalOntology =
      await functionalManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(functionalFixture, {
          documentIRI,
          fileName: "phase4-structural.ofn",
        }),
        configuration,
      );
    const expected = expectedDocument.snapshot;

    expect(expectedDocument).toMatchObject({
      fixture: "util/owlapi-reference/fixtures/owlxml/phase4-structural.owx",
      oracle: {
        revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
        version: "5.5.1",
      },
    });
    expect(structuralSnapshot(owlXmlOntology)).toEqual(
      structuralSnapshot(functionalOntology),
    );
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

    const differences = atomicDifferences(
      javaObjectOneOfSnapshot(expected.axioms),
      jsObjectOneOfSnapshot(owlXmlOntology),
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
    expect(differences).toHaveLength(1);
    for (const rule of scopedRules) {
      expect(rule.cardinality).toMatchObject({ form: "exact" });
      expect(matches.get(rule.id)).toBe(rule.cardinality.value);
    }
  });
});
