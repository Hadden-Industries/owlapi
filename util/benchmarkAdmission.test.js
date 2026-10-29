import {
  compareBenchmarkSuites,
  parseCliArgs,
} from "./benchmark-owlapi-java-parity.mjs";

const id = "manager.createOWLOntologyManager";
const row = (wallMs = 1, java = false) => ({
  id,
  verificationCount: 3,
  firstUseWallMs: 2,
  measurements: [
    { wallMs, [java ? "retainedHeapDeltaBytes" : "sampledHeapDeltaBytes"]: 0 },
  ],
  median: {
    wallMs,
    [java ? "retainedHeapDeltaBytes" : "sampledHeapDeltaBytes"]: 0,
  },
});
const candidate = () => ({
  javaSuite: { results: [row(1, true)] },
  jsSuites: {
    "java-owlapi-5.5.1": { results: [row()] },
    "normative-v1": { results: [row()] },
  },
  filterIds: [id],
  warmupCount: 0,
  runCount: 1,
});

describe("performance comparison admission", () => {
  test.each([
    ["--unknown"],
    ["--runs"],
    ["--runs", "0"],
    ["--runs", "2junk"],
    ["--warmup", "-1"],
    ["--runs", "1", "--runs", "2"],
    ["--filter", ""],
    ["--filter", "unknown"],
    ["--filter", `${id},${id}`],
  ])("rejects malformed CLI arguments %j", (...args) => {
    expect(() => parseCliArgs(args)).toThrow();
  });

  test("admits zero warmup and an exact selected case without launching a runner", () => {
    expect(
      parseCliArgs(["--warmup", "0", "--runs", "1", "--filter", id]),
    ).toMatchObject({
      warmupCount: 0,
      runCount: 1,
      filterIds: [id],
      refreshJavaBaseline: false,
    });
  });

  test("changed fixture dimensions cannot inherit an old comparison classification", () => {
    const different = candidate();
    different.javaSuite.parameters = {
      syntaxCount: 100,
      importClosureCount: 8,
    };
    different.javaSuite.fixtureGeneratorVersion = 1;
    different.syntaxCount = 20;
    const report = compareBenchmarkSuites(different);
    expect(report.comparisons[0].comparability).toBe("fixture-mismatch");
    expect(report.summary.fasterOrParityInJsCount).toBe(0);
  });

  test("different warmup and run counts cannot inherit a qualified timing classification", () => {
    const different = candidate();
    different.javaSuite.fixtureGeneratorVersion = "owlapi-benchmark-corpus-v1";
    different.javaSuite.parameters = {
      syntaxCount: 100,
      importClosureCount: 8,
      warmupCount: 2,
      runCount: 5,
    };
    const report = compareBenchmarkSuites(different);
    expect(report.comparisons[0].comparability).toBe(
      "measurement-parameters-mismatch",
    );
    expect(report.summary.fasterOrParityInJsCount).toBe(0);
  });
  test("rejects missing and duplicate rows instead of silently reducing coverage", () => {
    const missing = candidate();
    missing.jsSuites["normative-v1"].results = [];
    expect(() => compareBenchmarkSuites(missing)).toThrow(/missing/i);
    const duplicate = candidate();
    duplicate.javaSuite.results.push(row(1, true));
    expect(() => compareBenchmarkSuites(duplicate)).toThrow(/duplicate/i);
  });

  test("rejects unknown case IDs and invalid numeric measurements", () => {
    const unknown = candidate();
    unknown.filterIds = ["unknown"];
    expect(() => compareBenchmarkSuites(unknown)).toThrow(/unknown/i);
    const invalid = candidate();
    invalid.jsSuites["normative-v1"].results[0].median.wallMs = NaN;
    expect(() => compareBenchmarkSuites(invalid)).toThrow(/finite/i);
  });

  test("classifies before display rounding and never invents a Java denominator", () => {
    const near = candidate();
    near.jsSuites["normative-v1"].results[0] = row(1.104);
    expect(compareBenchmarkSuites(near).summary.slowerInJsCount).toBe(1);
    const unresolved = candidate();
    unresolved.javaSuite.results[0] = row(0, true);
    const report = compareBenchmarkSuites(unresolved);
    expect(report.comparisons[0].comparability).toBe("resolution-limited");
    expect(report.comparisons[0].maxJsVsJavaRatio).toBeNull();
    expect(report.summary.fasterOrParityInJsCount).toBe(0);
  });

  test("marks a checksum disagreement as unqualified and retains raw JS samples", () => {
    const mismatch = candidate();
    mismatch.jsSuites["normative-v1"].results[0].verificationCount = 4;
    const report = compareBenchmarkSuites(mismatch);
    expect(report.schemaVersion).toBe(2);
    expect(report.comparisons[0].comparability).toBe("checksum-mismatch");
    expect(report.summary.fasterOrParityInJsCount).toBe(0);
    expect(report.comparisons[0].jsNormativeV1.measurements).toEqual([
      { wallMs: 1, sampledHeapDeltaBytes: 0 },
    ]);
  });

  test("equal closure counts do not qualify unequal materialization work", () => {
    const selected = candidate();
    const closureId = "util.OWLOntologyImportsClosureSetProvider";
    selected.filterIds = [closureId];
    for (const suite of [
      selected.javaSuite,
      ...Object.values(selected.jsSuites),
    ])
      suite.results[0].id = closureId;
    const report = compareBenchmarkSuites(selected);
    const comparison = report.comparisons[0];
    expect(comparison.comparability).toBe("workload-mismatch");
    expect(comparison.maxJsVsJavaRatio).toBeNull();
    expect(comparison.jsJavaOwlapi551.ratioVsJava).toBe(1);
    expect(comparison.comparisonLimitation).toMatch(
      /Stream.count.*fresh.*Set/u,
    );
    expect(report.summary.unqualifiedCount).toBe(1);
    expect(report.summary.fasterOrParityInJsCount).toBe(0);
    selected.jsSuites["normative-v1"].results[0].verificationCount = 4;
    expect(
      compareBenchmarkSuites(selected).comparisons[0].jsNormativeV1
        .comparability,
    ).toBe("checksum-mismatch");
  });

  test("a normative checksum difference cannot hide a matching compatible-profile slowdown", () => {
    const partial = candidate();
    partial.jsSuites["java-owlapi-5.5.1"].results[0] = row(2);
    partial.jsSuites["normative-v1"].results[0].verificationCount = 4;
    const report = compareBenchmarkSuites(partial);
    expect(report.summary.slowerInCompatProfileCount).toBe(1);
    expect(report.summary.slowerInJsCount).toBe(1);
    expect(report.comparisons[0].jsJavaOwlapi551.comparability).toBe(
      "checksum-only",
    );
    expect(report.comparisons[0].jsNormativeV1.comparability).toBe(
      "checksum-mismatch",
    );
  });

  test("new JS records cannot silently reuse the legacy retained-heap field", () => {
    const legacy = candidate();
    const sample = legacy.jsSuites["normative-v1"].results[0].measurements[0];
    delete sample.sampledHeapDeltaBytes;
    sample.retainedHeapDeltaBytes = 0;
    expect(() => compareBenchmarkSuites(legacy)).toThrow(/finite raw samples/);
  });
});
