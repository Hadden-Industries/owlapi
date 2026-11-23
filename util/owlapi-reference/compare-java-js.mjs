import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  comparisonCatalogue,
  julyComparisonFixtures,
  julyComparisonManifest,
  resolveComparisonFixture,
  verifyPinnedFile,
} from "./comparison-fixtures.mjs";
import {
  comparisonIdentity,
  exactComparedDocuments,
  publishComparisonFile,
  publishComparisonJson,
  readCompletedComparisonFile,
  recordedNativeRdfXmlRoundTrip,
  sha256,
  strictRetryCategories,
} from "./comparison-evidence.mjs";
import {
  admitPinnedSourceClasspath,
  admitReleasedClasspath,
  comparisonJavaTools,
  compileComparisonOracle,
  executeComparisonProcess,
} from "./comparison-oracle.mjs";
import {
  loadPerformanceReport,
  measureComparisonWorker,
} from "./comparison-performance.mjs";
import {
  runBenchmarkComparison,
  runBenchmarkIoComparison,
} from "./comparison-benchmarks.mjs";
import {
  isReferenceCapture,
  runReferenceCapture,
} from "./comparison-reference-captures.mjs";
import {
  corpusQualificationRoster,
  corpusQualificationShards,
  installedDependencyGraphIdentity,
  reconcileCorpusReceipts,
} from "./comparison-release-evidence.mjs";
import { runWindowsComparisonJob } from "./comparison-job.mjs";
import { normalizeTransportCapture } from "./comparison-transport.mjs";
import {
  reconcileJulyTimeClosure,
  reconcileJulyTimeLoad,
} from "./comparison-july-differences.mjs";
import { runFormatPerformance } from "./comparison-format-performance.mjs";
import { runRdfXmlCorpusComparison } from "./comparison-rdfxml-corpus.mjs";
import { verifyWriterStages } from "./comparison-writer.mjs";
import { verifyProfileStages } from "./comparison-profile.mjs";
import { runCanonicalVowlProfileContract } from "./run-profile-contract.mjs";
import { runWriterConfigurationContract } from "./run-writer-configuration-contract.mjs";
import {
  assertSourceQualificationOutputDirectory,
  captureSourceIdentity,
  installCandidate,
  loadPublicApi,
  materializePinnedOntologySources,
} from "./qualify-universal-ontology.mjs";
import {
  comparisonCases,
  documentIdentity,
  javaProfile,
  literalScenarios,
  normativeProfile,
  selectsPublicBehavior,
  selectsVowl,
  selectsWriter,
} from "./comparison-cases.mjs";

export { comparisonCases };

const repository = fileURLToPath(new URL("../../", import.meta.url));
const comparisonInputs = [
  "./compare-java-js.mjs",
  "./comparison-cases.mjs",
  "./run-comparison-js.mjs",
  "./comparison-evidence.mjs",
  "./comparison-fixtures.mjs",
  "./comparison-fixtures.json",
  "./universal-ontology-july-2026.json",
  "./comparison-job.mjs",
  "./run-comparison-job.ps1",
  "./comparison-oracle.mjs",
  "./OntologyReferenceContract.java",
  "./OntologyStructuralComparison.java",
  "./RunOntologyComparisonCase.java",
  "./RunWithClasspath.java",
  "./comparison-performance.mjs",
  "./comparison-release-evidence.mjs",
  "./qualify-universal-ontology.mjs",
  "./run-import-closure-contract.mjs",
  "./comparison-writer.mjs",
  "./comparison-writer-fixtures.mjs",
  "./run-writer-configuration-contract.mjs",
  "./run-ontology-parsing-contract.mjs",
  "./RunOntologyParsingContract.java",
  "./RunWriterConfigurationContract.java",
  "./comparison-profile.mjs",
  "./run-profile-contract.mjs",
  "./RunOWL2DLProfile.java",
  "./comparison-configuration.mjs",
  "./comparison-mutation.mjs",
  "./comparison-load-publication.mjs",
  "./comparison-storage.mjs",
  "./OntologyStorageComparison.java",
  "./comparison-literal-construction.mjs",
  "./OntologyLiteralComparison.java",
  "./comparison-query.mjs",
  "./OntologyQueryComparison.java",
  "./comparison-parser-behavior.mjs",
  "./OntologyParserBehaviorComparison.java",
  "./comparison-profile-identity.mjs",
  "./comparison-locality.mjs",
  "./OntologyLocalityComparison.java",
  "./comparison-xml-provider.mjs",
  "./OntologyXmlProviderComparison.java",
  "./comparison-jsonld.mjs",
  "./OntologyJsonLdComparison.java",
  "./comparison-transport.mjs",
  "./OntologyTransportComparison.java",
  "./ObserveNetworkContracts.java",
  "./ObserveCompressionContracts.java",
  "./ObserveJsonLdTransport.java",
  "../../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
  "./comparison-july-differences.mjs",
  "./reconcile-structural-differences.mjs",
  "../../docs/compatibility/expected-differences.json",
  "./pinned-version.json",
  "./validate-released-oracle.mjs",
  "../../docs/compatibility/profiles/java-owlapi-5.5.1/java-dependencies.lock.json",
  "../../scripts/canonical-json.mjs",
  "../../scripts/java-toolchain.mjs",
  "../../.java-version",
  "../../package-lock.json",
  "../../test/consumers/browser/import-map/reference-import-map.json",
];

async function captureHarnessIdentity() {
  const files = [];
  for (const path of comparisonInputs) {
    files.push([path, sha256(await readFile(new URL(path, import.meta.url)))]);
  }
  return comparisonIdentity(files);
}
const jsWorker = fileURLToPath(
  new URL("./run-comparison-js.mjs", import.meta.url),
);
const processExecPath = process.execPath;
const normativeObservation = {
  configuration: "normativeCopy",
  mutation: "normativeMutation",
  loadPublication: "normativeLoadPublication",
  storage: "normativeStorage",
  literalConstruction: "normativeLiteralConstruction",
  queryBehavior: "normativeQueryBehavior",
  parserBehavior: "normativeParserBehavior",
  profileIdentity: "profileBindings",
  localityBehavior: "normativeLocalityBehavior",
  xmlProvider: "normativeXmlProvider",
  jsonLdFirstStructure: "normativeJsonLdFirstStructure",
  jsonLdContextProvider: "normativeJsonLdContextProvider",
  transport: "normativeTransport",
};
const referenceCheckout = (options) =>
  options.referenceCheckout ?? process.env.OWLAPI_REFERENCE_CHECKOUT;

async function admitCaseClasspath(entries, options, prepare = false) {
  const usesPinnedSource = Boolean(entries[0].definition.oracle);
  if (
    entries.some(
      ({ definition }) => Boolean(definition.oracle) !== usesPinnedSource,
    )
  ) {
    throw new Error("Select cases that use the same Java oracle in one run");
  }
  return usesPinnedSource
    ? admitPinnedSourceClasspath(referenceCheckout(options))
    : admitReleasedClasspath(options, prepare);
}

const matchesNativeVersion = (version, oracle) =>
  version === oracle.version ||
  (oracle.kind === "pinned-source" &&
    typeof version === "string" &&
    version.startsWith(oracle.version + "."));
const errorRecord = (error) => ({
  status: "failed",
  category: error.code ?? error.name,
  message: String(error.message),
});

async function resolvedDocuments(entry, environment, prepare) {
  const cache = new Map();
  const resolveDocument = async (fixture) => {
    if (!cache.has(fixture)) {
      cache.set(fixture, {
        ...documentIdentity(fixture),
        path: await resolveComparisonFixture(fixture, environment, prepare),
      });
    }
    return cache.get(fixture);
  };
  const document = await resolveDocument(entry.input);
  const imports = [];
  for (const [ontologyIRI, fixture] of entry.imports) {
    imports.push({ ontologyIRI, ...(await resolveDocument(fixture)) });
  }
  return { document, imports };
}

