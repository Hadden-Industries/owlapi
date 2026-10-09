import {
  ENTITY_KINDS,
  OWL_OBJECT_KINDS,
  OWLObjectKind as K,
} from "../../model/kinds.js";
import { OWLOntologyManager } from "../../model/owlOntologyManager.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import { createSourcePreservingDataFactory } from "../../model/owlDataFactory.js";
import { IRI, OWLStructuralObject } from "../../model/structural.js";
import { validateStructuralGraph } from "./structuralValidation.js";
import { structuralFields } from "./structuralFields.js";
import { minimumTwoSetFields, repeatSingleton } from "./setConstructs.js";

export const requireTransformKind = (value, kinds) => {
  if (!value || !kinds.includes(value.kind))
    throw new TypeError("unsupported transform kind");
  validateStructuralGraph(value, new Set(OWL_OBJECT_KINDS));
  OWLStructuralObject.prototype.structuralKey.call(value);
  return value;
};

export const transformFactory = (manager) =>
  createSourcePreservingDataFactory(
    OWLOntologyManager.prototype.getOWLDataFactory.call(manager),
  );

/** Capture genuine ontology members once; query their current revisions on each call. */
export const captureOntologies = (input) => {
  try {
    readOntologySnapshot(input);
    return Object.freeze([input]);
  } catch {
    /* try the selected iterable overload */
  }
  if (!input || typeof input[Symbol.iterator] !== "function")
    throw new TypeError("ontologies must be iterable");
  const result = [...new Set(input)];
  result.forEach(readOntologySnapshot);
  return Object.freeze(result);
};

/** Java maps use structural key equality. Copy entries before exposing a utility. */
export const captureReplacements = (map, keyKinds, valueKinds) => {
  if (!(map instanceof Map)) throw new TypeError("replacements must be a Map");
  const result = new Map();
  for (const [key, value] of map) {
    requireTransformKind(key, keyKinds);
    requireTransformKind(value, valueKinds);
    result.set(key.structuralKey(), Object.freeze({ key, value }));
  }
  return result;
};

/** Iterative postorder avoids a call-stack limit and rejects manufactured cycles.
 * Rebuild through the canonical factory, preserving normalized singleton sets.
 * resolve() handles entities atomically so raw IRI maps cannot rename a punned
 * entity that is absent from a typed map.
 */
export const transformObject = (root, factory, resolve) => {
  const order = validateStructuralGraph(
    root,
    new Set(
      OWL_OBJECT_KINDS.filter(
        (kind) => ![K.ONTOLOGY_ID, K.IMPORTS_DECLARATION].includes(kind),
      ),
    ),
  );
  const done = new Map();
  const get = (value) =>
    value && typeof value === "object" ? done.get(value) : value;
  for (const value of order) {
    if (Array.isArray(value)) {
      done.set(value, Object.freeze(value.map(get)));
      continue;
    }
    const resolved = resolve(value);
    if (resolved !== undefined) {
      done.set(value, resolved);
      continue;
    }
    let rebuilt;
    if (value.kind === K.IRI) rebuilt = IRI.create(value.value);
    else if (value.kind === K.LITERAL)
      rebuilt = factory.getOWLLiteral(
        value.lexicalForm,
        value.language || get(value.datatype),
      );
    else if (value.kind === K.INVERSE_OBJECT_PROPERTIES_AXIOM)
      rebuilt = factory.getOWLInverseObjectPropertiesAxiom(
        ...get(value.properties),
        get(value.annotations),
      );
    else {
      const setField = minimumTwoSetFields.get(value.kind);
      const args = structuralFields
        .get(value.kind)
        .map((field) =>
          field === setField
            ? repeatSingleton(get(value[field]))
            : get(value[field]),
        );
      rebuilt = factory[`get${value.kind}`](...args);
    }
    done.set(value, rebuilt);
  }
  const result = done.get(root);
  if (!result || Array.isArray(root))
    throw new TypeError("object must be a supported OWL structural object");
  return result;
};

/** Pick raw-IRI replacements in native entity-type priority, independent of Map insertion. */
export const iriReplacementsForEntities = (entities) => {
  const result = new Map();
  const order = [
    K.CLASS,
    K.OBJECT_PROPERTY,
    K.DATA_PROPERTY,
    K.ANNOTATION_PROPERTY,
    K.NAMED_INDIVIDUAL,
    K.DATATYPE,
  ];
  for (const kind of order)
    for (const { key, value } of entities.values()) {
      if (key.kind === kind && !result.has(key.iri.structuralKey()))
        result.set(key.iri.structuralKey(), value);
    }
  return result;
};

export const entityResolver = (factory, entities, iris) => (value) => {
  if (ENTITY_KINDS.includes(value.kind))
    return factory[`get${value.kind}`](
      entities.get(value.structuralKey())?.value ?? value.iri,
    );
  if (value.kind === K.IRI) return iris.get(value.structuralKey()) ?? value;
  return undefined;
};
