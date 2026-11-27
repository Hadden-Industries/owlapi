import {
  comparisonCatalogue,
  comparisonWitnesses,
  generatedFixture,
  universalOntologyFixtures,
  universalOntologyManifest,
} from "./comparison-fixtures.mjs";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";
import { scopedRuleExpectation } from "./comparison-scoped-swrl.mjs";
import { oracleVersion, pinnedSourceOracle } from "./comparison-oracle.mjs";
import { configurationComparisonCases } from "./comparison-configuration.mjs";
import { mutationComparisonCases } from "./comparison-mutation.mjs";
import { loadPublicationComparisonCase } from "./comparison-load-publication.mjs";
import { storageComparisonCases } from "./comparison-storage.mjs";
import { literalConstructionComparisonCase } from "./comparison-literal-construction.mjs";
import { queryComparisonCases } from "./comparison-query.mjs";
import { parserBehaviorComparisonCases } from "./comparison-parser-behavior.mjs";
import { profileIdentityComparisonCase } from "./comparison-profile-identity.mjs";
import { localityBehaviorComparisonCase } from "./comparison-locality.mjs";
import { xmlProviderComparisonCase } from "./comparison-xml-provider.mjs";
import { jsonLdComparisonCases } from "./comparison-jsonld.mjs";
import { transportComparisonCases } from "./comparison-transport.mjs";
import { writerComparisonCases } from "./comparison-writer.mjs";
import { profileComparisonCases } from "./comparison-profile.mjs";
import {
  ifcowlInputId,
  ifcowlImportClosure,
  ifcowlMappedInputsSha256,
  ifcowlMappedStrictRefusal,
  ifcowlMappedWriteRefusal,
  ifcowlRecordedInputsSha256,
  ifcowlSingletonUnionScope,
  recordedIfcowlMismatch,
  recordedIfcowlSuite,
} from "./comparison-ifcowl.mjs";
import {
  rdfXmlExpansionKind,
  rdfXmlExpansionSource,
} from "./comparison-rdfxml-expansion.mjs";

export const javaProfile = "java-owlapi-5.5.1";
export const normativeProfile = "normative-v1";
export const literalScenarios = [
  "large-literal-roundtrip",
  "large-literal-rendering",
];
export const selectsWriter = ({ suite, scenario }) =>
  suite === "rdfxml-writer" || scenario === "rdfxml-writer";
export const selectsVowl = ({ suite, scenario }) =>
  suite === "canonical-vowl-dl" || scenario === "canonical-vowl-dl";
export const selectsPublicBehavior = ({ suite, scenario }) =>
  suite === "public-api-behavior" || scenario === "public-api-behavior";