async function observeJs(request, directory, environment) {
  const requestPath = join(directory, "js-request.json");
  await publishComparisonJson(directory, "js-request.json", request);
  const resultPath = join(directory, "js-load.json");
  const process = await executeComparisonProcess(
    processExecPath,
    [jsWorker, requestPath, resultPath],
    {
      cwd: directory,
      timeout: environment.timeoutMs ?? 120_000,
    },
  );
  if (process.exitCode !== 0) {
    throw new Error(
      `JS worker failed (${process.exitCode}): ${process.stderr}`,
    );
  }
  return readCompletedComparisonFile({
    caseId: request.caseId,
    executionId: request.executionId,
    stage: "js-load",
    resultPath,
    stdout: process.stdout,
    maxResultBytes: environment.maxResultBytes ?? 128 * 1024 * 1024,
  });
}

function matchesExpectedLoadRefusals(definition, js, native) {
  const expected = definition.expectedLoadRefusals;
  const jsFailure = js.load;
  const javaFailure = native.javaLoad;
  const importMappings = Object.fromEntries(
    definition.imports.map(({ ontologyIRI, documentIRI }) => [
      ontologyIRI,
      documentIRI,
    ]),
  );
  return (
    jsFailure?.status === "failed" &&
    jsFailure.phase === "load" &&
    jsFailure.category === expected.js.category &&
    jsFailure.details?.resource === expected.js.resource &&
    jsFailure.details.limit === expected.js.limit &&
    jsFailure.details.observed > expected.js.limit &&
    javaFailure?.status === "failed" &&
    javaFailure.phase === "load" &&
    javaFailure.category === expected.java.category &&
    javaFailure.diagnosticCode === expected.java.diagnosticCode &&
    javaFailure.resource === expected.java.resource &&
    [
      "jdk.xml.entityExpansionLimit",
      "jdk.xml.totalEntitySizeLimit",
      "jdk.xml.maxGeneralEntitySizeLimit",
      "jdk.xml.maxParameterEntitySizeLimit",
    ].every((property) => native.xmlSettings?.[property] === null) &&
    native.xmlSettings?.["javax.xml.accessExternalDTD"] === "" &&
    native.xmlSettings?.["javax.xml.accessExternalSchema"] === "" &&
    native.structure?.status === "blocked" &&
    [
      js.functional,
      js.documentModels,
      js.merge,
      js.rdfXmlWrite,
      js.rdfXmlReload,
      native.javaModel,
      native.documentComparisons,
      native.merge,
      native.javaRdfXmlRoundTrip,
      native.javaDefaultRdfXmlRoundTrip,
      native.functionalReparse,
      native.jsRdfXmlRoundTrip,
      native.closurePropagation,
    ].every((stage) => stage === undefined) &&
    comparisonIdentity(native.importRequests ?? {}) ===
      comparisonIdentity(importMappings) &&
    js.importRequests?.length === 0
  );
}

function completedClosureStages(js, native) {
  return (
    js.merge?.status === "completed" &&
    native.merge?.status === "completed" &&
    js.rdfXmlWrite?.status === "completed" &&
    js.rdfXmlReload?.status === "completed" &&
    native.javaRdfXmlRoundTrip?.write?.status === "completed" &&
    native.javaRdfXmlRoundTrip?.reload?.status === "completed"
  );
}

function compareClosureStages(js, native, reconciledMember) {
  const javaRoundTrip = native.javaRdfXmlRoundTrip;
  const comparisons = native.documentComparisons ?? [];
  const verdicts = [
    javaRoundTrip?.comparison?.status,
    native.jsRdfXmlRoundTrip?.status,
    ...comparisons.map(({ documentIRI, comparison }) =>
      documentIRI === reconciledMember ? "match" : comparison.status,
    ),
  ];
  if (verdicts.includes("mismatch")) return "mismatch";
  const completed =
    completedClosureStages(js, native) &&
    exactComparedDocuments(js.documentModels, comparisons) &&
    verdicts.every((verdict) => verdict === "match");
  return completed ? "match" : "inconclusive";
}

function matchesStrictFirstAttempts(attempts) {
  if (!Array.isArray(attempts) || attempts[0]?.parsingMode !== "strict") {
    return false;
  }
  return attempts[0].status === "completed"
    ? attempts.length === 1
    : attempts.length === 2 &&
        attempts[0].status === "failed" &&
        strictRetryCategories.includes(attempts[0].category) &&
        attempts[1]?.parsingMode === "compatible" &&
        attempts[1].status === "completed";
}

