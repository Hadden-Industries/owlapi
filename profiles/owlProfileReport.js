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
