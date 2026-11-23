import {
  comparisonIdentity,
  comparisonImportRequests,
  exactComparedDocuments,
} from "./comparison-evidence.mjs";

export const ifcowlInputId = "building-smart-ifcowl";
export const recordedIfcowlSuite = "ifcowl-recorded";

// Independent witnesses from the pinned IFC4 ADD2 root and the two distinct
// import graphs. A future catalogue edit needs fresh evidence for these rules.
export const ifcowlMappedInputsSha256 =
  "0ead5a8b3ab91423f555116482ba1f7c28094bf5fe2b8dfe9f1710d8d689c909";
export const ifcowlRecordedInputsSha256 =
  "351b247e9e961007f550d4622cae5f435ad55300172487c1624cf99aa58904e2";

const rootDocumentIRI =
  "https://raw.githubusercontent.com/buildingsmart-community/ifcOWL/master/IFC4_ADD2.ttl";
const rootOntologyIRI = "http://ifcowl.openbimstandards.org/IFC4_ADD2";
const expressIRI = "https://w3id.org/express";
const listIRI = "https://w3id.org/list";
const referenceVersion = "5.5.1.2024-09-07T21:41:32Z";

export function ifcowlImportClosure(policy) {
  const iris = [rootOntologyIRI, expressIRI];
  if (policy === "mapped") iris.push(listIRI);
  return iris.map((ontologyIRI) => ({ ontologyIRI, versionIRI: null }));
}

const licenseAnnotation = {
  subject: rootOntologyIRI,
  predicate: "http://creativecommons.org/ns#license",
  objectSha256:
    "6cccfd94e1b0d407257aead32db43d29da89182aa90afb6f500c3bbce06e95d8",
};

export const ifcowlMappedWriteRefusal = licenseAnnotation;
export const ifcowlMappedStrictRefusal = {
  dependentStageReason: "expected-undeclared-ontology-annotation",
  authority:
    "https://www.w3.org/TR/owl2-mapping-to-rdf/#Parsing_of_Annotations",
  js: {
    category: "UNSUPPORTED_CONSTRUCT",
    statement: { graph: "", ...licenseAnnotation },
  },
  java: {
    oracleVersion: referenceVersion,
    identity: { ontologyIRI: rootOntologyIRI, versionIRI: null },
    axioms: 20627,
    closure: ifcowlImportClosure("mapped"),
  },
};

export const recordedIfcowlMismatch = Object.freeze({
  count: 16,
  sha256: "20a29d490900100777d1676bc4b6eabbda5306cd50f3743ef3eeee01b2f2c174",
  oracleVersion: referenceVersion,
});

const rootSingletonUnions = {
  count: 18,
  sha256: "b7ac1aa81c2a5036275c95d4fdbd0dabbab5a476c975e17ed88a821607b85434",
};
const expressSingletonUnions = {
  count: 4,
  sha256: "f9c5fba46ad10a81898a473273afb45cb6375cc62743ff33e6d13048b7265471",
};
const mergedSingletonUnions = {
  count: 22,
  sha256: "1a55575a0c658a58892219d41e8fe55f926082ae00af1b91694a4c1c7c19e4a3",
};

/** Scope the OWL 2 minimum-operand rule to the reviewed singleton pairs. */
export function ifcowlSingletonUnionScope(scenario) {
  const closure = scenario === "closure-roundtrip";
  return {
    kind: "ifcowl-singleton-unions",
    authority:
      "https://www.w3.org/TR/owl2-mapping-to-rdf/#Parsing_of_Expressions",
    oracleVersion: referenceVersion,
    ruleIds: ["IFCOWL-MAPPED-SINGLETON-UNIONS"],
    structure: { ...(closure ? mergedSingletonUnions : rootSingletonUnions) },
    ...(closure
      ? {
          memberDocumentIRIs: [rootDocumentIRI, expressIRI],
          documentDifferences: {
            [rootDocumentIRI]: { ...rootSingletonUnions },
            [expressIRI]: { ...expressSingletonUnions },
          },
        }
      : {}),
  };
}