async function caseVerdict(definition, measurements, js, native, performance) {
  const offline =
    js.networkRequests?.length === 0 &&
    (definition.transport
      ? js.networkBoundary === "owned-loopback" &&
        native.networkBoundary === "owned-loopback"
      : native.networkAttempts === 0);
  const matchedProfiles =
    js.effectiveSettings?.behaviorProfileId === definition.behaviorProfileId &&
    js.effectiveSettings?.parsingMode === definition.parsingMode &&
    js.effectiveSettings?.defaultBehaviorProfileId === normativeProfile;
  const behaviorField = Object.keys(normativeObservation).find(
    (field) => definition[field],
  );
  if (behaviorField) {
    const recipe = definition[behaviorField];
    const nativeRows = definition.transport
      ? typeof native.transportCapture === "string" &&
        sha256(native.transportCapture) === recipe.nativeCaptureSha256 &&
        normalizeTransportCapture(recipe.kind, native.transportCapture)
      : native[behaviorField];
    const expectedNormative = recipe.normative ?? recipe.normativeCopy;
    const observedNormative = js[normativeObservation[behaviorField]];
    const observedControls = js[`${behaviorField}Controls`];
    const matchedAdapter =
      !recipe.adapterControls ||
      (observedControls &&
        comparisonIdentity(observedControls) ===
          comparisonIdentity(recipe.adapterControls));
    const matchedExpected = Object.entries(recipe.expected ?? {}).every(
      ([key, value]) => js[behaviorField]?.[key] === value,
    );
    const matchesRecordedLiterals =
      behaviorField !== "literalConstruction" ||
      (Array.isArray(js.literalConstruction) &&
        comparisonIdentity(js.literalConstruction) === recipe.javaRowsSha256);
    const matchesRecordedRows =
      !recipe.javaRows ||
      (Array.isArray(js[behaviorField]) &&
        comparisonIdentity(js[behaviorField]) ===
          comparisonIdentity(recipe.javaRows));
    const recordedStorageBytes =
      behaviorField !== "storage" ||
      [js, native].every(
        ({ storageDocumentSha256 }) =>
          Array.isArray(storageDocumentSha256) &&
          storageDocumentSha256.length ===
            (recipe.kind === "target-reuse" ? 2 : 4) &&
          storageDocumentSha256.every((digest) =>
            /^[0-9a-f]{64}$/u.test(digest),
          ),
      );
    const matchedFailure =
      behaviorField !== "loadPublication" ||
      (native.loadPublicationFailure === recipe.javaFailure &&
        Array.isArray(js.loadPublicationFailures) &&
        comparisonIdentity(js.loadPublicationFailures) ===
          comparisonIdentity(recipe.jsFailures));
    const accepted =
      matchedProfiles &&
      offline &&
      js.load?.status === "completed" &&
      native.javaLoad?.status === "completed" &&
      matchedExpected &&
      matchedAdapter &&
      matchesRecordedLiterals &&
      matchesRecordedRows &&
      recordedStorageBytes &&
      js[behaviorField] &&
      nativeRows &&
      matchedFailure &&
      comparisonIdentity(js[behaviorField]) ===
        comparisonIdentity(nativeRows) &&
      (!expectedNormative ||
        (observedNormative &&
          comparisonIdentity(observedNormative) ===
            comparisonIdentity(expectedNormative)));
    return {
      measures: { behavior: accepted ? "observed" : "incomplete" },
      status: accepted ? "passed" : "failed",
      offline,
    };
  }
  if (definition.literal) {
    const { length, literalSha256 } = definition.literal;
    const normative = js.literal?.normative;
    const rendering = definition.scenario === "large-literal-rendering";
    const observedWork = rendering
      ? [js.literal, native.literal].every(
          (row) =>
            row?.lexicalLength === length &&
            row.renderedBytes === definition.literal.renderedBytes &&
            row.renderedSha256 === definition.literal.renderedSha256,
        ) &&
        normative?.phase === "normative-render" &&
        normative.details?.resource === "outputBytes" &&
        normative.details.limit === definition.literal.normativeOutputByteLimit
      : [js.literal, native.literal].every(
          (row) =>
            row?.documentBytes >= length &&
            /^[0-9a-f]{64}$/u.test(row.documentSha256) &&
            row.reloadedLength === length,
        ) &&
        normative?.phase === "normative-reload" &&
        normative.ontologyPresentBefore === false &&
        normative.ontologyPresentAfter === false;
    const accepted =
      matchedProfiles &&
      offline &&
      js.load?.status === "completed" &&
      native.javaLoad?.status === "completed" &&
      js.literal?.literalSha256 === literalSha256 &&
      native.literal?.literalSha256 === literalSha256 &&
      normative?.status === "failed" &&
      normative?.category === "RESOURCE_LIMIT_EXCEEDED" &&
      observedWork;
    return {
      measures: { behavior: accepted ? "observed" : "incomplete" },
      status: accepted ? "passed" : "failed",
      offline,
    };
  }
  const expectedLoad = definition.expectedLoadRefusals
    ? matchesExpectedLoadRefusals(definition, js, native)
    : js.load?.status === "completed" &&
      native.javaLoad?.status === "completed";
  const matchedDocument =
    js.effectiveSettings?.documentIRI === definition.input.documentIRI &&
    native.effectiveSettings?.documentIRI === definition.input.documentIRI &&
    js.effectiveSettings?.syntax === definition.input.syntax &&
    native.effectiveSettings?.syntax === definition.input.syntax &&
    (!definition.javaTurtle ||
      native.effectiveSettings?.format === "TurtleDocumentFormat");
  const matchedLoader = Object.entries(definition.jsLoaderOptions ?? {}).every(
    ([key, value]) => js.effectiveSettings?.[key] === value,
  );
  const matchedLoadSequence =
    definition.scenario !== "strict-first" ||
    matchesStrictFirstAttempts(js.loadAttempts);
  const completedRequestedStages =
    definition.scenario !== "closure-roundtrip" ||
    (definition.expectedLoadRefusals && expectedLoad) ||
    completedClosureStages(js, native);
  const matchedWriter =
    !definition.javaRdfXml ||
    (native.javaRdfXmlRoundTrip?.addMissingTypes ===
      definition.javaRdfXml.addMissingTypes &&
      native.javaDefaultRdfXmlRoundTrip?.addMissingTypes === true &&
      recordedNativeRdfXmlRoundTrip(native.javaDefaultRdfXmlRoundTrip));
  const behavior =
    matchedProfiles &&
    matchedDocument &&
    matchedLoader &&
    matchedLoadSequence &&
    completedRequestedStages &&
    matchedWriter &&
    expectedLoad &&
    offline
      ? "observed"
      : "incomplete";
  const reconciledRuleIds =
    behavior === "observed" && measurements.includes("structure")
      ? definition.expectedDifferences?.memberDocumentIRI
        ? await reconcileJulyTimeClosure(definition, js, native)
        : await reconcileJulyTimeLoad(definition, native)
      : null;
  const sourceStructure = reconciledRuleIds
    ? "reconciled"
    : definition.expectedDifferences && native.structure?.status === "match"
      ? "mismatch"
      : (native.structure?.status ?? "inconclusive");
  const inapplicable =
    behavior === "observed" &&
    definition.expectedLoadRefusals &&
    native.structure?.status === "blocked"
      ? { structure: definition.expectedLoadRefusals.dependentStageReason }
      : null;
  let structure = sourceStructure;
  if (inapplicable) structure = "not-applicable";
  else if (definition.scenario === "closure-roundtrip") {
    if (sourceStructure === "match")
      structure = compareClosureStages(js, native);
    if (sourceStructure === "reconciled") {
      const stages = compareClosureStages(
        js,
        native,
        definition.expectedDifferences.memberDocumentIRI,
      );
      structure = stages === "match" ? "reconciled" : stages;
    }
  }
  const accepted =
    behavior === "observed" &&
    (!measurements.includes("structure") ||
      structure === "match" ||
      structure === "reconciled" ||
      structure === "not-applicable");
  return {
    measures: Object.fromEntries(
      measurements.map((measurement) => [
        measurement,
        {
          structure,
          behavior,
          performance: performance?.comparison.status ?? "incomplete",
        }[measurement],
      ]),
    ),
    status:
      accepted &&
      (!performance || performance.comparison.status === "qualified")
        ? "passed"
        : performance?.comparison.status === "diagnostic-only" &&
            (measurements.length === 1 ||
              (definition.scenario === "strict-first" && accepted))
          ? "diagnostic-only"
          : structure === "mismatch"
            ? "failed"
            : "incomplete",
    offline,
    ...(inapplicable ? { inapplicable } : {}),
    ...(reconciledRuleIds ? { reconciledRuleIds } : {}),
  };
}

function equivalentLoadClosure(js, native) {
  const jsLoad = js.load;
  const javaLoad = native.javaLoad?.ontology;
  if (!jsLoad?.imports?.length && !javaLoad?.imports?.length) {
    return jsLoad?.closure?.length === 1 && javaLoad?.closure?.length === 1;
  }
  const comparisons = native.documentComparisons;
  return (
    exactComparedDocuments(js.documentModels, comparisons) &&
    jsLoad?.closure?.length === comparisons.length &&
    javaLoad?.closure?.length === comparisons.length &&
    comparisons.length > 1 &&
    comparisons.every(
      ({ comparison, unparsedRdf }) =>
        comparison.status === "match" && unparsedRdf?.length === 0,
    )
  );
}

function summarizeLoadPerformance(
  definition,
  js,
  native,
  samples,
  protocol,
  identity,
) {
  const nativeLoad = native.javaLoad?.ontology;
  const sameOperation =
    definition.scenario === "direct-load" &&
    definition.behaviorProfileId === javaProfile &&
    definition.parsingMode === "compatible" &&
    native.structure?.status === "match" &&
    native.networkAttempts === 0 &&
    nativeLoad?.unparsedRdf?.length === 0 &&
    js.networkRequests?.length === 0 &&
    equivalentLoadClosure(js, native);
  return loadPerformanceReport({
    samples,
    sameOperation,
    protocol,
    identity,
    expectedCounts: { js: js.load?.axioms, java: nativeLoad?.counts?.axioms },
  });
}

