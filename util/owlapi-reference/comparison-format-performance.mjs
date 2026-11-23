import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { RUN_COUNT, WARMUP_COUNT } from "../benchmarkSampling.mjs";
import { benchmarkCorpusInputs } from "../verify-owlapi-rdfxml-corpus.mjs";
import {
  comparisonIdentity,
  publishComparisonFile,
  publishComparisonJson,
  sha256,
} from "./comparison-evidence.mjs";
import { resolveComparisonFixture } from "./comparison-fixtures.mjs";
import { executeComparisonProcess } from "./comparison-oracle.mjs";
import { captureSourceIdentity } from "./qualify-universal-ontology.mjs";

const chunked = (format) => [
  ...[16_384, 65_536, 262_144].map(
    (size) => `generated-${format}-large.syntax-to-rdf.chunk-${size}`,
  ),
  `generated-${format}-large.end-to-end`,
];
const controls = (before, after, depth = false) => [
  `generated-functional-large-phase${before}-control`,
  `generated-functional-large-phase${after}`,
  ...(depth
    ? [
        `generated-functional-depth-phase${before}-control`,
        `generated-functional-depth-phase${after}`,
      ]
    : []),
  `generated-mismatch-large-phase${before}-control`,
  `generated-mismatch-large-phase${after}`,
];

// Freeze the predecessor's required report rows independently of a worker's output.
const programs = new Map([
  [
    "functional",
    [
      "generated-functional-large",
      "generated-functional-depth",
      "generated-mismatch-large",
    ],
  ],
  ["manchester", ["generated-manchester-large", "generated-mismatch-large"]],
  ["owlxml", ["generated-owlxml-large", "generated-mismatch-large"]],
  [
    "rdfxml",
    [
      "generated-rdfxml-large.syntax-to-rdf",
      "generated-rdfxml-large.end-to-end",
    ],
  ],
  ["turtle", chunked("turtle")],
  ["ntriples", [...chunked("ntriples"), ...controls(11, 12)]],
  ["nquads", [...chunked("nquads"), ...controls(12, 13)]],
  ["trig", [...chunked("trig"), ...controls(13, 14)]],
  [
    "jsonld",
    [
      "generated-jsonld-large.syntax-to-rdf",
      "generated-jsonld-large.end-to-end",
      "generated-functional-large-phase14-control",
      "generated-functional-large-phase15",
      "generated-mismatch-large-phase14-control",
      "generated-mismatch-1m-phase15-scale",
      "generated-mismatch-4m-phase15-scale",
      "generated-mismatch-large-phase15",
    ],
  ],
  [
    "dl",
    ["generated-dl-large", "generated-dl-depth", ...controls(9, 10, true)],
  ],
  [
    "krss2",
    [
      "generated-krss2-large",
      "generated-krss2-depth",
      ...controls(10, 11, true),
    ],
  ],
  [
    "krss1",
    ["generated-krss1-large", "generated-krss1-depth", ...controls(16, 17)],
  ],
  [
    "rdf-to-owl",
    [
      "generated-rdf-declarations-large",
      "generated-rdf-list-long",
      "generated-rdf-expression-depth",
    ],
  ],
  [
    "owl-to-rdf",
    [
      "generated-owl-declarations-large",
      "generated-owl-list-long",
      "generated-owl-expression-depth",
    ],
  ],
]);

const fixtures = benchmarkCorpusInputs.map(({ id, source, bytes, sha256 }) => ({
  id,
  documentIRI: source,
  syntax: id === "real-small-sosa" ? "turtle" : "rdfxml",
  byteLength: bytes,
  sha256,
}));
const sourceFile = (path) => new URL(path, import.meta.url);
const evidenceFiles = [
  "../benchmarkEnvironment.mjs",
  "../benchmarkParserRegistries.mjs",
  "../benchmarkSampling.mjs",
  "../generate-owlapi-benchmark-fixtures.cjs",
  "../../docs/performance/resource-budgets.json",
];
const coldReports = new Set([
  "rdfxml",
  "turtle",
  "ntriples",
  "nquads",
  "trig",
  "jsonld",
]);

