// Public-model counts from the independent inspection of the three publisher inputs.
const sourceRules = new Map([
  [
    "obo-clo",
    {
      sha256:
        "64b8167d3bdf789d902906053fcec29c0644d34e22378032fa0d2e03915d8920",
      rules: 4,
      annotated: 0,
      multiHead: 0,
    },
  ],
  [
    "obo-fovt",
    {
      sha256:
        "b533c22ddc907b2ee050dd543f474b3c13d2f38c66c1b375b878f7897808f038",
      rules: 48,
      annotated: 28,
      multiHead: 4,
    },
  ],
  [
    "obo-vbo",
    {
      sha256:
        "1375af3c0aac025f38c0a8767d0896a4ed189f290041eb58443d22f990b8b157",
      rules: 25,
      annotated: 13,
      multiHead: 2,
    },
  ],
]);

export function scopedRuleExpectation(input, scenario, profile, imports) {
  const pin = sourceRules.get(input.id);
  if (
    !pin ||
    scenario !== "direct-load" ||
    profile.behaviorProfileId !== "java-owlapi-5.5.1" ||
    profile.parsingMode !== "compatible" ||
    imports !== "recorded"
  )
    return undefined;
  if (input.sha256 !== pin.sha256)
    throw new Error(
      "The scoped SWRL expectation requires its reviewed publisher digest: " +
        input.id,
    );
  return { ...pin };
}

export function observeScopedRules(ontology, sha256) {
  let rules = 0,
    annotated = 0,
    multiHead = 0;
  for (const axiom of ontology.getAxioms()) {
    if (axiom.kind !== "SWRLRule") continue;
    rules++;
    if (axiom.annotations.length) annotated++;
    if (axiom.head.length > 1) multiHead++;
  }
  return { sha256, rules, annotated, multiHead };
}

export function matchesScopedRules(expected, observed) {
  return (
    observed?.sha256 === expected.sha256 &&
    observed.rules === expected.rules &&
    observed.annotated === expected.annotated &&
    observed.multiHead === expected.multiHead
  );
}
