import {
  ENTITY_KINDS,
  OWL_OBJECT_KINDS,
  OWLObjectKind as K,
} from "../../model/kinds.js";
import { OWLOntologyManager } from "../../model/owlOntologyManager.js";
import {
  isPackageOntology,
  readOntologySnapshot,
} from "../../model/owlOntology.js";
import {
  createSourcePreservingDataFactory,
  readDataFactoryBehaviorDefinition,
} from "../../model/owlDataFactory.js";
import { OWLStructuralObject } from "../../model/structural.js";
import { validateStructuralGraph } from "./structuralValidation.js";
import { structuralFields } from "./structuralFields.js";
import { minimumTwoSetFields, repeatSingleton } from "./setConstructs.js";

const ALL_OWL_OBJECT_KINDS_SET = new Set(OWL_OBJECT_KINDS);
const TRANSFORMABLE_KINDS_SET = new Set(
  OWL_OBJECT_KINDS.filter(
    (kind) => ![K.ONTOLOGY_ID, K.IMPORTS_DECLARATION].includes(kind),
  ),
);
const ENTITY_KINDS_SET = new Set(ENTITY_KINDS);

export const requireTransformKind = (value, kinds) => {
  if (!value || !kinds.includes(value.kind))
    throw new TypeError("unsupported transform kind");
  validateStructuralGraph(value, ALL_OWL_OBJECT_KINDS_SET);
  OWLStructuralObject.prototype.structuralKey.call(value);
  return value;
};

export const transformFactory = (manager) =>
  createSourcePreservingDataFactory(
    OWLOntologyManager.prototype.getOWLDataFactory.call(manager),
  );

/** Capture genuine ontology members once; query their current revisions on each call. */
export const captureOntologies = (input) => {
  if (isPackageOntology(input)) {
    return Object.freeze([input]);
  }
  if (!input || typeof input[Symbol.iterator] !== "function")
    throw new TypeError("ontologies must be iterable");
  const result = [...input];
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
export const transformObject = (root, factory, resolve, done = new Map()) => {
  const order = validateStructuralGraph(
    root,
    TRANSFORMABLE_KINDS_SET,
    readDataFactoryBehaviorDefinition(factory).computationResourcePolicy
      .maxTransformDepth,
  );
  const get = (value) =>
    value && typeof value === "object" ? done.get(value) : value;
  for (const value of order) {
    if (done.has(value)) continue;
    if (Array.isArray(value)) {
      let arrayChanged = false;
      for (let i = 0; i < value.length; i += 1) {
        if (get(value[i]) !== value[i]) {
          arrayChanged = true;
          break;
        }
      }
      done.set(value, arrayChanged ? Object.freeze(value.map(get)) : value);
      continue;
    }
    const resolved = resolve(value);
    if (resolved !== undefined) {
      done.set(value, resolved);
      continue;
    }
    let rebuilt;
    if (value.kind === K.IRI) rebuilt = value;
    else if (value.kind === K.LITERAL) {
      const nextDatatype = get(value.datatype);
      rebuilt =
        nextDatatype === value.datatype
          ? value
          : factory.getOWLLiteral(
              value.lexicalForm,
              value.language || nextDatatype,
            );
    } else if (value.kind === K.INVERSE_OBJECT_PROPERTIES_AXIOM) {
      const nextProps = get(value.properties);
      const nextAnnotations = get(value.annotations);
      rebuilt =
        nextProps === value.properties && nextAnnotations === value.annotations
          ? value
          : factory.getOWLInverseObjectPropertiesAxiom(
              ...nextProps,
              nextAnnotations,
            );
    } else {
      const fieldNames = structuralFields.get(value.kind);
      let anyFieldChanged = false;
      for (let i = 0; i < fieldNames.length; i += 1) {
        const field = fieldNames[i];
        if (get(value[field]) !== value[field]) {
          anyFieldChanged = true;
          break;
        }
      }
      if (!anyFieldChanged) {
        rebuilt = value;
      } else {
        const setField = minimumTwoSetFields.get(value.kind);
        const args = fieldNames.map((field) =>
          field === setField
            ? repeatSingleton(get(value[field]))
            : get(value[field]),
        );
        rebuilt = factory[`get${value.kind}`](...args);
      }
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
  if (ENTITY_KINDS_SET.has(value.kind)) {
    if (entities.size === 0) return value;
    const replacement = entities.get(value.structuralKey());
    return replacement ? factory[`get${value.kind}`](replacement.value) : value;
  }
  if (value.kind === K.IRI)
    return iris.size === 0 ? value : (iris.get(value.structuralKey()) ?? value);
  return undefined;
};
