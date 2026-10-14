import { ResourceLimitError } from "../io/errors.js";

/** Immutable result of checking one root-inclusive ontology closure. */
export class OWLProfileReport {
  #ontology;
  #profile;
  constructor(ontology, profile, result) {
    this.#ontology = ontology;
    this.#profile = profile;
    Object.assign(this, result);
    Object.freeze(this);
  }
  isInProfile() {
    const exhaustion = this.unverifiedChecks.find(
      ({ code }) => code === "RESOURCE_LIMIT_EXCEEDED",
    );
    if (exhaustion)
      throw new ResourceLimitError(
        "OWL profile membership was not determined because a resource limit was exceeded",
        { resource: exhaustion.resource, limit: exhaustion.limit },
      );
    return this.status === "valid";
  }
  getViolations() {
    return this.violations;
  }
  getOntology() {
    return this.#ontology;
  }
  getProfile() {
    return this.#profile;
  }
  getSourceAssessment() {
    return this.sourceAssessment;
  }
}
