import {
  AXIOM_KINDS,
  ENTITY_KINDS,
  OWL_OBJECT_KINDS,
  OWLObjectKind,
} from "../../model/kinds.js";
import {
  EMPTY_STRUCTURAL_SET,
  isFactoryStructuralObject,
  usesNativeStructuralKeys,
} from "../../model/structural.js";
import { StructuralHashTable } from "../../internal/collections/structuralHashTable.js";
import { captureStructuralKey } from "../../internal/collections/structuralProjection.js";
import { DenseBitSet } from "../../internal/collections/denseBitSet.js";
import { inspectStructuralGraph } from "../../internal/model/structuralValidation.js";
import { structuralFields } from "../../internal/model/structuralFields.js";
import { collectPostings } from "../../internal/model/structuralPostings.js";
import { createLocalityBudget } from "../../internal/modularity/localityBudget.js";
import { isSyntacticallyLocal } from "../../internal/modularity/syntacticLocality.js";
import { isLogicalAxiom } from "../../internal/model/axiomSemantics.js";
import { LocalityClass } from "./localityClass.js";

const kinds = new Set(OWL_OBJECT_KINDS),
  axioms = new Set(AXIOM_KINDS),
  entities = new Set(ENTITY_KINDS),
  classes = new Set([
    OWLObjectKind.CLASS,
    OWLObjectKind.OBJECT_INTERSECTION_OF,
    OWLObjectKind.OBJECT_UNION_OF,
    OWLObjectKind.OBJECT_COMPLEMENT_OF,
    OWLObjectKind.OBJECT_ONE_OF,
    OWLObjectKind.OBJECT_SOME_VALUES_FROM,
    OWLObjectKind.OBJECT_ALL_VALUES_FROM,
    OWLObjectKind.OBJECT_HAS_VALUE,
    OWLObjectKind.OBJECT_HAS_SELF,
    OWLObjectKind.OBJECT_MIN_CARDINALITY,
    OWLObjectKind.OBJECT_MAX_CARDINALITY,
    OWLObjectKind.OBJECT_EXACT_CARDINALITY,
    OWLObjectKind.DATA_SOME_VALUES_FROM,
    OWLObjectKind.DATA_ALL_VALUES_FROM,
    OWLObjectKind.DATA_HAS_VALUE,
    OWLObjectKind.DATA_MIN_CARDINALITY,
    OWLObjectKind.DATA_MAX_CARDINALITY,
    OWLObjectKind.DATA_EXACT_CARDINALITY,
  ]),
  EMPTY_CLASS_ORDER = Object.freeze([]);

function createClassOrderCollector() {
  const seen = new Set(),
    nodes = [],
    positions = [],
    fields = [];
  const visitRoot = (root, order) => {
    if (seen.has(root)) return;
    if (root.kind === OWLObjectKind.CLASS) {
      seen.add(root);
      order.push(root);
      return;
    }
    seen.add(root);
    nodes.length = 1;
    positions.length = 1;
    fields.length = 1;
    nodes[0] = root;
    positions[0] = 0;
    fields[0] = structuralFields.get(root.kind);
    while (nodes.length) {
      const level = nodes.length - 1,
        node = nodes[level],
        names = fields[level],
        index = positions[level];
      const length = names ? names.length : node.length;
      if (index < length) {
        positions[level]++;
        const child = node[names ? names[index] : index];
        if (
          child &&
          typeof child === "object" &&
          !seen.has(child) &&
          (Array.isArray(child) || classes.has(child.kind))
        ) {
          if (child === EMPTY_STRUCTURAL_SET) continue;
          if (Array.isArray(child)) {
            seen.add(child);
            nodes.push(child);
            positions.push(0);
            fields.push(undefined);
          } else if (child.kind === OWLObjectKind.CLASS) {
            seen.add(child);
            order.push(child);
          } else {
            seen.add(child);
            nodes.push(child);
            positions.push(0);
            fields.push(structuralFields.get(child.kind));
          }
        }
        continue;
      }
      nodes.pop();
      positions.pop();
      fields.pop();
      if (!Array.isArray(node)) {
        order.push(node);
      }
    }
  };
  return (axiom) => {
    switch (axiom.kind) {
      case OWLObjectKind.SUBCLASS_OF_AXIOM:
        if (
          axiom.subClass.kind === OWLObjectKind.CLASS &&
          axiom.superClass.kind === OWLObjectKind.CLASS
        ) {
          return EMPTY_CLASS_ORDER;
        }
        break;
      case OWLObjectKind.CLASS_ASSERTION_AXIOM:
      case OWLObjectKind.DISJOINT_CLASSES_AXIOM:
      case OWLObjectKind.EQUIVALENT_CLASSES_AXIOM:
      case OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM:
      case OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM:
        break;
      default:
        return EMPTY_CLASS_ORDER;
    }
    seen.clear();
    const order = [];
    if (axiom.subClass) visitRoot(axiom.subClass, order);
    if (axiom.superClass) visitRoot(axiom.superClass, order);
    if (axiom.classExpression) visitRoot(axiom.classExpression, order);
    if (axiom.domain) visitRoot(axiom.domain, order);
    if (axiom.range) visitRoot(axiom.range, order);
    if (axiom.classExpressions) {
      for (let i = 0; i < axiom.classExpressions.length; i++) {
        visitRoot(axiom.classExpressions[i], order);
      }
    }
    return order;
  };
}
function admit(value) {
  try {
    return inspectStructuralGraph(value, kinds);
  } catch (error) {
    throw new TypeError(
      "Expected an immutable supported OWL structural object",
      { cause: error },
    );
  }
}

