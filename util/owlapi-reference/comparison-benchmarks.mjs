import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import {
  BEHAVIOR_PROFILES,
  BENCHMARK_DEFINITIONS,
  DEFAULT_JAVA_BASELINE_PATH,
  loadJavaBaseline,
  loadBenchmarkApi,
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
import { median } from "./comparison-performance.mjs";
import { verifyBenchmarkApiSemantics } from "../verify-benchmark-api-semantics.mjs";
import { verifyBenchmarkIoSemantics } from "../verify-benchmark-io-semantics.mjs";

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

/** The JS strings and Java files must be the same generated inputs. */
export async function benchmarkFixtureDigest({
  fixturesDir,
  syntaxTexts,
  importClosure,
}) {
  const syntax = await Promise.all(
    Object.entries(syntaxTexts).map(async ([name, text]) => {
      const bytes = await readFile(join(fixturesDir, `${name}.txt`));
      if (!bytes.equals(Buffer.from(text)))
        throw new Error(`Benchmark fixture differs between workers: ${name}`);
      return [name, sha256(bytes)];
    }),
  );
  const imports = await Promise.all(
    Object.entries(importClosure.files).map(async ([iri, file]) => {
      const bytes = await readFile(file);
      if (
        iri === importClosure.rootIRI &&
        !bytes.equals(Buffer.from(importClosure.rootText))
      )
        throw new Error(
          "Benchmark root import fixture differs between workers",
        );
      return [iri, sha256(bytes)];
    }),
  );
  return comparisonIdentity({
    syntax,
    imports,
    rootIRI: importClosure.rootIRI,
  });
}

async function withBenchmarkFixtures(parameters, shared, operation) {
  const fixtures = shared ?? prepareSharedFixtureDirectory(parameters);
  try {
    return await operation(fixtures);
  } finally {
    if (!shared) fixtures.cleanup();
  }
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
  if (!isAbsolute(output ?? ""))
    throw new Error("An absolute api-semantics output directory is required");
  if (!["run", "verify"].includes(request.action))
    throw new Error("The api-semantics suite supports list, run and verify");

  const { syntaxCount, importClosureCount } = definitions[0];
  return withBenchmarkFixtures(
    { syntaxCount, importClosureCount },
    environment.benchmarkFixtures,
    async (fixtures) => {
      const fixtureSha256 = await benchmarkFixtureDigest(fixtures);
      if (request.action === "verify") {
        const { identity: subject } = await environment.benchmarkSubject();
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
          report.schemaVersion !== 2 ||
          comparisonIdentity(report.subject) !== comparisonIdentity(subject) ||
          report.fixtureSha256 !== fixtureSha256 ||
          comparisonIdentity(report.definitions) !==
            comparisonIdentity(definitions) ||
          report.evidence?.harnessSha256 !== expectedHarnessSha256 ||
          report.evidence?.sinkSha256 !== expectedSinkSha256 ||
          report.evidence?.fixtureGeneratorSha256 !==
            expectedFixtureGeneratorSha256 ||
          report.evidence?.summary?.failed !== 0 ||
          report.evidence?.summary?.totalRows !==
            report.evidence?.rows?.length ||
          report.evidence.syntaxCount !== syntaxCount ||
          report.evidence.importClosureCount !== importClosureCount ||
          comparisonIdentity(report.cases) !==
            comparisonIdentity(
              selectedWitnessRows(report.evidence, definitions),
            ) ||
          !Array.isArray(report.cases) ||
          report.cases.length !== definitions.length ||
          report.cases.some(
            (row, index) =>
              row.caseId !== definitions[index].caseId ||
              !["passed", "observed"].includes(row.status),
          )
        ) {
          throw new Error(
            "API semantic evidence does not pass for the requested subject, fixtures and profiles",
          );
        }
        return report;
      }

      await mkdir(output, { recursive: true });
      const selected = await environment.benchmarkSubject(true);
      const publicApi =
        environment.publicApi ?? (await loadBenchmarkApi(selected));
      const classpath = await admitReleasedClasspath(environment);
      const classpathFile = join(output, "locked-java-classpath");
      await writeFile(classpathFile, classpath.jars.join(delimiter), {
        flag: "wx",
      });
      const filterIds = [
        ...new Set(entries.map(({ workload }) => workload.id)),
      ];
      const result = await verifyBenchmarkApiSemantics({
        classpathFile,
        javaHome: environment.javaHome,
        javaSelection: environment.javaSelection,
        javaHeapMiB: environment.javaHeapMiB,
        javaBuildCacheDirectory:
          environment.javaBuildCacheDirectory ??
          (environment.cacheDirectory
            ? join(environment.cacheDirectory, "java-helper-builds")
            : undefined),
        fixtures,
        publicApi,
        syntaxCount,
        importClosureCount,
        filterIds,
      });
      const cases = selectedWitnessRows(result, definitions);
      if (
        fixtureSha256 !== (await benchmarkFixtureDigest(fixtures)) ||
        comparisonIdentity(selected.identity) !==
          comparisonIdentity((await environment.benchmarkSubject()).identity)
      )
        throw new Error(
          "API benchmark subject or fixtures changed during semantic observation",
        );

      const report = {
        schemaVersion: 2,
        action: "run",
        scenario: "api-semantics",
        subject: selected.identity,
        fixtureSha256,
        definitions,
        evidence: result,
        cases,
      };
      await publishComparisonJson(output, "api-semantics.json", report);
      return report;
    },
  );
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
  if (
    ![warmupCount, runCount, syntaxCount, importClosureCount].every(
      Number.isSafeInteger,
    ) ||
    warmupCount < 0 ||
    Math.min(runCount, syntaxCount, importClosureCount) < 1
  )
    throw new Error("Invalid benchmark measurement or fixture parameters");
  const inputs = request.input ? [request.input].flat() : null;
  const definitions = inputs
    ? inputs.map((id) => {
        const definition = BENCHMARK_DEFINITIONS.find((item) => item.id === id);
        if (!definition) throw new Error(`Unknown benchmark workload: ${id}`);
        return definition;
      })
    : BENCHMARK_DEFINITIONS;
  if (definitions.length === 0)
    throw new Error("At least one benchmark workload is required");
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

export function benchmarkVerdict(
  { workload, definition },
  java,
  js,
  basis,
  witness,
) {
  for (const [row, engine, fresh, heap] of [
    [
      java,
      "java",
      basis.kind === "fresh-observation",
      "retainedHeapDeltaBytes",
    ],
    [js, "js", true, "sampledHeapDeltaBytes"],
  ]) {
    if (
      row?.id !== definition.input ||
      !Number.isFinite(row.verificationCount) ||
      !Number.isFinite(row.median?.wallMs) ||
      row.median.wallMs < 0 ||
      !Number.isFinite(row.median[heap]) ||
      (fresh &&
        (!Number.isFinite(row.firstUseWallMs) ||
          row.firstUseWallMs < 0 ||
          !Array.isArray(row.measurements) ||
          row.measurements.length !== definition.runCount ||
          row.measurements.some(
            (sample) =>
              !Number.isFinite(sample?.wallMs) ||
              sample.wallMs < 0 ||
              !Number.isFinite(sample[heap]),
          )))
    )
      throw new Error(`Invalid timing samples for ${definition.input}`);
    if (fresh) {
      const wall = median(row.measurements.map(({ wallMs }) => wallMs));
      const heapDelta = median(row.measurements.map((sample) => sample[heap]));
      const roundedWall =
        engine === "java" && definition.runCount % 2 === 0
          ? Math.round(wall * 1000) / 1000
          : wall;
      if (
        row.median.wallMs !== roundedWall ||
        row.median[heap] !== Math.round(heapDelta)
      )
        throw new Error(
          `Benchmark medians disagree with the raw samples for ${definition.input}`,
        );
    }
  }
  const reason =
    basis.kind !== "fresh-observation"
      ? "Historical Java baseline"
      : (workload.comparisonLimitation ??
        (java.verificationCount !== js.verificationCount
          ? "Worker checksums differ"
          : witness?.groupId !== definition.input ||
              witness.behaviorProfileId !== definition.behaviorProfileId ||
              witness.status !== "passed" ||
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

async function admitBenchmarkReference(environment) {
  const classpath = await admitReleasedClasspath(environment);
  const selection =
    environment.javaSelection === undefined
      ? undefined
      : javaToolchainSelection(environment.javaSelection);
  return {
    classpath,
    jdk: observeSelectedJavaJdk(environment.javaHome, selection),
  };
}

/** Run or verify the public API workloads in the case registry. */
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
    benchmarkSubject: () => environment.benchmarkSubject(),
  };
  const semanticRequest = {
    ...request,
    suite: "api-semantics",
    scenario: "api-semantics",
  };
  if (request.action === "verify") {
    const { identity: subject } = await environment.benchmarkSubject();
    const fixtureSha256 = await withBenchmarkFixtures(
      definitions[0],
      null,
      benchmarkFixtureDigest,
    );
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
    const reference = witness
      ? await admitBenchmarkReference(environment)
      : null;
    const frozen = witness ? null : loadJavaBaseline(baselinePath);
    if (
      report.schemaVersion !== 3 ||
      report.mode !== mode ||
      comparisonIdentity(report.subject) !== comparisonIdentity(subject) ||
      report.fixtureSha256 !== fixtureSha256 ||
      report.javaBasis?.kind !== expectedBasis ||
      report.fixtureGeneratorSha256 !==
        sha256(await readFile(fixtureGenerator)) ||
      (witness
        ? report.witnessSha256 !== comparisonIdentity(witness) ||
          witness.fixtureSha256 !== fixtureSha256 ||
          comparisonIdentity(report.javaBasis.oracle) !==
            comparisonIdentity(reference.classpath.identity) ||
          comparisonIdentity(report.javaBasis.jdk) !==
            comparisonIdentity(reference.jdk.identity) ||
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
  if (mode === "refresh" && request.input)
    throw new Error("A baseline refresh requires the complete workload roster");
  await mkdir(output);
  const selected = await environment.benchmarkSubject(true);
  const publicApi = await loadBenchmarkApi(selected);
  const filterIds = [...new Set(entries.map(({ workload }) => workload.id))];
  const sharedFixtures = prepareSharedFixtureDirectory({
    syntaxCount,
    importClosureCount,
  });
  try {
    const fixtureSha256 = await benchmarkFixtureDigest(sharedFixtures);
    let javaSuite;
    let javaBasis;
    let witness;
    if (mode !== "frozen") {
      const { classpath, jdk } = await admitBenchmarkReference(environment);
      const runJava = (args) => {
        const suite = runJavaBenchmarks({
          ...args,
          classpath: classpath.jars.join(delimiter),
          java: jdk.javaPath,
          javaHeapMiB: environment.javaHeapMiB,
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
        witness = await runBenchmarkApiSemanticsComparison(semanticRequest, {
          ...semanticEnvironment,
          benchmarkFixtures: sharedFixtures,
          publicApi,
        });
        if (
          witness.evidence.summary.failed !== 0 ||
          witness.fixtureSha256 !== fixtureSha256 ||
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
          publicApi,
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
      schemaVersion: 3,
      mode,
      subject: selected.identity,
      fixtureSha256,
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
      limits: {
        windowsJobMiB:
          process.platform === "win32"
            ? (environment.memoryBudgetMiB ?? null)
            : null,
        nodeHeapMiB: environment.nodeHeapMiB ?? null,
        javaHeapMiB: environment.javaHeapMiB ?? null,
      },
    };
    if (
      fixtureSha256 !== (await benchmarkFixtureDigest(sharedFixtures)) ||
      comparisonIdentity(selected.identity) !==
        comparisonIdentity((await environment.benchmarkSubject()).identity)
    )
      throw new Error(
        "API benchmark subject or fixtures changed while timings were collected",
      );
    await publishComparisonJson(output, "benchmarks.json", report);
    return report;
  } finally {
    sharedFixtures.cleanup();
  }
}
