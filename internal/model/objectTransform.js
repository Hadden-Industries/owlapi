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
import { ResourceLimitError } from "../../io/errors.js";
import {
  EMPTY_STRUCTURAL_SET,
  isFactoryStructuralObject,
  usesNativeStructuralKeys,
} from "../../model/structural.js";
import {
  checkStructuralKeyReceiver,
  validateStructuralGraph,
} from "./structuralValidation.js";
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
  if (!isFactoryStructuralObject(value)) {
    validateStructuralGraph(value, ALL_OWL_OBJECT_KINDS_SET);
  }
  checkStructuralKeyReceiver(value);
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

const txSeen = new Map(),
  txNodes = [],
  txPos = [],
  txFields = [],
  txPathDepth = [],
  txDepths = [],
  txOrder = [],
  txDone = new Map();
let txBusy = false;

function fillFactoryTransformOrder(
  root,
  supportedKinds,
  maxDepth,
  seen,
  nodes,
  positions,
  fields,
  pathDepth,
  depths,
  order,
) {
  if (maxDepth < 0)
    throw new ResourceLimitError("Structural depth limit exceeded", {
      resource: "expressionDepth",
      limit: maxDepth,
    });
  if (!supportedKinds.has(root.kind))
    throw new TypeError("Unsupported structural input kind");
  seen.set(root, -1);
  nodes.push(root);
  positions[0] = 0;
  fields[0] = structuralFields.get(root.kind);
  pathDepth[0] = 0;
  while (nodes.length) {
    const level = nodes.length - 1,
      node = nodes[level],
      names = fields[level];
    const length = names?.length ?? node.length,
      index = positions[level];
    if (index < length) {
      positions[level]++;
      const child = node[names ? names[index] : index];
      if (child && typeof child === "object") {
        const previous = seen.get(child);
        if (previous === undefined) {
          if (child === EMPTY_STRUCTURAL_SET) {
            if (level + 1 > maxDepth)
              throw new ResourceLimitError("Structural depth limit exceeded", {
                resource: "expressionDepth",
                limit: maxDepth,
              });
            const ordinal = order.length;
            seen.set(child, ordinal);
            order.push(child);
            depths[ordinal] = 0;
            if (pathDepth[level] < 1) pathDepth[level] = 1;
          } else if (child.kind === K.IRI) {
            if (level + 1 > maxDepth)
              throw new ResourceLimitError("Structural depth limit exceeded", {
                resource: "expressionDepth",
                limit: maxDepth,
              });
            if (!supportedKinds.has(K.IRI))
              throw new TypeError("Unsupported structural input kind");
            const ordinal = order.length;
            seen.set(child, ordinal);
            order.push(child);
            depths[ordinal] = 0;
            if (pathDepth[level] < 1) pathDepth[level] = 1;
          } else {
            if (!Array.isArray(child) && !supportedKinds.has(child.kind))
              throw new TypeError("Unsupported structural input kind");
            const childLevel = nodes.length;
            if (childLevel > maxDepth)
              throw new ResourceLimitError("Structural depth limit exceeded", {
                resource: "expressionDepth",
                limit: maxDepth,
              });
            seen.set(child, -1);
            nodes.push(child);
            positions[childLevel] = 0;
            fields[childLevel] = Array.isArray(child)
              ? undefined
              : structuralFields.get(child.kind);
            pathDepth[childLevel] = 0;
          }
        } else {
          if (previous === -1) throw new TypeError("Cyclic structural input");
          const candidateDepth = depths[previous] + 1;
          if (level + candidateDepth > maxDepth)
            throw new ResourceLimitError("Structural depth limit exceeded", {
              resource: "expressionDepth",
              limit: maxDepth,
            });
          if (candidateDepth > pathDepth[level])
            pathDepth[level] = candidateDepth;
        }
      }
      continue;
    }
    const ordinal = order.length;
    seen.set(node, ordinal);
    order.push(node);
    nodes.pop();
    const depth = pathDepth[level];
    depths[ordinal] = depth;
    if (level && depth + 1 > pathDepth[level - 1]) {
      pathDepth[level - 1] = depth + 1;
    }
  }
}