function differenceAxioms(comparison, expected) {
  const axioms = comparison?.differences?.axioms;
  if (
    comparison?.status !== "mismatch" ||
    comparison.detailStatus !== "completed" ||
    ![axioms?.javaOnly, axioms?.jsOnly].every(
      (rows) =>
        Array.isArray(rows) &&
        rows.length === expected.count &&
        rows.every((row) => typeof row === "string"),
    )
  ) {
    return null;
  }
  return axioms;
}

function matchesDifferenceDigest(comparison, javaOnly, expected) {
  const { differences } = comparison;
  return (
    comparisonIdentity({
      ...differences,
      axioms: {
        ...differences.axioms,
        javaOnly: [...javaOnly].sort(),
        jsOnly: [...differences.axioms.jsOnly].sort(),
      },
    }) === expected.sha256
  );
}

const placeholder =
  /<http:\/\/org\.semanticweb\.owlapi\/error#Error[1-9]\d*>/gu;

/** The recorded load remains a mismatch. Only the Java error counters vary. */
export function matchesRecordedIfcowlMismatch(definition, js, native) {
  const expected = definition.expectedRecordedIfcowlMismatch;
  const { structure, javaLoad, functionalReparse } = native;
  const requests = comparisonImportRequests(definition.imports, js, native);
  const axioms = differenceAxioms(structure, expected);
  if (
    !axioms ||
    !requests.javascript ||
    !requests.java ||
    native.oracleVersion !== expected.oracleVersion ||
    functionalReparse?.status !== "completed" ||
    javaLoad?.ontology?.unparsedRdf?.length !== 0
  ) {
    return false;
  }
  const placeholders = axioms.javaOnly.map((axiom) => axiom.match(placeholder));
  return (
    placeholders.every((row) => row?.length === 1) &&
    new Set(placeholders.flat()).size === expected.count &&
    matchesDifferenceDigest(
      structure,
      axioms.javaOnly.map((axiom) =>
        axiom.replaceAll(
          placeholder,
          "<http://org.semanticweb.owlapi/error#Error>",
        ),
      ),
      expected,
    )
  );
}

const singletonUnion =
  /^(SubClassOf|DataPropertyDomain)\((<[^<>\s]+>) ObjectUnionOf\((<[^<>\s]+>)\)\)$/u;

function matchesSingletonUnions(comparison, expected) {
  const axioms = differenceAxioms(comparison, expected);
  if (!axioms || !axioms.javaOnly.every((axiom) => singletonUnion.test(axiom)))
    return false;
  const collapsed = axioms.javaOnly.map((axiom) =>
    axiom.replace(singletonUnion, "$1($2 $3)"),
  );
  return (
    comparisonIdentity(collapsed.sort()) ===
      comparisonIdentity([...axioms.jsOnly].sort()) &&
    matchesDifferenceDigest(comparison, axioms.javaOnly, expected)
  );
}

/** Verify every source model, the merged delta, and independent native propagation. */
export function reconcileIfcowlSingletonUnions(definition, js, native) {
  const scope = definition.expectedDifferences;
  const requests = comparisonImportRequests(definition.imports, js, native);
  if (
    native.oracleVersion !== scope.oracleVersion ||
    !requests.javascript ||
    !requests.java ||
    native.javaLoad?.ontology?.unparsedRdf?.length !== 0 ||
    !matchesSingletonUnions(native.structure, scope.structure)
  ) {
    return null;
  }
  if (scope.documentDifferences) {
    const requiredDocuments = new Set([
      definition.input.documentIRI,
      ...definition.imports.map(({ documentIRI }) => documentIRI),
    ]);
    if (
      native.closurePropagation?.status !== "match" ||
      !exactComparedDocuments(js.documentModels, native.documentComparisons) ||
      native.documentComparisons.length !== requiredDocuments.size ||
      native.documentComparisons.some(
        ({ documentIRI, comparison, unparsedRdf }) => {
          const expected = scope.documentDifferences[documentIRI];
          return (
            !requiredDocuments.has(documentIRI) ||
            unparsedRdf?.length !== 0 ||
            (expected
              ? !matchesSingletonUnions(comparison, expected)
              : comparison?.status !== "match")
          );
        },
      )
    ) {
      return null;
    }
  }
  return scope.ruleIds;
}
