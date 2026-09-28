import { OWLObjectKind } from "../../model/kinds.js";
import { OWLOntology } from "../../model/owlOntology.js";
import { isCanonicalStructuralObject } from "../../model/structural.js";

const DEFAULT_MAXIMUM_SEARCH_STATES = 1_000_000;
const COMPARISON_OPTION_NAMES = Object.freeze([
  "compareAnnotations",
  "compareAxioms",
  "compareImports",
  "compareOntologyID",
  "maximumSearchStates",
]);
const COMPARISON_OPTION_NAME_SET = new Set(COMPARISON_OPTION_NAMES);

const UNORDERED_STRUCTURAL_FIELDS = new Set([
  `${OWLObjectKind.OBJECT_INTERSECTION_OF}:operands`,
  `${OWLObjectKind.OBJECT_UNION_OF}:operands`,
  `${OWLObjectKind.OBJECT_ONE_OF}:individuals`,
  `${OWLObjectKind.DATA_INTERSECTION_OF}:operands`,
  `${OWLObjectKind.DATA_UNION_OF}:operands`,
  `${OWLObjectKind.DATA_ONE_OF}:values`,
  `${OWLObjectKind.DATATYPE_RESTRICTION}:facetRestrictions`,
  `${OWLObjectKind.EQUIVALENT_CLASSES_AXIOM}:classExpressions`,
  `${OWLObjectKind.DISJOINT_CLASSES_AXIOM}:classExpressions`,
  `${OWLObjectKind.DISJOINT_UNION_AXIOM}:classExpressions`,
  `${OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM}:properties`,
  `${OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM}:properties`,
  `${OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM}:properties`,
  `${OWLObjectKind.EQUIVALENT_DATA_PROPERTIES_AXIOM}:properties`,
  `${OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM}:properties`,
  `${OWLObjectKind.HAS_KEY_AXIOM}:objectProperties`,
  `${OWLObjectKind.HAS_KEY_AXIOM}:dataProperties`,
  `${OWLObjectKind.SAME_INDIVIDUAL_AXIOM}:individuals`,
  `${OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM}:individuals`,
]);

const compareCodeUnits = (left, right) => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

const isUnorderedStructuralField = (kind, field) =>
  field === "annotations" ||
  UNORDERED_STRUCTURAL_FIELDS.has(`${kind}:${field}`);

const anonymousIndividualIdentity = (individual) =>
  JSON.stringify([individual.documentScope, individual.nodeID]);

const hasAnonymousIndividual = (value, visited = new Set()) => {
  if (value?.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL) {
    return true;
  }
  if (!value || typeof value !== "object" || visited.has(value)) {
    return false;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    return value.some((entry) => hasAnonymousIndividual(entry, visited));
  }
  return Object.keys(value).some(
    (field) =>
      field !== "kind" && hasAnonymousIndividual(value[field], visited),
  );
};

const withAnonymousOccurrenceContext = (anonymousOccurrences, context) =>
  anonymousOccurrences.map(({ identity, path }) => ({
    identity,
    path: [context, ...path],
  }));

const fingerprintTree = (value, parentKind, parentField) => {
  if (value?.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL) {
    return {
      anonymousOccurrences: [
        { identity: anonymousIndividualIdentity(value), path: [] },
      ],
      tree: ["anonymous-individual"],
    };
  }
  if (Array.isArray(value)) {
    const entryFingerprints = value.map((entry) => fingerprintTree(entry));
    const unordered = isUnorderedStructuralField(parentKind, parentField);
    const treeEntries = entryFingerprints.map(({ tree }) => tree);
    if (unordered) {
      treeEntries.sort((left, right) =>
        compareCodeUnits(JSON.stringify(left), JSON.stringify(right)),
      );
    }
    return {
      anonymousOccurrences: entryFingerprints.flatMap(
        ({ anonymousOccurrences, tree }, index) =>
          withAnonymousOccurrenceContext(
            anonymousOccurrences,
            unordered
              ? ["unordered-entry", JSON.stringify(tree)]
              : ["ordered-entry", index],
          ),
      ),
      tree: [unordered ? "unordered" : "ordered", treeEntries],
    };
  }
  if (value && typeof value === "object") {
    const fieldFingerprints = Object.keys(value)
      .filter((field) => field !== "kind")
      .sort(compareCodeUnits)
      .map((field) => ({
        field,
        fingerprint: fingerprintTree(value[field], value.kind, field),
      }));
    return {
      anonymousOccurrences: fieldFingerprints.flatMap(
        ({ field, fingerprint: { anonymousOccurrences } }) =>
          withAnonymousOccurrenceContext(anonymousOccurrences, [
            "structural-field",
            value.kind,
            field,
          ]),
      ),
      tree: [
        "structural-object",
        value.kind,
        fieldFingerprints.map(({ field, fingerprint }) => [
          field,
          fingerprint.tree,
        ]),
      ],
    };
  }
  return {
    anonymousOccurrences: [],
    tree: ["primitive", typeof value, value ?? null],
  };
};