async function selectPrograms(request) {
  const selection = request.input
    ? [request.input].flat()
    : [...programs.keys()];
  if (!selection.length || new Set(selection).size !== selection.length) {
    throw new Error("Select distinct format performance programs");
  }
  const supportSha256 = comparisonIdentity(
    await Promise.all(
      evidenceFiles.map(async (path) => [
        path,
        sha256(await readFile(sourceFile(path))),
      ]),
    ),
  );
  return Promise.all(
    selection.map(async (input) => {
      const resultIds = programs.get(input);
      if (!resultIds)
        throw new Error(`Unknown format performance program: ${input}`);
      const worker = sourceFile(`../benchmark-owlapi-${input}.mjs`);
      const definition = {
        schemaVersion: 1,
        scenario: "format-performance",
        scenarioVersion: 1,
        observationPoint: "format-program-sampling-run",
        engine: "javascript",
        input,
        resultIds,
        firstUse: coldReports.has(input),
        warmups: WARMUP_COUNT,
        measuredRuns: RUN_COUNT,
        supportSha256,
        workerSha256: sha256(await readFile(worker)),
      };
      return { caseId: comparisonIdentity(definition), definition, worker };
    }),
  );
}

function verdict(definition, exitCode, receipt) {
  let raw;
  try {
    raw = JSON.parse(receipt);
  } catch {
    return {
      status: "failed",
      reason: "The JS worker did not return its sample report",
    };
  }
  if (
    raw?.schemaVersion !== 1 ||
    raw.protocol?.warmups !== definition.warmups ||
    raw.protocol?.measuredRuns !== definition.measuredRuns ||
    Boolean(raw.firstUse) !== definition.firstUse ||
    !Array.isArray(raw.results) ||
    raw.results.some(
      ({ measurements, id }, index) =>
        id !== definition.resultIds[index] ||
        !Array.isArray(measurements) ||
        measurements.length !== definition.measuredRuns ||
        measurements.some(
          ({ wallMs, peakHeapBytes }) =>
            !Number.isFinite(wallMs) ||
            wallMs < 0 ||
            !Number.isSafeInteger(peakHeapBytes) ||
            peakHeapBytes < 0,
        ),
    ) ||
    raw.results.length !== definition.resultIds.length
  ) {
    return {
      status: "failed",
      reason: "The original workload or sample inventory is incomplete",
    };
  }
  if (exitCode !== 0 || raw.gates?.boundedDetection?.pass === false) {
    return { status: "failed", reason: "The original JS benchmark failed" };
  }
  return {
    status: "diagnostic-only",
    reason:
      "No paired Java workload or equivalence witness exists for this JS sampling program",
  };
}

async function formatSourceIdentity(repository) {
  const { files, head } = await captureSourceIdentity(repository);
  // Planning edits do not enter any of the format workers' inputs.
  const inputs = files.filter(({ path }) => !path.startsWith("docs/plans/"));
  return { mode: "SOURCE", head, contentSha256: comparisonIdentity(inputs) };
}

async function runFormatWorker(worker, directory, timeout) {
  const attempts = [];
  for (let index = 0; index < 5; index++) {
    let observation;
    try {
      observation = await executeComparisonProcess(
        process.execPath,
        [
          ...process.execArgv.filter((flag) => flag === "--expose-gc"),
          fileURLToPath(worker),
        ],
        { cwd: directory, timeout },
      );
    } catch (error) {
      observation = { stdout: "", stderr: error.message, exitCode: null };
    }
    if (
      index === 4 ||
      observation.stdout ||
      !observation.stderr.includes("Error: The machine is not idle:")
    ) {
      return { ...observation, attempts };
    }
    attempts.push(observation.stderr);
    await delay(2_000);
  }
}

