import { readFileSync } from "node:fs";
import {
  OWLOntologyManager,
  IRI,
  AddImport,
  RemoveImport,
} from "../model/index.js";
import { StringDocumentSource } from "../io/index.js";
import { OWL2ELProfile } from "./owl2ELProfile.js";
import { OWL2QLProfile } from "./owl2QLProfile.js";
import { OWL2RLProfile } from "./owl2RLProfile.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../util/owlapi-reference/fixtures/rc2/profile-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const profiles = [
  new OWL2ELProfile(),
  new OWL2QLProfile(),
  new OWL2RLProfile(),
];
// Owner-accepted W3C differences remain exact fixture/profile expectations;
// every other profile result and diagnostic still compares with native Java.
const acceptedDifferences = new Map([
  ...["datatype_unsignedInt", "datatype_unsignedShort"].map((id) => [
    id,
    { identity: "RC2-PRF-DIFF-001", profile: "OWL 2 RL", valid: true },
  ]),
  ...["topObject", "bottomData"].map((id) => [
    id,
    {
      identity: "RC2-PRF-DIFF-002",
      profile: "OWL 2 RL",
      valid: false,
      code: "PROFILE_PROPERTY_NOT_ALLOWED",
    },
  ]),
  [
    "chainRangeInherited",
    { identity: "RC2-PRF-DIFF-003", profile: "OWL 2 EL", valid: true },
  ],
  ...[
    "disjointSome",
    "position_disjoint_3",
    "position_disjoint_5",
    "position_disjoint_6",
    "position_disjoint_10",
    "position_disjoint_13",
  ].map((id) => [
    id,
    { identity: "RC2-PRF-DIFF-004", profile: "OWL 2 RL", valid: true },
  ]),
]);
const nativeDiagnosticCodes = {
  UseOfNonSubClassExpression: ["PROFILE_CLASS_POSITION_NOT_ALLOWED"],
  UseOfNonSuperClassExpression: ["PROFILE_CLASS_POSITION_NOT_ALLOWED"],
  UseOfNonEquivalentClassExpression: ["PROFILE_CLASS_POSITION_NOT_ALLOWED"],
  UseOfNonAtomicClassExpression: ["PROFILE_CLASS_ASSERTION_NOT_ATOMIC"],
  UseOfIllegalClassExpression: ["PROFILE_CLASS_EXPRESSION_NOT_ALLOWED"],
  UseOfIllegalDataRange: [
    "PROFILE_DATA_RANGE_NOT_ALLOWED",
    "PROFILE_DATATYPE_NOT_ALLOWED",
  ],
  UseOfIllegalAxiom: ["PROFILE_AXIOM_NOT_ALLOWED"],
  UseOfObjectOneOfWithMultipleIndividuals: [
    "PROFILE_OBJECT_ENUMERATION_NOT_SINGLETON",
  ],
  UseOfDataOneOfWithMultipleLiterals: [
    "PROFILE_DATA_ENUMERATION_NOT_SINGLETON",
  ],
  UseOfObjectPropertyInverse: ["PROFILE_INVERSE_PROPERTY_NOT_ALLOWED"],
  UseOfAnonymousIndividual: ["PROFILE_ANONYMOUS_INDIVIDUAL_NOT_ALLOWED"],
  LastPropertyInChainNotInImposedRange: [
    "EL_CHAIN_RANGE_NOT_IMPOSED_ON_LAST_PROPERTY",
  ],
  UseOfUndeclaredClass: ["UNDECLARED_ENTITY"],
  UseOfNonSimplePropertyInFunctionalPropertyAxiom: [
    "NONSIMPLE_OBJECT_PROPERTY",
  ],
};