async function observeLoadPerformance({
  definition,
  directory,
  environment,
  java,
  jsRequest,
  nativeRequest,
  js,
  native,
}) {
  const { caseId, executionId } = jsRequest;
  const protocol = environment.performanceProtocol;
  const sample = async (engine, mode, index) => {
    const name = `${engine}-${mode}-${index}`;
    const performance = { ...protocol, mode, sampleId: name };
    try {
      let worker;
      if (engine === "js") {
        const path = join(directory, name + "-request.json");
        await publishComparisonJson(directory, name + "-request.json", {
          ...jsRequest,
          performance,
        });
        worker = {
          file: processExecPath,
          args: [jsWorker, path, join(directory, name + "-unused.json")],
          options: { cwd: directory },
        };
      } else {
        worker = await java.performanceWorker(
          { ...nativeRequest, performance },
          directory,
          name,
        );
      }
      return await measureComparisonWorker(
        worker,
        { caseId, executionId, sampleId: name },
        mode,
        environment.timeoutMs ?? 120_000,
      );
    } catch (error) {
      return errorRecord(error);
    }
  };
  const samples = {};
  for (const engine of ["js", "java"]) {
    const cold = [];
    for (let index = 0; index < protocol.coldSamples; index++) {
      cold.push(await sample(engine, "cold", index));
    }
    samples[engine] = { cold, warm: await sample(engine, "warm", 0) };
  }
  return {
    ...summarizeLoadPerformance(definition, js, native, samples, protocol, {
      caseId,
      executionId,
    }),
    ...(jsRequest.scenario === "strict-first"
      ? {
          boundary: "strict-then-compatible-load",
          nativeBoundary: "loadOntologyFromOntologyDocument",
        }
      : {}),
    caseId,
    executionId,
    protocol,
  };
}

async function observeCase(
  entry,
  environment,
  directory,
  java,
  measurements,
  executionId,
) {
  const { caseId, definition } = entry;
  const compareLoadedDocuments =
    measurements.includes("performance") &&
    definition.scenario === "direct-load";
  const compareStructure =
    definition.scenario === "closure-roundtrip" ||
    measurements.includes("structure") ||
    measurements.includes("performance");
  if (
    measurements.includes("performance") &&
    !["direct-load", "strict-first"].includes(definition.scenario)
  ) {
    throw new Error(
      "Load performance requires a direct-load or strict-first scenario",
    );
  }
  const operation = [...Object.keys(normativeObservation), "literal"].find(
    (field) => definition[field],
  );
  const input = operation
    ? { [operation]: definition[operation] }
    : await resolvedDocuments(entry, environment, false);
  const jsRequest = {
    caseId,
    executionId,
    ...input,
    input: entry.input.id,
    compareStructure,
    ...(compareLoadedDocuments ? { compareLoadedDocuments } : {}),
    scenario: definition.scenario,
    packageDirectory: environment.packageDirectory,
    consumerDirectory: environment.consumerDirectory ?? null,
    behaviorProfileId: definition.behaviorProfileId,
    ...(definition.parsingMode ? { parsingMode: definition.parsingMode } : {}),
    ...(definition.jsLoaderOptions
      ? { loaderOptions: definition.jsLoaderOptions }
      : {}),
  };
  let js;
  let jsEvidence;
  try {
    const observed = await observeJs(jsRequest, directory, environment);
    js = observed.result;
    jsEvidence = {
      name: "js-load.json",
      sha256: sha256(observed.bytes),
      byteLength: observed.bytes.length,
    };
    if (
      js.effectiveSettings?.behaviorProfileId !==
        definition.behaviorProfileId ||
      js.effectiveSettings?.defaultBehaviorProfileId !== normativeProfile
    ) {
      throw new Error(
        "JS worker returned the wrong effective behavior profile",
      );
    }
  } catch (error) {
    js = { load: errorRecord(error) };
  }
  let native;
  let nativeEvidence;
  const nativeRequest = {
    schemaVersion: 1,
    caseId,
    executionId,
    oracleVersion: java.identity.version,
    ...(java.identity.kind === "pinned-source"
      ? { oracleVersionLine: true }
      : {}),
    ...input,
    scenario: definition.scenario,
    compareStructure,
    ...(compareLoadedDocuments ? { compareLoadedDocuments } : {}),
    ...(definition.expectedDifferences?.memberDocumentIRI
      ? { propagateClosure: true }
      : {}),
    ...(definition.javaXml ? { javaXml: definition.javaXml } : {}),
    ...(definition.javaTurtle ? { javaTurtle: definition.javaTurtle } : {}),
    ...(definition.javaRdfXml ? { javaRdfXml: definition.javaRdfXml } : {}),
  };
  try {
    const model = js.functional?.artifact;
    const functionalPath =
      model?.name === "js-model.ofn" ? join(directory, "js-model.ofn") : null;
    if (
      functionalPath &&
      !(await verifyPinnedFile(functionalPath, { id: "js-model", ...model }))
    ) {
      throw new Error("Completed Functional output is missing");
    }
    const checkedModel = async (row, name) => {
      if (row?.artifact?.name !== name) return null;
      const path = join(directory, name);
      if (!(await verifyPinnedFile(path, { id: name, ...row.artifact }))) {
        throw new Error(`Missing completed model: ${name}`);
      }
      return path;
    };
    const jsReloadPath = await checkedModel(
      js.rdfXmlReload?.functional,
      "js-rdfxml-reloaded.ofn",
    );
    const sourceModels = [];
    for (const [index, document] of (js.documentModels ?? []).entries()) {
      const path = await checkedModel(document, `js-direct-${index}.ofn`);
      if (path) sourceModels.push({ path, documentIRI: document.documentIRI });
    }
    const observed = await java.run(
      {
        ...nativeRequest,
        functionalPath,
        jsReloadPath,
        sourceModels,
      },
      directory,
    );
    native = observed.result;
    nativeEvidence = await publishComparisonFile(
      directory,
      "native-result.json",
      observed.bytes,
    );
    await rm(join(directory, "native-result.pending"));
    if (observed.stderr)
      await publishComparisonFile(
        directory,
        "native-stderr.log",
        observed.stderr,
      );
  } catch (error) {
    native = {
      structure: { status: "inconclusive" },
      javaLoad: errorRecord(error),
    };
  }
  let performance;
  let performanceEvidence;
  if (measurements.includes("performance")) {
    performance = await observeLoadPerformance({
      definition,
      directory,
      environment,
      java,
      jsRequest,
      nativeRequest,
      js,
      native,
    });
    performanceEvidence = await publishComparisonJson(
      directory,
      "performance.json",
      performance,
    );
  }
  const documents = [input.document, ...(input.imports ?? [])].filter(Boolean);
  const verifiedPaths = new Set();
  for (const document of documents) {
    if (!verifiedPaths.has(document.path)) {
      if (!(await verifyPinnedFile(document.path, document))) {
        throw new Error(`Comparison input disappeared: ${document.id}`);
      }
      verifiedPaths.add(document.path);
    }
  }
  return {
    caseId,
    ...(await caseVerdict(definition, measurements, js, native, performance)),
    ...(performanceEvidence ? { performance: performanceEvidence } : {}),
    js: {
      load: js.load.status,
      evidence: jsEvidence ?? null,
      ...(js.load.status === "failed" ? { failure: js.load } : {}),
    },
    java: {
      load: native.javaLoad?.status ?? "unknown",
      evidence: nativeEvidence ?? null,
      ...(native.javaLoad?.status === "failed"
        ? { failure: native.javaLoad }
        : {}),
    },
  };
}

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

