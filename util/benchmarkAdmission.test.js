import {
  benchmarkComparisonCases,
  benchmarkVerdict,
} from "./owlapi-reference/comparison-benchmarks.mjs";

const id = "manager.createOWLOntologyManager";
const [entry] = benchmarkComparisonCases(
  { input: id, profile: "normative-v1" },
  { warmupCount: 0, runCount: 1 },
);
const fresh = { kind: "fresh-observation" };
const witness = {
  caseId: "api-witness",
  groupId: id,
  behaviorProfileId: "normative-v1",
  status: "passed",
  admission: "independently-witnessed",
  semanticMatch: true,
};
function row(heap, wallMs = 1, verificationCount = 3) {
  const sample = { wallMs, [heap]: 0 };
  return {
    id,
    verificationCount,
    firstUseWallMs: 2,
    measurements: [sample],
    median: { ...sample },
  };
}

test.each([
  { runCount: 0 },
  { warmupCount: -1 },
  { runCount: 2.5 },
  { syntaxCount: 0 },
  { importClosureCount: 0 },
])(
  "rejects invalid benchmark parameters %j during case selection",
  (parameters) => {
    expect(() => benchmarkComparisonCases({ input: id }, parameters)).toThrow(
      /Invalid benchmark measurement or fixture parameters/u,
    );
  },
);

test.each([[], ["unknown"], [id, id]])(
  "rejects invalid benchmark input selection %j",
  (...input) => {
    expect(() => benchmarkComparisonCases({ input })).toThrow();
  },
);

test("a live timing ratio requires a matching independent semantic witness", () => {
  const java = row("retainedHeapDeltaBytes");
  const js = row("sampledHeapDeltaBytes", 1.104);
  expect(benchmarkVerdict(entry, java, js, fresh, witness)).toEqual({
    status: "qualified",
    ratioVsJava: 1.104,
    witnessCaseId: witness.caseId,
  });
  expect(
    benchmarkVerdict(entry, java, js, fresh, {
      ...witness,
      behaviorProfileId: "java-owlapi-5.5.1",
    }).status,
  ).toBe("diagnostic-only");
  expect(
    benchmarkVerdict(entry, java, js, { kind: "historical-baseline" }, witness),
  ).toEqual({ status: "diagnostic-only", reason: "Historical Java baseline" });
});

test("a corrupted summary or a missing sample cannot produce a speed ratio", () => {
  const java = row("retainedHeapDeltaBytes");
  const js = row("sampledHeapDeltaBytes", 1.104);
  expect(() =>
    benchmarkVerdict(
      entry,
      java,
      {
        ...js,
        median: { ...js.median, wallMs: 0.2 },
      },
      fresh,
      witness,
    ),
  ).toThrow(/medians disagree/u);
  expect(() =>
    benchmarkVerdict(
      entry,
      java,
      {
        ...js,
        measurements: [],
      },
      fresh,
      witness,
    ),
  ).toThrow(/Invalid timing samples/u);
});

test("zero resolution and differing verification counts are diagnostic", () => {
  const java = row("retainedHeapDeltaBytes");
  expect(
    benchmarkVerdict(
      entry,
      java,
      row("sampledHeapDeltaBytes", 0),
      fresh,
      witness,
    ),
  ).toEqual({ status: "diagnostic-only", reason: "Timer resolution" });
  expect(
    benchmarkVerdict(
      entry,
      java,
      row("sampledHeapDeltaBytes", 1, 4),
      fresh,
      witness,
    ),
  ).toEqual({ status: "diagnostic-only", reason: "Worker checksums differ" });
});
