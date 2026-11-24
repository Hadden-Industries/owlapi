import { compareStructuralValues } from "../collections/structuralComparator.js";
import { readSnapshotAxioms } from "../model/ontologyState.js";

/** A caller of a private storer may supply a plain snapshot-shaped record. */
export function snapshotAxioms(snapshot) {
  try {
    return readSnapshotAxioms(snapshot);
  } catch {
    return snapshot.directAxioms;
  }
}

export const sortedStructuralValues = (values) =>
  [...values].sort(compareStructuralValues);
