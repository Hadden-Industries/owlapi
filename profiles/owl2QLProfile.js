import { checkOWL2Profile } from "../internal/profiles/owl2dl.js";
import { IRI } from "../model/structural.js";
import { OWLProfileReport } from "./owlProfileReport.js";

/** Asynchronous assessment of the root-inclusive OWL 2 QL closure. */
export class OWL2QLProfile {
  getName() {
    return "OWL 2 QL";
  }
  getIRI() {
    return IRI.create("http://www.w3.org/ns/owl-profile/QL");
  }
  async checkOntology(ontology, options) {
    return new OWLProfileReport(
      ontology,
      this,
      await checkOWL2Profile(ontology, options, "QL"),
    );
  }
}
