import { OWLObjectKind as K } from "../../model/kinds.js";
import { EMPTY_STRUCTURAL_SET } from "../../model/structural.js";
import { readSnapshotAxioms } from "../model/ontologyState.js";
import { structuralFields } from "../model/structuralFields.js";
import { hasValidatedStructuralSnapshot } from "../model/structuralValidation.js";

const forbidsAnonymous = new Set([
  K.SAME_INDIVIDUAL_AXIOM,
  K.DIFFERENT_INDIVIDUALS_AXIOM,
  K.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
  K.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
  K.OBJECT_ONE_OF,
  K.OBJECT_HAS_VALUE,
]);

const FIELDS_BY_KIND = Object.create(null);
for (const [kind, fieldList] of structuralFields) {
  FIELDS_BY_KIND[kind] = fieldList;
}

const createFramePool = (scope, sourceVerified) => {
  const frames = [];
  return {
    frames,
    frame(depth) {
      return (frames[depth] ??= {
        depth,
        scope,
        sourceVerified,
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
    },
    release() {},
  };
};

const pooledFrames = [];
let pooledFramesBusy = false;

const createPooledFramePool = (scope, sourceVerified) => {
  if (pooledFramesBusy) return createFramePool(scope, sourceVerified);
  pooledFramesBusy = true;
  let released = false;
  return {
    frames: pooledFrames,
    frame(depth) {
      let item = pooledFrames[depth];
      if (!item) {
        item = pooledFrames[depth] = {
          depth,
          scope,
          sourceVerified,
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
        };
      } else {
        item.depth = depth;
        item.scope = scope;
        item.sourceVerified = sourceVerified;
        item.value = undefined;
        item.parent = undefined;
        item.field = undefined;
        item.definition = undefined;
        item.anonymousForbidden = undefined;
        item.annotationContext = false;
        item.trusted = false;
        item.entered = false;
        item.skipped = false;
        item.sequence = false;
        item.virtual = false;
        item.fields = undefined;
        item.index = 0;
      }
      return item;
    },
    release() {
      if (released) return;
      released = true;
      for (let i = 0; i < pooledFrames.length; i++) {
        const item = pooledFrames[i];
        item.value = undefined;
        item.parent = undefined;
        item.definition = undefined;
        item.fields = undefined;
      }
      pooledFramesBusy = false;
    },
  };
};

const prepareMemberRoots = (member, sourceRoots) => {
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
  return { stored, trusted, roots, firstExtra };
};

const enterStep = (current, stored, policy) => {
  const value = current.value;
  current.entered = true;
  current.virtual = value === stored;
  current.sequence = current.virtual || Array.isArray(value);
  current.skipped =
    !value ||
    typeof value !== "object" ||
    (!policy.inspectsAnnotationValues &&
      current.annotationContext &&
      (value.kind === K.LITERAL || value.kind === K.ANONYMOUS_INDIVIDUAL));
  return value;
};

const setupChildren = (current, value) => {
  if (
    value === EMPTY_STRUCTURAL_SET ||
    (current.trusted && value.kind === K.IRI)
  ) {
    current.index = -1;
    return;
  }
  current.fields = current.sequence
    ? undefined
    : current.trusted
      ? (FIELDS_BY_KIND[value.kind] ?? Object.keys(value))
      : Object.keys(value);
  current.index = (current.sequence ? value.length : current.fields.length) - 1;
};

const pushNextChild = (
  current,
  value,
  stored,
  depth,
  frame,
  skipEmptySequences = false,
  skipCounter = undefined,
) => {
  const index = current.index--;
  const field = current.sequence ? current.field : current.fields[index];
  const child = current.virtual
    ? stored.valueAt(index)
    : value[current.sequence ? index : field];
  if (!current.sequence) {
    if (!child || typeof child !== "object") return depth;
    if (skipCounter && current.trusted && child.kind === K.IRI) {
      skipCounter.count += 1;
      return depth;
    }
    if (skipEmptySequences && Array.isArray(child) && child.length === 0) {
      return depth;
    }
  }
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
        (value.kind === K.ANNOTATION_ASSERTION_AXIOM && field === "value")));
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
  return depth;
};

