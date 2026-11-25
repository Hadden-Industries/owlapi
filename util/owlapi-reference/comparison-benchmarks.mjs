import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BEHAVIOR_PROFILES,
  BENCHMARK_DEFINITIONS,
  DEFAULT_JAVA_BASELINE_PATH,
  loadJavaBaseline,
  prepareSharedFixtureDirectory,
  resolveJavaBaselineSuite,
  runJavaBenchmarks,
  runJsProfileBenchmarks,
} from "../benchmark-owlapi-java-parity.mjs";
import {
  javaToolchainSelection,
  observeSelectedJavaJdk,
} from "../../scripts/java-toolchain.mjs";
import {
  comparisonIdentity,
  publishComparisonJson,
  sha256,
} from "./comparison-evidence.mjs";
import { admitReleasedClasspath, oracleVersion } from "./comparison-oracle.mjs";
import { verifyBenchmarkApiSemantics } from "../verify-benchmark-api-semantics.mjs";
import { verifyBenchmarkIoSemantics } from "../verify-benchmark-io-semantics.mjs";
import { captureSourceIdentity } from "./qualify-universal-ontology.mjs";

const apiSemanticsHarness = new URL(
  "./VerifyBenchmarkApiSemantics.java",
  import.meta.url,
);
const apiSemanticsSink = new URL(
  "../verify-benchmark-api-semantics.mjs",
  import.meta.url,
);
const fixtureGenerator = new URL(
  "../generate-owlapi-benchmark-fixtures.cjs",
  import.meta.url,
);
const priorIoObservation = new URL(
  "../../docs/performance/qualification-rc3/io-semantics.json",
  import.meta.url,
);

export async function benchmarkSourceDigest() {
  const { files } = await captureSourceIdentity(
    fileURLToPath(new URL("../../", import.meta.url)),
  );
  return comparisonIdentity(
    files.filter(
      ({ path }) =>
        !/^(?:docs|\.github|test|tooling)\//u.test(path) &&
        !/\.test\.[cm]?js$/u.test(path) &&
        /\.(?:[cm]?js|java|json)$/iu.test(path),
    ),
  );
}

function selectedWitnessRows(evidence, definitions) {
  const rows = new Map();
  for (const row of evidence.rows) {
    const key = comparisonIdentity([row.groupId, row.behaviorProfileId]);
    if (rows.has(key)) throw new Error("Duplicate API semantic witness row");
    rows.set(key, row);
  }
  return definitions.map(({ input, behaviorProfileId, caseId }) => {
    const row = rows.get(comparisonIdentity([input, behaviorProfileId]));
    if (!row)
      throw new Error(
        `Missing API semantic witness row for ${input} (${behaviorProfileId})`,
      );
    return { caseId, ...row };
  });
}

export async function runBenchmarkIoComparison(request, environment) {
  const original = JSON.parse(await readFile(priorIoObservation, "utf8"));
  const ids = Object.keys(original.observations).sort();
  const cases = ids.map((input) => ({
    input,
    caseId: comparisonIdentity({ scenario: "io-admission", version: 1, input }),
  }));
  if (request.action === "list") return { schemaVersion: 1, cases };
  if (
    request.action !== "run" ||
    !isAbsolute(environment.outputDirectory ?? "") ||
    request.input ||
    request.profile
  ) {
    throw new Error(
      "The I/O semantic suite requires the complete observation set and an absolute output directory",
    );
  }
  await mkdir(environment.outputDirectory);
  const classpath = await admitReleasedClasspath(environment);
  const classpathFile = join(
    environment.outputDirectory,
    "locked-java-classpath",
  );
  await writeFile(classpathFile, classpath.jars.join(delimiter), {
    flag: "wx",
  });
  const result = await verifyBenchmarkIoSemantics({
    classpathFile,
    javaHome: environment.javaHome,
    javaSelection: environment.javaSelection,
    javaBuildCacheDirectory:
      environment.javaBuildCacheDirectory ??
      (environment.cacheDirectory
        ? join(environment.cacheDirectory, "java-helper-builds")
        : undefined),
  });
  if (
    comparisonIdentity(Object.keys(result.observations).sort()) !==
    comparisonIdentity(ids)
  ) {
    throw new Error("The Java/JS I/O observation roster changed");
  }
  const report = {
    schemaVersion: 1,
    action: "run",
    scenario: "io-admission",
    evidence: result,
    cases: cases.map((entry) => ({
      ...entry,
      status:
        result.observations[entry.input].structuralSha256 ===
        original.observations[entry.input].structuralSha256
          ? "passed"
          : "failed",
    })),
  };
  await publishComparisonJson(
    environment.outputDirectory,
    "io-semantics.json",
    report,
  );
  return report;
}

