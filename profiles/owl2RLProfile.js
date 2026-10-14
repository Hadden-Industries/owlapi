import {
  initializeProfileBehavior,
  readProfileBehavior,
} from "../internal/profiles/profileBehaviorContext.js";
import { checkOWL2Profile } from "../internal/profiles/owl2dl.js";
import { IRI } from "../model/structural.js";
import { OWLProfileReport } from "./owlProfileReport.js";

/** Asynchronous assessment of the root-inclusive OWL 2 RL closure. */
export class OWL2RLProfile {
  constructor(options) {
    initializeProfileBehavior(this, options);
  }
  getName() {
    return "OWL 2 RL";
  }
  getIRI() {
    return IRI.create("http://www.w3.org/ns/owl-profile/RL");
  }
  async checkOntology(ontology, options) {
    return new OWLProfileReport(
      ontology,
      this,
      await checkOWL2Profile(
        ontology,
        options,
        "RL",
        readProfileBehavior(this, ontology),
      ),
    );
  }
}
