import { ResourceLimitError } from "../../io/errors.js";
import { StructuralAxiomSet } from "./axiomSemantics.js";

const records = new WeakMap();

/** The parser owns this axiom table until one state or draft takes it. */
export class OntologyBuildBuffer {
  constructor(maxAxioms) {
    records.set(this, { axioms: new StructuralAxiomSet(), maxAxioms });
  }

  get size() {
    return records.get(this).axioms.size;
  }

  has(axiom) {
    return records.get(this).axioms.has(axiom);
  }

  add(axiom) {
    const { axioms, maxAxioms } = records.get(this);
    if (axioms.size >= maxAxioms && !axioms.has(axiom)) {
      throw new ResourceLimitError("The ontology axiom limit was exceeded", {
        limit: maxAxioms,
        resource: "maxAxioms",
      });
    }
    return axioms.add(axiom);
  }

  [Symbol.iterator]() {
    return records.get(this).axioms.values();
  }

  reverseValues() {
    return records.get(this).axioms.reverseValues();
  }
}

export const isOntologyBuildBuffer = (value) => records.has(value);

/** The receiving state alone may mutate the transferred, already admitted values. */
export function takeOntologyBuildAxioms(buffer) {
  const record = records.get(buffer);
  if (!record?.axioms)
    throw new TypeError("Expected an open ontology build buffer");
  const { axioms } = record;
  record.axioms = undefined;
  return axioms;
}