export function apiSemanticsComparisonCases(
  request,
  { syntaxCount = 100, importClosureCount = 8 } = {},
) {
  const inputs = request.input ? [request.input].flat() : null;
  const definitions = inputs
    ? inputs.map((id) => {
        const definition = BENCHMARK_DEFINITIONS.find((item) => item.id === id);
        if (!definition) {
          throw new Error(`Unknown benchmark workload: ${id}`);
        }
        return definition;
      })
    : BENCHMARK_DEFINITIONS;
  if (definitions.length === 0) {
    throw new Error("At least one benchmark workload is required");
  }
  if (new Set(definitions).size !== definitions.length) {
    throw new Error("Duplicate benchmark workload");
  }
  if (request.profile && !BEHAVIOR_PROFILES.includes(request.profile)) {
    throw new Error("Unknown benchmark behavior profile");
  }
  const profiles = request.profile ? [request.profile] : BEHAVIOR_PROFILES;
  return definitions.flatMap((workload) =>
    profiles.map((behaviorProfileId) => {
      const definition = {
        schemaVersion: 1,
        scenario: "api-semantics",
        scenarioVersion: 1,
        input: workload.id,
        behaviorProfileId,
        syntaxCount,
        importClosureCount,
      };
      return { caseId: comparisonIdentity(definition), definition, workload };
    }),
  );
}

/** Run or verify the untimed 70-group canonical structural AST equivalence witness suite. */
export async function runBenchmarkApiSemanticsComparison(request, environment) {
  const entries = apiSemanticsComparisonCases(
    request,
    environment.benchmarkParameters,
  );
  const definitions = entries.map(({ caseId, definition }) => ({
    caseId,
    ...definition,
  }));
  if (request.action === "list") {
    return { schemaVersion: 1, cases: definitions };
  }
  const output = environment.outputDirectory;
  if (!isAbsolute(output ?? "")) {
    throw new Error("An absolute api-semantics output directory is required");
  }
  if (request.action === "verify") {
    const report = JSON.parse(
      await readFile(join(output, "api-semantics.json"), "utf8"),
    );
    const [
      expectedHarnessSha256,
      expectedSinkSha256,
      expectedFixtureGeneratorSha256,
    ] = await Promise.all([
      readFile(apiSemanticsHarness).then(sha256),
      readFile(apiSemanticsSink).then(sha256),
      readFile(fixtureGenerator).then(sha256),
    ]);
    if (
      report.schemaVersion !== 1 ||
      comparisonIdentity(report.definitions) !==
        comparisonIdentity(definitions) ||
      report.evidence?.harnessSha256 !== expectedHarnessSha256 ||
      report.evidence?.sinkSha256 !== expectedSinkSha256 ||
      report.evidence?.fixtureGeneratorSha256 !==
        expectedFixtureGeneratorSha256 ||
      report.evidence?.summary?.failed !== 0 ||
      report.evidence?.summary?.totalRows !== report.evidence?.rows?.length ||
      report.evidence.syntaxCount !== definitions[0].syntaxCount ||
      report.evidence.importClosureCount !==
        definitions[0].importClosureCount ||
      report.sourceSha256 !== (await benchmarkSourceDigest()) ||
      comparisonIdentity(report.cases) !==
        comparisonIdentity(selectedWitnessRows(report.evidence, definitions)) ||
      !Array.isArray(report.cases) ||
      report.cases.length !== definitions.length ||
      report.cases.some(
        (row, index) =>
          row.caseId !== definitions[index].caseId ||
          !["passed", "observed"].includes(row.status),
      )
    ) {
      throw new Error(
        "API semantic evidence does not pass for all requested workloads and profiles",
      );
    }
    return report;
  }
  if (request.action !== "run") {
    throw new Error("The api-semantics suite supports list, run and verify");
  }
  await mkdir(output, { recursive: true });
  const sourceSha256 = await benchmarkSourceDigest();
  const classpath = await admitReleasedClasspath(environment);
  const classpathFile = join(output, "locked-java-classpath");
  await writeFile(classpathFile, classpath.jars.join(delimiter), {
    flag: "wx",
  });
  const filterIds = [...new Set(entries.map(({ workload }) => workload.id))];
  const { syntaxCount, importClosureCount } = definitions[0];
  const result = await verifyBenchmarkApiSemantics({
    classpathFile,
    javaHome: environment.javaHome,
    javaSelection: environment.javaSelection,
    javaBuildCacheDirectory:
      environment.javaBuildCacheDirectory ??
      (environment.cacheDirectory
        ? join(environment.cacheDirectory, "java-helper-builds")
        : undefined),
    syntaxCount,
    importClosureCount,
    filterIds,
  });
  const cases = selectedWitnessRows(result, definitions);
  if (sourceSha256 !== (await benchmarkSourceDigest()))
    throw new Error("Benchmark source changed during the semantic observation");
  const report = {
    schemaVersion: 1,
    action: "run",
    scenario: "api-semantics",
    sourceSha256,
    definitions,
    evidence: result,
    cases,
  };
  await publishComparisonJson(output, "api-semantics.json", report);
  return report;
}