const structuralFingerprint = (value) => {
  const { anonymousOccurrences, tree } = fingerprintTree(value);
  const positionPathsByAnonymousIdentity = new Map();
  for (const { identity, path } of anonymousOccurrences) {
    const positionPaths = positionPathsByAnonymousIdentity.get(identity) ?? [];
    positionPaths.push(JSON.stringify(path));
    positionPathsByAnonymousIdentity.set(identity, positionPaths);
  }
  const anonymousPositionProfiles = [
    ...positionPathsByAnonymousIdentity.values(),
  ]
    .map((positionPaths) => positionPaths.sort(compareCodeUnits))
    .sort((left, right) =>
      compareCodeUnits(JSON.stringify(left), JSON.stringify(right)),
    );
  return JSON.stringify([tree, anonymousPositionProfiles]);
};

const mappingSignature = ({ forwardAnonymousIndividuals }) =>
  JSON.stringify(
    [...forwardAnonymousIndividuals.entries()].sort(
      ([leftA, rightA], [leftB, rightB]) => {
        const leftComparison = compareCodeUnits(leftA, leftB);
        return leftComparison || compareCodeUnits(rightA, rightB);
      },
    ),
  );

const createEmptyAnonymousIndividualMapping = () => ({
  forwardAnonymousIndividuals: new Map(),
  reverseAnonymousIndividuals: new Map(),
});

export class OntologyStructuralComparisonLimitError extends Error {
  constructor(maximumSearchStates, searchStatesExamined) {
    super(
      `Ontology structural comparison exceeded its ${maximumSearchStates} search-state limit`,
    );
    this.name = "OntologyStructuralComparisonLimitError";
    this.code = "ONTOLOGY_STRUCTURAL_COMPARISON_LIMIT_EXCEEDED";
    this.maximumSearchStates = maximumSearchStates;
    this.searchStatesExamined = searchStatesExamined;
  }
}

const consumeSearchState = (context) => {
  context.searchStatesExamined += 1;
  if (context.searchStatesExamined > context.maximumSearchStates) {
    throw new OntologyStructuralComparisonLimitError(
      context.maximumSearchStates,
      context.searchStatesExamined,
    );
  }
};

const matchAnonymousIndividuals = (left, right, mapping, success, failure) => {
  if (
    left?.kind !== OWLObjectKind.ANONYMOUS_INDIVIDUAL ||
    right?.kind !== OWLObjectKind.ANONYMOUS_INDIVIDUAL
  ) {
    return failure;
  }

  const leftIdentity = anonymousIndividualIdentity(left);
  const rightIdentity = anonymousIndividualIdentity(right);
  const mappedRightIdentity =
    mapping.forwardAnonymousIndividuals.get(leftIdentity);
  if (mappedRightIdentity !== undefined) {
    return mappedRightIdentity === rightIdentity
      ? () => success(mapping, failure)
      : failure;
  }
  if (mapping.reverseAnonymousIndividuals.has(rightIdentity)) {
    return failure;
  }

  const nextMapping = {
    forwardAnonymousIndividuals: new Map(mapping.forwardAnonymousIndividuals),
    reverseAnonymousIndividuals: new Map(mapping.reverseAnonymousIndividuals),
  };
  nextMapping.forwardAnonymousIndividuals.set(leftIdentity, rightIdentity);
  nextMapping.reverseAnonymousIndividuals.set(rightIdentity, leftIdentity);
  return () => success(nextMapping, failure);
};