/** Bind installed qualification to the original tarball and actual module bytes. */
async function captureInstalledIdentity(candidateDirectory, consumerDirectory) {
  const candidate = await readJson(
    join(candidateDirectory, "candidate-manifest.json"),
  );
  const basename = candidate.tarball.fileName;
  if (!/^[A-Za-z0-9_.-]+\.tgz$/u.test(basename))
    throw new Error("Invalid candidate tarball name");
  const tarballPath = resolve(candidateDirectory, basename);
  const tarball = await readFile(tarballPath);
  const tarballSha256 = sha256(tarball);
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  if (tarballSha256 !== candidate.tarball.sha256)
    throw new Error("Candidate tarball digest mismatch");
  const dependencyLock = await readFile(
    join(consumerDirectory, "package-lock.json"),
  );
  if (candidate.tarball.integrity && candidate.tarball.integrity !== integrity)
    throw new Error(
      "Installed consumer integrity differs from the candidate tarball",
    );
  const dependencyGraphSha256 = installedDependencyGraphIdentity(
    JSON.parse(dependencyLock),
    {
      consumerDirectory,
      tarballPath,
      tarballSha256,
      integrity,
    },
  );
  const files = [];
  async function visit(relative) {
    for (const entry of await readdir(join(consumerDirectory, relative), {
      withFileTypes: true,
    })) {
      if (entry.name === ".bin" && entry.isDirectory()) continue;
      // npm's private install cache repeats the host-relative candidate alias.
      if (
        relative === "node_modules" &&
        entry.name === ".package-lock.json" &&
        entry.isFile()
      )
        continue;
      const child = relative + "/" + entry.name;
      if (entry.isDirectory()) await visit(child);
      else {
        if (!entry.isFile())
          throw new Error(`Unexpected installed dependency entry: ${child}`);
        files.push([
          child,
          sha256(await readFile(join(consumerDirectory, child))),
        ]);
      }
    }
  }
  await visit("node_modules");
  files.sort(([left], [right]) => (left < right ? -1 : left === right ? 0 : 1));
  return {
    mode: "INSTALLED_CANDIDATE",
    candidate,
    tarballSha256,
    integrity,
    dependencyGraphSha256,
    importMapSha256: sha256(
      await readFile(
        new URL(
          "../../test/consumers/browser/import-map/reference-import-map.json",
          import.meta.url,
        ),
      ),
    ),
    contentSha256: comparisonIdentity(files),
  };
}

async function readEvidence(directory, pin, name, caseId, executionId) {
  if (
    pin?.name !== name ||
    !Number.isSafeInteger(pin.byteLength) ||
    pin.byteLength < 1 ||
    pin.byteLength > 128 * 1024 * 1024 ||
    !/^[0-9a-f]{64}$/u.test(pin.sha256)
  ) {
    throw new Error(`Missing verification evidence: ${name}`);
  }
  const path = join(directory, name);
  if (!(await verifyPinnedFile(path, { id: name, ...pin }))) {
    throw new Error(`Missing comparison file: ${name}`);
  }
  const bytes = await readFile(path);
  if (bytes.length !== pin.byteLength || sha256(bytes) !== pin.sha256) {
    throw new Error(`Comparison receipt changed while reading: ${name}`);
  }
  const value = JSON.parse(bytes.toString("utf8"));
  if (
    value.caseId !== caseId ||
    value.executionId !== executionId ||
    value.schemaVersion !== 1
  ) {
    throw new Error(
      `Comparison file belongs to a different case or execution: ${name}`,
    );
  }
  return value;
}

async function verifyWorkerArtifacts(directory, js, native) {
  const outputs = [
    js.functional,
    ...(js.documentModels ?? []),
    js.rdfXmlWrite,
    js.rdfXmlReload?.functional,
    native.javaModel,
    native.javaRdfXmlRoundTrip?.write,
    native.javaDefaultRdfXmlRoundTrip?.write,
    native.loadPublicationFixture,
  ];
  for (const output of outputs) {
    if (!output || (output.status !== "completed" && !output.prefix)) continue;
    const pin = output.artifact ?? output.prefix;
    if (
      !pin ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(pin.name) ||
      !Number.isSafeInteger(pin.byteLength) ||
      pin.byteLength < 0 ||
      !/^[0-9a-f]{64}$/u.test(pin.sha256) ||
      !(await verifyPinnedFile(join(directory, pin.name), {
        id: pin.name,
        ...pin,
      }))
    ) {
      throw new Error(
        "A registered worker artifact is missing or unverifiable",
      );
    }
  }
}

/** Verify original artifacts against the requested roster and trusted subject. */
async function verifyComparison(entries, measurements, options) {
  const directory = options.outputDirectory;
  const attempt = await readJson(join(directory, "attempt.json"));
  const report = await readJson(join(directory, "report.json"));
  const expectedCandidate = options.candidateDirectory
    ? await captureInstalledIdentity(
        options.candidateDirectory,
        join(directory, "consumer"),
      )
    : (options.candidateIdentity ??
      (await captureSourceIdentity(options.packageDirectory)));
  const {
    candidate,
    oracle,
    node,
    protocols,
    executionId,
    attemptId,
    harnessSha256,
  } = attempt;
  const expectedIds = entries.map(({ caseId }) => caseId);
  const { identity: expectedOracle } = await admitCaseClasspath(
    entries,
    options,
  );
  const recordedOracle = Object.fromEntries(
    Object.keys(expectedOracle).map((key) => [key, oracle?.[key] ?? null]),
  );
  if (
    attempt.schemaVersion !== 2 ||
    report.schemaVersion !== 2 ||
    report.action !== "run" ||
    executionId !== report.executionId ||
    executionId !==
      comparisonIdentity({
        candidate,
        oracle,
        node,
        protocols,
        attemptId,
        harnessSha256,
        measurements,
      }) ||
    harnessSha256 !== (await captureHarnessIdentity()) ||
    comparisonIdentity(recordedOracle) !== comparisonIdentity(expectedOracle) ||
    comparisonIdentity(candidate) !== comparisonIdentity(expectedCandidate) ||
    comparisonIdentity(attempt.measurements) !==
      comparisonIdentity(measurements) ||
    comparisonIdentity(protocols.performance ?? null) !==
      comparisonIdentity(
        measurements.includes("performance")
          ? options.performanceProtocol
          : null,
      ) ||
    comparisonIdentity(attempt.required) !== comparisonIdentity(expectedIds) ||
    !Array.isArray(report.cases) ||
    report.cases.length !== entries.length
  ) {
    throw new Error(
      "Comparison report has the wrong subject, protocol or required case roster",
    );
  }
  const byId = new Map(
    report.cases.map((receipt) => [receipt.caseId, receipt]),
  );
  if (byId.size !== entries.length)
    throw new Error("Duplicate comparison receipt");
  const cases = [];
  for (const { caseId, definition, input } of entries) {
    try {
      const row = byId.get(caseId);
      if (!row || row.input !== input.id)
        throw new Error("Required case is absent");
      const caseDirectory = join(directory, caseId);
      const original = await readJson(join(caseDirectory, "case.json"));
      if (
        comparisonIdentity(original) !==
        comparisonIdentity({ caseId, ...definition })
      ) {
        throw new Error("Comparison case configuration changed");
      }
      const receipt = await readEvidence(
        caseDirectory,
        row.receipt,
        "result.json",
        caseId,
        executionId,
      );
      const js = await readEvidence(
        caseDirectory,
        receipt.js?.evidence,
        "js-load.json",
        caseId,
        executionId,
      );
      const native = await readEvidence(
        caseDirectory,
        receipt.java?.evidence,
        "native-result.json",
        caseId,
        executionId,
      );
      await verifyWorkerArtifacts(caseDirectory, js, native);
      const performance = measurements.includes("performance")
        ? await readEvidence(
            caseDirectory,
            receipt.performance,
            "performance.json",
            caseId,
            executionId,
          )
        : null;
      if (performance) {
        const rebuilt = summarizeLoadPerformance(
          definition,
          js,
          native,
          performance.samples,
          options.performanceProtocol,
          { caseId, executionId },
        );
        if (
          comparisonIdentity(performance.protocol) !==
            comparisonIdentity(options.performanceProtocol) ||
          comparisonIdentity(performance.summary) !==
            comparisonIdentity(rebuilt.summary) ||
          comparisonIdentity(performance.comparison) !==
            comparisonIdentity(rebuilt.comparison)
        ) {
          throw new Error(
            "Performance comparison disagrees with the requested protocol and retained samples",
          );
        }
      }
      const verdict = await caseVerdict(
        definition,
        measurements,
        js,
        native,
        performance,
      );
      const published = {
        status: receipt.status,
        offline: receipt.offline,
        measures: receipt.measures,
        ...(receipt.inapplicable ? { inapplicable: receipt.inapplicable } : {}),
        ...(receipt.reconciledRuleIds
          ? { reconciledRuleIds: receipt.reconciledRuleIds }
          : {}),
      };
      if (
        receipt.executionId !== executionId ||
        !matchesNativeVersion(native.oracleVersion, oracle) ||
        comparisonIdentity(verdict) !== comparisonIdentity(published)
      ) {
        throw new Error("Comparison receipt disagrees with worker evidence");
      }
      cases.push({ input: input.id, caseId, ...verdict });
    } catch (error) {
      cases.push({ input: input.id, caseId, ...errorRecord(error) });
    }
  }
  return { schemaVersion: 2, action: "verify", executionId, cases };
}

