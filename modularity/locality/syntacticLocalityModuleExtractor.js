import {
  AXIOM_KINDS,
  ENTITY_KINDS,
  OWL_OBJECT_KINDS,
  OWLObjectKind,
} from "../../model/kinds.js";
import { isFactoryStructuralObject } from "../../model/structural.js";
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
  entities = new Set(ENTITY_KINDS);
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
            enter(child);
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

/** Captured syntactic-locality axiom base with structural set equality.
 * Constructor and query methods are synchronous; extract returns a fresh eager
 * axiom array asynchronously. Input capture never acquires ontology documents.
 * No numerical cap is imposed by default, matching the pinned Java API.
 */
export class SyntacticLocalityModuleExtractor {
  #mode;
  #base = new StructuralHashTable();
  #entities = new StructuralHashTable();
  #index;
  #depth;
  #annotationDepth;
  #work;
  #explicitSignatures;
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
    const depths = [],
      annotationDepths = [],
      work = [],
      keys = [];
    const inspectFactoryGraph = traversalWorkspace(true);
    this.#index = collectPostings(this.#entities, (emit) => {
      for (const axiom of axiomIterable) {
        if (!axioms.has(axiom?.kind)) {
          throw new TypeError("Axiom base must contain OWL axioms");
        }
        const facts = isFactoryStructuralObject(axiom)
            ? inspectFactoryGraph(axiom)
            : admit(axiom),
          size = this.#base.size,
          id = this.#base.add(axiom);
        if (id < size) {
          continue;
        }
        keys.length = 0;
        let explicit = false;
        for (const value of facts.order) {
          if (entities.has(value.kind)) {
            const key = captureStructuralKey(value);
            if (key !== value) {
              explicit = true;
            }
            if (emit(value, id, key)) {
              keys.push(key);
            }
          }
        }
        if (explicit) {
          (this.#explicitSignatures ??= new Map()).set(
            id,
            Uint32Array.from(keys, (key) =>
              this.#entities.idOfCapturedKey(key),
            ),
          );
        }
        depths.push(facts.depth);
        annotationDepths.push(facts.annotations);
        work.push(facts.work + keys.length);
      }
    });
    this.#depth = Uint32Array.from(depths);
    this.#annotationDepth = Uint32Array.from(annotationDepths);
    this.#work = Float64Array.from(work);
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
      budget.check(
        isFactoryStructuralObject(entity)
          ? orderedNodes(entity).length
          : admit(entity).order.length,
      );
      const id = this.#entities.idOf(entity);
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
    for (let id = 0; id < this.#base.size; id++) {
      budget.check();
      budget.limit("maxDepth", this.#depth[id]);
      budget.limit("maxAnnotationDepth", this.#annotationDepth[id]);
      budget.check(this.#work[id]);
      if (budget.shouldYield()) {
        await budget.yieldTurn();
      }
    }
    const selected = new DenseBitSet(this.#base.size);
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

    const pass = async (mode, base) => {
      const signature = seedBits.clone(),
        queue = seeds.slice(),
        mask = new DenseBitSet(this.#base.size),
        order = [];
      const contains = (entity) => signature.has(this.#entities.idOf(entity));
      const seenEntities = new Set();
      const { offsets, entries } = this.#index;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        budget.check();
        const entity = queue[cursor];
        for (let i = offsets[entity]; i < offsets[entity + 1]; i++) {
          budget.check();
          if (budget.shouldYield()) {
            await budget.yieldTurn();
          }
          const id = entries[i];
          if (!base.has(id) || mask.has(id)) {
            continue;
          }
          const axiom = this.#base.valueAt(id);
          if (!isLogicalAxiom(axiom)) {
            continue;
          }
          const nodes = orderedNodes(axiom);
          if (isSyntacticallyLocal(axiom, nodes, contains, mode, budget)) {
            continue;
          }
          mask.add(id);
          order.push(id);
          const explicit = this.#explicitSignatures?.get(id);
          seenEntities.clear();
          if (!explicit) {
            for (const value of nodes) {
              if (entities.has(value.kind)) {
                seenEntities.add(this.#entities.idOfCapturedKey(value));
              }
            }
          }
          for (const member of explicit ?? seenEntities) {
            budget.check();
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