// Factory proof or full external admission has established acyclic, data-only
// nodes. Reuse scratch across roots. A shared child inherits its completed
// height on every parent edge while being charged only once as a distinct node.
function traversalWorkspace(measure) {
  const seen = new Map(),
    nodes = [],
    positions = [],
    fields = [],
    order = [];
  const pathDepth = [],
    pathAnnotations = [],
    depths = [],
    annotations = [];
  const facts = { order, depth: 0, annotations: 0, work: 0 };

  function enter(node) {
    const level = nodes.length;
    seen.set(node, -1);
    nodes.push(node);
    positions[level] = 0;
    fields[level] = Array.isArray(node)
      ? undefined
      : structuralFields.get(node.kind);
    if (measure) {
      pathDepth[level] = 0;
      pathAnnotations[level] = 0;
    }
  }
  function includeChild(level, depth, annotationDepth) {
    pathDepth[level] = Math.max(pathDepth[level], depth + 1);
    pathAnnotations[level] = Math.max(pathAnnotations[level], annotationDepth);
  }
  return (root) => {
    seen.clear();
    order.length = 0;
    facts.work = 0;
    enter(root);
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
              const ordinal = order.length;
              seen.set(child, ordinal);
              order.push(child);
              if (measure) {
                depths[ordinal] = 0;
                annotations[ordinal] = 0;
                facts.work += 1;
                includeChild(level, 0, 0);
              }
            } else if (child.kind === OWLObjectKind.IRI) {
              const ordinal = order.length;
              seen.set(child, ordinal);
              order.push(child);
              if (measure) {
                depths[ordinal] = 0;
                annotations[ordinal] = 0;
                facts.work += 2;
                includeChild(level, 0, 0);
              }
            } else {
              enter(child);
            }
          } else if (measure) {
            includeChild(level, depths[previous], annotations[previous]);
          }
        }
        continue;
      }
      const ordinal = order.length;
      seen.set(node, ordinal);
      order.push(node);
      nodes.pop();
      if (measure) {
        const depth = pathDepth[level],
          annotationDepth =
            pathAnnotations[level] +
            Number(node.kind === OWLObjectKind.ANNOTATION);
        depths[ordinal] = depth;
        annotations[ordinal] = annotationDepth;
        facts.work += 1 + length;
        if (level) {
          includeChild(level - 1, depth, annotationDepth);
        } else {
          facts.depth = depth;
          facts.annotations = annotationDepth;
        }
      }
    }
    return facts;
  };
}

const entityStackNodes = [];
const entityStackFields = [];
const entityStackPos = [];
function collectFactoryEntities(root, emitEntity) {
  entityStackNodes.length = 1;
  entityStackFields.length = 1;
  entityStackPos.length = 1;
  entityStackNodes[0] = root;
  entityStackFields[0] = structuralFields.get(root.kind);
  entityStackPos[0] = 0;
  try {
    while (entityStackNodes.length) {
      const level = entityStackNodes.length - 1;
      const node = entityStackNodes[level];
      const names = entityStackFields[level];
      const index = entityStackPos[level];
      const length = names ? names.length : node.length;
      if (index < length) {
        entityStackPos[level] = index + 1;
        const child = node[names ? names[index] : index];
        if (
          !child ||
          typeof child !== "object" ||
          child === EMPTY_STRUCTURAL_SET
        ) {
          continue;
        }
        if (Array.isArray(child)) {
          entityStackNodes.push(child);
          entityStackFields.push(undefined);
          entityStackPos.push(0);
          continue;
        }
        const kind = child.kind;
        if (kind === OWLObjectKind.IRI) continue;
        if (entities.has(kind)) {
          emitEntity(child);
          continue;
        }
        const childFields = structuralFields.get(kind);
        if (childFields) {
          entityStackNodes.push(child);
          entityStackFields.push(childFields);
          entityStackPos.push(0);
        }
        continue;
      }
      entityStackNodes.pop();
      entityStackFields.pop();
      entityStackPos.pop();
    }
  } finally {
    entityStackNodes.length = 0;
    entityStackFields.length = 0;
    entityStackPos.length = 0;
  }
}

