import { checkOWL2DL } from "../internal/profiles/owl2dl.js";
import { IRI } from "../model/structural.js";
import { OWLProfileReport } from "./owlProfileReport.js";

/** Java OWL2DLProfile responsibility, adapted to asynchronous JS validation. */
export class OWL2DLProfile {
  getName() {
    return "OWL 2 DL";
  }
  getIRI() {
    return IRI.create("http://www.w3.org/ns/owl-profile/DL");
  }
  async checkOntology(ontology, options) {
    return new OWLProfileReport(
      ontology,
      this,
      await checkOWL2DL(ontology, options),
    );
  }
}