/** Preserve the historical oracle and authenticate the selected package independently. */
async function executePinnedSourceComparison(request, options, entries) {
  const { action } = request;
  const scenario = entries[0].definition.scenario;
  const isProfile = scenario === "canonical-vowl-dl";
  const available = entries[0].definition.measurements ?? [
    "behavior",
    "structure",
  ];
  const directory = options.outputDirectory;
  const workerDirectory = join(directory, "pinned-source-observations");
  const measurements = [...new Set(request.measurements ?? available)].sort();
  if (
    !["run", "verify"].includes(action) ||
    !measurements.length ||
    measurements.some((value) => !available.includes(value))
  ) {
    throw new Error(
      "Select supported measurements for the pinned-source suite",
    );
  }
  const sourceCheckoutPath = referenceCheckout(options);
  const observeReference = async () =>
    (await admitPinnedSourceClasspath(sourceCheckoutPath)).identity;
  const reference = await observeReference();
  const { jdk, selection, executeProcess } = comparisonJavaTools(
    options,
    directory,
  );
  let { consumerDirectory, packageDirectory } = options;
  if (action === "run") {
    await mkdir(directory);
    if (options.candidateDirectory) {
      ({ consumerDirectory, packageDirectory } = await installCandidate(
        options.candidateDirectory,
        directory,
      ));
    }
  } else if (options.candidateDirectory) {
    consumerDirectory = join(directory, "consumer");
  }
  const observeCandidate = () =>
    options.candidateDirectory
      ? captureInstalledIdentity(options.candidateDirectory, consumerDirectory)
      : captureSourceIdentity(packageDirectory);
  const candidate = await observeCandidate();
  const harnessSha256 = await captureHarnessIdentity();
  const input = {
    schemaVersion: 1,
    scenario,
    candidate,
    harnessSha256,
    reference,
    jdk: jdk.identity,
    node: process.version,
    required: entries.map(({ caseId }) => caseId),
    measurements,
  };
  const executionId = comparisonIdentity(input);
  if (action === "run") {
    await publishComparisonJson(directory, "pinned-source-attempt.json", input);
    if (isProfile) {
      await mkdir(workerDirectory);
      const publicApi = await loadPublicApi({
        packageDirectory,
        consumerDirectory,
        includeProfiles: true,
      });
      const observation = await runCanonicalVowlProfileContract({
        javaRoot: sourceCheckoutPath,
        java: jdk.javaPath,
        javac: jdk.javacPath,
        javaSelection: selection,
        publicApi,
      });
      await publishComparisonJson(workerDirectory, "report.json", observation);
    } else {
      await runWriterConfigurationContract({
        outputDirectory: workerDirectory,
        sourceCheckoutPath,
        executeProcess,
        packageDirectory,
        consumerDirectory,
      });
    }
    if (
      comparisonIdentity(await observeCandidate()) !==
        comparisonIdentity(candidate) ||
      (await captureHarnessIdentity()) !== harnessSha256 ||
      comparisonIdentity(await observeReference()) !==
        comparisonIdentity(reference)
    ) {
      throw new Error(
        "Candidate or pinned source reference changed during execution",
      );
    }
  } else if (
    comparisonIdentity(
      await readJson(join(directory, "pinned-source-attempt.json")),
    ) !== executionId
  ) {
    throw new Error(
      "Pinned source attempt does not match the selected subject and cases",
    );
  }
  const evidence = isProfile
    ? await verifyProfileStages(workerDirectory, entries)
    : await verifyWriterStages(workerDirectory, entries, measurements);
  const report = { schemaVersion: 2, action: "run", executionId, ...evidence };
  if (action === "run") {
    await publishComparisonJson(directory, "report.json", report);
  } else if (
    comparisonIdentity(await readJson(join(directory, "report.json"))) !==
    comparisonIdentity(report)
  ) {
    throw new Error(
      "Pinned source report disagrees with the original observations",
    );
  }
  return { ...report, action };
}