/** Synchronous cursor reusing one frame per depth without generator frames. */
export function createProfileStepCursor(
  member,
  sourceRoots,
  policy,
  { pooled = false, skipEmptySequences = false, skipIris = false } = {},
) {
  const { stored, trusted, roots, firstExtra } = prepareMemberRoots(
    member,
    sourceRoots,
  );
  const { frames, frame, release } = pooled
    ? createPooledFramePool(member.scope, member.status === "verified")
    : createFramePool(member.scope, member.status === "verified");
  const skipCounter = skipIris ? { count: 0 } : undefined;
  let root = roots.length;
  let depth = -1;
  let needsSetup = false;

  return {
    next() {
      if (needsSetup) {
        needsSetup = false;
        const prev = frames[depth];
        if (prev.skipped) {
          depth--;
        } else {
          setupChildren(prev, prev.value);
        }
      }
      for (;;) {
        while (depth < 0) {
          root--;
          if (root < 0) {
            release();
            return undefined;
          }
          depth = 0;
          const first = frame(0);
          first.value = roots[root];
          first.trusted = root < firstExtra && trusted;
          first.entered = false;
          enterStep(first, stored, policy);
          needsSetup = true;
          return first;
        }
        const current = frames[depth];
        if (!current.entered) {
          enterStep(current, stored, policy);
          if (current.trusted && current.value.kind === K.IRI) {
            current.index = -1;
          } else {
            needsSetup = true;
          }
          return current;
        }
        if (current.index < 0) {
          depth--;
          continue;
        }
        depth = pushNextChild(
          current,
          current.value,
          stored,
          depth,
          frame,
          skipEmptySequences,
          skipCounter,
        );
      }
    },
    drainSkipped() {
      if (!skipCounter || skipCounter.count === 0) return 0;
      const count = skipCounter.count;
      skipCounter.count = 0;
      return count;
    },
    close: release,
  };
}

/** Synchronous cursor over non-skipped, non-sequence scoped profile nodes. */
export function createScopedNodeCursor(
  members,
  sourceRoots,
  policy,
  { skipIris = false } = {},
) {
  let memberIndex = 0;
  let skipped = 0;
  let cursor =
    members.length > 0
      ? createProfileStepCursor(members[0], sourceRoots, policy, {
          pooled: true,
          skipEmptySequences: true,
          skipIris,
        })
      : undefined;

  return {
    next() {
      while (cursor !== undefined) {
        for (
          let step = cursor.next();
          step !== undefined;
          step = cursor.next()
        ) {
          if (!step.skipped && !step.sequence) return step;
        }
        if (skipIris) skipped += cursor.drainSkipped();
        cursor.close();
        memberIndex++;
        cursor =
          memberIndex < members.length
            ? createProfileStepCursor(
                members[memberIndex],
                sourceRoots,
                policy,
                { pooled: true, skipEmptySequences: true, skipIris },
              )
            : undefined;
      }
      return undefined;
    },
    drainSkipped() {
      if (!skipIris) return 0;
      const total = skipped + (cursor ? cursor.drainSkipped() : 0);
      skipped = 0;
      return total;
    },
    close() {
      if (cursor !== undefined) {
        cursor.close();
        cursor = undefined;
      }
    },
  };
}

/** Reuse a single cursor frame per depth. Consumers process a frame before
 * advancing this iterator and copy any values they need to retain. */
export function* profileSteps(member, sourceRoots, policy) {
  const cursor = createProfileStepCursor(member, sourceRoots, policy);
  for (let step = cursor.next(); step !== undefined; step = cursor.next()) {
    // Shape admission happens before enumerating any untrusted fields.
    yield step;
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