function applyTransformOrder(root, order, factory, resolve, done) {
  const get = (value) =>
    value && typeof value === "object" ? done.get(value) : value;
  for (let idx = 0; idx < order.length; idx += 1) {
    const value = order[idx];
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
}

/** Iterative postorder avoids a call-stack limit and rejects manufactured cycles.
 * Rebuild through the canonical factory, preserving normalized singleton sets.
 * resolve() handles entities atomically so raw IRI maps cannot rename a punned
 * entity that is absent from a typed map.
 */
export const transformObject = (root, factory, resolve, doneArg) => {
  const maxDepth =
    readDataFactoryBehaviorDefinition(factory).computationResourcePolicy
      .maxTransformDepth;
  if (!isFactoryStructuralObject(root)) {
    const order = validateStructuralGraph(
      root,
      TRANSFORMABLE_KINDS_SET,
      maxDepth,
    );
    return applyTransformOrder(
      root,
      order,
      factory,
      resolve,
      doneArg ?? new Map(),
    );
  }

  const usePool = !doneArg && !txBusy;
  const seen = usePool ? txSeen : new Map();
  const nodes = usePool ? txNodes : [];
  const positions = usePool ? txPos : [];
  const fields = usePool ? txFields : [];
  const pathDepth = usePool ? txPathDepth : [];
  const depths = usePool ? txDepths : [];
  const order = usePool ? txOrder : [];
  const done = usePool ? txDone : (doneArg ?? new Map());
  if (usePool) {
    txBusy = true;
    seen.clear();
    nodes.length = 0;
    order.length = 0;
    done.clear();
  }
  try {
    fillFactoryTransformOrder(
      root,
      TRANSFORMABLE_KINDS_SET,
      maxDepth,
      seen,
      nodes,
      positions,
      fields,
      pathDepth,
      depths,
      order,
    );
    return applyTransformOrder(root, order, factory, resolve, done);
  } finally {
    if (usePool) {
      seen.clear();
      nodes.length = 0;
      positions.length = 0;
      fields.length = 0;
      pathDepth.length = 0;
      depths.length = 0;
      order.length = 0;
      done.clear();
      txBusy = false;
    }
  }
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

export const entityResolver = (factory, entities, iris) => {
  const cache = new WeakMap();
  let nativeEntitiesByKind;
  let nativeIris;
  if (entities.size > 0) {
    nativeEntitiesByKind = new Map();
    for (const entry of entities.values()) {
      const { key, value } = entry;
      if (!isFactoryStructuralObject(key)) {
        nativeEntitiesByKind = undefined;
        break;
      }
      let byIri = nativeEntitiesByKind.get(key.kind);
      if (!byIri) {
        byIri = new Map();
        nativeEntitiesByKind.set(key.kind, byIri);
      }
      byIri.set(key.iri.value, value);
    }
  }
  if (iris.size > 0) {
    nativeIris = new Map();
    for (const [iriKey, replacement] of iris) {
      if (iriKey.startsWith('["IRI",') && iriKey.endsWith("]")) {
        try {
          const parsed = JSON.parse(iriKey);
          if (
            Array.isArray(parsed) &&
            parsed.length === 2 &&
            parsed[0] === "IRI" &&
            typeof parsed[1] === "string"
          ) {
            nativeIris.set(parsed[1], replacement);
            continue;
          }
        } catch {
          nativeIris = undefined;
          break;
        }
      }
      nativeIris = undefined;
      break;
    }
  }
  return (value) => {
    if (ENTITY_KINDS_SET.has(value.kind)) {
      if (entities.size === 0) return value;
      const isNative =
        isFactoryStructuralObject(value) && usesNativeStructuralKeys();
      if (isNative) {
        const hit = cache.get(value);
        if (hit !== undefined) return hit;
        if (nativeEntitiesByKind !== undefined) {
          const iri = nativeEntitiesByKind
            .get(value.kind)
            ?.get(value.iri.value);
          const out = iri ? factory[`get${value.kind}`](iri) : value;
          cache.set(value, out);
          return out;
        }
      }
      const replacement = entities.get(value.structuralKey());
      const out = replacement
        ? factory[`get${value.kind}`](replacement.value)
        : value;
      if (isNative) cache.set(value, out);
      return out;
    }
    if (value.kind === K.IRI) {
      if (iris.size === 0) return value;
      const isNative =
        isFactoryStructuralObject(value) && usesNativeStructuralKeys();
      if (isNative) {
        const hit = cache.get(value);
        if (hit !== undefined) return hit;
        if (nativeIris !== undefined) {
          const out = nativeIris.get(value.value) ?? value;
          cache.set(value, out);
          return out;
        }
      }
      const out = iris.get(value.structuralKey()) ?? value;
      if (isNative) cache.set(value, out);
      return out;
    }
    return undefined;
  };
};