const originalIdmp = comparisonCatalogue.fixtures.find(
  ({ id }) => id === "pistoia-idmp",
);
const brickInputId = "brick-only";
const nativeClosureControls = new Set([
  "eu-epo-core",
  "entsoe-cgmes-eq",
  "iof-core",
  "esco-model",
]);
// Each compatible pre-save model carries this ontology annotation without its
// property declaration. The strict RDF reconstruction requires that role.
const normativeRdfXmlWriteRefusals = new Map([
  [
    "eu-epo-core",
    {
      subject: "http://data.europa.eu/a4g/ontology#core",
      predicate: "http://purl.org/dc/terms/created",
      objectSha256:
        "8e9ed7f273d05f4cbf47fe5edd7f3ce5c646c44bbc4bc4e7c8421011cf211648",
    },
  ],
  [
    "iof-core",
    {
      subject: "https://spec.industrialontologies.org/ontology/core/Core/",
      predicate: "http://purl.org/dc/terms/abstract",
      objectSha256:
        "21bf78fa7fab13b7095c84851eda9913be08b18a00d5135e1b14a8e6ce631d1f",
    },
  ],
  [
    "esco-model",
    {
      subject: "http://data.europa.eu/esco/model",
      predicate: "http://purl.org/dc/terms/abstract",
      objectSha256:
        "4a70683366b975f5ff7a687c8f33e06acc7806446d21d82a95c169e87ead5bf2",
    },
  ],
]);
// Observed revision 67 root and mapped import identities, including their
// acquisition sources. Catalogue edits require fresh stock-refusal evidence.
const oggArchiveXmlRefusalInputs = new Map([
  [
    "obo-ogg-archive-ce",
    "9440b8efe562eed517863941f096c338339681d1e99893a6c7fdd39b45988e38",
  ],
  [
    "obo-ogg-archive-dm",
    "814ec3dfec735b3e4925ef69a888fec84e8bd7a6f3595113f866021a4c616f05",
  ],
]);
const stockXmlEntityLimitRefusal = {
  dependentStageReason: "expected-xml-entity-limit",
  js: {
    category: "RESOURCE_LIMIT_EXCEEDED",
    resource: "maxTotalEntityCodeUnits",
    limit: 100_000,
  },
  java: {
    category: "UnparsableOntologyException",
    diagnosticCode: "JAXP00010004",
    resource: "jdk.xml.totalEntitySizeLimit",
  },
};
const strictIdmpRefusal = {
  dependentStageReason: "expected-undeclared-ontology-annotation",
  authority:
    "https://www.w3.org/TR/owl2-mapping-to-rdf/#Parsing_of_Annotations",
  js: {
    category: "UNSUPPORTED_CONSTRUCT",
    statement: {
      graph: "",
      subject:
        "https://spec.pistoiaalliance.org/idmp/ontology/IdentificationOfMedicinalProductsOntology/",
      predicate: "http://purl.org/dc/terms/abstract",
      objectSha256:
        "0ed2555127f346563de17f2d2b15ffed67bfd9b42f4484cb0f0083776b3c3386",
    },
  },
  java: stockXmlEntityLimitRefusal.java,
};
const compatibleIdmpNativeLimit = {
  dependentStageReason: "expected-native-xml-entity-limit",
  authority:
    "docs/compatibility/behavior-profiles.md#configuration-and-resource-defaults",
  js: {
    identity: {
      ontologyIRI:
        "https://spec.pistoiaalliance.org/idmp/ontology/IdentificationOfMedicinalProductsOntology/",
      versionIRI:
        "https://spec.pistoiaalliance.org/idmp/ontology/20260301/IdentificationOfMedicinalProductsOntology/",
    },
    diagnostic: {
      code: "RDF_UNDECLARED_ANNOTATION_PROPERTY",
      iri: "http://purl.org/dc/terms/abstract",
    },
  },
  java: stockXmlEntityLimitRefusal.java,
};
const owlTimeIdentity = {
  ontologyIRI: "http://www.w3.org/2006/time",
  versionIRI: "http://www.w3.org/2006/time#2026",
};
// These outcomes apply to the exact admitted source and import bytes.
const upstreamProfileControls = new Map([
  [
    "w3c-owl-time-rdfxml",
    {
      inputsSha256:
        "5bf3e01fb2573c198deed05e18fa7b0ec905dca57d7617bdcdba4b3b5a7ce305",
      closure: [owlTimeIdentity],
      axioms: 1073,
      predicate: "http://www.w3.org/2004/02/skos/core#changeNote",
      object: "2024-02-29 - Fixed datatype on all cardinality restrictions",
    },
  ],
  [
    "w3c-skos",
    {
      inputsSha256:
        "03c7ad9bd6a1be8d6d7af01b06b6cb64022137ac9e47c22104067bc97c206350",
      closure: [
        {
          ontologyIRI: "http://www.w3.org/2004/02/skos/core",
          versionIRI: null,
        },
      ],
      axioms: 205,
      predicate: "http://purl.org/dc/terms/title",
      object: "SKOS Vocabulary",
    },
  ],
  [
    "w3c-time-gregorian",
    {
      inputsSha256:
        "d65849b34efdd4ee5e3f81ee497cd4b3a14f51c285c4ab9ef2e9d3a6873ac3f6",
      closure: [
        {
          ontologyIRI: "http://www.w3.org/ns/time/gregorian",
          versionIRI: null,
        },
        owlTimeIdentity,
      ],
      axioms: 184,
      predicate: "http://purl.org/dc/terms/created",
      object: "2017-01-20",
    },
  ],
]);
const profileSelections = [
  { behaviorProfileId: javaProfile, parsingMode: "compatible" },
  { behaviorProfileId: normativeProfile, parsingMode: "compatible" },
  { behaviorProfileId: normativeProfile, parsingMode: "strict" },
];
const smokeIds = new Set([
  "entsoe-cgmes-eq",
  "etsi-saref-core",
  "cgmes-range-less",
]);
const memoryIds = new Set([
  "obo-fovt",
  "obo-iceo",
  "obo-cido",
  "obo-clo",
  "obo-vbo",
  "obo-mro",
]);

