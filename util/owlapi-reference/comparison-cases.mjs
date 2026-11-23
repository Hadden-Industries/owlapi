import {
  comparisonCatalogue,
  comparisonWitnesses,
  generatedFixture,
  julyComparisonFixtures,
} from "./comparison-fixtures.mjs";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";
import { pinnedSourceOracle } from "./comparison-oracle.mjs";
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
import { julyTimeDifferenceScope } from "./comparison-july-differences.mjs";
import { writerComparisonCases } from "./comparison-writer.mjs";
import { profileComparisonCases } from "./comparison-profile.mjs";

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
const julyTimePath = "src/external/time.rdf";
const julyTimeClosureRoots = new Set(["july/core", "july/extended"]);

const originalIdmp = comparisonCatalogue.fixtures.find(
  ({ id }) => id === "pistoia-idmp",
);
const nativeClosureControls = new Set([
  "eu-epo-core",
  "entsoe-cgmes-eq",
  "iof-core",
  "esco-model",
]);
const stockIdmpRefusal = {
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
  java: stockIdmpRefusal.java,
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
  java: stockIdmpRefusal.java,
};
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
    for (const id of fixture.imports ?? []) {
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

const recordedScenarioInputs = (() => {
  const canonicalInputs = new Map(
    [
      ...comparisonCatalogue.fixtures,
      ...comparisonWitnesses,
      ...julyComparisonFixtures,
    ].map((input) => [input.id, input]),
  );
  const scopedIds = [
    originalIdmp.id,
    ...nativeClosureControls,
    ...julyComparisonFixtures.map(({ id }) => id),
  ];
  return new Map(
    scopedIds.map((id) => {
      const input = canonicalInputs.get(id);
      return [
        id,
        comparisonIdentity({
          input: documentIdentity(input),
          imports: importIdentities(
            importedDocuments(
              input,
              canonicalInputs,
              comparisonCatalogue.standIns,
              "recorded",
            ),
          ),
        }),
      ];
    }),
  );
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
  const policy = request.imports ?? "recorded";
  if (!["recorded", "mapped", "none"].includes(policy))
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
    ...julyComparisonFixtures,
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
    const oracle = input.suite === "july" ? pinnedSourceOracle() : null;
    const imports = importedDocuments(input, all, catalogue.standIns, policy);
    const admittedInputs = {
      input: documentIdentity(input),
      imports: importIdentities(imports),
    };
    const frozenInputs = recordedScenarioInputs.get(input.id);
    const exactRecordedInputs =
      policy === "recorded" &&
      frozenInputs !== undefined &&
      frozenInputs === comparisonIdentity(admittedInputs);
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
        let expectedDifferences;
        const normativeJuly =
          oracle &&
          exactRecordedInputs &&
          profile.behaviorProfileId === normativeProfile &&
          profile.parsingMode === "compatible";
        if (normativeJuly) {
          if (
            scenario === "direct-load" &&
            input.source.path === julyTimePath
          ) {
            expectedDifferences = julyTimeDifferenceScope(
              input.source,
              oracle.revision,
            );
          } else if (
            scenario === "closure-roundtrip" &&
            julyTimeClosureRoots.has(input.id)
          ) {
            const time = imports.find(
              ([, document]) => document.source.path === julyTimePath,
            )?.[1];
            if (!time)
              throw new Error(
                "The pinned July closure is missing its OWL-Time mapping",
              );
            expectedDifferences = {
              ...julyTimeDifferenceScope(time.source, oracle.revision),
              memberDocumentIRI: time.documentIRI,
            };
          }
        }
        // The exact round trip preserves the admitted axiom set. Keep the
        // unconfigured native writer result as a separate observation.
        const checkExactClosureWriter =
          scenario === "closure-roundtrip" &&
          ((normativeJuly && input.closure) ||
            (nativeClosureControls.has(input.id) &&
              exactRecordedInputs &&
              profile.behaviorProfileId === javaProfile &&
              profile.parsingMode === "compatible"));
        let expectedLoadRefusals;
        if (
          (scenario === "direct-load" || scenario === "closure-roundtrip") &&
          input.id === originalIdmp.id &&
          exactRecordedInputs &&
          request.javaXml !== "historical-idmp"
        ) {
          if (
            profile.behaviorProfileId === javaProfile &&
            profile.parsingMode === "compatible"
          ) {
            expectedLoadRefusals = stockIdmpRefusal;
          } else if (profile.behaviorProfileId === normativeProfile) {
            expectedLoadRefusals =
              profile.parsingMode === "strict"
                ? strictIdmpRefusal
                : compatibleIdmpNativeLimit;
          }
        }
        const definition = {
          schemaVersion: 1,
          scenario,
          scenarioVersion: 1,
          observationPoint:
            scenario === "strict-first"
              ? "public-strict-then-compatible-load"
              : scenario === "direct-load"
                ? "public-direct-load"
                : "merged-closure-roundtrip",
          ...(strictFirst ? { loadSequence: ["strict", "compatible"] } : {}),
          ...(oracle ? { oracle } : {}),
          ...admittedInputs,
          importPolicy: policy,
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
        };
      }),
    );
  });
}