/** Captured syntactic-locality axiom base with structural set equality.
 * Constructor and query methods are synchronous; extract returns a fresh eager
 * axiom array asynchronously. Input capture never acquires ontology documents.
 * No numerical cap is imposed by default, matching the pinned Java API.
 */
export class SyntacticLocalityModuleExtractor {
  #mode;
  #base = new StructuralHashTable();
  #entities = new StructuralHashTable();
  #entityIds = new WeakMap();
  #index;
  #nonFactoryFacts;
  #depth;
  #annotationDepth;
  #work;
  #nodeCounts;
  #entityOffsets;
  #entityEntries;
  #classOrders;
  #classOrderCollector;
  #ensureMetrics() {
    if (this.#depth) return;
    const size = this.#base.size;
    const depths = new Uint32Array(size);
    const annotationDepths = new Uint32Array(size);
    const work = new Float64Array(size);
    const nodeCounts = new Uint32Array(size);
    const inspectFactoryGraph = traversalWorkspace(true);
    const nonFactory = this.#nonFactoryFacts;
    const offsets = this.#entityOffsets;
    for (let id = 0; id < size; id++) {
      const nonFactoryEntry = nonFactory?.get(id);
      const facts =
        nonFactoryEntry ?? inspectFactoryGraph(this.#base.valueAt(id));
      depths[id] = facts.depth;
      annotationDepths[id] = facts.annotations;
      nodeCounts[id] = facts.nodeCount ?? facts.order.length;
      work[id] = facts.work + (offsets[id + 1] - offsets[id]);
    }
    this.#depth = depths;
    this.#annotationDepth = annotationDepths;
    this.#work = work;
    this.#nodeCounts = nodeCounts;
    this.#nonFactoryFacts = undefined;
  }
  #entityIdOf(entity) {
    if (isFactoryStructuralObject(entity) && usesNativeStructuralKeys()) {
      const cached = this.#entityIds.get(entity);
      if (cached !== undefined) {
        return cached;
      }
      const id = this.#entities.idOf(entity);
      if (id >= 0) {
        this.#entityIds.set(entity, id);
      }
      return id;
    }
    return this.#entities.idOf(entity);
  }
  #classOrderOf(id, axiom) {
    let order = this.#classOrders[id];
    if (order === undefined) {
      order = (this.#classOrderCollector ??= createClassOrderCollector())(
        axiom,
      );
      this.#classOrders[id] = order;
    }
    return order;
  }
  constructor(localityClass, axiomIterable) {
    if (!Object.values(LocalityClass).includes(localityClass)) {
      throw new TypeError("Unknown locality class");
    }
    if (
      !axiomIterable ||
      typeof axiomIterable[Symbol.iterator] !== "function"
    ) {
      throw new TypeError("Axiom base must be iterable");
    }
    this.#mode = localityClass;
    const sigOffsets = [0],
      sigEntities = [];
    let nonFactoryFacts;
    const useNativeEntities = usesNativeStructuralKeys();
    const factoryEntityIds = new Map();
    const resolveNativeEntity = (entity) => {
      let eid = factoryEntityIds.get(entity);
      if (eid === undefined) {
        eid = this.#entities.add(entity);
        factoryEntityIds.set(entity, eid);
        this.#entityIds.set(entity, eid);
      }
      return eid;
    };
    this.#index = collectPostings(this.#entities, (emit) => {
      for (const axiom of axiomIterable) {
        if (!axioms.has(axiom?.kind)) {
          throw new TypeError("Axiom base must contain OWL axioms");
        }
        const factoryAxiom = isFactoryStructuralObject(axiom);
        const facts = factoryAxiom ? undefined : admit(axiom),
          size = this.#base.size,
          id = this.#base.add(axiom);
        if (id < size) {
          continue;
        }
        if (factoryAxiom && useNativeEntities) {
          const emitNativeEntity = (entity) => {
            const eid = resolveNativeEntity(entity);
            if (emit.id(eid, id)) {
              sigEntities.push(eid);
            }
          };
          const unannotated = axiom.annotations === EMPTY_STRUCTURAL_SET;
          if (
            unannotated &&
            axiom.kind === OWLObjectKind.DECLARATION_AXIOM &&
            entities.has(axiom.entity.kind)
          ) {
            emitNativeEntity(axiom.entity);
          } else if (
            unannotated &&
            axiom.kind === OWLObjectKind.SUBCLASS_OF_AXIOM &&
            axiom.subClass.kind === OWLObjectKind.CLASS &&
            axiom.superClass.kind === OWLObjectKind.CLASS
          ) {
            emitNativeEntity(axiom.subClass);
            if (axiom.superClass !== axiom.subClass) {
              emitNativeEntity(axiom.superClass);
            }
          } else if (
            unannotated &&
            axiom.kind === OWLObjectKind.CLASS_ASSERTION_AXIOM &&
            axiom.classExpression.kind === OWLObjectKind.CLASS &&
            axiom.individual.kind === OWLObjectKind.NAMED_INDIVIDUAL
          ) {
            emitNativeEntity(axiom.classExpression);
            emitNativeEntity(axiom.individual);
          } else if (
            unannotated &&
            axiom.kind === OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM &&
            axiom.property.kind === OWLObjectKind.OBJECT_PROPERTY &&
            axiom.range.kind === OWLObjectKind.CLASS
          ) {
            emitNativeEntity(axiom.property);
            emitNativeEntity(axiom.range);
          } else if (
            unannotated &&
            axiom.kind === OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM &&
            axiom.property.kind === OWLObjectKind.OBJECT_PROPERTY &&
            axiom.domain.kind === OWLObjectKind.CLASS
          ) {
            emitNativeEntity(axiom.property);
            emitNativeEntity(axiom.domain);
          } else {
            collectFactoryEntities(axiom, emitNativeEntity);
          }
          sigOffsets.push(sigEntities.length);
          continue;
        }
        const inspected = facts ?? traversalWorkspace(true)(axiom);
        const order = inspected.order;
        for (let i = 0; i < order.length; i++) {
          const value = order[i];
          if (entities.has(value.kind)) {
            if (useNativeEntities && factoryAxiom) {
              const eid = resolveNativeEntity(value);
              if (emit.id(eid, id)) {
                sigEntities.push(eid);
              }
            } else {
              const key = captureStructuralKey(value);
              if (emit(value, id, key)) {
                sigEntities.push(
                  key === value
                    ? this.#entities.idOf(value)
                    : this.#entities.idOfCapturedKey(key),
                );
              }
            }
          }
        }
        sigOffsets.push(sigEntities.length);
        if (!factoryAxiom) {
          nonFactoryFacts ??= new Map();
          nonFactoryFacts.set(id, {
            depth: inspected.depth,
            annotations: inspected.annotations,
            nodeCount: order.length,
            work: inspected.work,
          });
        }
      }
    });
    this.#nonFactoryFacts = nonFactoryFacts;
    this.#entityOffsets = Int32Array.from(sigOffsets);
    this.#entityEntries = Uint32Array.from(sigEntities);
    this.#classOrders = new Array(this.#base.size);
  }

  /** Defensive eager copy of all captured axioms, including nonlogical axioms. */
  axiomBase() {
    return [...this.#base];
  }
  /** Structural membership, including independently created equivalent axioms. */
  containsAxiom(axiom) {
    if (!axioms.has(axiom?.kind)) {
      throw new TypeError("Expected an OWL axiom");
    }
    if (!isFactoryStructuralObject(axiom)) {
      admit(axiom);
    }
    return this.#base.idOf(axiom) >= 0;
  }
  getLocalityClass() {
    return this.#mode;
  }

  /** A filter runs before propagation. Depth, cancellation and work limits
   * apply to the original base. STAR shrinks its active members while retaining
   * the original signature postings and discovery order. */
  async extract(seedIterable, filter, options) {
    const budget = createLocalityBudget(options);
    if (filter !== undefined && typeof filter !== "function") {
      throw new TypeError("Locality filter must be a function");
    }
    if (!seedIterable || typeof seedIterable[Symbol.iterator] !== "function") {
      throw new TypeError("Seed must be iterable");
    }
    await budget.checkpoint();
    budget.limit("maxAxioms", this.#base.size);
    const { maxDepth, maxAnnotationDepth, maxWork, timeoutMs, signal } =
      budget.configuration;
    const hasMetricLimits =
      maxDepth !== null || maxAnnotationDepth !== null || maxWork !== null;
    const hasBudgetGuards =
      hasMetricLimits || signal !== undefined || timeoutMs !== null;
    let traversal;
    const orderedNodes = (value) =>
      (traversal ??= traversalWorkspace(false))(value).order;
    const seeds = [],
      seedBits = new DenseBitSet(this.#entities.size);
    for (const entity of seedIterable) {
      budget.check();
      if (!entities.has(entity?.kind)) {
        throw new TypeError("Seed must contain typed OWL entities");
      }
      if (maxWork !== null) {
        budget.check(
          isFactoryStructuralObject(entity)
            ? orderedNodes(entity).length
            : admit(entity).order.length,
        );
      } else {
        if (!isFactoryStructuralObject(entity)) admit(entity);
        budget.check(1);
      }
      const id = this.#entityIdOf(entity);
      if (id < 0) {
        throw new TypeError(
          "Seed entity is absent from the captured axiom base",
        );
      }
      if (seedBits.add(id)) {
        seeds.push(id);
      }
      if (budget.shouldYield()) {
        await budget.yieldTurn();
      }
    }
    if (!seeds.length) {
      return [];
    }
    if (hasMetricLimits) {
      this.#ensureMetrics();
      for (let id = 0; id < this.#base.size; id++) {
        budget.check();
        budget.limit("maxDepth", this.#depth[id]);
        budget.limit("maxAnnotationDepth", this.#annotationDepth[id]);
        budget.check(this.#work[id]);
        if (budget.shouldYield()) {
          await budget.yieldTurn();
        }
      }
    } else if (hasBudgetGuards) {
      for (let id = 0; id < this.#base.size; id++) {
        budget.check();
        if (budget.shouldYield()) {
          await budget.yieldTurn();
        }
      }
    }
    let selected;
    if (filter !== undefined || hasBudgetGuards) {
      selected = new DenseBitSet(this.#base.size);
      for (let id = 0; id < this.#base.size; id++) {
        budget.check();
        const include =
          filter === undefined ? true : filter(this.#base.valueAt(id));
        budget.check(0);
        if (typeof include !== "boolean") {
          throw new TypeError(
            "Locality filter must return a synchronous boolean",
          );
        }
        if (include) {
          selected.add(id);
        }
        if (budget.shouldYield()) {
          await budget.yieldTurn();
        }
      }
    }

    const pass = async (mode, base) => {
      const signature = seedBits.clone(),
        queue = seeds.slice(),
        mask = new DenseBitSet(this.#base.size),
        order = [],
        localityResults = new Map();
      const contains = (entity) => signature.has(this.#entityIdOf(entity));
      const { offsets, entries } = this.#index;
      const nodeCounts = this.#nodeCounts;
      const entityOffsets = this.#entityOffsets;
      const entityEntries = this.#entityEntries;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        budget.check();
        const entity = queue[cursor];
        for (let i = offsets[entity]; i < offsets[entity + 1]; i++) {
          budget.check();
          if (budget.shouldYield()) {
            await budget.yieldTurn();
          }
          const id = entries[i];
          if ((base !== undefined && !base.has(id)) || mask.has(id)) {
            continue;
          }
          const axiom = this.#base.valueAt(id);
          if (!isLogicalAxiom(axiom)) {
            continue;
          }
          const classOrder = this.#classOrderOf(id, axiom);
          if (
            isSyntacticallyLocal(
              axiom,
              classOrder,
              contains,
              mode,
              budget,
              localityResults,
              nodeCounts ? nodeCounts[id] + 1 : 1,
            )
          ) {
            continue;
          }
          mask.add(id);
          order.push(id);
          const sigEnd = entityOffsets[id + 1];
          for (let s = entityOffsets[id]; s < sigEnd; s++) {
            budget.check();
            const member = entityEntries[s];
            if (signature.add(member)) {
              queue.push(member);
            }
          }
        }
      }
      return { mask, order };
    };
    let active;
    if (this.#mode !== LocalityClass.STAR) {
      active = await pass(this.#mode, selected);
    } else {
      active = await pass(LocalityClass.BOTTOM, selected);
      let mode = LocalityClass.TOP;
      for (;;) {
        budget.check();
        if (budget.shouldYield()) {
          await budget.yieldTurn();
        }
        const next = await pass(mode, active.mask);
        if (next.mask.size === active.mask.size) {
          active = next;
          break;
        }
        active = next;
        mode =
          mode === LocalityClass.TOP ? LocalityClass.BOTTOM : LocalityClass.TOP;
      }
    }
    const result = [];
    for (const id of active.order) {
      budget.check();
      result.push(this.#base.valueAt(id));
    }
    budget.check(0);
    return result;
  }
}