function importedDocuments(input, all, standIns, policy) {
  const mappings = new Map();
  const seen = new Set();
  const add = (iri, document) => {
    if (mappings.has(iri) && mappings.get(iri) !== document) {
      throw new Error(`Conflicting exact import alias ${iri}`);
    }
    mappings.set(iri, document);
  };
  const visit = (fixture) => {
    if (seen.has(fixture.id)) return;
    seen.add(fixture.id);
    const imports =
      policy === "mapped"
        ? (fixture.mappedImports ?? fixture.imports)
        : fixture.imports;
    for (const id of imports ?? []) {
      if (!all.has(id)) continue;
      const dependency = all.get(id);
      for (const alias of [dependency.ontologyIRI, dependency.documentIRI]) {
        if (alias) add(alias, dependency);
      }
      visit(dependency);
    }
  };
  if (policy !== "none") visit(input);
  if (policy === "recorded") {
    for (const { iri, collections } of standIns) {
      if (!collections.includes(input.collection)) continue;
      if (/[<>\r\n]/u.test(iri) || !/^https?:\/\//u.test(iri)) {
        throw new Error("Stand-in requires an exact HTTP ontology IRI");
      }
      add(
        iri,
        generatedFixture(iri, iri, "functional", `Ontology(<${iri}>)\n`),
      );
    }
  }
  return [...mappings.entries()].sort(([left], [right]) =>
    left < right ? -1 : left === right ? 0 : 1,
  );
}

export const documentIdentity = ({
  id,
  sha256,
  byteLength,
  syntax,
  documentIRI,
}) => ({
  id,
  sha256: sha256 ?? null,
  byteLength: byteLength ?? null,
  syntax: syntax ?? null,
  documentIRI,
});

const importIdentities = (imports) =>
  imports.map(([ontologyIRI, document]) => ({
    ontologyIRI,
    ...documentIdentity(document),
  }));

const pinnedScenarioInputs = (() => {
  const canonicalInputs = new Map(
    [
      ...comparisonCatalogue.fixtures,
      ...comparisonWitnesses,
      ...universalOntologyFixtures,
    ].map((input) => [input.id, input]),
  );
  const scopedIds = [
    originalIdmp.id,
    brickInputId,
    ...nativeClosureControls,
    ...universalOntologyFixtures.map(({ id }) => id),
  ];
  const identity = (id, policy) => {
    const input = canonicalInputs.get(id);
    return comparisonIdentity({
      input: documentIdentity(input),
      imports: importIdentities(
        importedDocuments(
          input,
          canonicalInputs,
          comparisonCatalogue.standIns,
          policy,
        ),
      ),
    });
  };
  return {
    recorded: new Map(scopedIds.map((id) => [id, identity(id, "recorded")])),
  };
})();

