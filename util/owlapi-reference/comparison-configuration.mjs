import { comparisonIdentity } from "./comparison-evidence.mjs";

const javaProfile = "java-owlapi-5.5.1";
const cases = [
  {
    kind: "loader",
    decisionId: "BEHAVIOR-LOADER-CONFIGURATION",
    timeout: 123,
    retries: 2,
    entityLimit: "0",
    authorization: "Bearer owned-test-token",
  },
  {
    kind: "writer",
    decisionId: "BEHAVIOR-WRITER-CONFIGURATION",
    indentSize: 2,
    normativeCopy: [false, 2, false, false, false],
  },
];

/** Bind the supported public configuration sequences to each policy decision. */
export function configurationComparisonCases(request) {
  if (
    request.input ||
    (request.suite && request.suite !== "public-api-behavior") ||
    (request.scenario && request.scenario !== "public-api-behavior") ||
    (request.profile && request.profile !== javaProfile) ||
    request.parsingMode ||
    request.imports ||
    request.format ||
    request.javaXml ||
    request.javaTurtle
  ) {
    throw new Error(
      "Configuration cases own their finite profiles and operations",
    );
  }
  return cases.map((configuration) => {
    const input = { id: `configuration/${configuration.kind}` };
    const definition = {
      schemaVersion: 1,
      scenario: "public-api-behavior",
      scenarioVersion: 1,
      observationPoint: "configuration-copy-and-defaults",
      behaviorProfileId: javaProfile,
      measurements: ["behavior"],
      input,
      configuration,
    };
    return {
      caseId: comparisonIdentity(definition),
      definition,
      input,
      imports: [],
    };
  });
}

const loaderState = (configuration) => [
  configuration.getConnectionTimeout(),
  configuration.getRetriesToAttempt(),
  configuration.isFollowRedirects(),
  configuration.getEntityExpansionLimit(),
  configuration.isStrict(),
  configuration.isLoadAnnotationAxioms(),
  configuration.getAuthorizationValue(),
  configuration.isAcceptingHTTPCompression(),
];

const writerState = (configuration) => [
  configuration.isIndenting(),
  configuration.getIndentSize(),
  configuration.shouldUseBanners(),
  configuration.isLabelsAsBanner(),
  configuration.shouldSaveIdsForAllAnonymousIndividuals(),
];

/** Exercise the same public setters from source or an isolated package installation. */
export function observeConfiguration(api, request) {
  const recipe = request.configuration;
  const options = { behaviorProfileId: request.behaviorProfileId };
  const loader = recipe.kind === "loader";
  const Constructor = loader
    ? api.OWLOntologyLoaderConfiguration
    : api.OWLOntologyWriterConfiguration;
  const original = new Constructor(options);
  const normative = new Constructor();
  const state = loader ? loaderState : writerState;
  const chain = loader
    ? (config) =>
        config
          .setConnectionTimeout(recipe.timeout)
          .setRetriesToAttempt(recipe.retries)
          .setStrict(true)
          .setLoadAnnotationAxioms(false)
          .setEntityExpansionLimit(recipe.entityLimit)
    : (config) =>
        config
          .withIndentSize(recipe.indentSize)
          .withBannersEnabled(false)
          .withIndenting(false);
  const changed = chain(original);
  const noOp = loader
    ? [
        original ===
          original.setConnectionTimeout(original.getConnectionTimeout()),
        original === original.setLoadAnnotationAxioms(true),
        original === original.setStrict(false),
        original === original.setAuthorizationValue(""),
        original === original.setAcceptingHTTPCompression(true),
      ]
    : [original === original.withIndentSize(original.getIndentSize())];
  const retained = loader
    ? original
        .setAuthorizationValue(recipe.authorization)
        .setAcceptingHTTPCompression(false)
        .setConnectionTimeout(recipe.timeout)
    : original.withIndentSize(recipe.indentSize).withBannersEnabled(true);
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: original.getBehaviorProfileId(),
      defaultBehaviorProfileId: normative.getBehaviorProfileId(),
    },
    networkRequests: [],
    load: { status: "completed" },
    configuration: {
      original: state(original),
      chain: state(changed),
      noOp,
      retained: state(retained),
    },
    ...(loader ? {} : { normativeCopy: state(chain(normative)) }),
  };
}
