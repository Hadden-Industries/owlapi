import { OWLObjectKind as K } from "../../model/kinds.js";
import { readSnapshotAxioms } from "../model/ontologyState.js";
import { hasValidatedStructuralSnapshot } from "../model/structuralValidation.js";

const forbidsAnonymous = new Set([
  K.SAME_INDIVIDUAL_AXIOM,
  K.DIFFERENT_INDIVIDUALS_AXIOM,
  K.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
  K.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
  K.OBJECT_ONE_OF,
  K.OBJECT_HAS_VALUE,
]);

/** Replay the profile visitor's original depth-first order directly from its
 * snapshot. A wide axiom/operand sequence uses a cursor instead of one pending
 * work record per sibling. The caller charges each sequence edge on entry. */
export function* profileSteps(member, sourceRoots, policy) {
  const { snapshot, scope } = member;
  const stored = readSnapshotAxioms(snapshot);
  const trusted = hasValidatedStructuralSnapshot(snapshot);
  const pending = [
    snapshot.ontologyID,
    snapshot.authoredImportDeclarations,
    snapshot.directOntologyAnnotations,
    stored,
  ].map((value) => ({ value, depth: 0, trusted }));
  for (const value of sourceRoots.get(scope) ?? [])
    pending.push({ value, depth: 0, trusted: false });
  while (pending.length) {
    const item = pending.pop();
    if (item.sequence) {
      const i = item.index--;
      if (i > 0) pending.push(item);
      const value =
        item.sequence === stored ? stored.valueAt(i) : item.sequence[i];
      pending.push({ ...item.parent, value, depth: item.parent.depth + 1 });
      continue;
    }
    const value = item.value;
    const skipped =
      !value ||
      typeof value !== "object" ||
      (!policy.inspectsAnnotationValues &&
        item.annotationContext &&
        (value.kind === K.LITERAL || value.kind === K.ANONYMOUS_INDIVIDUAL));
    const sequence = Array.isArray(value) || value === stored;
    // Shape admission is performed by the consumer before we inspect children.
    yield {
      ...item,
      scope,
      sourceVerified: member.status === "verified",
      skipped,
      sequence,
      virtual: value === stored,
    };
    if (skipped) continue;
    if (sequence) {
      if (value.length)
        pending.push({
          sequence: value,
          index: value.length - 1,
          parent: item,
        });
      continue;
    }
    for (const field of Object.keys(value)) {
      const child = value[field];
      if (!child || typeof child !== "object") continue;
      pending.push({
        value: child,
        parent: value,
        field,
        depth: item.depth + 1,
        trusted: item.trusted,
        annotationContext:
          item.annotationContext ||
          value.kind === K.ANNOTATION ||
          (value.kind === K.ANNOTATION_ASSERTION_AXIOM && field === "value"),
        anonymousForbidden:
          item.anonymousForbidden ??
          (forbidsAnonymous.has(value.kind) ? value.kind : undefined),
        definition:
          value.kind === K.DATATYPE_DEFINITION_AXIOM && field === "dataRange"
            ? value.datatype
            : item.definition,
      });
    }
  }
}

/** The multi-pass profile rules can traverse these views again without
 * retaining a node graph or scoped axiom wrapper array between passes. */
export function scopedProfileAxioms(members) {
  return {
    *[Symbol.iterator]() {
      for (const { scope, snapshot } of members)
        for (const value of readSnapshotAxioms(snapshot))
          yield { value, scope };
    },
  };
}

export function scopedProfileNodes(members, sourceRoots, policy) {
  return {
    *[Symbol.iterator]() {
      for (const member of members)
        for (const step of profileSteps(member, sourceRoots, policy)) {
          if (!step.skipped && !step.sequence) yield step;
        }
    },
  };
}
