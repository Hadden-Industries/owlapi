const compareCodeUnits = (left, right) => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

const literalKey = (term) =>
  JSON.stringify([
    term.value,
    term.language || "",
    term.direction || "",
    term.datatype?.value || "",
  ]);

const termKey = (term, blankNode) => {
  switch (term?.termType) {
    case "NamedNode":
      return `N${JSON.stringify(term.value)}`;
    case "BlankNode":
      return blankNode(term.value);
    case "Literal":
      return `L${literalKey(term)}`;
    case "DefaultGraph":
      return "D";
    case "Variable":
      return `V${JSON.stringify(term.value)}`;
    case "Quad":
      return `Q(${quadKey(term, blankNode)})`;
    default:
      throw new TypeError(`Unsupported RDF/JS term type: ${term?.termType}`);
  }
};

const quadKey = (quad, blankNode) =>
  [quad.subject, quad.predicate, quad.object, quad.graph]
    .map((term) => termKey(term, blankNode))
    .join(" ");

const collectBlankNodes = (term, values) => {
  if (term?.termType === "BlankNode") {
    values.add(term.value);
  } else if (term?.termType === "Quad") {
    collectBlankNodes(term.subject, values);
    collectBlankNodes(term.predicate, values);
    collectBlankNodes(term.object, values);
    collectBlankNodes(term.graph, values);
  }
};

const blankNodesIn = (quads) => {
  const values = new Set();
  for (const quad of quads) {
    collectBlankNodes(quad.subject, values);
    collectBlankNodes(quad.predicate, values);
    collectBlankNodes(quad.object, values);
    collectBlankNodes(quad.graph, values);
  }
  return [...values].sort(compareCodeUnits);
};

const containsBlankNode = (term, value) => {
  if (term?.termType === "BlankNode") {
    return term.value === value;
  }
  return (
    term?.termType === "Quad" &&
    [term.subject, term.predicate, term.object, term.graph].some((nested) =>
      containsBlankNode(nested, value),
    )
  );
};

const quadContainsBlankNode = (quad, value) =>
  [quad.subject, quad.predicate, quad.object, quad.graph].some((term) =>
    containsBlankNode(term, value),
  );

const incidentSignature = (quads, value, colors) =>
  quads
    .filter((quad) => quadContainsBlankNode(quad, value))
    .map((quad) =>
      quadKey(quad, (blankValue) =>
        blankValue === value ? "B:self" : `B:color:${colors.get(blankValue)}`,
      ),
    )
    .sort(compareCodeUnits)
    .join("\n");

const refinedColors = (actualQuads, expectedQuads, actualIds, expectedIds) => {
  let actualColors = new Map(actualIds.map((id) => [id, "c0"]));
  let expectedColors = new Map(expectedIds.map((id) => [id, "c0"]));
  const rounds = actualIds.length + expectedIds.length + 1;

  for (let round = 0; round < rounds; round += 1) {
    const actualSignatures = new Map(
      actualIds.map((id) => [
        id,
        incidentSignature(actualQuads, id, actualColors),
      ]),
    );
    const expectedSignatures = new Map(
      expectedIds.map((id) => [
        id,
        incidentSignature(expectedQuads, id, expectedColors),
      ]),
    );
    const signatures = [
      ...new Set([
        ...actualSignatures.values(),
        ...expectedSignatures.values(),
      ]),
    ].sort(compareCodeUnits);
    const colors = new Map(
      signatures.map((signature, index) => [signature, `c${index}`]),
    );
    actualColors = new Map(
      actualIds.map((id) => [id, colors.get(actualSignatures.get(id))]),
    );
    expectedColors = new Map(
      expectedIds.map((id) => [id, colors.get(expectedSignatures.get(id))]),
    );
  }

  return { actualColors, expectedColors };
};

const colorCounts = (colors) => {
  const counts = new Map();
  for (const color of colors.values()) {
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  return counts;
};

const sameColorCounts = (left, right) =>
  left.size === right.size &&
  [...left].every(([color, count]) => right.get(color) === count);

const termIsMapped = (term, mapping) => {
  if (term?.termType === "BlankNode") {
    return mapping.has(term.value);
  }
  return (
    term?.termType !== "Quad" ||
    [term.subject, term.predicate, term.object, term.graph].every((nested) =>
      termIsMapped(nested, mapping),
    )
  );
};

const quadIsMapped = (quad, mapping) =>
  [quad.subject, quad.predicate, quad.object, quad.graph].every((term) =>
    termIsMapped(term, mapping),
  );

export const datasetsAreIsomorphic = (actual, expected) => {
  const actualQuads = [...actual];
  const expectedQuads = [...expected];
  if (actualQuads.length !== expectedQuads.length) {
    return false;
  }

  const actualIds = blankNodesIn(actualQuads);
  const expectedIds = blankNodesIn(expectedQuads);
  if (actualIds.length !== expectedIds.length) {
    return false;
  }
  const expectedKeys = new Set(
    expectedQuads.map((quad) => quadKey(quad, (value) => `B:${value}`)),
  );
  if (actualIds.length === 0) {
    return actualQuads.every((quad) =>
      expectedKeys.has(quadKey(quad, (value) => `B:${value}`)),
    );
  }

  const { actualColors, expectedColors } = refinedColors(
    actualQuads,
    expectedQuads,
    actualIds,
    expectedIds,
  );
  if (
    !sameColorCounts(colorCounts(actualColors), colorCounts(expectedColors))
  ) {
    return false;
  }

  const candidates = new Map(
    actualIds.map((id) => [
      id,
      expectedIds.filter(
        (expectedId) => expectedColors.get(expectedId) === actualColors.get(id),
      ),
    ]),
  );
  const orderedActualIds = [...actualIds].sort((left, right) => {
    const candidateDifference =
      candidates.get(left).length - candidates.get(right).length;
    return candidateDifference || compareCodeUnits(left, right);
  });
  const mapping = new Map();
  const usedExpectedIds = new Set();

  const mappedQuadsExist = () =>
    actualQuads
      .filter((quad) => quadIsMapped(quad, mapping))
      .every((quad) =>
        expectedKeys.has(quadKey(quad, (value) => `B:${mapping.get(value)}`)),
      );

  const match = (index) => {
    if (index === orderedActualIds.length) {
      return mappedQuadsExist();
    }
    const actualId = orderedActualIds[index];
    for (const expectedId of candidates.get(actualId)) {
      if (usedExpectedIds.has(expectedId)) {
        continue;
      }
      mapping.set(actualId, expectedId);
      usedExpectedIds.add(expectedId);
      if (mappedQuadsExist() && match(index + 1)) {
        return true;
      }
      usedExpectedIds.delete(expectedId);
      mapping.delete(actualId);
    }
    return false;
  };

  return match(0);
};