const groupValuesByFingerprint = (leftValues, rightValues) => {
  if (leftValues.length !== rightValues.length) {
    return null;
  }

  const group = (values) => {
    const groups = new Map();
    for (const value of values) {
      const fingerprint = structuralFingerprint(value);
      const entries = groups.get(fingerprint) ?? [];
      entries.push(value);
      groups.set(fingerprint, entries);
    }
    return groups;
  };
  const leftGroups = group(leftValues);
  const rightGroups = group(rightValues);
  if (leftGroups.size !== rightGroups.size) {
    return null;
  }

  const pairedGroups = [];
  for (const [fingerprint, leftGroup] of leftGroups) {
    const rightGroup = rightGroups.get(fingerprint);
    if (!rightGroup || leftGroup.length !== rightGroup.length) {
      return null;
    }
    pairedGroups.push({ fingerprint, leftGroup, rightGroup });
  }
  pairedGroups.sort((left, right) => {
    const sizeComparison = left.leftGroup.length - right.leftGroup.length;
    return (
      sizeComparison || compareCodeUnits(left.fingerprint, right.fingerprint)
    );
  });
  return pairedGroups;
};

const matchStructuralValue = (
  left,
  right,
  mapping,
  context,
  success,
  failure,
  parentKind,
  parentField,
) => {
  if (
    left?.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL ||
    right?.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL
  ) {
    return matchAnonymousIndividuals(left, right, mapping, success, failure);
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return failure;
    }
    if (isUnorderedStructuralField(parentKind, parentField)) {
      return matchUnorderedStructuralValues(
        left,
        right,
        mapping,
        context,
        success,
        failure,
      );
    }
    if (left.length !== right.length) {
      return failure;
    }
    const matchOrderedEntry = (index, currentMapping, resume) => {
      if (index === left.length) {
        return () => success(currentMapping, resume);
      }
      return () =>
        matchStructuralValue(
          left[index],
          right[index],
          currentMapping,
          context,
          (nextMapping, nextResume) =>
            matchOrderedEntry(index + 1, nextMapping, nextResume),
          resume,
        );
    };
    return matchOrderedEntry(0, mapping, failure);
  }

  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return left === right ? () => success(mapping, failure) : failure;
  }
  if (
    !isCanonicalStructuralObject(left) ||
    !isCanonicalStructuralObject(right)
  ) {
    return failure;
  }
  if (left.kind !== right.kind) {
    return failure;
  }
  if (!hasAnonymousIndividual(left) && !hasAnonymousIndividual(right)) {
    return left.structuralKey() === right.structuralKey()
      ? () => success(mapping, failure)
      : failure;
  }

  const leftFields = Object.keys(left)
    .filter((field) => field !== "kind")
    .sort(compareCodeUnits);
  const rightFields = Object.keys(right)
    .filter((field) => field !== "kind")
    .sort(compareCodeUnits);
  if (
    leftFields.length !== rightFields.length ||
    leftFields.some((field, index) => field !== rightFields[index])
  ) {
    return failure;
  }

  const matchField = (index, currentMapping, resume) => {
    if (index === leftFields.length) {
      return () => success(currentMapping, resume);
    }
    const field = leftFields[index];
    return () =>
      matchStructuralValue(
        left[field],
        right[field],
        currentMapping,
        context,
        (nextMapping, nextResume) =>
          matchField(index + 1, nextMapping, nextResume),
        resume,
        left.kind,
        field,
      );
  };
  return matchField(0, mapping, failure);
};