async function executeComparison(request, environment = {}) {
  if (request.shard && request.suite !== "release-semantics") {
    throw new Error("A shard selection requires the release-semantics suite");
  }
  if (
    request.suite === "format-performance" ||
    request.scenario === "format-performance"
  ) {
    if (
      request.action !== "list" &&
      isAbsolute(environment.outputDirectory ?? "")
    ) {
      assertSourceQualificationOutputDirectory(
        repository,
        environment.outputDirectory,
      );
    }
    return runFormatPerformance(request, environment, repository);
  }
  if (
    request.suite === "rdfxml-corpus" ||
    request.scenario === "rdfxml-corpus"
  ) {
    if (
      request.action !== "list" &&
      isAbsolute(environment.outputDirectory ?? "")
    ) {
      assertSourceQualificationOutputDirectory(
        repository,
        environment.outputDirectory,
      );
    }
    return runRdfXmlCorpusComparison(request, environment, repository);
  }
  if (request.suite === "io-admission" || request.scenario === "io-admission") {
    if (
      request.action !== "list" &&
      isAbsolute(environment.outputDirectory ?? "")
    ) {
      assertSourceQualificationOutputDirectory(
        repository,
        environment.outputDirectory,
      );
    }
    return runBenchmarkIoComparison(request, environment);
  }
  if (request.suite === "release-semantics") {
    if (
      request.input ||
      request.profile ||
      request.parsingMode ||
      request.scenario ||
      request.measurements ||
      request.imports ||
      request.javaXml ||
      request.javaTurtle ||
      request.format
    ) {
      throw new Error(
        "The release corpus owns its complete case and measurement selection",
      );
    }
    if (request.action === "list" && !request.shard) {
      const roster = corpusQualificationRoster(comparisonCases);
      const { cells, ...metadata } = roster;
      return {
        ...metadata,
        rosterSha256: comparisonIdentity(roster),
        cases: cells,
        shards: corpusQualificationShards(comparisonCases, roster),
      };
    }
    if (request.shard) {
      if (
        !["prepare", "run", "verify"].includes(request.action) ||
        (request.action !== "prepare" && !environment.candidateDirectory) ||
        environment.corpusReceipts ||
        environment.corpusArtifacts
      ) {
        throw new Error(
          "Shadow shards require their own run and an installed candidate",
        );
      }
      const roster = corpusQualificationRoster(comparisonCases);
      const shard = corpusQualificationShards(comparisonCases, roster).find(
        ({ shardId }) => shardId === request.shard,
      );
      if (!shard || shard.platform !== process.platform)
        throw new Error(
          "The required corpus shard does not belong to this runner",
        );
      const { action } = request;
      const historical = ["rdfxml-writer", "canonical-vowl-dl"].includes(
        shard.selection.suite,
      );
      const selected = {
        action,
        ...shard.selection,
        plannedCases: shard.caseIds,
      };
      const options = { ...environment, catalogue: comparisonCatalogue };
      if (action === "prepare" && historical) {
        const oracle = await admitPinnedSourceClasspath(
          referenceCheckout(options),
        );
        return { schemaVersion: 1, action, shard, oracle: oracle.identity };
      }
      const result = await executeComparison(selected, options);
      if (action !== "verify") return { ...result, shard };
      const directory = options.outputDirectory;
      const reportBytes = await readFile(join(directory, "report.json"));
      const report = JSON.parse(reportBytes);
      const attempt = await readJson(
        join(
          directory,
          historical ? "pinned-source-attempt.json" : "attempt.json",
        ),
      );
      if (
        attempt.candidate?.mode !== "INSTALLED_CANDIDATE" ||
        report.executionId !== result.executionId
      )
        throw new Error(
          "Shadow verification requires the original installed shard",
        );
      return {
        ...result,
        shard,
        rosterSha256: comparisonIdentity(roster),
        reportSha256: sha256(reportBytes),
        candidate: attempt.candidate,
        oracle: historical ? attempt.reference : attempt.oracle,
      };
    }
    if (
      request.action === "verify" &&
      isAbsolute(environment.corpusArtifacts ?? "") &&
      !environment.corpusReceipts
    ) {
      const { readHostedCorpus } =
        await import("../../scripts/release-corpus-artifacts.mjs");
      return readHostedCorpus(await readJson(environment.corpusArtifacts));
    }
    if (
      request.action !== "verify" ||
      environment.corpusArtifacts ||
      !isAbsolute(environment.corpusReceipts ?? "")
    ) {
      throw new Error(
        "Select the trusted corpus receipt input for shadow verification",
      );
    }
    return reconcileCorpusReceipts(
      await readJson(environment.corpusReceipts),
      comparisonCases,
    );
  }
  if (isReferenceCapture(request.suite)) {
    if (
      request.action !== "list" &&
      isAbsolute(environment.outputDirectory ?? "")
    ) {
      assertSourceQualificationOutputDirectory(
        repository,
        environment.outputDirectory,
      );
    }
    return runReferenceCapture(request, environment);
  }
  if (
    request.suite === "api-benchmarks" ||
    request.scenario === "api-benchmarks"
  ) {
    if (
      request.action !== "list" &&
      isAbsolute(environment.outputDirectory ?? "")
    ) {
      assertSourceQualificationOutputDirectory(
        repository,
        environment.outputDirectory,
      );
    }
    return runBenchmarkComparison(request, environment);
  }
  const available = comparisonCases(request, environment.catalogue);
  const planned = request.plannedCases ? new Set(request.plannedCases) : null;
  const entries = planned
    ? available.filter(({ caseId }) => planned.has(caseId))
    : available;
  if (planned && (entries.length === 0 || entries.length !== planned.size))
    throw new Error(
      "The frozen corpus shard differs from the selected case registry",
    );
  if (request.action === "list") {
    return {
      schemaVersion: 1,
      cases: entries.map(({ caseId, definition }) => ({
        caseId,
        ...definition,
      })),
    };
  }
  const options = {
    ...environment,
    packageDirectory: environment.packageDirectory ?? repository,
  };
  if (!isAbsolute(options.outputDirectory ?? ""))
    throw new Error("Comparison requires an absolute output directory");
  assertSourceQualificationOutputDirectory(repository, options.outputDirectory);
  if (options.candidateDirectory && !isAbsolute(options.candidateDirectory)) {
    throw new Error("An absolute retained candidate directory is required");
  }
  if (selectsWriter(request) || selectsVowl(request))
    return executePinnedSourceComparison(request, options, entries);
  if (!["prepare", "run", "verify"].includes(request.action))
    throw new Error(`Unknown comparison action ${request.action}`);
  const isLiteral = literalScenarios.includes(request.scenario);
  const behaviorOnly = isLiteral || selectsPublicBehavior(request);
  // The released Turtle parser grows its literal buffer incrementally. Give
  // this explicitly selected stress case the same wall-time as the old probe.
  if (
    request.scenario === "large-literal-roundtrip" &&
    options.timeoutMs === undefined
  ) {
    options.timeoutMs = 600_000;
  }
  if (request.scenario === "strict-first" && options.timeoutMs === undefined) {
    // Both attempts share one worker and need the ordinary load allowance.
    options.timeoutMs = 240_000;
  }
  const measurements = [
    ...new Set(
      request.measurements ??
        (behaviorOnly ? ["behavior"] : ["structure", "behavior"]),
    ),
  ].sort();
  if (
    !measurements.length ||
    measurements.some(
      (measurement) =>
        !["structure", "behavior", "performance"].includes(measurement),
    )
  ) {
    throw new Error("Unknown comparison measurement");
  }
  if (
    behaviorOnly &&
    (measurements.length !== 1 || measurements[0] !== "behavior")
  ) {
    throw new Error("The selected scenarios supply only behavior evidence");
  }
  options.performanceProtocol = {
    coldSamples: 3,
    warmups: 2,
    repetitions: 5,
    ...environment.performanceProtocol,
  };
  const { coldSamples, warmups, repetitions } = options.performanceProtocol;
  if (
    ![coldSamples, warmups, repetitions].every(Number.isSafeInteger) ||
    coldSamples < 1 ||
    warmups < 0 ||
    repetitions < 1
  ) {
    throw new Error("Invalid comparison measurement sampling counts");
  }
  if (request.action === "verify")
    return verifyComparison(entries, measurements, options);
  await mkdir(options.outputDirectory);
  const cases = [];
  if (request.action === "prepare") {
    if (
      options.ontologyRepository &&
      entries.some(({ input }) => input.suite === "july")
    ) {
      const sources = await materializePinnedOntologySources(
        options.ontologyRepository,
        join(options.outputDirectory, "git-originals"),
        julyComparisonManifest,
      );
      const byPath = new Map(
        sources.catalogMappings.map(({ path, documentPath }) => [
          path,
          documentPath,
        ]),
      );
      options.localSeeds = new Map(options.localSeeds);
      for (const fixture of julyComparisonFixtures) {
        options.localSeeds.set(fixture.id, byPath.get(fixture.source.path));
      }
    }
    for (const entry of entries) {
      try {
        if (!behaviorOnly) await resolvedDocuments(entry, options, true);
        cases.push({
          caseId: entry.caseId,
          input: entry.input.id,
          status: "prepared",
        });
      } catch (error) {
        cases.push({
          caseId: entry.caseId,
          input: entry.input.id,
          ...errorRecord(error),
        });
      }
    }
    const classpath = await admitCaseClasspath(entries, options, true);
    const result = {
      schemaVersion: 1,
      action: "prepare",
      oracle: classpath.identity,
      cases,
    };
    await publishComparisonJson(
      options.outputDirectory,
      "preparation.json",
      result,
    );
    return result;
  }
  if (options.candidateDirectory) {
    const installed = await installCandidate(
      options.candidateDirectory,
      options.outputDirectory,
    );
    options.packageDirectory = installed.packageDirectory;
    options.consumerDirectory = installed.consumerDirectory;
  }
  const candidate = options.candidateDirectory
    ? await captureInstalledIdentity(
        options.candidateDirectory,
        options.consumerDirectory,
      )
    : await captureSourceIdentity(options.packageDirectory);
  if (!candidate)
    throw new Error("An installed candidate identity is required");
  const classpath = await admitCaseClasspath(entries, options);
  const java = await compileComparisonOracle(
    options,
    options.outputDirectory,
    classpath,
  );
  const harnessSha256 = await captureHarnessIdentity();
  const inputs = {
    attemptId: randomUUID(),
    harnessSha256,
    measurements,
    candidate,
    oracle: java.identity,
    node: process.version,
    protocols: {
      comparison: 1,
      case: 1,
      worker: 3,
      ...(measurements.includes("performance")
        ? { performance: options.performanceProtocol }
        : {}),
      ...(options.memoryBudgetMiB
        ? {
            windowsJobMemoryMiB: options.memoryBudgetMiB,
            nodeHeapMiB: options.nodeHeapMiB,
          }
        : {}),
      ...(options.javaHeapMiB ? { javaHeapMiB: options.javaHeapMiB } : {}),
    },
  };
  const executionId = comparisonIdentity(inputs);
  await publishComparisonJson(options.outputDirectory, "attempt.json", {
    schemaVersion: 2,
    executionId,
    ...inputs,
    required: entries.map(({ caseId }) => caseId),
  });
  for (const entry of entries) {
    const directory = join(options.outputDirectory, entry.caseId);
    await mkdir(directory);
    await publishComparisonJson(directory, "case.json", {
      caseId: entry.caseId,
      ...entry.definition,
    });
    let result;
    try {
      result = await observeCase(
        entry,
        options,
        directory,
        java,
        measurements,
        executionId,
      );
    } catch (error) {
      result = { caseId: entry.caseId, ...errorRecord(error) };
    }
    const receipt = await publishComparisonJson(directory, "result.json", {
      schemaVersion: 1,
      executionId,
      ...result,
    });
    cases.push({ input: entry.input.id, ...result, receipt });
  }
  const confirmed = options.candidateDirectory
    ? await captureInstalledIdentity(
        options.candidateDirectory,
        options.consumerDirectory,
      )
    : await captureSourceIdentity(options.packageDirectory);
  if (comparisonIdentity(confirmed) !== comparisonIdentity(candidate)) {
    throw new Error("Selected source changed during comparison");
  }
  if ((await captureHarnessIdentity()) !== harnessSha256) {
    throw new Error("Comparison harness changed during execution");
  }
  const confirmedClasspath = await admitCaseClasspath(entries, options);
  const { jdk: confirmedJdk } = comparisonJavaTools(
    options,
    options.outputDirectory,
  );
  if (
    comparisonIdentity(confirmedClasspath.identity) !==
      comparisonIdentity(classpath.identity) ||
    comparisonIdentity(confirmedJdk.identity) !==
      comparisonIdentity(java.identity.jdk)
  ) {
    throw new Error("Java oracle bytes changed during comparison");
  }
  const report = { schemaVersion: 2, action: "run", executionId, cases };
  await publishComparisonJson(options.outputDirectory, "report.json", report);
  return report;
}