test.each(profiles)(
  "%p rejects queued cancellation and never certifies a changing snapshot",
  async (profile) => {
    const manager = new OWLOntologyManager();
    const ontology = manager.createOntology();
    const factory = manager.getOWLDataFactory();
    const first = factory.getOWLClass(IRI.create("urn:profiles:initial"));
    manager.addAxiom(ontology, factory.getOWLDeclarationAxiom(first));
    const controller = new AbortController();
    const cancelled = profile.checkOntology(ontology, {
      signal: controller.signal,
    });
    queueMicrotask(() => controller.abort());
    await expect(cancelled).rejects.toHaveProperty("name", "AbortError");
    const checking = profile.checkOntology(ontology);
    manager.addAxiom(
      ontology,
      factory.getOWLDeclarationAxiom(
        factory.getOWLClass(IRI.create("urn:profiles:later")),
      ),
    );
    const report = await checking;
    expect(report.status).toBe("unverified");
    expect(report.unverifiedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ONTOLOGY_CHANGED_DURING_CHECK" }),
      ]),
    );
    expect(report.isInProfile()).toBe(false);
    expect((await profile.checkOntology(ontology)).isInProfile()).toBe(true);
  },
);

test.each(
  fixture.observations
    .filter(
      ({ id }) =>
        id !== "annotationCustomDatatype" && !id.startsWith("common_"),
    )
    .map((row) => [row.id, row]),
)("per-rule native profile vector %s", async (_id, row) => {
  const manager = new OWLOntologyManager();
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(row.input),
    { parsingMode: "strict" },
  );
  for (const profile of profiles) {
    const report = await profile.checkOntology(ontology);
    const difference = acceptedDifferences.get(row.id);
    if (difference?.profile === profile.getName()) {
      expect(difference.identity).toMatch(/^RC2-PRF-DIFF-00[1-4]$/);
      expect(row.profiles[profile.getName()].inProfile).toBe(!difference.valid);
      expect(report.status).toBe(difference.valid ? "valid" : "invalid");
      if (difference.code)
        expect(report.violations).toContainEqual(
          expect.objectContaining({ code: difference.code }),
        );
      continue;
    }
    if (report.isInProfile() !== row.profiles[profile.getName()].inProfile)
      throw new Error(
        JSON.stringify({
          id: row.id,
          profile: profile.getName(),
          expected: row.profiles[profile.getName()],
          status: report.status,
          violations: report.violations,
          unverified: report.unverifiedChecks,
        }),
      );
    expect(report.getOntology()).toBe(ontology);
    expect(report.getProfile()).toBe(profile);
    const actualCodes = new Set(report.violations.map(({ code }) => code));
    for (const violation of row.profiles[profile.getName()].violations) {
      expect(Object.hasOwn(nativeDiagnosticCodes, violation)).toBe(true);
      expect(
        nativeDiagnosticCodes[violation].some((code) => actualCodes.has(code)),
      ).toBe(true);
    }
  }
});