const matchFingerprintGroup = (
  leftValues,
  rightValues,
  mapping,
  context,
  success,
  failure,
) => {
  const failedStates = new Set();
  const availableRightIndexes = rightValues.map((_, index) => index);

  const matchEntry = (
    leftIndex,
    availableIndexes,
    currentMapping,
    currentSuccess,
    currentFailure,
  ) => {
    if (leftIndex === leftValues.length) {
      return () => currentSuccess(currentMapping, currentFailure);
    }
    const failedStateKey = JSON.stringify([
      leftIndex,
      availableIndexes,
      mappingSignature(currentMapping),
    ]);
    if (failedStates.has(failedStateKey)) {
      return currentFailure;
    }

    const tryCandidate = (candidatePosition) => {
      if (candidatePosition === availableIndexes.length) {
        failedStates.add(failedStateKey);
        return currentFailure;
      }
      const rightIndex = availableIndexes[candidatePosition];
      const nextAvailableIndexes = availableIndexes.filter(
        (candidateIndex) => candidateIndex !== rightIndex,
      );
      const tryNextCandidate = () => tryCandidate(candidatePosition + 1);
      return () => {
        consumeSearchState(context);
        return matchStructuralValue(
          leftValues[leftIndex],
          rightValues[rightIndex],
          currentMapping,
          context,
          (nextMapping, nextFailure) =>
            matchEntry(
              leftIndex + 1,
              nextAvailableIndexes,
              nextMapping,
              currentSuccess,
              nextFailure,
            ),
          tryNextCandidate,
        );
      };
    };

    return tryCandidate(0);
  };

  return matchEntry(0, availableRightIndexes, mapping, success, failure);
};

function matchUnorderedStructuralValues(
  leftValues,
  rightValues,
  mapping,
  context,
  success,
  failure,
) {
  const pairedGroups = groupValuesByFingerprint(leftValues, rightValues);
  if (!pairedGroups) {
    return failure;
  }

  const matchGroup = (groupIndex, currentMapping, resume) => {
    if (groupIndex === pairedGroups.length) {
      return () => success(currentMapping, resume);
    }
    const { leftGroup, rightGroup } = pairedGroups[groupIndex];
    return () =>
      matchFingerprintGroup(
        leftGroup,
        rightGroup,
        currentMapping,
        context,
        (nextMapping, nextResume) =>
          matchGroup(groupIndex + 1, nextMapping, nextResume),
        resume,
      );
  };
  return matchGroup(0, mapping, failure);
}

const runStructuralMatch = (initialTask) => {
  let task = initialTask;
  while (typeof task === "function") {
    task = task();
  }
  return task;
};

const compareStructuralCollections = (leftValues, rightValues, context) =>
  runStructuralMatch(
    matchUnorderedStructuralValues(
      leftValues,
      rightValues,
      createEmptyAnonymousIndividualMapping(),
      context,
      (mapping) => mapping,
      () => null,
    ),
  );

const createOntologySnapshot = (value, name) => {
  try {
    return {
      annotations: [...OWLOntology.prototype.getAnnotations.call(value)],
      axioms: [...OWLOntology.prototype.getAxioms.call(value)],
      imports: [...OWLOntology.prototype.getImportsDeclarations.call(value)],
      ontologyID: OWLOntology.prototype.getOntologyID.call(value),
    };
  } catch {
    throw new TypeError(`${name} must be an OWLOntology`);
  }
};

const normalizeOptions = (options) => {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new TypeError("ontology comparison options must be an object");
  }
  for (const optionName of Object.keys(options)) {
    if (!COMPARISON_OPTION_NAME_SET.has(optionName)) {
      throw new TypeError(`Unknown ontology comparison option ${optionName}`);
    }
  }

  const normalized = {
    compareAnnotations: options.compareAnnotations ?? true,
    compareAxioms: options.compareAxioms ?? true,
    compareImports: options.compareImports ?? true,
    compareOntologyID: options.compareOntologyID ?? true,
    maximumSearchStates:
      options.maximumSearchStates ?? DEFAULT_MAXIMUM_SEARCH_STATES,
  };
  for (const optionName of COMPARISON_OPTION_NAMES.slice(0, 4)) {
    if (typeof normalized[optionName] !== "boolean") {
      throw new TypeError(`${optionName} must be a boolean`);
    }
  }
  if (
    !Number.isSafeInteger(normalized.maximumSearchStates) ||
    normalized.maximumSearchStates <= 0
  ) {
    throw new TypeError("maximumSearchStates must be a positive safe integer");
  }
  return normalized;
};

