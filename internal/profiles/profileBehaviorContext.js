import { OntologyBehaviorContext } from "../behavior/ontologyBehaviorContext.js";
import { readOntologyBehaviorDefinition } from "../../model/owlOntology.js";

const contexts = new WeakMap();

/** Standalone OWL-language-profile checkers select behavior at construction. */
export const initializeProfileBehavior = (checker, options = {}) => {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some((name) => name !== "behaviorProfileId")
  )
    throw new TypeError(
      "Profile checker options accept only behaviorProfileId",
    );
  contexts.set(checker, new OntologyBehaviorContext(options.behaviorProfileId));
};

/** Capture before asynchronous work; never select a profile from a later read. */
export const readProfileBehavior = (checker, ontology) => {
  const definition = contexts.get(checker).behaviorProfileDefinition;
  const ownerDefinition = readOntologyBehaviorDefinition(ontology);
  if (ownerDefinition && ownerDefinition !== definition)
    throw new TypeError(
      "OWL profile checker and ontology behavior profiles must match",
    );
  return definition;
};