export function benchmarkComparisonCases(
  request,
  {
    syntaxCount = 100,
    importClosureCount = 8,
    warmupCount = 2,
    runCount = 5,
  } = {},
) {
  const inputs = request.input ? [request.input].flat() : null;
  const definitions = inputs
    ? inputs.map((id) => {
        const definition = BENCHMARK_DEFINITIONS.find((item) => item.id === id);
        if (!definition) throw new Error(`Unknown benchmark workload: ${id}`);
        return definition;
      })
    : BENCHMARK_DEFINITIONS;
  if (new Set(definitions).size !== definitions.length)
    throw new Error("Duplicate benchmark workload");
  if (request.profile && !BEHAVIOR_PROFILES.includes(request.profile)) {
    throw new Error("Unknown benchmark behavior profile");
  }
  const profiles = request.profile ? [request.profile] : BEHAVIOR_PROFILES;
  return definitions.flatMap((workload) =>
    profiles.map((behaviorProfileId) => {
      const definition = {
        schemaVersion: 1,
        scenario: "api-benchmarks",
        scenarioVersion: 1,
        input: workload.id,
        behaviorProfileId,
        syntaxCount,
        importClosureCount,
        warmupCount,
        runCount,
      };
      return { caseId: comparisonIdentity(definition), definition, workload };
    }),
  );
}

function benchmarkVerdict({ workload, definition }, java, js, basis, witness) {
  for (const [row, fresh] of [
    [java, basis.kind === "fresh-observation"],
    [js, true],
  ]) {
    if (
      row?.id !== definition.input ||
      !Number.isFinite(row.verificationCount) ||
      !Number.isFinite(row.median?.wallMs) ||
      row.median.wallMs < 0 ||
      (fresh &&
        (row.measurements?.length !== definition.runCount ||
          row.measurements.some(
            ({ wallMs }) => !Number.isFinite(wallMs) || wallMs < 0,
          )))
    )
      throw new Error(`Invalid timing samples for ${definition.input}`);
  }
  const reason =
    basis.kind !== "fresh-observation"
      ? "Historical Java baseline"
      : (workload.comparisonLimitation ??
        (java.verificationCount !== js.verificationCount
          ? "Worker checksums differ"
          : witness?.status !== "passed" ||
              witness.admission !== "independently-witnessed" ||
              witness.semanticMatch !== true
            ? (witness?.reasonId ?? "Missing independent semantic witness")
            : java.median.wallMs === 0 || js.median.wallMs === 0
              ? "Timer resolution"
              : null));
  return reason
    ? { status: "diagnostic-only", reason }
    : {
        status: "qualified",
        ratioVsJava: js.median.wallMs / java.median.wallMs,
        witnessCaseId: witness.caseId,
      };
}