/** Run the same plan, workers and report protocol from CLI and programmatic callers. */
export function runComparison(request, environment = {}) {
  if (environment.memoryGuard === false) {
    return executeComparison(request, {
      ...environment,
      memoryBudgetMiB: undefined,
      nodeHeapMiB: undefined,
    });
  }
  if (process.platform === "win32" && request.action === "run") {
    return runWindowsComparisonJob(
      request,
      environment,
      fileURLToPath(import.meta.url),
    );
  }
  return executeComparison(request, environment);
}

const optionNames = [
  "suite",
  "scenario",
  "profile",
  "parsing-mode",
  "imports",
  "measure",
  "format",
  "cache",
  "output",
  "java-home",
  "java-selection",
  "maven-directory",
  "classpath-file",
  "ontology-repository",
  "reference-checkout",
  "candidate",
  "java-xml",
  "java-turtle",
  "cold-samples",
  "repetitions",
  "warmups",
  "benchmark-mode",
  "syntax-count",
  "import-closure-count",
  "corpus-receipts",
  "corpus-artifacts",
  "shard",
  "memory-budget-mib",
  "node-heap-mib",
  "java-heap-mib",
  "reuse-observations",
];
function parseComparisonArguments([action, ...args]) {
  const { values } = parseArgs({
    args,
    options: {
      ...Object.fromEntries(
        optionNames.map((name) => [name, { type: "string" }]),
      ),
      input: { type: "string", multiple: true },
      seed: { type: "string", multiple: true },
      "no-memory-guard": { type: "boolean" },
    },
  });
  const localSeeds = new Map();
  for (const seed of values.seed ?? []) {
    const separator = seed.indexOf("=");
    const id = seed.slice(0, separator);
    if (separator < 1 || localSeeds.has(id))
      throw new Error("Use one --seed ID=PATH per input");
    localSeeds.set(id, resolve(seed.slice(separator + 1)));
  }
  return [
    {
      action,
      input: values.input,
      suite: values.suite,
      scenario: values.scenario,
      profile: values.profile,
      parsingMode: values["parsing-mode"],
      imports: values.imports,
      javaXml: values["java-xml"],
      javaTurtle: values["java-turtle"],
      format: values.format,
      measurements: values.measure?.split(","),
      shard: values.shard,
    },
    {
      localSeeds,
      cacheDirectory: values.cache,
      outputDirectory: values.output,
      javaHome: values["java-home"] ?? process.env.JAVA_HOME,
      javaSelection: values["java-selection"],
      mavenDirectory: values["maven-directory"],
      classpathFile: values["classpath-file"],
      ontologyRepository: values["ontology-repository"],
      referenceCheckout: values["reference-checkout"],
      candidateDirectory: values.candidate,
      benchmarkMode: values["benchmark-mode"],
      corpusReceipts: values["corpus-receipts"],
      corpusArtifacts: values["corpus-artifacts"],
      memoryGuard: values["no-memory-guard"] ? false : undefined,
      memoryBudgetMiB:
        values["memory-budget-mib"] === undefined
          ? undefined
          : Number(values["memory-budget-mib"]),
      nodeHeapMiB:
        values["node-heap-mib"] === undefined
          ? undefined
          : Number(values["node-heap-mib"]),
      javaHeapMiB:
        values["java-heap-mib"] === undefined
          ? undefined
          : Number(values["java-heap-mib"]),
      reuseObservations: values["reuse-observations"],
      benchmarkParameters: Object.fromEntries(
        [
          ["syntaxCount", "syntax-count"],
          ["importClosureCount", "import-closure-count"],
          ["warmupCount", "warmups"],
          ["runCount", "repetitions"],
        ]
          .filter(([, option]) => values[option] !== undefined)
          .map(([name, option]) => [name, Number(values[option])]),
      ),
      performanceProtocol: Object.fromEntries(
        [
          ["coldSamples", "cold-samples"],
          ["warmups", "warmups"],
          ["repetitions", "repetitions"],
        ]
          .filter(([, option]) => values[option] !== undefined)
          .map(([name, option]) => [name, Number(values[option])]),
      ),
    },
  ];
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    if (process.argv[2] === "--protected-comparison") {
      const { request, environment } = await readJson(process.argv[3]);
      if (
        process.platform !== "win32" ||
        process.env.OWLAPI_COMPARISON_JOB_MIB !==
          String(environment.memoryBudgetMiB) ||
        process.env.OWLAPI_COMPARISON_NODE_HEAP_MIB !==
          String(environment.nodeHeapMiB) ||
        request.action !== "run"
      ) {
        throw new Error(
          "A Windows memory job is required for the comparison worker",
        );
      }
      environment.localSeeds = new Map(environment.localSeeds);
      const result = await executeComparison(request, environment);
      await publishComparisonJson(
        dirname(process.argv[3]),
        "result.json",
        result,
      );
    } else {
      const result = await runComparison(
        ...parseComparisonArguments(process.argv.slice(2)),
      );
      process.stdout.write(JSON.stringify(result) + "\n");
      if (
        result.status === "incomplete" ||
        result.cases?.some(
          ({ status }) =>
            status &&
            !["passed", "prepared", "diagnostic-only", "observed"].includes(
              status,
            ),
        )
      ) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 2;
  }
}
