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

/** Reuse a single cursor frame per depth. Consumers process a frame before
 * advancing this iterator and copy any values they need to retain. */
export function* profileSteps(member, sourceRoots, policy) {
  const { snapshot, scope } = member;
  const stored = readSnapshotAxioms(snapshot);
  const trusted = hasValidatedStructuralSnapshot(snapshot);
  const roots = [
    snapshot.ontologyID,
    snapshot.authoredImportDeclarations,
    snapshot.directOntologyAnnotations,
    stored,
  ];
  const firstExtra = roots.length;
  for (const root of sourceRoots.get(scope) ?? []) roots.push(root);
  const frames = [];
  function frame(depth) {
    return (frames[depth] ??= {
      depth,
      scope,
      sourceVerified: member.status === "verified",
      value: undefined,
      parent: undefined,
      field: undefined,
      definition: undefined,
      anonymousForbidden: undefined,
      annotationContext: false,
      trusted: false,
      entered: false,
      skipped: false,
      sequence: false,
      virtual: false,
      fields: undefined,
      index: 0,
    });
  }
  for (let root = roots.length - 1; root >= 0; root--) {
    let depth = 0;
    const first = frame(0);
    first.value = roots[root];
    first.trusted = root < firstExtra && trusted;
    first.entered = false;
    while (depth >= 0) {
      const current = frames[depth],
        value = current.value;
      if (!current.entered) {
        current.entered = true;
        current.virtual = value === stored;
        current.sequence = current.virtual || Array.isArray(value);
        current.skipped =
          !value ||
          typeof value !== "object" ||
          (!policy.inspectsAnnotationValues &&
            current.annotationContext &&
            (value.kind === K.LITERAL ||
              value.kind === K.ANONYMOUS_INDIVIDUAL));
        // Shape admission happens before enumerating any untrusted fields.
        yield current;
        if (current.skipped) {
          depth--;
          continue;
        }
        current.fields = current.sequence ? undefined : Object.keys(value);
        current.index =
          (current.sequence ? value.length : current.fields.length) - 1;
      }
      if (current.index < 0) {
        depth--;
        continue;
      }
      const index = current.index--;
      const field = current.sequence ? current.field : current.fields[index];
      const child = current.virtual
        ? stored.valueAt(index)
        : value[current.sequence ? index : field];
      if (!current.sequence && (!child || typeof child !== "object")) continue;
      const next = frame(++depth);
      next.value = child;
      next.parent = current.sequence ? current.parent : value;
      next.field = field;
      next.trusted = current.trusted;
      next.entered = false;
      next.annotationContext =
        current.annotationContext ||
        (!current.sequence &&
          (value.kind === K.ANNOTATION ||
            (value.kind === K.ANNOTATION_ASSERTION_AXIOM &&
              field === "value")));
      next.anonymousForbidden =
        current.anonymousForbidden ??
        (!current.sequence && forbidsAnonymous.has(value.kind)
          ? value.kind
          : undefined);
      next.definition =
        !current.sequence &&
        value.kind === K.DATATYPE_DEFINITION_AXIOM &&
        field === "dataRange"
          ? value.datatype
          : current.definition;
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
