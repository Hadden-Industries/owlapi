import {
  benchmarkComparisonCases,
  benchmarkMemoryVerdict,
  benchmarkVerdict,
} from "./owlapi-reference/comparison-benchmarks.mjs";
import { comparisonIdentity } from "./owlapi-reference/comparison-evidence.mjs";
import { oracleVersion } from "./owlapi-reference/comparison-oracle.mjs";

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

const protocol = {
  supported: true,
  executionId: "a".repeat(64),
  coldSamples: 3,
};
const javaBasis = { ...fresh, jdk: { version: "test-jdk" } };

function coldTrials(engine, peaks) {
  return peaks.map((peak, index) => ({
    kind: "sample",
    status: "completed",
    input: id,
    caseId: comparisonIdentity({ input: id, engine }),
    executionId: protocol.executionId,
    sampleId: `${engine}-cold-${index}`,
    verificationCount: 3,
    ...(engine === "java"
      ? { javaVersion: "test-jdk", owlapiVersion: oracleVersion }
      : { behaviorProfileId: engine, nodeVersion: process.version }),
    checkpoints: ["before", "after"].map((phase) => ({
      phase,
      rssBytes: 100,
      peakRssBytes: phase === "before" ? 100 : peak,
      heapUsedBytes: 10,
      heapTotalBytes: 20,
      ...(engine === "java" ? {} : { externalBytes: 1, arrayBufferBytes: 0 }),
    })),
  }));
}

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "reconstructs %s process peaks and checks evidence independently of timer resolution",
  (profile) => {
    const [selected] = benchmarkComparisonCases({ input: id, profile });
    const raw = {
      java: coldTrials("java", [400, 900, 500]),
      [profile]: coldTrials(profile, [200, 1000, 300]),
    };
    const evaluate = (
      observations,
      plan = protocol,
      proof = { ...witness, behaviorProfileId: profile },
    ) =>
      benchmarkMemoryVerdict(
        selected,
        row("retainedHeapDeltaBytes", 0),
        row("sampledHeapDeltaBytes", 0),
        javaBasis,
        proof,
        plan,
        observations,
      );
    expect(evaluate(raw)).toMatchObject({
      status: "qualified",
      peakRssRatio: 0.6,
      java: { peakRssBytes: 500, peakGrowthBytes: 400 },
      js: { peakRssBytes: 300, peakGrowthBytes: 200 },
    });
    expect(evaluate(raw, null).status).toBe("unavailable");
    expect(evaluate(raw, { ...protocol, supported: false }).status).toBe(
      "unavailable",
    );
    const diagnostic = evaluate(raw, protocol, null);
    expect(diagnostic).toMatchObject({
      status: "diagnostic-only",
      js: { peakRssBytes: 300 },
    });
    expect(diagnostic.peakRssRatio).toBeUndefined();
    expect(() => evaluate({ ...raw, java: raw.java.slice(1) })).toThrow(
      /sample count/u,
    );
    for (const change of [
      { executionId: "b".repeat(64) },
      { behaviorProfileId: "other" },
      { sampleId: "other-cold-0" },
      { input: "another-workload" },
      { checkpoints: raw[profile][0].checkpoints.slice(1) },
    ]) {
      const altered = structuredClone(raw);
      Object.assign(altered[profile][0], change);
      expect(() => evaluate(altered)).toThrow(/Invalid API memory sample/u);
    }
    raw[profile][0].verificationCount++;
    expect(evaluate(raw).status).toBe("diagnostic-only");
  },
);
