import { checkOWL2Profile } from "../internal/profiles/owl2dl.js";
import { IRI } from "../model/structural.js";
import { OWLProfileReport } from "./owlProfileReport.js";

/** Asynchronous assessment of the root-inclusive OWL 2 EL closure. */
export class OWL2ELProfile {
  getName() {
    return "OWL 2 EL";
  }
  getIRI() {
    return IRI.create("http://www.w3.org/ns/owl-profile/EL");
  }
  async checkOntology(ontology, options) {
    return new OWLProfileReport(
      ontology,
      this,
      await checkOWL2Profile(ontology, options, "EL"),
    );
  }
}