const ontologyIDMismatchPath = (left, right) => {
  const leftOntologyIRI = left.ontologyIRI?.value;
  const rightOntologyIRI = right.ontologyIRI?.value;
  if (leftOntologyIRI === undefined && rightOntologyIRI === undefined) {
    return null;
  }
  if (leftOntologyIRI !== rightOntologyIRI) {
    return ["ontologyID", "ontologyIRI"];
  }
  return left.versionIRI?.value === right.versionIRI?.value
    ? null
    : ["ontologyID", "versionIRI"];
};

const stableMismatchingKind = (leftValues, rightValues) => {
  const kinds = [
    ...new Set([
      ...leftValues.map((value) => value.kind),
      ...rightValues.map((value) => value.kind),
    ]),
  ].sort(compareCodeUnits);
  const fingerprintCountsForKind = (values, kind) => {
    const counts = new Map();
    for (const value of values.filter((candidate) => candidate.kind === kind)) {
      const fingerprint = structuralFingerprint(value);
      counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }
    return JSON.stringify(
      [...counts.entries()].sort(([left], [right]) =>
        compareCodeUnits(left, right),
      ),
    );
  };
  return kinds.find(
    (kind) =>
      fingerprintCountsForKind(leftValues, kind) !==
      fingerprintCountsForKind(rightValues, kind),
  );
};

const stableCollectionMismatchPath = (root, leftValues, rightValues) => {
  const kind = stableMismatchingKind(leftValues, rightValues);
  if (kind !== undefined) {
    return [root, kind];
  }
  const participatingKinds = new Set([
    ...leftValues.map((value) => value.kind),
    ...rightValues.map((value) => value.kind),
  ]);
  return participatingKinds.size === 1
    ? [root, participatingKinds.values().next().value]
    : [root];
};

const mismatchResult = (category, path) =>
  Object.freeze({
    equal: false,
    mismatch: Object.freeze({ category, path: Object.freeze(path) }),
  });

const EQUAL_RESULT = Object.freeze({ equal: true, mismatch: null });

export const compareOntologies = (left, right, options = {}) => {
  const normalizedOptions = normalizeOptions(options);
  const leftSnapshot = createOntologySnapshot(left, "left");
  const rightSnapshot = createOntologySnapshot(right, "right");
  const context = {
    maximumSearchStates: normalizedOptions.maximumSearchStates,
    searchStatesExamined: 0,
  };

  if (normalizedOptions.compareOntologyID) {
    const path = ontologyIDMismatchPath(
      leftSnapshot.ontologyID,
      rightSnapshot.ontologyID,
    );
    if (path) {
      return mismatchResult("ONTOLOGY_ID", path);
    }
  }

  if (
    normalizedOptions.compareImports &&
    !compareStructuralCollections(
      leftSnapshot.imports,
      rightSnapshot.imports,
      context,
    )
  ) {
    return mismatchResult(
      "IMPORTS",
      stableCollectionMismatchPath(
        "imports",
        leftSnapshot.imports,
        rightSnapshot.imports,
      ),
    );
  }

  if (
    normalizedOptions.compareAnnotations &&
    !compareStructuralCollections(
      leftSnapshot.annotations,
      rightSnapshot.annotations,
      context,
    )
  ) {
    return mismatchResult(
      "ONTOLOGY_ANNOTATIONS",
      stableCollectionMismatchPath(
        "annotations",
        leftSnapshot.annotations,
        rightSnapshot.annotations,
      ),
    );
  }

  if (normalizedOptions.compareAxioms) {
    const leftComparedValues = normalizedOptions.compareAnnotations
      ? [...leftSnapshot.annotations, ...leftSnapshot.axioms]
      : leftSnapshot.axioms;
    const rightComparedValues = normalizedOptions.compareAnnotations
      ? [...rightSnapshot.annotations, ...rightSnapshot.axioms]
      : rightSnapshot.axioms;
    if (
      !compareStructuralCollections(
        leftComparedValues,
        rightComparedValues,
        context,
      )
    ) {
      return mismatchResult(
        "AXIOMS",
        stableCollectionMismatchPath(
          "axioms",
          leftSnapshot.axioms,
          rightSnapshot.axioms,
        ),
      );
    }
  }

  return EQUAL_RESULT;
};
