import {
  reconcileStructuralDifferences,
  reconcileUnparsedRdf,
} from "./reconcile-structural-differences.mjs";

const fixture = "corpus@revision:source.rdf";
const empty = () => ({
  ontologyId: null,
  imports: { javaOnly: [], jsOnly: [] },
  annotations: { javaOnly: [], jsOnly: [] },
  axioms: { javaOnly: [], jsOnly: [] },
  anonymousIndividualGraphs: { javaOnly: [], jsOnly: [] },
  anonymousIndividualComparison: "NOT_REQUIRED",
});
const rule = (changes = {}) => ({
  id: "EXACT",
  artifactType: "OWL native structural differences",
  fixture,
  referenceRevision: "java-pin",
  differenceCategory: "SPECIFICATION_GROUNDED_RECOVERY",
  differenceType: "EXTRA",
  side: "JS",
  selector: "$['axioms']['jsOnly'][*]",
  javaValue: null,
  jsValue: "DatatypeDefinition(<urn:code> ...)",
  cardinality: { form: "exact", value: 1 },
  rationale: "Preserve the named restriction's datatype extension",
  authority:
    "https://www.w3.org/TR/owl2-rdf-based-semantics/#Semantic_Conditions_for_Datatypes",
  ...changes,
});
const context = (rules = [rule()]) => ({
  fixture,
  rules,
  referenceRevision: "java-pin",
});
const changed = () => ({
  ...empty(),
  axioms: { javaOnly: [], jsOnly: [rule().jsValue] },
});

test("accepts only the exact value selected by the RFC 9535 engine, retaining the original differences", () => {
  const differences = changed();
  const original = structuredClone(differences);
  expect(reconcileStructuralDifferences(differences, context())).toMatchObject({
    status: "PASS",
    unmatched: [],
    ambiguous: [],
    unsatisfied: [],
    matches: [{ ruleId: "EXACT" }],
  });
  expect(differences).toEqual(original);
});

test.each([
  [
    "unmatched",
    () => ({ ...empty(), axioms: { javaOnly: [], jsOnly: ["Unexpected"] } }),
    context(),
  ],
  ["ambiguous", changed, context([rule(), rule({ id: "DUPLICATE" })])],
  ["unsatisfied", empty, context()],
  ["unmatched", changed, { ...context(), fixture: "different-source" }],
])("fails closed for %s differences", (field, value, options) => {
  const result = reconcileStructuralDifferences(value(), options);
  expect(result.status).toBe("FAIL");
  expect(result[field].length).toBeGreaterThan(0);
});

test.each([
  { selector: "$[" },
  { cardinality: { form: "exact", value: -1 } },
  { referenceRevision: "different-pin" },
  { authority: "" },
])("rejects an invalid or unbound rule %j", (changes) => {
  expect(() =>
    reconcileStructuralDifferences(changed(), context([rule(changes)])),
  ).toThrow();
});

test("uses native RDFC-1.0 for unparsed RDF while keeping sharing significant", async () => {
  const nquads = "<urn:a> <urn:p> _:a .\n<urn:b> <urn:p> _:a .\n";
  const first = await reconcileUnparsedRdf(nquads, context([]));
  const renamed = await reconcileUnparsedRdf(
    nquads.replaceAll("_:a", "_:z"),
    context([]),
  );
  const split = await reconcileUnparsedRdf(
    nquads.replace("<urn:b> <urn:p> _:a", "<urn:b> <urn:p> _:b"),
    context([]),
  );
  expect(first.unparsedNQuads).toBe(renamed.unparsedNQuads);
  expect(first.unparsedNQuads).not.toBe(split.unparsedNQuads);
  expect(first.reconciliation.status).toBe("FAIL");
  const approved = rule({
    artifactType: "RDF parsing diagnostics",
    side: "Java",
    selector: "$['unparsedNQuads']",
    javaValue: first.unparsedNQuads,
    jsValue: null,
  });
  expect(
    (await reconcileUnparsedRdf(nquads, context([approved]))).reconciliation
      .status,
  ).toBe("PASS");
  expect(
    (await reconcileUnparsedRdf("", context([approved]))).reconciliation.status,
  ).toBe("FAIL");
});

test("does not accept an incomplete native difference report", () => {
  expect(() => reconcileStructuralDifferences(null, context([]))).toThrow();
  expect(() =>
    reconcileStructuralDifferences(
      { ...empty(), unexpected: true },
      context([]),
    ),
  ).toThrow();
});