const commonRules = {
  propertyCategory: "PROPERTY_CATEGORY_COLLISION",
  classDatatype: "CLASS_DATATYPE_COLLISION",
  reservedClass: "RESERVED_ENTITY_IRI",
  reservedObjectProperty: "RESERVED_ENTITY_IRI",
  reservedIndividual: "RESERVED_ENTITY_IRI",
  reservedDatatype: "RESERVED_ENTITY_IRI",
  badAnnotationLiteral: "LITERAL_LEXICAL_SPACE",
  badNestedAnnotationLiteral: "LITERAL_LEXICAL_SPACE",
  definedLiteral: "DEFINED_DATATYPE_LITERAL",
  definedRestriction: "DEFINED_DATATYPE_RESTRICTION",
  badFacetValue: "FACET_VALUE_OUTSIDE_BASE_SPACE",
  multipleDefinitions: "DATATYPE_DEFINITION_COUNT",
  redefinedBuiltin: "DATATYPE_DEFINITION_COUNT",
  cyclicDefinitions: "CYCLIC_DATATYPE_DEFINITION",
  topDataDeclaration: "TOP_DATA_PROPERTY_POSITION",
  naryDataRange: "DATA_RANGE_ARITY",
  anonymousSame: "ANONYMOUS_INDIVIDUAL_POSITION",
  anonymousDifferent: "ANONYMOUS_INDIVIDUAL_POSITION",
  anonymousNegativeObject: "ANONYMOUS_INDIVIDUAL_POSITION",
  anonymousNegativeData: "ANONYMOUS_INDIVIDUAL_POSITION",
  anonymousNominal: "ANONYMOUS_INDIVIDUAL_POSITION",
  anonymousHasValue: "ANONYMOUS_INDIVIDUAL_POSITION",
  anonymousCycle: "ANONYMOUS_GRAPH_NOT_FOREST",
  anonymousDuplicateEdge: "MULTIPLE_ANONYMOUS_EDGE_ASSERTIONS",
  anonymousNoRoot: "ANONYMOUS_TREE_WITHOUT_ROOT",
  irregularMiddleHead: "IRREGULAR_PROPERTY_HIERARCHY",
  irregularHierarchy: "IRREGULAR_PROPERTY_HIERARCHY",
};
// The accepted baseline carries the existing DL validator into every new
// profile. These exact native omissions do not authorize weakening that validator.
const nativeCommonOmissions = new Set([
  "badAnnotationLiteral",
  "badNestedAnnotationLiteral",
  "topDataDeclaration",
  "naryDataRange",
]);
const nativeRLOmissions = new Set([
  "anonymousSame",
  "anonymousDifferent",
  "anonymousNegativeObject",
  "anonymousNegativeData",
  "anonymousHasValue",
  "anonymousCycle",
  "anonymousDuplicateEdge",
  "anonymousNoRoot",
]);
test.each(
  fixture.observations
    .filter(({ id }) => id.startsWith("common_"))
    .map((row) => [row.id, row]),
)(
  "preserves inherited common validation and native observation for %s",
  async (id, row) => {
    const ontology =
      await new OWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource(row.input),
        { parsingMode: "preserve" },
      );
    const rule = id.slice("common_".length);
    const code = rule.startsWith("nonsimple_")
      ? "NONSIMPLE_OBJECT_PROPERTY"
      : commonRules[rule];
    for (const profile of profiles) {
      const report = await profile.checkOntology(ontology);
      const native = row.profiles[profile.getName()];
      if (code)
        expect(report.violations).toContainEqual(
          expect.objectContaining({ code }),
        );
      if (rule === "definedRestriction") {
        expect(native.error).toBe("OWLRuntimeException");
        expect(native.message).toContain("not a built in datatype");
        expect(report.status).toBe("invalid");
      } else if (
        nativeCommonOmissions.has(rule) ||
        (profile.getName() === "OWL 2 RL" && nativeRLOmissions.has(rule))
      ) {
        expect(native.inProfile).toBe(true);
        expect(report.status).toBe("invalid");
      } else {
        expect(native.error).toBeUndefined();
        expect(report.isInProfile()).toBe(native.inProfile);
      }
    }
  },
);

test("new profiles preserve the existing stricter common datatype boundary for unknown annotation literals", async () => {
  const row = fixture.observations.find(
    ({ id }) => id === "annotationCustomDatatype",
  );
  const manager = new OWLOntologyManager();
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(row.input),
  );
  for (const profile of profiles) {
    expect(row.profiles[profile.getName()].inProfile).toBe(true);
    const report = await profile.checkOntology(ontology);
    expect(report.isInProfile()).toBe(false);
    expect(report.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DATATYPE_DEFINITION_COUNT" }),
      ]),
    );
    expect(report.unverifiedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DATATYPE_NOT_IN_SUPPORTED_MAP" }),
      ]),
    );
  }
});

