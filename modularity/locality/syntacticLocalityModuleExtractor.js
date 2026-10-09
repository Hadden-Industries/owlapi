import {
  AXIOM_KINDS,
  ENTITY_KINDS,
  OWL_OBJECT_KINDS,
  OWLObjectKind as K,
} from "../../model/kinds.js";
import { OWLStructuralObject } from "../../model/structural.js";
import { validateStructuralGraph } from "../../internal/model/structuralValidation.js";
import { structuralFields } from "../../internal/model/structuralFields.js";
import { createLocalityBudget } from "../../internal/modularity/localityBudget.js";
import { isSyntacticallyLocal } from "../../internal/modularity/syntacticLocality.js";
import { LocalityClass } from "./localityClass.js";

const kinds = new Set(OWL_OBJECT_KINDS),
  axioms = new Set(AXIOM_KINDS),
  entities = new Set(ENTITY_KINDS);
const keyOf = (value) =>
  OWLStructuralObject.prototype.structuralKey.call(value);
const children = (value) =>
  Array.isArray(value)
    ? value
    : structuralFields.get(value.kind).map((field) => value[field]);
const validatedOrder = (value) => {
  try {
    return validateStructuralGraph(value, kinds, Infinity, Infinity);
  } catch (error) {
    throw new TypeError(
      "Expected an immutable supported OWL structural object",
      { cause: error },
    );
  }
};

/** Captured syntactic-locality axiom base with structural set equality.
 * Constructor and query methods are synchronous; extract returns a fresh eager
 * axiom array asynchronously. Input capture never acquires ontology documents.
 * No numerical cap is imposed by default, matching the pinned Java API.
 */
export class SyntacticLocalityModuleExtractor {
  #mode;
  #base = new Map();
  #index = new Map();
  constructor(localityClass, axiomIterable) {
    if (!Object.values(LocalityClass).includes(localityClass))
      throw new TypeError("Unknown locality class");
    if (!axiomIterable || typeof axiomIterable[Symbol.iterator] !== "function")
      throw new TypeError("Axiom base must be iterable");
    this.#mode = localityClass;
    for (const axiom of axiomIterable) {
      if (!axioms.has(axiom?.kind))
        throw new TypeError("Axiom base must contain OWL axioms");
      const order = validatedOrder(axiom),
        key = keyOf(axiom);
      if (this.#base.has(key)) continue;
      const signature = new Set(),
        heights = new Map();
      for (const value of order) {
        let depth = 0,
          annotations = 0;
        for (const child of children(value)) {
          const height = heights.get(child);
          if (!height) continue;
          depth = Math.max(depth, height.depth + 1);
          annotations = Math.max(annotations, height.annotations);
        }
        annotations += value.kind === K.ANNOTATION ? 1 : 0;
        heights.set(value, { depth, annotations });
        if (entities.has(value.kind)) signature.add(keyOf(value));
      }
      const height = heights.get(axiom);
      const entry = { axiom, key, order, signature, ...height };
      this.#base.set(key, entry);
      for (const entity of signature) {
        if (!this.#index.has(entity)) this.#index.set(entity, new Set());
        this.#index.get(entity).add(entry);
      }
    }
  }

  /** Defensive eager copy of all captured axioms, including nonlogical axioms. */
  axiomBase() {
    return [...this.#base.values()].map(({ axiom }) => axiom);
  }
  /** Structural membership, including independently created equivalent axioms. */
  containsAxiom(axiom) {
    if (!axioms.has(axiom?.kind)) throw new TypeError("Expected an OWL axiom");
    validatedOrder(axiom);
    return this.#base.has(keyOf(axiom));
  }
  getLocalityClass() {
    return this.#mode;
  }

  /** Extract a module for typed entity seeds. filter is an optional synchronous
   * boolean predicate captured before use and applied before propagation.
   * options: signal, timeoutMs, maxWork, maxAxioms, maxDepth, maxAnnotationDepth;
   * every numerical option defaults to null (unlimited). Explicit exhaustion,
   * cancellation, absent seeds and invalid callbacks reject without a module.
   * STAR retains the original signature index while shrinking the active base.
   */
  async extract(seedIterable, filter, options) {
    const budget = createLocalityBudget(options);
    if (filter !== undefined && typeof filter !== "function")
      throw new TypeError("Locality filter must be a function");
    if (!seedIterable || typeof seedIterable[Symbol.iterator] !== "function")
      throw new TypeError("Seed must be iterable");
    await budget.checkpoint();
    budget.limit("maxAxioms", this.#base.size);
    const seed = new Set();
    for (const entity of seedIterable) {
      await budget.checkpoint();
      if (!entities.has(entity?.kind))
        throw new TypeError("Seed must contain typed OWL entities");
      const order = validatedOrder(entity);
      for (let index = 0; index < order.length; index++)
        await budget.checkpoint();
      const key = keyOf(entity);
      // Java dereferences a missing signature index entry. Adapt that failure to
      // TypeError, rather than silently return a misleading empty module.
      if (!this.#index.has(key))
        throw new TypeError(
          "Seed entity is absent from the captured axiom base",
        );
      seed.add(key);
    }
    // All admission precedes callbacks, including optional limits on the full
    // original base. Count edges as well as unique DAG nodes, never just roots.
    for (const entry of this.#base.values()) {
      await budget.checkpoint();
      budget.limit("maxDepth", entry.depth);
      budget.limit("maxAnnotationDepth", entry.annotations);
      for (const value of entry.order) {
        await budget.checkpoint();
        const values = children(value);
        for (let index = 0; index < values.length; index++)
          await budget.checkpoint();
      }
      for (let index = 0; index < entry.signature.size; index++)
        await budget.checkpoint();
    }
    let active = new Set();
    for (const entry of this.#base.values()) {
      await budget.checkpoint();
      const selected = filter === undefined ? true : filter(entry.axiom);
      budget.check(0);
      if (typeof selected !== "boolean")
        throw new TypeError(
          "Locality filter must return a synchronous boolean",
        );
      if (selected) active.add(entry.key);
    }
    const pass = async (mode, base) => {
      const signature = new Set(seed),
        queue = [...seed],
        module = new Set();
      for (let cursor = 0; cursor < queue.length; cursor++) {
        await budget.checkpoint();
        for (const entry of this.#index.get(queue[cursor])) {
          await budget.checkpoint();
          if (!base.has(entry.key) || module.has(entry.key)) continue;
          if (
            await isSyntacticallyLocal(
              entry.axiom,
              entry.order,
              signature,
              mode,
              budget,
            )
          )
            continue;
          module.add(entry.key);
          for (const entity of entry.signature) {
            await budget.checkpoint();
            if (!signature.has(entity)) {
              signature.add(entity);
              queue.push(entity);
            }
          }
        }
      }
      return module;
    };
    if (this.#mode !== LocalityClass.STAR)
      active = await pass(this.#mode, active);
    else {
      active = await pass(LocalityClass.BOTTOM, active);
      let mode = LocalityClass.TOP;
      while (true) {
        await budget.checkpoint();
        const next = await pass(mode, active);
        if (next.size === active.size) {
          active = next;
          break;
        }
        active = next;
        mode =
          mode === LocalityClass.TOP ? LocalityClass.BOTTOM : LocalityClass.TOP;
      }
    }
    const result = [];
    for (const key of active) {
      await budget.checkpoint();
      result.push(this.#base.get(key).axiom);
    }
    budget.check(0);
    return result;
  }
}
