import { OWLOntologyManager } from "../model/owlOntologyManager.js";

export class OWLManager {
  // UNSUPPORTED(OWLAPI parity): Java OWLAPI manager factories and managers expose
  // configurators, change listeners, progress listeners, ontology factories,
  // storers, and lifecycle mutation APIs. The initial 0.1 package intentionally
  // exposes the narrow manager created here: data-factory access, ontology creation/loading,
  // and ontology lookup only. Correctly adding listener/lifecycle behavior would
  // require public event and mutation contracts plus reentrancy/transaction tests.
  // Verification: `manager.narrow-v1-surface` and `manager.java-listeners`.
  static createOWLOntologyManager(options) {
    return new OWLOntologyManager(options);
  }
}

Object.freeze(OWLManager);
