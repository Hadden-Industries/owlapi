import { OWLOntology } from "../model/owlOntology.js";

const requireOntology = (ontology, name) => {
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
  const closure = manager.getImportsClosure(rootOntology);
  if (!closure || typeof closure[Symbol.iterator] !== "function") {
    throw new TypeError("manager.getImportsClosure() must return an iterable");
  }
  const capturedOntologies = [];
  let index = 0;
  for (const ontology of closure) {
    capturedOntologies.push(
      requireOntology(ontology, `importsClosure[${index}]`),
    );
    index += 1;
  }
  return Object.freeze([...new Set(capturedOntologies)]);
};

export class OWLOntologyImportsClosureSetProvider {
  #capturedOntologies;

  constructor(manager, rootOntology) {
    const normalizedManager = requireClosureManager(manager);
    const normalizedRootOntology = requireOntology(
      rootOntology,
      "rootOntology",
    );
    this.#capturedOntologies = captureClosureSnapshot(
      normalizedManager,
      normalizedRootOntology,
    );
    Object.freeze(this);
  }

  ontologies() {
    return new Set(this.#capturedOntologies);
  }
}