test.each(profiles)(
  "%p checks common simplicity and annotation literals across both import directions",
  async (profile) => {
    for (const swap of [false, true]) {
      const declarations =
        "Declaration(Class(<urn:profiles:A>)) Declaration(Class(<urn:profiles:B>)) Declaration(ObjectProperty(<urn:profiles:p>))";
      const parts = [
        "TransitiveObjectProperty(<urn:profiles:p>)",
        'SubClassOf(<urn:profiles:A> ObjectMinCardinality(1 <urn:profiles:p> <urn:profiles:B>)) AnnotationAssertion(<http://www.w3.org/2000/01/rdf-schema#label> <urn:profiles:A> "bad"^^<http://www.w3.org/2001/XMLSchema#integer>)',
      ];
      if (swap) parts.reverse();
      let acquisitions = 0;
      const manager = new OWLOntologyManager({
        documentLoader: {
          load: async () => {
            acquisitions++;
            return new StringDocumentSource(
              `Ontology(<urn:profiles:imported> ${declarations} ${parts[1]})`,
            );
          },
        },
      });
      const ontology = await manager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(
          `Ontology(<urn:profiles:root> Import(<urn:profiles:imported>) ${declarations} ${parts[0]})`,
        ),
        { parsingMode: "preserve" },
      );
      const report = await profile.checkOntology(ontology, {
        sourceAssessment: true,
      });
      expect(report.status).toBe("invalid");
      expect(report.closure).toHaveLength(2);
      for (const code of ["NONSIMPLE_OBJECT_PROPERTY", "LITERAL_LEXICAL_SPACE"])
        expect(report.violations).toContainEqual(
          expect.objectContaining({ code, scope: swap ? 0 : 1 }),
        );
      expect(report.sourceAssessment.status).toBe("invalid");
      expect(acquisitions).toBe(1);
    }
  },
);

test.each(profiles)(
  "%p retains resource, closure and source-evidence boundaries",
  async (profile) => {
    const manager = new OWLOntologyManager();
    const ontology = manager.createOntology();
    const factory = manager.getOWLDataFactory();
    const report = await profile.checkOntology(ontology, {
      sourceAssessment: true,
    });
    expect(report.isInProfile()).toBe(true);
    expect(report.getSourceAssessment().status).toBe("unverified");
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.getViolations())).toBe(true);
    expect(profile.getIRI().value).toBe(
      `http://www.w3.org/ns/owl-profile/${profile.getName().slice(-2)}`,
    );
    const limited = await profile.checkOntology(ontology, { maxWork: 0 });
    expect(limited.status).toBe("unverified");
    expect(limited.unverifiedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED" }),
      ]),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      profile.checkOntology(ontology, { signal: controller.signal }),
    ).rejects.toHaveProperty("name", "AbortError");
    await expect(
      profile.checkOntology(ontology, { unknownOption: true }),
    ).rejects.toThrow(TypeError);
    const declaration = factory.getOWLImportsDeclaration(
      IRI.create("urn:profiles:missing"),
    );
    manager.applyChanges([new AddImport(ontology, declaration)]);
    expect((await profile.checkOntology(ontology)).status).toBe("unverified");
    manager.applyChanges([new RemoveImport(ontology, declaration)]);
    expect((await profile.checkOntology(ontology)).isInProfile()).toBe(true);
    const imported = manager.createOntology(
      factory.getOWLOntologyID(IRI.create("urn:profiles:missing")),
    );
    manager.addAxiom(
      imported,
      factory.getOWLDisjointUnionAxiom(
        factory.getOWLClass(IRI.create("urn:profiles:A")),
        [
          factory.getOWLClass(IRI.create("urn:profiles:B")),
          factory.getOWLClass(IRI.create("urn:profiles:C")),
        ],
      ),
    );
    manager.applyChanges([new AddImport(ontology, declaration)]);
    const invalid = await profile.checkOntology(ontology);
    expect(invalid.status).toBe("invalid");
    expect(invalid.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PROFILE_AXIOM_NOT_ALLOWED",
          scope: 1,
        }),
      ]),
    );
  },
);