/** Keep the JS specialists' native samples, input inventory and original gate outcomes. */
export async function runFormatPerformance(request, environment, repository) {
  if (
    (request.suite && request.suite !== "format-performance") ||
    (request.scenario && request.scenario !== "format-performance") ||
    request.profile ||
    request.parsingMode ||
    request.format ||
    request.imports ||
    request.javaTurtle ||
    request.javaXml ||
    request.measurements?.some((value) => value !== "performance") ||
    environment.candidateDirectory ||
    environment.packageDirectory
  ) {
    throw new Error(
      "Format performance uses the original JS source workloads and protocols",
    );
  }
  const entries = await selectPrograms(request);
  const definitions = entries.map(({ caseId, definition }) => ({
    caseId,
    ...definition,
  }));
  if (request.action === "list")
    return { schemaVersion: 1, cases: definitions, fixtures };
  const directory = environment.outputDirectory;
  if (
    !isAbsolute(directory ?? "") ||
    !["prepare", "run", "verify"].includes(request.action)
  ) {
    throw new Error(
      "Select a format performance action and an absolute output directory",
    );
  }
  if (request.action === "prepare") {
    await mkdir(directory);
    for (const input of fixtures) {
      await resolveComparisonFixture(
        {
          ...input,
          acquisition: "local-only",
          source: { kind: "https", url: input.documentIRI, redirects: [] },
        },
        environment,
        true,
      );
    }
    const report = {
      schemaVersion: 1,
      action: "prepare",
      cases: definitions,
      fixtures,
    };
    await publishComparisonJson(directory, "preparation.json", report);
    return report;
  }
  const source = await formatSourceIdentity(repository);
  if (request.action === "verify") {
    const attempt = JSON.parse(await readFile(join(directory, "attempt.json")));
    const report = JSON.parse(
      await readFile(join(directory, "format-performance.json")),
    );
    if (
      report.schemaVersion !== 1 ||
      report.action !== "run" ||
      !Array.isArray(report.cases) ||
      report.cases.length !== entries.length ||
      report.source?.mode !== source.mode ||
      report.source.contentSha256 !== source.contentSha256 ||
      attempt.schemaVersion !== 1 ||
      comparisonIdentity(attempt.source) !==
        comparisonIdentity(report.source) ||
      comparisonIdentity(attempt.definitions) !==
        comparisonIdentity(definitions) ||
      comparisonIdentity(report.definitions) !== comparisonIdentity(definitions)
    ) {
      throw new Error(
        "Format performance evidence has a different subject or case roster",
      );
    }
    for (const [index, { caseId, definition }] of entries.entries()) {
      const row = report.cases[index];
      const bytes = await readFile(join(directory, caseId + ".stdout"));
      const observed = verdict(definition, row.exitCode, bytes);
      const retries = row.idleRetries
        ? JSON.parse(await readFile(join(directory, caseId + ".retries.json")))
        : [];
      if (
        row.caseId !== caseId ||
        row.input !== definition.input ||
        row.stdoutSha256 !== sha256(bytes) ||
        !Array.isArray(retries) ||
        retries.length !== row.idleRetries ||
        retries.length > 4 ||
        retries.some(
          (message) =>
            typeof message !== "string" ||
            !message.includes("Error: The machine is not idle:"),
        ) ||
        row.status !== observed.status ||
        row.reason !== observed.reason
      ) {
        throw new Error(
          "Format performance evidence disagrees with the original worker output",
        );
      }
    }
    return { ...report, action: "verify" };
  }
  await mkdir(directory);
  await publishComparisonJson(directory, "attempt.json", {
    schemaVersion: 1,
    source,
    definitions,
  });
  const cases = [];
  for (const { caseId, definition, worker } of entries) {
    const { stdout, stderr, exitCode, attempts } = await runFormatWorker(
      worker,
      directory,
      environment.timeoutMs ?? 1_200_000,
    );
    const raw = await publishComparisonFile(
      directory,
      caseId + ".stdout",
      stdout,
    );
    if (stderr)
      await publishComparisonFile(directory, caseId + ".stderr", stderr);
    if (attempts.length)
      await publishComparisonJson(
        directory,
        caseId + ".retries.json",
        attempts,
      );
    cases.push({
      caseId,
      input: definition.input,
      exitCode,
      idleRetries: attempts.length,
      stdoutSha256: raw.sha256,
      ...verdict(definition, exitCode, stdout),
    });
  }
  const completed = await selectPrograms(request);
  if (
    comparisonIdentity(completed.map(({ caseId }) => caseId)) !==
      comparisonIdentity(entries.map(({ caseId }) => caseId)) ||
    (await formatSourceIdentity(repository)).contentSha256 !==
      source.contentSha256
  ) {
    throw new Error(
      "Source or worker changed during format performance measurement",
    );
  }
  const report = {
    schemaVersion: 1,
    action: "run",
    source,
    definitions,
    cases,
  };
  await publishComparisonJson(directory, "format-performance.json", report);
  return report;
}