function literalCases(request) {
  const rendering = request.scenario === "large-literal-rendering";
  if (
    request.input ||
    request.suite ||
    request.javaTurtle ||
    request.javaXml ||
    request.imports ||
    (rendering && (request.format || request.parsingMode)) ||
    (request.profile && request.profile !== javaProfile) ||
    (request.parsingMode && request.parsingMode !== "compatible")
  ) {
    throw new Error(
      "The large-literal scenario owns its generated input and both profile controls",
    );
  }
  const character = "x";
  const length = 32 * 1024 * 1024 + 1;
  const lexicalForm = character.repeat(length);
  const literalSha256 = sha256(lexicalForm);
  const formats = ["functional", "rdfxml", "owlxml", "turtle"];
  if (request.format && !formats.includes(request.format)) {
    throw new Error("Unknown large-literal document format");
  }
  const variants = rendering
    ? ["manchester-render"]
    : request.format
      ? [request.format]
      : formats;
  return variants.map((syntax) => {
    const input = { id: `large-literal/${syntax}` };
    const definition = {
      schemaVersion: 1,
      scenario: request.scenario,
      scenarioVersion: 1,
      observationPoint: rendering
        ? "manchester-object-render"
        : "model-save-and-reload",
      input,
      literal: {
        character,
        length,
        literalSha256,
        ...(rendering
          ? {
              renderedBytes: length + 2,
              renderedSha256: sha256(`"${lexicalForm}"`),
              normativeOutputByteLimit: 32 * 1024 * 1024,
            }
          : {
              syntax,
              ontologyIRI: "urn:resources:large",
              subjectIRI: "urn:resources:subject",
            }),
      },
      behaviorProfileId: javaProfile,
      ...(rendering ? {} : { parsingMode: "compatible" }),
    };
    return {
      caseId: comparisonIdentity(definition),
      definition,
      input,
      imports: [],
      behaviorDecisionId: "BEHAVIOR-RESOURCE-ACCEPTANCE",
    };
  });
}

