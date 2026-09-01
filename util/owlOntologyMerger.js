import {
  isLogicalAxiom,
  StructuralAxiomSet,
} from "../internal/model/axiomSemantics.js";
import { OWLObjectKind } from "../model/kinds.js";
import { OWLOntology } from "../model/owlOntology.js";
import { isCanonicalStructuralObject } from "../model/structural.js";

const requireOntologySetProvider = (ontologySetProvider) => {
  if (
    !ontologySetProvider ||
    typeof ontologySetProvider.ontologies !== "function"
  ) {
    throw new TypeError("ontologySetProvider must implement ontologies()");
  }
  return ontologySetProvider;
};

const requireMergeOnlyLogicalAxioms = (mergeOnlyLogicalAxioms) => {
  if (mergeOnlyLogicalAxioms === undefined) {
    return false;
  }
  if (typeof mergeOnlyLogicalAxioms !== "boolean") {
    throw new TypeError("mergeOnlyLogicalAxioms must be a boolean");
  }
  return mergeOnlyLogicalAxioms;
};

const requireOntologyManager = (ontologyManager) => {
  if (
    !ontologyManager ||
    typeof ontologyManager.addAxioms !== "function" ||
    typeof ontologyManager.createOntology !== "function" ||
    typeof ontologyManager.getOWLDataFactory !== "function"
  ) {
    throw new TypeError(
      "ontologyManager must implement createOntology(), addAxioms(), and getOWLDataFactory()",
    );
  }
  return ontologyManager;
};

const requireOptionalOntologyIRI = (ontologyIRI) => {
  if (ontologyIRI === undefined) {
    return undefined;
  }
  if (
    !isCanonicalStructuralObject(ontologyIRI) ||
    ontologyIRI.kind !== OWLObjectKind.IRI ||
    typeof ontologyIRI.value !== "string" ||
    ontologyIRI.value.length === 0
  ) {
    throw new TypeError("ontologyIRI must be an IRI");
  }
  return ontologyIRI;
};

const requireOntology = (ontology, index) => {
  try {
    OWLOntology.prototype.getOntologyID.call(ontology);
    return ontology;
  } catch {
    throw new TypeError(`ontologies[${index}] must be an OWLOntology`);
  }
};

const materializeProviderOntologies = (ontologySetProvider) => {
  const providedOntologies = ontologySetProvider.ontologies();
  if (
    !providedOntologies ||
    typeof providedOntologies[Symbol.iterator] !== "function"
  ) {
    throw new TypeError(
      "ontologySetProvider.ontologies() must return an iterable",
    );
  }
  const ontologies = [];
  let index = 0;
  for (const ontology of providedOntologies) {
    ontologies.push(requireOntology(ontology, index));
    index += 1;
  }
  return Object.freeze(ontologies);
};

const collectAxiomUnion = (ontologies, mergeOnlyLogicalAxioms) => {
  const axiomUnion = new StructuralAxiomSet();
  for (const ontology of ontologies) {
    const directAxioms = OWLOntology.prototype.getAxioms.call(ontology);
    for (const axiom of directAxioms) {
      if (!mergeOnlyLogicalAxioms || isLogicalAxiom(axiom)) {
        axiomUnion.add(axiom);
      }
    }
  }
  return axiomUnion.toFrozenArray();
};

const createTargetOntology = (ontologyManager, ontologyIRI) => {
  if (ontologyIRI === undefined) {
    return ontologyManager.createOntology();
  }
  const dataFactory = ontologyManager.getOWLDataFactory();
  if (!dataFactory || typeof dataFactory.getOWLOntologyID !== "function") {
    throw new TypeError(
      "ontologyManager.getOWLDataFactory() must provide getOWLOntologyID()",
    );
  }
  return ontologyManager.createOntology(
    dataFactory.getOWLOntologyID(ontologyIRI),
  );
};

export class OWLOntologyMerger {
  #mergeOnlyLogicalAxioms;
  #ontologySetProvider;

  constructor(ontologySetProvider, mergeOnlyLogicalAxioms) {
    this.#ontologySetProvider = requireOntologySetProvider(ontologySetProvider);
    this.#mergeOnlyLogicalAxioms = requireMergeOnlyLogicalAxioms(
      mergeOnlyLogicalAxioms,
    );
    Object.freeze(this);
  }

  createMergedOntology(ontologyManager, ontologyIRI) {
    const normalizedOntologyManager = requireOntologyManager(ontologyManager);
    const normalizedOntologyIRI = requireOptionalOntologyIRI(ontologyIRI);
    const ontologies = materializeProviderOntologies(this.#ontologySetProvider);
    const axiomUnion = collectAxiomUnion(
      ontologies,
      this.#mergeOnlyLogicalAxioms,
    );
    const mergedOntology = createTargetOntology(
      normalizedOntologyManager,
      normalizedOntologyIRI,
    );
    normalizedOntologyManager.addAxioms(mergedOntology, axiomUnion);
    return mergedOntology;
  }
}