/** Use the existing independently maintained workload implementations in the case registry. */
export async function runBenchmarkComparison(request, environment) {
  const entries = benchmarkComparisonCases(
    request,
    environment.benchmarkParameters,
  );
  const definitions = entries.map(({ caseId, definition }) => ({
    caseId,
    ...definition,
  }));
  if (request.action === "list")
    return { schemaVersion: 1, cases: definitions };
  const output = environment.outputDirectory;
  if (!isAbsolute(output ?? ""))
    throw new Error("An absolute benchmark output directory is required");
  const mode = environment.benchmarkMode ?? "frozen";
  if (!["frozen", "live", "refresh", "missing"].includes(mode))
    throw new Error("Unknown Java benchmark basis");
  const baselinePath =
    environment.javaBaselinePath ?? DEFAULT_JAVA_BASELINE_PATH;
  if (!isAbsolute(baselinePath))
    throw new Error("An absolute Java baseline path is required");
  const semanticEnvironment = {
    ...environment,
    outputDirectory: join(output, "semantic-witness"),
  };
  const semanticRequest = {
    ...request,
    suite: "api-semantics",
    scenario: "api-semantics",
  };
  if (request.action === "verify") {
    const report = JSON.parse(
      await readFile(join(output, "benchmarks.json"), "utf8"),
    );
    const witness =
      mode === "live"
        ? await runBenchmarkApiSemanticsComparison(
            semanticRequest,
            semanticEnvironment,
          )
        : null;
    const expectedBasis =
      mode === "live" ? "fresh-observation" : "historical-baseline";
    const frozen = witness ? null : loadJavaBaseline(baselinePath);
    if (
      report.schemaVersion !== 2 ||
      report.mode !== mode ||
      report.javaBasis?.kind !== expectedBasis ||
      report.fixtureGeneratorSha256 !==
        sha256(await readFile(fixtureGenerator)) ||
      (witness
        ? report.witnessSha256 !== comparisonIdentity(witness) ||
          comparisonIdentity(witness.evidence.java) !==
            comparisonIdentity(report.javaBasis.jdk) ||
          witness.evidence.classpathLockSha256 !==
            report.javaBasis.oracle.lockSha256
        : report.javaBasis.digest !== sha256(await readFile(baselinePath))) ||
      comparisonIdentity(report.definitions) !==
        comparisonIdentity(definitions) ||
      report.cases.length !== definitions.length ||
      report.cases.some(
        (row, index) =>
          row.caseId !== definitions[index].caseId ||
          row.input !== definitions[index].input ||
          row.behaviorProfileId !== definitions[index].behaviorProfileId ||
          (frozen &&
            comparisonIdentity(row.java) !==
              comparisonIdentity(
                frozen.results.find((r) => r.id === row.input),
              )) ||
          comparisonIdentity(row) !==
            comparisonIdentity({
              caseId: row.caseId,
              input: row.input,
              behaviorProfileId: row.behaviorProfileId,
              java: row.java,
              js: row.js,
              ...benchmarkVerdict(
                entries[index],
                row.java,
                row.js,
                report.javaBasis,
                witness?.cases[index],
              ),
            }),
      )
    ) {
      throw new Error(
        "Benchmark evidence does not cover the requested workloads and profiles",
      );
    }
    return { ...report, action: "verify" };
  }
  if (
    request.action !== "run" ||
    request.measurements?.some((measurement) => measurement !== "performance")
  ) {
    throw new Error("The API workload suite records performance observations");
  }
  const { warmupCount, runCount, syntaxCount, importClosureCount } =
    definitions[0];
  if (
    ![warmupCount, runCount, syntaxCount, importClosureCount].every(
      Number.isSafeInteger,
    ) ||
    warmupCount < 0 ||
    runCount < 1 ||
    syntaxCount < 1 ||
    importClosureCount < 1
  ) {
    throw new Error("Invalid benchmark measurement or fixture parameters");
  }
  if (mode === "refresh" && request.input)
    throw new Error("A baseline refresh requires the complete workload roster");
  await mkdir(output);
  const filterIds = [...new Set(entries.map(({ workload }) => workload.id))];
  const sharedFixtures = prepareSharedFixtureDirectory({
    syntaxCount,
    importClosureCount,
  });
  try {
    let javaSuite;
    let javaBasis;
    let witness;
    if (mode !== "frozen") {
      const classpath = await admitReleasedClasspath(environment);
      const selection =
        environment.javaSelection === undefined
          ? undefined
          : javaToolchainSelection(environment.javaSelection);
      const jdk = observeSelectedJavaJdk(environment.javaHome, selection);
      const runJava = (args) => {
        const suite = runJavaBenchmarks({
          ...args,
          classpath: classpath.jars.join(delimiter),
          java: jdk.javaPath,
        });
        if (
          suite.owlapiVersion !== oracleVersion ||
          suite.javaVersion !== jdk.identity.version
        )
          throw new Error("Wrong live Java benchmark oracle");
        const wanted =
          args.filterIds ?? BENCHMARK_DEFINITIONS.map(({ id }) => id);
        if (
          comparisonIdentity(suite.results.map(({ id }) => id).sort()) !==
          comparisonIdentity([...wanted].sort())
        )
          throw new Error("Incomplete live Java benchmark run");
        return suite;
      };
      const parameters = {
        filterIds,
        warmupCount,
        runCount,
        syntaxCount,
        importClosureCount,
        sharedFixtures,
      };
      if (mode === "live") {
        witness = await runBenchmarkApiSemanticsComparison(
          semanticRequest,
          semanticEnvironment,
        );
        if (
          witness.evidence.summary.failed !== 0 ||
          witness.evidence.classpathLockSha256 !==
            classpath.identity.lockSha256 ||
          comparisonIdentity(witness.evidence.java) !==
            comparisonIdentity(jdk.identity)
        )
          throw new Error(
            "Live benchmarks require a successful matching independent Java witness",
          );
        javaSuite = runJava(parameters);
        javaBasis = {
          kind: "fresh-observation",
          oracle: classpath.identity,
          jdk: jdk.identity,
        };
      } else {
        await resolveJavaBaselineSuite({
          ...parameters,
          javaBaselinePath: baselinePath,
          runJava,
          expectedRuntime: {
            javaVersion: jdk.identity.version,
            owlapiVersion: oracleVersion,
            provenance: {
              jdk: jdk.identity,
              classpathLockSha256: classpath.identity.lockSha256,
            },
          },
          refreshJavaBaseline: mode === "refresh",
          updateMissingJavaBaseline: mode === "missing",
        });
      }
    }
    if (mode !== "live") {
      javaSuite = loadJavaBaseline(baselinePath);
      javaBasis = {
        kind: "historical-baseline",
        digest: sha256(await readFile(baselinePath)),
        runtime: javaSuite.javaVersion,
        owlapiVersion: javaSuite.owlapiVersion,
      };
    }
    const jsSuites = new Map();
    for (const profile of new Set(
      entries.map(({ definition }) => definition.behaviorProfileId),
    )) {
      jsSuites.set(
        profile,
        await runJsProfileBenchmarks(profile, {
          warmupCount,
          runCount,
          filterIds,
          sharedFixtures,
        }),
      );
    }
    const cases = entries.map(({ caseId, definition, workload }, index) => {
      const java = javaSuite.results.find((row) => row.id === definition.input);
      const js = jsSuites
        .get(definition.behaviorProfileId)
        .results.find((row) => row.id === definition.input);
      if (!java || !js)
        throw new Error(`Missing worker observation for ${definition.input}`);
      return {
        caseId,
        input: definition.input,
        behaviorProfileId: definition.behaviorProfileId,
        ...benchmarkVerdict(
          { workload, definition },
          java,
          js,
          javaBasis,
          witness?.cases[index],
        ),
        java,
        js,
      };
    });
    const report = {
      schemaVersion: 2,
      mode,
      ...(witness ? { witnessSha256: comparisonIdentity(witness) } : {}),
      action: "run",
      scenario: "api-benchmarks",
      definitions,
      cases,
      javaBasis,
      fixtureGeneratorSha256: sha256(await readFile(fixtureGenerator)),
      javascript: {
        node: process.version,
        explicitGc: typeof globalThis.gc === "function",
      },
    };
    if (witness && witness.sourceSha256 !== (await benchmarkSourceDigest()))
      throw new Error("Benchmark source changed while timings were collected");
    await publishComparisonJson(output, "benchmarks.json", report);
    return report;
  } finally {
    sharedFixtures.cleanup();
  }
}
