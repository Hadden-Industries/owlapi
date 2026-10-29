import { isPackageOntology, OWLOntology } from "../model/owlOntology.js";
import { readNativeManagerImportsClosure } from "../model/owlOntologyManager.js";

const requireOntology = (ontology, name) => {
  if (isPackageOntology(ontology)) return ontology;
  try {
    OWLOntology.prototype.getOntologyID.call(ontology);
    return ontology;
  } catch {
    throw new TypeError(`${name} must be an OWLOntology`);
  }
};

const requireClosureManager = (manager) => {
  if (!manager || typeof manager.getImportsClosure !== "function") {
    throw new TypeError("manager must implement getImportsClosure()");
  }
  return manager;
};

const captureClosureSnapshot = (manager, rootOntology) => {
  const method = manager.getImportsClosure;
  const nativeClosure = readNativeManagerImportsClosure(
    manager,
    method,
    rootOntology,
  );
  if (nativeClosure) return new Set(nativeClosure);
  const closure = Reflect.apply(method, manager, [rootOntology]);
  if (!closure || typeof closure[Symbol.iterator] !== "function") {
    throw new TypeError("manager.getImportsClosure() must return an iterable");
  }
  const capturedOntologies = new Set();
  let index = 0;
  for (const ontology of closure) {
    capturedOntologies.add(
      requireOntology(ontology, `importsClosure[${index}]`),
    );
    index += 1;
  }
  return capturedOntologies;
};

export class OWLOntologyImportsClosureSetProvider {
  #manager;
  #rootOntology;

  constructor(manager, rootOntology) {
    this.#manager = requireClosureManager(manager);
    this.#rootOntology = requireOntology(rootOntology, "rootOntology");
    Object.freeze(this);
  }

  /** Read the current closure at each call; retain that result's membership
   * independently of later manager changes, matching Java's stream creation.
   */
  ontologies() {
    return captureClosureSnapshot(this.#manager, this.#rootOntology);
  }
}
