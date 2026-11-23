import { comparisonIdentity } from "./comparison-evidence.mjs";

const named = "java-owlapi-5.5.1";
const normative = "normative-v1";
const profileIdentity = {
  decisionId: "BEHAVIOR-PROFILE-IDENTITY",
  unknownProfile: "unregistered-owl-behavior",
  normative: {
    named: [named, named, named, named],
    default: [normative, normative, normative, normative],
    loaderBindingRefused: true,
    writerBindingRefused: true,
    originalLoaderRetained: true,
    originalWriterRetained: true,
    unknownRefused: true,
  },
};

export function profileIdentityComparisonCase() {
  const input = { id: "manager/behavior-profile-identity" };
  const definition = {
    schemaVersion: 1,
    scenario: "public-api-behavior",
    scenarioVersion: 1,
    observationPoint: "manager-factory-and-configuration-bindings",
    behaviorProfileId: named,
    measurements: ["behavior"],
    input,
    profileIdentity,
  };
  return {
    caseId: comparisonIdentity(definition),
    definition,
    input,
    imports: [],
  };
}

export function observeProfileIdentity(api, request) {
  const create = (options) => api.OWLManager.createOWLOntologyManager(options);
  const selected = create({ behaviorProfileId: request.behaviorProfileId });
  const defaults = create();
  const loader = selected.getOntologyLoaderConfiguration();
  const writer = selected.getOntologyWriterConfiguration();
  const factory = selected.getOWLDataFactory();
  const owners = (manager) =>
    [
      manager,
      manager.getOWLDataFactory(),
      manager.getOntologyLoaderConfiguration(),
      manager.getOntologyWriterConfiguration(),
    ].map((owner) => owner.getBehaviorProfileId());
  const refused = (operation, type, message) => {
    try {
      operation();
      return false;
    } catch (error) {
      return error instanceof type && message.test(error.message);
    }
  };
  const loaderBindingRefused = refused(
    () =>
      selected.setOntologyLoaderConfiguration(
        defaults.getOntologyLoaderConfiguration(),
      ),
    TypeError,
    /profiles must match/u,
  );
  const writerBindingRefused = refused(
    () =>
      selected.setOntologyWriterConfiguration(
        defaults.getOntologyWriterConfiguration(),
      ),
    TypeError,
    /profiles must match/u,
  );
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: selected.getBehaviorProfileId(),
      defaultBehaviorProfileId: defaults.getBehaviorProfileId(),
    },
    networkRequests: [],
    load: { status: "completed" },
    profileIdentity: {
      factoryReused: factory === selected.getOWLDataFactory(),
      connectionTimeout: loader.getConnectionTimeout(),
      writerIndentSize: writer.getIndentSize(),
    },
    profileBindings: {
      named: owners(selected),
      default: owners(defaults),
      loaderBindingRefused,
      writerBindingRefused,
      originalLoaderRetained:
        selected.getOntologyLoaderConfiguration() === loader,
      originalWriterRetained:
        selected.getOntologyWriterConfiguration() === writer,
      unknownRefused: refused(
        () =>
          create({ behaviorProfileId: request.profileIdentity.unknownProfile }),
        RangeError,
        /profile/iu,
      ),
    },
  };
}
