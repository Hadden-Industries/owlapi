import {
  reconcileStructuralDifferences,
  reconcileStructuralSnapshots,
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

const snapshotRule = (changes = {}) =>
  rule({
    artifactType: "OWL structural snapshot",
    parser: "OWL/XML",
    capability: "parser.owlxml",
    differenceType: "VALUE_CHANGED",
    side: "Java",
    selector: "$['disjointUnion']['objectOneOf']['anonymousIndividualCount']",
    javaValue: 0,
    jsValue: 1,
    ...changes,
  });
const snapshotContext = (rules = [snapshotRule()]) => ({
  ...context(rules),
  parser: "OWL/XML",
  capability: "parser.owlxml",
});
const oneOfSnapshot = (count) => ({
  disjointUnion: { objectOneOf: { anonymousIndividualCount: count } },
});

test.each([
  "$.disjointUnion.objectOneOf.anonymousIndividualCount",
  '$["disjointUnion"]["objectOneOf"]["anonymousIndividualCount"]',
  snapshotRule().selector,
])("reconciles snapshots by evaluated node identity: %s", (selector) => {
  expect(
    reconcileStructuralSnapshots(
      oneOfSnapshot(0),
      oneOfSnapshot(1),
      snapshotContext([snapshotRule({ selector })]),
    ),
  ).toMatchObject({
    status: "PASS",
    matches: [{ ruleId: "EXACT", javaValue: 0, jsValue: 1 }],
  });
});

test("delegates escaped member names and array indexes to JSONPath", () => {
  const key = "quote'\\\n\u0001";
  const java = { [key]: [{ value: 0 }] };
  const js = { [key]: [{ value: 1 }] };
  const selector = `$[${JSON.stringify(key)}][0].value`;
  expect(
    reconcileStructuralSnapshots(
      java,
      js,
      snapshotContext([snapshotRule({ selector })]),
    ).status,
  ).toBe("PASS");
});

test.each([
  ["unmatched", [snapshotRule({ selector: "$.missing" })]],
  ["unmatched", [snapshotRule({ jsValue: 2 })]],
  [
    "ambiguous",
    [
      snapshotRule(),
      snapshotRule({
        id: "OVERLAP",
        selector: "$.disjointUnion.objectOneOf.anonymousIndividualCount",
      }),
    ],
  ],
  ["unsatisfied", [snapshotRule({ cardinality: { form: "exact", value: 2 } })]],
])("snapshot rules fail closed for %s", (field, rules) => {
  const report = reconcileStructuralSnapshots(
    oneOfSnapshot(0),
    oneOfSnapshot(1),
    snapshotContext(rules),
  );
  expect(report.status).toBe("FAIL");
  expect(report[field].length).toBeGreaterThan(0);
});

test.each([
  { referenceRevision: "stale" },
  { parser: "Manchester Syntax" },
  { capability: "parser.manchester" },
  { selector: "$[" },
  { cardinality: { form: "zero-or-more" } },
])("rejects unbound or non-exact snapshot approval %j", (changes) => {
  expect(() =>
    reconcileStructuralSnapshots(
      oneOfSnapshot(0),
      oneOfSnapshot(1),
      snapshotContext([snapshotRule(changes)]),
    ),
  ).toThrow();
});

test("unapproved additional snapshot content cannot disappear from the comparison", () => {
  expect(
    reconcileStructuralSnapshots(
      oneOfSnapshot(0),
      { ...oneOfSnapshot(1), extra: null },
      snapshotContext(),
    ),
  ).toMatchObject({
    status: "FAIL",
    unmatched: [
      {
        selector: "$['extra']",
        differenceType: "EXTRA",
        side: "JS",
        jsValue: null,
      },
    ],
  });
});

test("container type changes and removed subtrees each remain one atomic difference", () => {
  const report = reconcileStructuralSnapshots(
    { a: { nested: 1 }, b: [1] },
    { a: null, b: { 0: 1 } },
    snapshotContext([]),
  );
  expect(report.unmatched).toHaveLength(2);
  expect(report.unmatched.map(({ differenceType }) => differenceType)).toEqual([
    "TYPE_CHANGED",
    "TYPE_CHANGED",
  ]);
  expect(
    reconcileStructuralSnapshots({ a: { nested: 1 } }, {}, snapshotContext([]))
      .unmatched,
  ).toEqual([
    {
      selector: "$['a']",
      differenceType: "MISSING",
      side: "Java",
      javaValue: { nested: 1 },
      jsValue: undefined,
    },
  ]);
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