/** Expand named inputs, operations and exact loader settings independently of run evidence. */
export function comparisonCases(request, catalogue = comparisonCatalogue) {
  if (request.suite === recordedIfcowlSuite) {
    if (
      [
        "input",
        "scenario",
        "profile",
        "parsingMode",
        "imports",
        "javaTurtle",
        "javaXml",
        "format",
      ].some((key) => request[key] !== undefined)
    ) {
      throw new Error(
        "The recorded ifcOWL control owns its input and loader settings",
      );
    }
    const [recorded] = comparisonCases(
      {
        input: ifcowlInputId,
        profile: javaProfile,
        imports: "recorded",
        scenario: "direct-load",
      },
      catalogue,
    );
    const { input, imports } = recorded.definition;
    if (comparisonIdentity({ input, imports }) !== ifcowlRecordedInputsSha256) {
      throw new Error(
        "The recorded ifcOWL control requires the exact historical inputs",
      );
    }
    const definition = {
      ...recorded.definition,
      observationPoint: "recorded-ifcowl-incomplete-imports",
      measurements: ["behavior"],
      requiredImportClosure: ifcowlImportClosure("recorded"),
      expectedRecordedIfcowlMismatch: structuredClone(recordedIfcowlMismatch),
    };
    return [
      { ...recorded, definition, caseId: comparisonIdentity(definition) },
    ];
  }
  if (literalScenarios.includes(request.scenario)) return literalCases(request);
  if (selectsPublicBehavior(request))
    return [
      ...configurationComparisonCases(request),
      ...mutationComparisonCases(),
      loadPublicationComparisonCase(),
      ...storageComparisonCases(),
      literalConstructionComparisonCase(),
      ...queryComparisonCases(),
      ...parserBehaviorComparisonCases(),
      profileIdentityComparisonCase(),
      localityBehaviorComparisonCase(),
      xmlProviderComparisonCase(),
      ...jsonLdComparisonCases(),
      ...transportComparisonCases(),
    ];
  if (selectsWriter(request)) return writerComparisonCases(request);
  if (selectsVowl(request))
    return profileComparisonCases(request, pinnedSourceOracle());
  if (request.format)
    throw new Error("Format selection applies to large-literal round trips");
  if (catalogue.schemaVersion !== 1)
    throw new Error("Unsupported comparison catalogue");
  const inputIds = [request.input ?? []].flat();
  const selectsInputs = inputIds.length > 0;
  if (Boolean(request.suite) === selectsInputs) {
    throw new Error("Select exactly one comparison suite or input");
  }
  const scenarios = ["direct-load", "closure-roundtrip"];
  const strictFirst = request.scenario === "strict-first";
  if (
    request.scenario &&
    !strictFirst &&
    !scenarios.includes(request.scenario)
  ) {
    throw new Error(`Unknown comparison scenario ${request.scenario}`);
  }
  if (
    strictFirst &&
    request.parsingMode &&
    request.parsingMode !== "compatible"
  ) {
    throw new Error("The strict-first scenario requires a compatible retry");
  }
  if (
    request.imports !== undefined &&
    !["recorded", "mapped", "none"].includes(request.imports)
  )
    throw new Error("Unknown comparison import policy");
  if (
    request.javaXml !== undefined &&
    !["stock", "historical-idmp"].includes(request.javaXml)
  ) {
    throw new Error("Unknown native XML configuration");
  }
  const inputs = [
    ...catalogue.fixtures,
    ...comparisonWitnesses,
    ...universalOntologyFixtures,
  ];
  const all = new Map(inputs.map((fixture) => [fixture.id, fixture]));
  if (all.size !== inputs.length)
    throw new Error("Duplicate input ID in comparison catalogue");
  const selected = inputIds.length
    ? inputIds.map((id) => {
        const fixture = all.get(id);
        if (!fixture) throw new Error(`Unknown comparison input ${id}`);
        return fixture;
      })
    : inputs.filter(({ id, suite }) => {
        if (request.suite === "smoke") return smokeIds.has(id);
        if (request.suite === "memory") return memoryIds.has(id);
        return suite === request.suite;
      });
  if (new Set(selected).size !== selected.length)
    throw new Error("Duplicate comparison input");
  if (selected.length === 0)
    throw new Error("No inputs match the requested comparison selection");
  if (
    request.javaTurtle !== undefined &&
    (request.javaTurtle !== "owlapi" ||
      selected.some(({ syntax }) => syntax !== "turtle"))
  ) {
    throw new Error("The OWLAPI Turtle parser variant requires Turtle inputs");
  }
  if (
    request.javaXml === "historical-idmp" &&
    (selected.length !== 1 ||
      selected[0].id !== originalIdmp.id ||
      selected[0].sha256 !== originalIdmp.sha256)
  ) {
    throw new Error(
      "The historical XML settings require the exact reviewed IDMP input",
    );
  }
  const profiles =
    strictFirst || request.profile || request.parsingMode
      ? [
          {
            behaviorProfileId: request.profile ?? normativeProfile,
            parsingMode: request.parsingMode ?? "compatible",
          },
        ]
      : selected.every(({ source }) => source.kind === rdfXmlExpansionKind)
        ? [profileSelections[0]]
        : request.suite
          ? profileSelections
          : [profileSelections[1]];
  for (const { behaviorProfileId, parsingMode } of profiles) {
    if (
      ![normativeProfile, javaProfile].includes(behaviorProfileId) ||
      !["strict", "compatible"].includes(parsingMode)
    ) {
      throw new Error("Unknown comparison profile or parsing mode");
    }
  }
  return selected.flatMap((input) => {
    const expansion = rdfXmlExpansionSource(input, catalogue);
    const policy =
      request.imports ??
      (expansion ||
      (request.suite === "prospects" && input.id === ifcowlInputId)
        ? "mapped"
        : "recorded");
    const universalOntology = input.suite === "universal-ontology";
    const oracle = universalOntology ? pinnedSourceOracle() : null;
    const imports = importedDocuments(input, all, catalogue.standIns, policy);
    const admittedInputs = {
      input: documentIdentity(input),
      imports: importIdentities(imports),
    };
    const frozenInputs = pinnedScenarioInputs.recorded.get(input.id);
    const exactRecordedInputs =
      policy === "recorded" &&
      frozenInputs !== undefined &&
      frozenInputs === comparisonIdentity(admittedInputs);
    const exactMappedIfcowlInputs =
      policy === "mapped" &&
      input.id === ifcowlInputId &&
      ifcowlMappedInputsSha256 === comparisonIdentity(admittedInputs);
    const hasMappedHttpImports = imports.some(([, document]) =>
      /^https?:/u.test(document.documentIRI),
    );
    const includeClosure =
      input.closure || (request.suite === "prospects" && input.role === "root");
    const selectedScenarios = request.scenario
      ? [request.scenario]
      : request.suite && includeClosure
        ? scenarios
        : [scenarios[0]];
    return selectedScenarios.flatMap((scenario) =>
      profiles.map((profile) => {
        const upstreamControl =
          scenario === "direct-load" &&
          policy === "recorded" &&
          !request.javaTurtle
            ? upstreamProfileControls.get(input.id)
            : undefined;
        if (
          upstreamControl &&
          comparisonIdentity(admittedInputs) !== upstreamControl.inputsSha256
        ) {
          throw new Error(
            `Upstream profile control requires the exact pinned inputs for ${input.id}`,
          );
        }
        const normativeMappedIfcowl =
          exactMappedIfcowlInputs &&
          profile.behaviorProfileId === normativeProfile &&
          !strictFirst &&
          !request.javaTurtle;
        const expectedDifferences =
          normativeMappedIfcowl && profile.parsingMode === "compatible"
            ? ifcowlSingletonUnionScope(scenario)
            : undefined;
        const expectedJsRdfXmlWriteRefusal =
          scenario === "closure-roundtrip" &&
          profile.behaviorProfileId === normativeProfile &&
          profile.parsingMode === "compatible"
            ? normativeMappedIfcowl
              ? ifcowlMappedWriteRefusal
              : exactRecordedInputs
                ? normativeRdfXmlWriteRefusals.get(input.id)
                : undefined
            : undefined;
        const pinnedOntologyClosure =
          scenario === "closure-roundtrip" &&
          input.closure &&
          universalOntology &&
          exactRecordedInputs;
        // The exact round trip preserves the admitted axiom set. Keep the
        // unconfigured native writer result as a separate observation.
        const checkExactClosureWriter =
          scenario === "closure-roundtrip" &&
          (expectedJsRdfXmlWriteRefusal !== undefined ||
            pinnedOntologyClosure ||
            (((nativeClosureControls.has(input.id) && exactRecordedInputs) ||
              exactMappedIfcowlInputs) &&
              profile.behaviorProfileId === javaProfile &&
              profile.parsingMode === "compatible"));
        let expectedLoadRefusals;
        const compatibleJava =
          profile.behaviorProfileId === javaProfile &&
          profile.parsingMode === "compatible";
        if (
          expansion &&
          (scenario !== "direct-load" || policy !== "mapped" || !compatibleJava)
        ) {
          throw new Error(
            "Entity-free RDF/XML requires a Java-compatible direct load with mapped imports",
          );
        }
        const oggArchivePin = oggArchiveXmlRefusalInputs.get(input.id);
        if (
          upstreamControl &&
          profile.behaviorProfileId === normativeProfile &&
          profile.parsingMode === "strict"
        ) {
          const { closure, axioms, predicate, object } = upstreamControl;
          const [identity] = closure;
          expectedLoadRefusals = {
            dependentStageReason: "expected-undeclared-ontology-annotation",
            authority:
              "https://www.w3.org/TR/owl2-mapping-to-rdf/#Parsing_of_Annotations",
            js: {
              category: "UNSUPPORTED_CONSTRUCT",
              statement: {
                graph: "",
                subject: identity.ontologyIRI,
                predicate,
                objectSha256: sha256(object),
              },
            },
            java: { oracleVersion, identity, axioms, closure },
          };
        } else if (normativeMappedIfcowl && profile.parsingMode === "strict") {
          expectedLoadRefusals = ifcowlMappedStrictRefusal;
        } else if (
          scenario === "direct-load" &&
          compatibleJava &&
          policy === "mapped" &&
          !request.javaTurtle &&
          oggArchivePin !== undefined &&
          oggArchivePin ===
            comparisonIdentity({
              ...admittedInputs,
              sources: [
                input.source,
                ...imports.map(([, document]) => document.source),
              ],
            })
        ) {
          expectedLoadRefusals = stockXmlEntityLimitRefusal;
        } else if (
          (scenario === "direct-load" || scenario === "closure-roundtrip") &&
          exactRecordedInputs
        ) {
          if (
            input.id === originalIdmp.id &&
            request.javaXml !== "historical-idmp"
          ) {
            if (compatibleJava)
              expectedLoadRefusals = stockXmlEntityLimitRefusal;
            else if (profile.behaviorProfileId === normativeProfile)
              expectedLoadRefusals =
                profile.parsingMode === "strict"
                  ? strictIdmpRefusal
                  : compatibleIdmpNativeLimit;
          } else if (
            input.id === brickInputId &&
            compatibleJava &&
            !request.javaTurtle
          ) {
            expectedLoadRefusals = {
              dependentStageReason: "expected-rdf-header-id-collision",
              js: {
                category: "ONTOLOGY_STATE_INVALID",
                reason: "RDF_HEADER_ID_COLLISION",
                collisionIdentities: imports.map(([ontologyIRI]) => ({
                  ontologyIRI,
                  versionIRI: null,
                })),
              },
              java: { category: "OWLOntologyAlreadyExistsException" },
            };
          }
        }
        const requiredImportClosure = expansion
          ? [
              input.documentIRI,
              ...new Set(imports.map(([, member]) => member.ontologyIRI)),
            ].map((ontologyIRI) => ({ ontologyIRI, versionIRI: null }))
          : upstreamControl && !expectedLoadRefusals
            ? structuredClone(upstreamControl.closure)
            : exactMappedIfcowlInputs && !strictFirst && !expectedLoadRefusals
              ? ifcowlImportClosure("mapped")
              : undefined;
        const expectedScopedRules = scopedRuleExpectation(
          input,
          scenario,
          profile,
          policy,
        );
        const definition = {
          schemaVersion: 1,
          scenario,
          ...(expectedScopedRules ? { expectedScopedRules } : {}),
          scenarioVersion: scenario === "direct-load" ? 1 : 2,
          observationPoint:
            scenario === "strict-first"
              ? "public-strict-then-compatible-load"
              : scenario === "direct-load"
                ? "public-direct-load"
                : "merged-closure-roundtrip",
          ...(strictFirst ? { loadSequence: ["strict", "compatible"] } : {}),
          ...(oracle ? { oracle } : {}),
          ...admittedInputs,
          ...(pinnedOntologyClosure &&
          profile.behaviorProfileId === normativeProfile
            ? {
                expectedClosure: universalOntologyManifest.roots.find(
                  (root) => root.path === input.source.path,
                ).expectedClosure,
                allowedSourceDiagnostics:
                  universalOntologyManifest.allowedSourceDiagnostics,
              }
            : {}),
          importPolicy: policy,
          ...(requiredImportClosure ? { requiredImportClosure } : {}),
          ...(expansion
            ? {
                originalRdfXml: {
                  document: documentIdentity(expansion.original),
                  recipe: expansion.recipe,
                  limits: expansion.limits,
                },
              }
            : {}),
          ...(hasMappedHttpImports &&
          profile.behaviorProfileId === normativeProfile
            ? {
                jsLoaderOptions: {
                  remoteImports: true,
                  remoteJsonLdContexts: false,
                },
              }
            : {}),
          ...(request.javaXml === "historical-idmp"
            ? { javaXml: request.javaXml }
            : {}),
          ...(request.javaTurtle ? { javaTurtle: request.javaTurtle } : {}),
          ...(expectedDifferences ? { expectedDifferences } : {}),
          ...(expectedJsRdfXmlWriteRefusal
            ? {
                expectedJsRdfXmlWriteRefusal: structuredClone(
                  expectedJsRdfXmlWriteRefusal,
                ),
              }
            : {}),
          ...(checkExactClosureWriter
            ? { javaRdfXml: { addMissingTypes: false, observeDefault: true } }
            : {}),
          ...(expectedLoadRefusals
            ? {
                measurements: ["behavior"],
                expectedLoadRefusals: structuredClone(expectedLoadRefusals),
              }
            : {}),
          ...profile,
        };
        return {
          caseId: comparisonIdentity(definition),
          definition,
          input,
          imports,
          ...(expansion ? { originalRdfXml: expansion.original } : {}),
        };
      }),
    );
  });
}
