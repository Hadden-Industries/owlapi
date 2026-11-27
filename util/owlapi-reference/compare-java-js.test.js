import { expect, jest, test } from "@jest/globals";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { comparisonCases, runComparison } from "./compare-java-js.mjs";
import {
  bindLinuxBehaviorBaseline,
  referenceCaptureBaseline,
  referenceCaptureVerdicts,
} from "./comparison-reference-captures.mjs";
import { runWindowsComparisonJob } from "./comparison-job.mjs";
import {
  executeComparisonProcess,
  oracleLockPath,
  oracleVersion,
} from "./comparison-oracle.mjs";
import {
  corpusQualificationRoster,
  installedDependencyGraphIdentity,
  bindRetainedConsumerLock,
  reconcileCorpusReceipts,
} from "./comparison-release-evidence.mjs";
import {
  comparisonCatalogue,
  comparisonWitnesses,
  fetchPinnedBytes,
  generatedFixture,
  resolveComparisonFixture,
} from "./comparison-fixtures.mjs";
import {
  comparisonIdentity,
  comparisonStageFailure,
  exactComparedDocuments,
  isRetryableStrictRefusal,
  matchesComparisonImportClosure,
  readNativeComparisonResult,
  recordedNativeRdfXmlRoundTrip,
  sha256,
} from "./comparison-evidence.mjs";
import {
  matchesRecordedIfcowlMismatch,
  reconcileIfcowlSingletonUnions,
} from "./comparison-ifcowl.mjs";
import {
  isolatedLoadReport,
  loadPerformanceReport,
} from "./comparison-performance.mjs";
import {
  compareExpandedRdfXmlDocuments,
  matchesOriginalRdfXml,
} from "./comparison-rdfxml-expansion.mjs";
import { benchmarkSourceDigest } from "./comparison-benchmarks.mjs";

import {
  scopedRuleExpectation,
  matchesScopedRules,
  observeScopedRules,
} from "./comparison-scoped-swrl.mjs";

test("scoped rule evidence requires the reviewed digest, counts, annotation and head memberships", () => {
  const profile = {
    behaviorProfileId: "java-owlapi-5.5.1",
    parsingMode: "compatible",
  };
  const input = {
    id: "obo-vbo",
    sha256: "1375af3c0aac025f38c0a8767d0896a4ed189f290041eb58443d22f990b8b157",
  };
  const expected = scopedRuleExpectation(
    input,
    "direct-load",
    profile,
    "recorded",
  );
  expect(expected).toMatchObject({ rules: 25, annotated: 13, multiHead: 2 });
  const rules = Array.from({ length: 25 }, (_, i) => ({
    kind: "SWRLRule",
    annotations: i < 13 ? [{}] : [],
    head: i < 2 ? [{}, {}] : [{}],
  }));
  const getAxioms = jest.fn(() => [...rules, { kind: "OWLDeclarationAxiom" }]);
  const actual = observeScopedRules({ getAxioms }, input.sha256);
  expect(getAxioms).toHaveBeenCalledTimes(1);
  expect(matchesScopedRules(expected, actual)).toBe(true);
  for (const altered of [
    undefined,
    { ...actual, rules: 24 },
    { ...actual, annotated: 12 },
    { ...actual, multiHead: 0 },
    { ...actual, sha256: "stale" },
  ])
    expect(matchesScopedRules(expected, altered)).toBe(false);
  expect(() =>
    scopedRuleExpectation(
      { ...input, sha256: "other" },
      "direct-load",
      profile,
      "recorded",
    ),
  ).toThrow(/digest/);
  expect(
    scopedRuleExpectation(
      input,
      "direct-load",
      { ...profile, parsingMode: "strict" },
      "recorded",
    ),
  ).toBeUndefined();
});

async function withScratch(run) {
  const directory = await mkdtemp(join(tmpdir(), "owlapi-comparison-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test.each([
  ["source observation", undefined],
  [
    "timed load",
    { mode: "warm", sampleId: "profile-control", warmups: 0, repetitions: 1 },
  ],
])(
  "%s uses the selected profile and refuses a changed parsing mode",
  async (label, performance) => {
    await withScratch(async (directory) => {
      const xml = `<Ontology xmlns="http://www.w3.org/2002/07/owl#">
      <SubClassOf><Class IRI="urn:control:C"/><ObjectOneOf/></SubClassOf>
    </Ontology>`;
      const document = {
        path: join(directory, "control.owx"),
        documentIRI: "urn:control:document",
        syntax: "owlxml",
        byteLength: Buffer.byteLength(xml),
        sha256: sha256(xml),
      };
      await writeFile(document.path, xml);
      const worker = fileURLToPath(
        new URL("./run-comparison-js.mjs", import.meta.url),
      );
      const packageDirectory = fileURLToPath(
        new URL("../../", import.meta.url),
      );
      const observe = async (name, behaviorProfileId, loaderOptions) => {
        const output = join(directory, name);
        await mkdir(output);
        const requestFile = join(output, "request.json");
        const resultFile = join(output, "result.json");
        await writeFile(
          requestFile,
          JSON.stringify({
            caseId: comparisonIdentity([label, name]),
            executionId: "1".repeat(64),
            scenario: "direct-load",
            document,
            imports: [],
            packageDirectory,
            behaviorProfileId,
            parsingMode: "compatible",
            loaderOptions,
            performance,
          }),
        );
        const result = await executeComparisonProcess(process.execPath, [
          worker,
          requestFile,
          resultFile,
        ]);
        return { ...result, resultFile };
      };
      for (const [profile, status] of [
        ["java-owlapi-5.5.1", "completed"],
        ["normative-v1", "failed"],
      ]) {
        const result = await observe(profile, profile);
        expect(result.exitCode).toBe(0);
        if (performance) {
          expect(JSON.parse(result.stdout).status).toBe(status);
        } else {
          const observation = JSON.parse(
            await readFile(result.resultFile, "utf8"),
          );
          expect(observation.effectiveSettings).toMatchObject({
            behaviorProfileId: profile,
            parsingMode: "compatible",
          });
          expect(observation.load.status).toBe(status);
        }
      }
      const overridden = await observe("overridden", "java-owlapi-5.5.1", {
        parsingMode: "strict",
      });
      expect(overridden.stderr).toContain("Comparison loader settings differ");
      expect(overridden.exitCode).not.toBe(0);
    });
  },
);

test("the Linux reference covers the frozen inventory and detects a changed Turtle writer", async () => {
  const suite = "reference-behavior";
  const { cases } = await runComparison({ action: "list", suite });
  const original = await readFile(
    new URL(
      "../../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
      import.meta.url,
    ),
  );
  const baseline = JSON.parse(
    await readFile(
      new URL(
        "../../docs/development/java-toolchain/temurin-25.0.5-linux-x64-behavior.json",
        import.meta.url,
      ),
    ),
  );
  const held = bindLinuxBehaviorBaseline(original, baseline);
  const nativeReference = await referenceCaptureBaseline(
    suite,
    original,
    JSON.parse(original),
  );
  if (process.platform === "linux" && process.arch === "x64") {
    expect(nativeReference.held).toEqual(held);
    expect(nativeReference.reference).toEqual(baseline);
  } else {
    expect(nativeReference.held.size).toBe(0);
    expect(nativeReference.reference).toEqual(JSON.parse(original));
  }
  const statuses = (observations) =>
    referenceCaptureVerdicts(suite, cases, baseline, observations, held);
  const complete = statuses(baseline);
  expect(complete.filter((row) => row.status === "observed")).toHaveLength(27);
  expect(complete.filter((row) => row.status === "incomplete")).toEqual([
    expect.objectContaining({
      probeId: "ObserveResourceContracts",
      reason: expect.stringContaining("#1187"),
    }),
  ]);

  const changed = structuredClone(baseline);
  const writer = changed.observations.find(
    (row) => row.probeId === "ObserveStorageContracts",
  );
  writer.stdout = JSON.parse(original).observations.find(
    (row) => row.probeId === writer.probeId,
  ).stdout;
  expect(statuses(changed).filter((row) => row.status === "failed")).toEqual([
    expect.objectContaining({ probeId: writer.probeId }),
  ]);

  const { basis, ...capture } = structuredClone(baseline);
  capture.observations[0] = capture.observations[1];
  expect(() =>
    bindLinuxBehaviorBaseline(original, {
      ...capture,
      basis: { ...basis, captureIdentity: comparisonIdentity(capture) },
    }),
  ).toThrow("frozen probe inventory");
  expect(() =>
    bindLinuxBehaviorBaseline(original, {
      ...baseline,
      basis: {
        ...basis,
        held: [...basis.held, { caseId: cases[0].caseId, reason: "missing" }],
      },
    }),
  ).toThrow("frozen probe inventory");
});

test("publisher acquisition continues past a minute while bytes keep arriving", async () => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  const oldStyleDeadline = jest
    .spyOn(AbortSignal, "timeout")
    .mockImplementation((milliseconds) => {
      const abort = new AbortController();
      setTimeout(
        () => abort.abort(new Error("Absolute download deadline")),
        milliseconds,
      );
      return abort.signal;
    });
  try {
    const stream = await fetchPinnedBytes(
      { url: "https://publisher.example.test/input.owl", redirects: [] },
      {
        fetchImpl: async (_url, { signal }) =>
          new Response(
            new ReadableStream({
              start(body) {
                const encoder = new TextEncoder();
                let index = 0;
                const timer = setInterval(() => {
                  body.enqueue(
                    encoder.encode(["part1", "part2", "part3"][index++]),
                  );
                  if (index === 3) {
                    clearInterval(timer);
                    signal.removeEventListener("abort", stop);
                    body.close();
                  }
                }, 30_000);
                function stop() {
                  clearInterval(timer);
                  body.error(signal.reason);
                }
                signal.addEventListener("abort", stop, { once: true });
              },
            }),
          ),
      },
    );
    const result = (async () => {
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks).toString();
    })().catch((error) => error.message);
    await jest.advanceTimersByTimeAsync(90_000);
    await expect(result).resolves.toBe("part1part2part3");
  } finally {
    oldStyleDeadline.mockRestore();
    jest.useRealTimers();
  }
});

test("the GAZ download identifies the client and accepts the publisher's file representation", () =>
  withScratch(async (cacheDirectory) => {
    const source = comparisonCatalogue.fixtures.find(
      (row) => row.id === "obo-gaz",
    );
    const payload = Buffer.from("<ontology/>");
    const fixture = {
      ...source,
      byteLength: payload.length,
      sha256: sha256(payload),
    };
    const fetchImpl = jest.fn(async () => new Response(payload));
    const path = await resolveComparisonFixture(
      fixture,
      { cacheDirectory, fetchImpl },
      true,
    );
    expect(await readFile(path)).toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(source.source.url);
    expect(options.headers).toMatchObject({
      Accept: "*/*",
      "User-Agent": expect.stringMatching(
        /^owlapi-corpus-qualification\/\S+ \(\+https:\/\/github\.com\/Hadden-Industries\/owlapi\/issues\)$/u,
      ),
    });
  }));

test("a stalled publisher response is aborted while waiting for bytes", async () => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  try {
    let networkSignal;
    const stream = await fetchPinnedBytes(
      { url: "https://publisher.example.test/input.owl", redirects: [] },
      {
        fetchImpl: async (_url, { signal }) => {
          networkSignal = signal;
          return new Response(new ReadableStream());
        },
      },
    );
    const outcome = (async () => {
      for await (const chunk of stream) return chunk;
      return "empty";
    })().catch((error) => error.message);
    await jest.advanceTimersByTimeAsync(59_999);
    expect(networkSignal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(networkSignal.aborted).toBe(true);
    await expect(outcome).resolves.toMatch(/no network progress/i);
  } finally {
    jest.useRealTimers();
  }
});

test.each([302, 503])(
  "a stalled publisher response disposal is bounded for HTTP %i",
  async (status) => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    try {
      let networkSignal;
      const outcome = fetchPinnedBytes(
        { url: "https://publisher.example.test/input.owl", redirects: [] },
        {
          fetchImpl: async (_url, { signal }) => {
            networkSignal = signal;
            return new Response(
              new ReadableStream({
                cancel: () =>
                  new Promise((resolve) =>
                    signal.addEventListener("abort", resolve, { once: true }),
                  ),
              }),
              { status, headers: { Location: "/next.owl" } },
            );
          },
        },
      ).catch((error) => error.message);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(networkSignal.aborted).toBe(true);
      await expect(outcome).resolves.toMatch(/no network progress/i);
    } finally {
      jest.useRealTimers();
    }
  },
);

test.each(["matching pins", "changed archive", "invalid pin type"])(
  "publisher gzip requires matching archive and member pins (%s)",
  async (variant) => {
    await withScratch(async (cacheDirectory) => {
      const original = Buffer.from("published RDF/XML fixture\n");
      const archive = gzipSync(original);
      const delivered = Buffer.from(archive);
      if (variant === "changed archive")
        delivered[9] = (delivered[9] + 1) % 256;
      const pin = {
        id: "archived-owl-fixture",
        documentIRI: "https://publisher.example.test/fixture.owl",
        syntax: "rdfxml",
        acquisition: "publisher",
        byteLength: original.length,
        sha256: sha256(original),
        source: {
          kind: "https",
          url: "https://publisher.example.test/fixture.owl.gz",
          redirects: [],
          archive: {
            format: "gzip",
            byteLength: archive.length,
            sha256:
              variant === "invalid pin type"
                ? [sha256(archive)]
                : sha256(archive),
          },
        },
      };
      const restored = resolveComparisonFixture(
        pin,
        {
          cacheDirectory,
          fetchImpl: async () => new Response(delivered),
        },
        true,
      );
      if (variant !== "matching pins") {
        await expect(restored).rejects.toThrow(
          variant === "invalid pin type"
            ? /invalid publisher archive pin/iu
            : /gzip archive/iu,
        );
        await expect(
          readFile(join(cacheDirectory, "objects", pin.sha256)),
        ).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        expect(await readFile(await restored)).toEqual(original);
      }
    });
  },
);

test("strict-first accepts a Java-profile aggregate only when every selected parser reports a retryable cause", () => {
  const syntax = Object.assign(
    new Error("Conflicting OWL property categories"),
    {
      code: "OWL_SYNTAX_ERROR",
    },
  );
  const mismatch = Object.assign(new Error("Unrecognized syntax"), {
    code: "PARSER_MISMATCH",
  });
  const aggregate = (errors) =>
    comparisonStageFailure(
      "load",
      Object.assign(new AggregateError(errors), {
        code: "UNPARSABLE_ONTOLOGY",
      }),
    );
  expect(aggregate([syntax]).parserFailures[0]).toMatchObject({
    category: syntax.code,
    message: syntax.message,
  });
  expect(isRetryableStrictRefusal(aggregate([syntax]))).toBe(true);
  expect(isRetryableStrictRefusal(aggregate([syntax, mismatch]))).toBe(false);
  expect(isRetryableStrictRefusal(aggregate([]))).toBe(false);
  expect(isRetryableStrictRefusal({ category: "UNPARSABLE_ONTOLOGY" })).toBe(
    false,
  );
});

test("a writer failure retains the precise RDF statement reported by its parser", () => {
  const statement = {
    subject: "urn:owlapi:header",
    predicate: "http://purl.org/dc/terms/created",
    object: "2021-06-01",
  };
  const cause = Object.assign(new Error("Unconsumed RDF statement"), {
    code: "UNSUPPORTED_CONSTRUCT",
    ...statement,
  });
  const error = Object.assign(new Error("RDF/XML save failed", { cause }), {
    code: "ONTOLOGY_STORAGE_FAILED",
    reason: "ONTOLOGY_NOT_REPRESENTABLE",
  });
  expect(comparisonStageFailure("save", error)).toMatchObject({
    status: "failed",
    phase: "save",
    category: "ONTOLOGY_STORAGE_FAILED",
    details: { reason: "ONTOLOGY_NOT_REPRESENTABLE" },
    causes: [
      {
        category: "UNSUPPORTED_CONSTRUCT",
        details: statement,
      },
    ],
  });
});

test("a completed native write still requires a reload disposition", () => {
  const write = {
    status: "completed",
    artifact: { name: "java-default-closure.rdf" },
  };
  expect(recordedNativeRdfXmlRoundTrip({ write })).toBe(false);
  expect(
    recordedNativeRdfXmlRoundTrip({
      write,
      reload: { status: "completed" },
      comparison: { status: "mismatch" },
    }),
  ).toBe(true);
  expect(
    recordedNativeRdfXmlRoundTrip({
      write,
      reload: {
        status: "failed",
        phase: "rdfxml-reload",
        category: "UnparsableOntologyException",
      },
    }),
  ).toBe(true);
});

test("the reviewed roster preserves all original, closure and held cases", async () => {
  const named = { profile: "java-owlapi-5.5.1" };
  const prospects = comparisonCases({ suite: "prospects", ...named });
  expect(
    prospects.filter(({ definition }) => definition.scenario === "direct-load"),
  ).toHaveLength(47);
  const closures = prospects
    .filter(({ definition }) => definition.scenario === "closure-roundtrip")
    .map(({ input }) => input.id);
  expect(closures).toHaveLength(31);
  expect(closures).toEqual(
    expect.arrayContaining([
      "eu-epo-core",
      "entsoe-cgmes-eq",
      "iof-core",
      "pistoia-idmp",
      "ogc-geosparql",
      "brick-only",
      "building-smart-ifcowl",
      "esco-model",
    ]),
  );
  const wider = comparisonCases({ suite: "wider", ...named });
  expect(wider).toHaveLength(201);
  expect(wider.filter(({ input }) => input.sha256)).toHaveLength(200);
  expect(wider.filter(({ input }) => input.historicalAcquisition)).toHaveLength(
    22,
  );
  expect(
    wider
      .filter(({ input }) => input.acquisition === "unavailable")
      .map(({ input }) => input.id),
  ).toEqual(["obo-ogg"]);
  expect(
    corpusQualificationRoster(comparisonCases).held.map(({ input }) => input),
  ).toEqual(["obo-ogg"]);
  expect(comparisonCatalogue.collections).toHaveLength(24);
  expect(comparisonCatalogue.standIns).toHaveLength(57);
  const universalOntology = comparisonCases({
    suite: "universal-ontology",
    ...named,
  });
  expect(universalOntology).toHaveLength(11);
  for (const { definition } of universalOntology) {
    expect(definition.oracle).toEqual({
      kind: "pinned-source",
      revision: "b61ebe2da83daceebb3e7ba7afbd2582c9240c33",
      version: "5.5.1",
    });
  }
  const list = await runComparison({
    action: "list",
    suite: "prospects",
    ...named,
  });
  expect(list.cases.map(({ caseId }) => caseId)).toEqual(
    prospects.map(({ caseId }) => caseId),
  );
});

test("all active Universal Ontology closure cases use lossless RDF/XML and observe the native default", () => {
  const cases = comparisonCases({ suite: "universal-ontology" });
  const closures = cases.filter(
    ({ definition }) => definition.scenario === "closure-roundtrip",
  );
  expect(cases).toHaveLength(33);
  expect(closures).toHaveLength(12);
  for (const { definition } of closures) {
    expect(definition.javaRdfXml).toEqual({
      addMissingTypes: false,
      observeDefault: true,
    });
    if (definition.behaviorProfileId === "normative-v1") {
      expect(definition).toMatchObject({
        expectedClosure: expect.any(Array),
        allowedSourceDiagnostics: [],
      });
    }
    expect(definition.expectedDifferences).toBeUndefined();
  }
});

test("the benchmark registry accounts for all 70 workloads under both profiles", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "api-benchmarks",
  });
  expect(cases).toHaveLength(140);
  expect(new Set(cases.map(({ input }) => input)).size).toBe(70);
  expect(new Set(cases.map(({ caseId }) => caseId)).size).toBe(140);
  expect(
    cases.filter(
      ({ behaviorProfileId }) => behaviorProfileId === "normative-v1",
    ),
  ).toHaveLength(70);
});

test("registry comparisons reject version ranges, mixed subjects and a benchmark selector before installation", async () => {
  const request = { action: "verify", suite: "universal-ontology" };
  await expect(
    runComparison(request, { registryVersion: "latest" }),
  ).rejects.toThrow(/exact public package version/u);
  const { PACKAGE_VERSION } =
    await import("../../scripts/package-identity.mjs");
  await expect(
    runComparison(request, {
      registryVersion: PACKAGE_VERSION,
      candidateDirectory: "candidate",
    }),
  ).rejects.toThrow(/exact public package version/u);
  await expect(
    runComparison(
      { ...request, suite: "api-benchmarks" },
      { registryVersion: PACKAGE_VERSION },
    ),
  ).rejects.toThrow(/direct or closure ontology comparison/u);
});

test("the api-semantics suite registers all 70 workloads across both profiles", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "api-semantics",
  });
  expect(cases).toHaveLength(140);
  expect(new Set(cases.map(({ input }) => input)).size).toBe(70);
  expect(new Set(cases.map(({ caseId }) => caseId)).size).toBe(140);
  expect(cases[0].scenario).toBe("api-semantics");
});

test("api-semantics verify rejects stale harness, sink, or fixture generator evidence", async () => {
  await withScratch(async (outputDirectory) => {
    const { cases: definitions } = await runComparison({
      action: "list",
      suite: "api-semantics",
      input: "model.IRI.create",
    });
    const harnessSha256 = sha256(
      await readFile(
        new URL("./VerifyBenchmarkApiSemantics.java", import.meta.url),
      ),
    );
    const sinkSha256 = sha256(
      await readFile(
        new URL("../verify-benchmark-api-semantics.mjs", import.meta.url),
      ),
    );
    const fixtureGeneratorSha256 = sha256(
      await readFile(
        new URL("../generate-owlapi-benchmark-fixtures.cjs", import.meta.url),
      ),
    );
    const rows = definitions.map(({ input: groupId, behaviorProfileId }) => ({
      groupId,
      behaviorProfileId,
      status: "passed",
      admission: "independently-witnessed",
      semanticMatch: true,
    }));
    const validReport = {
      schemaVersion: 1,
      action: "run",
      scenario: "api-semantics",
      sourceSha256: await benchmarkSourceDigest(),
      definitions,
      evidence: {
        rows,
        syntaxCount: definitions[0].syntaxCount,
        importClosureCount: definitions[0].importClosureCount,
        harnessSha256,
        sinkSha256,
        fixtureGeneratorSha256,
        summary: {
          totalRows: definitions.length,
          passed: definitions.length,
          observed: 0,
          failed: 0,
        },
      },
      cases: definitions.map((definition, index) => ({
        caseId: definition.caseId,
        ...rows[index],
      })),
    };
    const reportPath = join(outputDirectory, "api-semantics.json");
    await writeFile(
      reportPath,
      JSON.stringify({
        ...validReport,
        evidence: { ...validReport.evidence, sinkSha256: "0".repeat(64) },
      }),
      "utf8",
    );
    await expect(
      runComparison(
        {
          action: "verify",
          suite: "api-semantics",
          input: "model.IRI.create",
        },
        { outputDirectory },
      ),
    ).rejects.toThrow(/API semantic evidence/u);

    await writeFile(reportPath, JSON.stringify(validReport), "utf8");
    const verified = await runComparison(
      {
        action: "verify",
        suite: "api-semantics",
        input: "model.IRI.create",
      },
      { outputDirectory },
    );
    expect(verified.cases).toHaveLength(2);
  });
}, 30_000);

test("Manchester literal rendering owns a separate behavior-only release case", async () => {
  const scenario = "large-literal-rendering";
  const { cases } = await runComparison({ action: "list", scenario });
  expect(cases).toHaveLength(1);
  const [rendering] = cases;
  expect(rendering).toMatchObject({
    scenario,
    observationPoint: "manchester-object-render",
    input: { id: "large-literal/manchester-render" },
    literal: { character: "x", length: 33_554_433, renderedBytes: 33_554_435 },
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  const fourWriters = comparisonCases({ scenario: "large-literal-roundtrip" });
  expect(fourWriters).toHaveLength(4);
  expect(fourWriters.map(({ caseId }) => caseId)).not.toContain(
    rendering.caseId,
  );
  expect(
    corpusQualificationRoster(comparisonCases)
      .cells.filter(({ caseId }) => caseId === rendering.caseId)
      .map(({ platform, measurement }) => [platform, measurement]),
  ).toEqual([
    ["linux", "behavior"],
    ["win32", "behavior"],
  ]);
});

test("RDF/XML writer presentation and structure have seven same-input cases", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "rdfxml-writer",
  });
  expect(cases.map(({ writerMode }) => writerMode)).toEqual([
    "defaults",
    "no-banners",
    "two-spaces",
    "no-indent",
    "labels",
    "save-ids",
    "force-string",
  ]);
  expect(new Set(cases.map(({ caseId }) => caseId)).size).toBe(7);
  expect(new Set(cases.map(({ input }) => input.sha256)).size).toBe(1);
  for (const entry of cases) {
    expect(entry).toMatchObject({
      scenario: "rdfxml-writer",
      oracle: {
        kind: "pinned-source",
        revision: "b61ebe2da83daceebb3e7ba7afbd2582c9240c33",
      },
      input: { syntax: "functional" },
      behaviorProfileId: "normative-v1",
    });
  }
});

test("canonical VOWL cases bind each original preserve-mode OWL 2 DL assessment", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "canonical-vowl-dl",
  });
  expect(cases).toHaveLength(20);
  expect(new Set(cases.map(({ caseId }) => caseId)).size).toBe(20);
  expect(cases.map(({ input }) => input.id)).toEqual(
    expect.arrayContaining([
      "valid-empty",
      "invalid-datatype-cycle",
      "import-nonsimple-forward",
      "import-nonsimple-reverse",
      "import-bad-annotation",
    ]),
  );
  for (const entry of cases) {
    expect(entry).toMatchObject({
      scenario: "canonical-vowl-dl",
      observationPoint: "owl2-dl-profile-assessment",
      parsingMode: "preserve",
      sourceAssessment: true,
      behaviorProfileId: "normative-v1",
      oracle: { kind: "pinned-source" },
    });
  }
});

test("the RDF/XML benchmark corpus preserves the three pinned source observations", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "rdfxml-corpus",
  });
  expect(cases.map(({ input }) => input.id)).toEqual([
    "real-medium-wine",
    "real-large-geonames",
    "real-largest-schemaorg",
  ]);
  expect(cases.map(({ expected }) => expected.strictErrorCode)).toEqual([
    null,
    "UNSUPPORTED_CONSTRUCT",
    "OWL_SYNTAX_ERROR",
  ]);
  for (const { input } of cases) {
    expect(input.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(input).not.toHaveProperty("localEvidencePath");
  }
});

test("the format performance suite registers all 14 programs and their sampling cases", async () => {
  const { cases, fixtures } = await runComparison({
    action: "list",
    suite: "format-performance",
  });
  expect(cases).toHaveLength(14);
  const turtle = cases.find(({ input }) => input === "turtle");
  expect(turtle.resultIds).toEqual([
    "generated-turtle-large.syntax-to-rdf.chunk-16384",
    "generated-turtle-large.syntax-to-rdf.chunk-65536",
    "generated-turtle-large.syntax-to-rdf.chunk-262144",
    "generated-turtle-large.end-to-end",
  ]);
  expect(cases.every(({ engine }) => engine === "javascript")).toBe(true);
  expect(fixtures.map(({ id }) => id)).toEqual([
    "real-small-sosa",
    "real-medium-wine",
    "real-large-geonames",
    "real-largest-schemaorg",
  ]);
});

test("public configuration behavior cases bind the supported loader and writer operations", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  const configurationCases = cases.filter((item) => item.configuration);
  expect(configurationCases.map(({ input }) => input.id)).toEqual([
    "configuration/loader",
    "configuration/writer",
  ]);
  expect(
    configurationCases.map(({ configuration }) => configuration.decisionId),
  ).toEqual(["BEHAVIOR-LOADER-CONFIGURATION", "BEHAVIOR-WRITER-CONFIGURATION"]);
  expect(
    cases.every(
      ({ behaviorProfileId }) => behaviorProfileId === "java-owlapi-5.5.1",
    ),
  ).toBe(true);
});

test("public mutation cases register batch publication, foreign ownership and copy independently", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  const mutationCases = cases.filter((item) => item.mutation);
  expect(mutationCases.map(({ mutation }) => mutation.decisionId)).toEqual([
    "BEHAVIOR-MUTATION-PUBLICATION",
    "BEHAVIOR-FOREIGN-MANAGER-MUTATION",
    "BEHAVIOR-ONTOLOGY-COPY",
  ]);
  expect(new Set(mutationCases.map(({ caseId }) => caseId)).size).toBe(3);
});

test("the load publication case records distinct failure and retry documents", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  const loading = cases.find((item) => item.loadPublication);
  expect(loading).toMatchObject({
    input: { id: "loading/syntax-failure-and-retry" },
    loadPublication: { decisionId: "BEHAVIOR-LOAD-PUBLICATION" },
  });
  expect(loading.loadPublication.failedDocumentIRI).not.toBe(
    loading.loadPublication.retryDocumentIRI,
  );
  expect(loading.loadPublication.failedText).toContain("NOT_SYNTAX");
});

test("storage behavior registers reuse and parameter observation for all four formats", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  const storageCases = cases.filter((item) => item.storage);
  expect(storageCases).toHaveLength(8);
  for (const format of ["functional", "turtle", "rdfxml", "owlxml"]) {
    const formatCases = storageCases.filter(
      ({ storage }) => storage.format === format,
    );
    expect(formatCases.map(({ storage }) => storage.decisionId)).toEqual([
      "BEHAVIOR-STORAGE-TARGET",
      "BEHAVIOR-STORAGE-PARAMETERS",
    ]);
  }
});

test("literal construction binds every recorded typed and language input", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  const literal = cases.find((item) => item.literalConstruction);
  expect(literal).toMatchObject({
    input: { id: "factory/literal-construction" },
    literalConstruction: {
      decisionId: "BEHAVIOR-LITERAL-CONSTRUCTION",
      typedCount: 672,
      languageCount: 6,
    },
  });
  expect(literal.literalConstruction.javaRowsSha256).toMatch(/^[0-9a-f]{64}$/u);
});

test("query behavior registers deferred search and closure snapshots independently", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  expect(
    cases
      .filter(({ queryBehavior }) => queryBehavior)
      .map(({ queryBehavior }) => queryBehavior.decisionId),
  ).toEqual(["BEHAVIOR-SEARCH-CONSUMPTION", "BEHAVIOR-CLOSURE-PROVIDER"]);
});

test("parser behavior binds witnessed selection, metadata, enumeration and datatype cases", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  expect(
    cases
      .filter(({ parserBehavior }) => parserBehavior)
      .map(({ parserBehavior }) => [
        parserBehavior.decisionId,
        parserBehavior.rows.length,
      ]),
  ).toEqual([
    ["BEHAVIOR-PARSER-SELECTION", 2],
    ["BEHAVIOR-RDF-METADATA", 7],
    ["BEHAVIOR-INDIVIDUAL-ENUMERATION", 4],
    ["BEHAVIOR-NAMED-DATATYPE-RESTRICTION", 2],
  ]);
});

test("profile identity is explicit and existing resource and language profile cases bind the ledger", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  const identity = cases.find((item) => item.profileIdentity);
  expect(identity?.profileIdentity.decisionId).toBe(
    "BEHAVIOR-PROFILE-IDENTITY",
  );
  const roster = corpusQualificationRoster(comparisonCases);
  for (const id of [
    "BEHAVIOR-PROFILE-IDENTITY",
    "BEHAVIOR-RESOURCE-ACCEPTANCE",
    "BEHAVIOR-OWL-LANGUAGE-PROFILES",
  ]) {
    expect(roster.unregisteredBehaviorDecisions).not.toContain(id);
    expect(roster.cells.some((cell) => cell.behaviorDecisionId === id)).toBe(
      true,
    );
  }
});

test("locality behavior binds exact seed and filter inputs", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  const locality = cases.find(({ localityBehavior }) => localityBehavior);
  expect(locality).toMatchObject({
    input: { id: "locality/filtered-forward-chain" },
    localityBehavior: { decisionId: "BEHAVIOR-LOCALITY", seed: "urn:module:A" },
  });
  expect(locality.localityBehavior.excluded).toEqual([
    "urn:module:B",
    "urn:module:C",
  ]);
});

test("the XML provider case declares the original finite expansion limits", async () => {
  const { cases } = await runComparison({
    action: "list",
    suite: "public-api-behavior",
  });
  const xml = cases.find(({ xmlProvider }) => xmlProvider);
  expect(xml?.xmlProvider.decisionId).toBe("BEHAVIOR-XML-PROVIDER");
  expect(xml.xmlProvider.limits).toEqual(["0", "1", "2", "-1", "bad"]);
});

test("release shadow coverage rejects a different oracle, source evidence and duplicate cells", async () => {
  const subject = {
    tarballSha256: "1".repeat(64),
    dependencyGraphSha256: "2".repeat(64),
    artifactSha256: "3".repeat(64),
    artifactId: "123",
    integrity: "sha512-AAAA",
  };
  const oracle = {
    lockSha256: sha256(await readFile(oracleLockPath)),
    version: oracleVersion,
  };
  const roster = corpusQualificationRoster(comparisonCases);
  const cell = roster.cells.find(
    ({ measurement }) => measurement === "structure",
  );
  const receipt = {
    ...cell,
    subject,
    oracle,
    provenance: "SOURCE",
    verdict: "match",
    stageSha256: "5".repeat(64),
    producerArtifactSha256: "6".repeat(64),
    producerRun: "7",
    producerAttempt: "1",
  };
  await expect(
    reconcileCorpusReceipts(
      {
        subject,
        oracle: { ...oracle, lockSha256: "4".repeat(64) },
        receipts: [],
      },
      comparisonCases,
    ),
  ).rejects.toThrow("authenticated candidate and oracle identities");
  const verdict = await reconcileCorpusReceipts(
    { subject, oracle, receipts: [receipt, receipt] },
    comparisonCases,
  );
  expect(verdict.status).toBe("incomplete");
  expect(verdict.missing).toHaveLength(roster.cells.length - 1);
  expect(verdict.rejected.map(({ reason }) => reason)).toEqual([
    "Missing, mismatched or inconclusive case evidence",
    "Duplicate required cell",
  ]);
});

test("release shadow preserves the separately pinned writer and VOWL source cases", async () => {
  const roster = corpusQualificationRoster(comparisonCases);
  const [writer] = comparisonCases({ suite: "rdfxml-writer" });
  const [vowl] = comparisonCases({ suite: "canonical-vowl-dl" });
  const cells = (caseId) =>
    roster.cells.filter((cell) => cell.caseId === caseId);
  expect(cells(writer.caseId).map(({ measurement }) => measurement)).toEqual([
    "behavior",
    "structure",
    "behavior",
    "structure",
  ]);
  expect(cells(vowl.caseId).map(({ measurement }) => measurement)).toEqual([
    "behavior",
    "behavior",
  ]);
  for (const cell of [...cells(writer.caseId), ...cells(vowl.caseId)]) {
    expect(cell.oracle).toEqual(writer.definition.oracle);
  }
  const subject = {
    tarballSha256: "1".repeat(64),
    dependencyGraphSha256: "2".repeat(64),
    artifactSha256: "3".repeat(64),
    artifactId: "123",
    integrity: "sha512-AAAA",
  };
  const oracle = {
    lockSha256: sha256(await readFile(oracleLockPath)),
    version: oracleVersion,
  };
  const [cell] = cells(writer.caseId);
  const base = {
    ...cell,
    subject,
    provenance: "INSTALLED_CANDIDATE",
    verdict: "observed",
    stageSha256: "5".repeat(64),
    producerArtifactSha256: "6".repeat(64),
    producerRun: "7",
    producerAttempt: "1",
  };
  const redirected = await reconcileCorpusReceipts(
    { subject, oracle, receipts: [{ ...base, oracle }] },
    comparisonCases,
  );
  expect(redirected.rejected).toHaveLength(1);
  const admitted = await reconcileCorpusReceipts(
    {
      subject,
      oracle,
      receipts: [
        {
          ...base,
          oracle: {
            ...cell.oracle,
            classpathSha256: "7".repeat(64),
            jars: [
              {
                file: "owlapi-api-5.5.1.jar",
                byteLength: 99,
                sha256: "8".repeat(64),
              },
            ],
          },
        },
      ],
    },
    comparisonCases,
  );
  expect(admitted.rejected).toHaveLength(0);
  expect(admitted.status).toBe("incomplete");
});

test("JSON-LD provider and parser behavior each bind a distinct required witness", () => {
  const cases = comparisonCases({ suite: "public-api-behavior" });
  const roster = corpusQualificationRoster(comparisonCases);
  for (const [input, decisionId] of [
    ["jsonld/context-provider", "BEHAVIOR-JSONLD-CONTEXT-PROVIDER"],
    ["jsonld/first-structure", "BEHAVIOR-JSONLD-FIRST-STRUCTURE"],
  ]) {
    const entry = cases.find(({ input: fixture }) => fixture.id === input);
    expect(entry).toBeDefined();
    expect(
      roster.cells.filter(({ caseId }) => caseId === entry.caseId),
    ).toEqual([
      expect.objectContaining({
        input,
        platform: "linux",
        measurement: "behavior",
        behaviorDecisionId: decisionId,
      }),
      expect.objectContaining({
        input,
        platform: "win32",
        measurement: "behavior",
        behaviorDecisionId: decisionId,
      }),
    ]);
    expect(roster.unregisteredBehaviorDecisions).not.toContain(decisionId);
  }
});

test("all registered receipts still hold shadow qualification when a behavior decision lacks a case", async () => {
  const incompleteRegistry = (selection) =>
    comparisonCases(selection).filter(
      ({ input }) => !input.id.startsWith("node-transport/"),
    );
  const subject = {
    tarballSha256: "1".repeat(64),
    dependencyGraphSha256: "2".repeat(64),
    artifactSha256: "3".repeat(64),
    artifactId: "123",
    integrity: "sha512-AAAA",
  };
  const oracle = {
    lockSha256: sha256(await readFile(oracleLockPath)),
    version: oracleVersion,
  };
  const roster = corpusQualificationRoster(incompleteRegistry);
  const receipts = roster.cells.map((cell) => ({
    ...cell,
    subject,
    oracle: cell.oracle
      ? {
          ...cell.oracle,
          classpathSha256: "7".repeat(64),
          jars: [
            {
              file: "owlapi-api-5.5.1.jar",
              byteLength: 99,
              sha256: "8".repeat(64),
            },
          ],
        }
      : oracle,
    provenance: "INSTALLED_CANDIDATE",
    verdict: cell.expectedDifferenceRules
      ? "reconciled"
      : cell.measurement === "structure"
        ? "match"
        : "observed",
    ...(cell.expectedDifferenceRules
      ? { reconciledRuleIds: cell.expectedDifferenceRules }
      : {}),
    stageSha256: "5".repeat(64),
    producerArtifactSha256: "6".repeat(64),
    producerRun: "7",
    producerAttempt: "1",
  }));
  const result = await reconcileCorpusReceipts(
    { subject, oracle, receipts },
    incompleteRegistry,
  );
  expect(result.missing).toHaveLength(0);
  expect(result.rejected).toHaveLength(0);
  expect(result.unregisteredBehaviorDecisions).toContain(
    "BEHAVIOR-NODE-TRANSPORT",
  );
  expect(result.unregisteredBehaviorDecisions).not.toContain(
    "BEHAVIOR-STORAGE-TARGET",
  );
  expect(result.status).toBe("incomplete");
});

test("the shadow roster requires the socket, compression and context acquisition witnesses", () => {
  const roster = corpusQualificationRoster(comparisonCases);
  for (const [input, decision] of [
    ["node-transport/loopback", "BEHAVIOR-NODE-TRANSPORT"],
    ["node-transport/compression", "BEHAVIOR-NODE-TRANSPORT"],
    ["jsonld/context-transport", "BEHAVIOR-JSONLD-CONTEXT-PROVIDER"],
  ]) {
    expect(
      roster.cells
        .filter(({ input: id }) => id === input)
        .map(({ platform, behaviorDecisionId }) => [
          platform,
          behaviorDecisionId,
        ]),
    ).toEqual([
      ["linux", decision],
      ["win32", decision],
    ]);
  }
  expect(roster.unregisteredBehaviorDecisions).toEqual([]);
});

test("every required case belongs to one deterministic shard per platform", async () => {
  const request = { action: "list", suite: "release-semantics" };
  const listed = await runComparison(request);
  const key = ({ platform, caseId }) => `${platform}:${caseId}`;
  const required = new Set(listed.cases.map(key));
  const planned = listed.shards.flatMap(({ platform, caseIds }) =>
    caseIds.map((caseId) => key({ platform, caseId })),
  );
  expect(planned).toHaveLength(required.size);
  expect(new Set(planned)).toEqual(required);
  expect(listed.shards.every(({ caseIds }) => caseIds.length > 0)).toBe(true);
  expect((await runComparison(request)).shards).toEqual(listed.shards);
  const { shardId } = listed.shards.find(
    ({ platform }) => platform === process.platform,
  );
  await expect(
    runComparison(
      { action: "run", suite: "release-semantics", shard: shardId },
      { memoryGuard: false },
    ),
  ).rejects.toThrow("an installed candidate");
});

test("installed graph identity is portable across producer directories", () => {
  const makeLock = (root, nested) => {
    const consumerDirectory = resolve(root, ...nested);
    const tarballPath = resolve(root, "approved candidate", "owlapi.tgz");
    const integrity = "sha512-AAAA";
    const tarballSha256 = "1".repeat(64);
    const lock = {
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { owlapi: pathToFileURL(tarballPath).href } },
        "node_modules/owlapi": {
          integrity,
          resolved:
            "file:" +
            relative(consumerDirectory, tarballPath).split(sep).join("/"),
        },
        "node_modules/dependency": { integrity: "sha512-BBBB" },
      },
    };
    return {
      lock,
      options: { consumerDirectory, tarballPath, integrity, tarballSha256 },
    };
  };
  const { lock, options } = makeLock("fresh", ["consumer"]);
  const promoted = makeLock("promoted", ["proof", "consumer"]);
  const expected = installedDependencyGraphIdentity(lock, options);
  expect(
    installedDependencyGraphIdentity(promoted.lock, promoted.options),
  ).toBe(expected);
  promoted.lock.packages["node_modules/dependency"].integrity = "sha512-CCCC";
  expect(
    installedDependencyGraphIdentity(promoted.lock, promoted.options),
  ).not.toBe(expected);
  promoted.lock.packages["node_modules/owlapi"].resolved =
    "file:other/owlapi.tgz";
  expect(() =>
    installedDependencyGraphIdentity(promoted.lock, promoted.options),
  ).toThrow("does not resolve the admitted candidate");
});

test("a hosted consumer reuses the retained lock with only the candidate alias rebased", () => {
  const options = {
    consumerDirectory: resolve("worker", "consumer"),
    tarballPath: resolve("worker", "candidate", "owlapi.tgz"),
    tarballSha256: "1".repeat(64),
    integrity: "sha512-AAAA",
  };
  const original = {
    name: "owlapi-release-consumer",
    version: "0.0.0",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "owlapi-release-consumer",
        version: "0.0.0",
        dependencies: { owlapi: "file:/old/runner/owlapi.tgz" },
      },
      "node_modules/owlapi": {
        version: "0.1.0",
        resolved: "file:../old/runner/owlapi.tgz",
        integrity: options.integrity,
      },
      "node_modules/dep": {
        version: "1.2.3",
        resolved: "https://registry.npmjs.org/dep/-/dep-1.2.3.tgz",
        integrity: "sha512-BBBB",
      },
    },
  };
  const bound = bindRetainedConsumerLock(original, options);
  expect(original.packages[""].dependencies.owlapi).toBe(
    "file:/old/runner/owlapi.tgz",
  );
  expect(bound.packages[""].dependencies.owlapi).toBe(
    pathToFileURL(options.tarballPath).href,
  );
  expect(bound.packages["node_modules/dep"]).toEqual(
    original.packages["node_modules/dep"],
  );
  expect(installedDependencyGraphIdentity(bound, options)).toMatch(
    /^[0-9a-f]{64}$/u,
  );
  expect(() =>
    bindRetainedConsumerLock(original, {
      ...options,
      integrity: "sha512-CCCC",
    }),
  ).toThrow("retained consumer lock");
});

test("a requested Node heap must fit within the Windows job budget", async () => {
  await expect(
    runWindowsComparisonJob(
      { action: "run" },
      {
        memoryBudgetMiB: 3072,
        nodeHeapMiB: 3072,
      },
      "unused",
    ),
  ).rejects.toThrow("smaller than the comparison job budget");
});

test("phase-isolated load measurements reject retry scenarios", async () => {
  await expect(
    runComparison({
      action: "list",
      input: "obo-cido",
      scenario: "strict-first",
      loadOnly: true,
    }),
  ).rejects.toThrow("direct-load");
});

test("isolated observations separate load and public Set peaks and bind the complete witness", () => {
  const identity = { caseId: "a".repeat(64), executionId: "b".repeat(64) };
  const protocol = {
    coldSamples: 1,
    materializeAxioms: true,
    sourceTransport: "string",
    engines: ["js", "java"],
  };
  const sample = (engine) => ({
    ...identity,
    sampleId: engine + "-cold-0",
    status: "completed",
    networkAttempts: 0,
    sourceTransport: "string",
    wallNanos: [31],
    axioms: 2,
    witness: {
      identity: { ontologyIRI: "urn:test", versionIRI: null },
      axioms: 2,
      ontologyAnnotations: 1,
      imports: [],
    },
    checkpoints: ["before", "after", "materialized"].map((phase, i) => ({
      phase,
      rssBytes: 10,
      peakRssBytes: [10, 20, 70][i],
      heapUsedBytes: 4,
      heapTotalBytes: 6,
      ...(engine === "js" ? { externalBytes: 1, arrayBufferBytes: 0 } : {}),
    })),
  });
  const samples = {
    js: { cold: [sample("js")] },
    java: { cold: [sample("java")] },
  };
  expect(isolatedLoadReport(samples, protocol, identity)).toMatchObject({
    status: "observed",
    summary: { js: { coldPeakBytes: 20, materializedPeakBytes: 70 } },
  });
  const diagnostic = isolatedLoadReport(
    { js: samples.js },
    { ...protocol, engines: ["js"], allocationProfile: true },
    identity,
  );
  expect(diagnostic.status).toBe("diagnostic-only");
  expect(diagnostic.measurementKind).toBe("allocation-profile");
  expect(diagnostic).not.toHaveProperty("summary");
  expect(diagnostic.diagnosticSummary.js.coldPeakBytes).toBe(20);
  samples.java.cold[0].witness.ontologyAnnotations++;
  expect(isolatedLoadReport(samples, protocol, identity)).toMatchObject({
    status: "diagnostic-only",
    diagnosticSummary: { java: { coldPeakBytes: 20 } },
  });
  samples.java.cold[0].witness.ontologyAnnotations--;
  samples.java.cold[0].witness.identity.ontologyIRI = "urn:different";
  expect(isolatedLoadReport(samples, protocol, identity).status).toBe("failed");
  samples.js.cold[0].checkpoints.pop();
  expect(() => isolatedLoadReport(samples, protocol, identity)).toThrow(
    "phase checkpoint",
  );
});

test("native and JavaScript closures must cover the same unique document IRIs", () => {
  const model = (documentIRI) => ({
    documentIRI,
    status: "completed",
    artifact: { sha256: "a".repeat(64) },
  });
  const root = model("urn:root");
  const dependency = model("urn:import");
  const unrelated = model("urn:elsewhere");
  expect(exactComparedDocuments([root, dependency], [dependency, root])).toBe(
    true,
  );
  expect(exactComparedDocuments([root, dependency], [root, unrelated])).toBe(
    false,
  );
  expect(exactComparedDocuments([root, root], [root, root])).toBe(false);
  expect(exactComparedDocuments([root, dependency], [root, root])).toBe(false);
});

test("a performance result requires every requested cold sample and warm repetition", () => {
  const identity = { caseId: "1".repeat(64), executionId: "2".repeat(64) };
  const timings = {
    ...identity,
    status: "completed",
    axioms: 1,
    networkAttempts: 0,
    wallNanos: [123],
  };
  const checkpoint = (phase) => ({ phase, rssBytes: 100, peakRssBytes: 101 });
  const cold = {
    ...timings,
    checkpoints: [checkpoint("before"), checkpoint("after")],
  };
  const samples = (engine) => ({
    cold: [{ ...cold, sampleId: `${engine}-cold-0` }],
    warm: { ...timings, checkpoints: [], sampleId: `${engine}-warm-0` },
  });
  const request = {
    samples: { js: samples("js"), java: samples("java") },
    sameOperation: true,
    expectedCounts: { js: 1, java: 1 },
    protocol: { coldSamples: 1, repetitions: 1 },
    identity,
  };
  expect(loadPerformanceReport(request).comparison.status).toBe("qualified");
  const priorAttempt = {
    ...request.samples.js.warm,
    executionId: "3".repeat(64),
  };
  expect(
    loadPerformanceReport({
      ...request,
      samples: {
        ...request.samples,
        js: { ...request.samples.js, warm: priorAttempt },
      },
    }).comparison.status,
  ).toBe("diagnostic-only");
  expect(
    loadPerformanceReport({
      ...request,
      samples: { ...request.samples, js: request.samples.java },
    }).comparison.status,
  ).toBe("diagnostic-only");
  expect(() =>
    loadPerformanceReport({
      ...request,
      protocol: { coldSamples: 2, repetitions: 1 },
    }),
  ).toThrow("cold sample");
  expect(
    loadPerformanceReport({
      ...request,
      protocol: { coldSamples: 1, repetitions: 2 },
    }).comparison.status,
  ).toBe("diagnostic-only");
});

test("an explicit unguarded comparison reaches the normal run boundary", async () => {
  await expect(
    runComparison(
      { action: "run", input: "pistoia-idmp" },
      { memoryGuard: false, memoryBudgetMiB: 1 },
    ),
  ).rejects.toThrow("Comparison requires an absolute output directory");
});

test("the exact stock IDMP load gates both direct and closure observations", () => {
  const request = { input: "pistoia-idmp", profile: "java-owlapi-5.5.1" };
  const [stock] = comparisonCases({ ...request, javaXml: "stock" });
  expect(stock.definition.expectedLoadRefusals).toMatchObject({
    js: { category: "RESOURCE_LIMIT_EXCEEDED", limit: 100_000 },
    java: { diagnosticCode: "JAXP00010004" },
  });
  const [closure] = comparisonCases({
    ...request,
    javaXml: "stock",
    scenario: "closure-roundtrip",
  });
  expect(closure.caseId).not.toBe(stock.caseId);
  expect(closure.definition.expectedLoadRefusals).toEqual(
    stock.definition.expectedLoadRefusals,
  );
  const roster = corpusQualificationRoster(comparisonCases);
  for (const { caseId } of [stock, closure]) {
    expect(
      roster.cells
        .filter((cell) => cell.caseId === caseId)
        .map(({ measurement }) => measurement),
    ).toEqual(["behavior", "behavior"]);
    expect(roster.inapplicable).toContainEqual({
      caseId,
      input: "pistoia-idmp",
      measurement: "structure",
      prerequisite: "load",
      reason: "expected-xml-entity-limit",
    });
  }
  for (const changes of [
    { javaXml: "historical-idmp" },
    { scenario: "closure-roundtrip", javaXml: "historical-idmp" },
    { scenario: "strict-first" },
    { imports: "none" },
    { imports: "mapped" },
  ]) {
    const [different] = comparisonCases({ ...request, ...changes });
    expect(different.definition.expectedLoadRefusals).toBeUndefined();
    expect(different.caseId).not.toBe(stock.caseId);
  }
});

test("only the pinned recorded Brick case admits a typed Java header collision", () => {
  const request = {
    input: "brick-only",
    profile: "java-owlapi-5.5.1",
    parsingMode: "compatible",
  };
  const [direct] = comparisonCases({ ...request, scenario: "direct-load" });
  const [closure] = comparisonCases({
    ...request,
    scenario: "closure-roundtrip",
  });
  const expected = direct.definition.expectedLoadRefusals;
  expect(expected).toMatchObject({
    dependentStageReason: "expected-rdf-header-id-collision",
    js: {
      reason: "RDF_HEADER_ID_COLLISION",
      category: "ONTOLOGY_STATE_INVALID",
    },
    java: { category: "OWLOntologyAlreadyExistsException" },
  });
  expect(expected.js.collisionIdentities).toEqual(
    direct.imports.map(([ontologyIRI]) => ({ ontologyIRI, versionIRI: null })),
  );
  expect(expected.js.collisionIdentities).toHaveLength(5);
  expect(closure.definition.expectedLoadRefusals).toEqual(expected);
  for (const boundary of [
    { imports: "mapped" },
    { imports: "none" },
    { profile: "normative-v1" },
    { javaTurtle: "owlapi" },
  ]) {
    const [changed] = comparisonCases({ ...request, ...boundary });
    expect(changed.definition.expectedLoadRefusals).toBeUndefined();
  }
  const differentBytes = {
    ...comparisonCatalogue,
    fixtures: comparisonCatalogue.fixtures.map((fixture) =>
      fixture.id === "brick-only"
        ? { ...fixture, sha256: "0".repeat(64) }
        : fixture,
    ),
  };
  expect(
    comparisonCases(request, differentBytes)[0].definition.expectedLoadRefusals,
  ).toBeUndefined();
});

test("archived OGG binds the stock XML refusals to the original imported bytes", () => {
  const stockJava = {
    profile: "java-owlapi-5.5.1",
    parsingMode: "compatible",
    imports: "mapped",
    scenario: "direct-load",
  };
  const [base, worm, fly] = comparisonCases({
    ...stockJava,
    suite: "ogg-archive",
  });
  expect([base, worm, fly].map(({ input }) => input.id)).toEqual([
    "obo-ogg-archive-base",
    "obo-ogg-archive-ce",
    "obo-ogg-archive-dm",
  ]);
  expect([base, worm, fly].map(({ imports }) => imports[0][1].id)).toEqual([
    "obo-ogg-archive-taxon-base",
    "obo-ogg-archive-taxon-ce",
    "obo-ogg-archive-taxon-dm",
  ]);
  expect(base.definition.expectedLoadRefusals).toBeUndefined();
  for (const { definition } of [worm, fly]) {
    expect(definition.measurements).toEqual(["behavior"]);
    expect(definition.expectedLoadRefusals).toMatchObject({
      dependentStageReason: "expected-xml-entity-limit",
      js: { resource: "maxTotalEntityCodeUnits", limit: 100_000 },
      java: { diagnosticCode: "JAXP00010004" },
    });
  }
  expect(corpusQualificationRoster(comparisonCases).held).toContainEqual({
    input: "obo-ogg",
    unavailable: "obo-ogg",
    reason: "HTTP 404",
  });
  const request = { ...stockJava, input: worm.input.id };
  for (const variant of [
    { imports: "recorded" },
    { imports: "none" },
    { profile: "normative-v1" },
    { scenario: "closure-roundtrip" },
  ]) {
    expect(
      comparisonCases({ ...request, ...variant })[0].definition
        .expectedLoadRefusals,
    ).toBeUndefined();
  }
  for (const [changedId, replacement] of [
    [worm.input.id, { sha256: "0".repeat(64) }],
    [worm.imports[0][1].id, { sha256: "0".repeat(64) }],
    [
      worm.input.id,
      {
        source: {
          ...worm.input.source,
          url: "https://example.test/ogg-ce.owl",
        },
      },
    ],
  ]) {
    const changedCatalogue = {
      ...comparisonCatalogue,
      fixtures: comparisonCatalogue.fixtures.map((row) =>
        row.id === changedId ? { ...row, ...replacement } : row,
      ),
    };
    expect(
      comparisonCases(request, changedCatalogue)[0].definition
        .expectedLoadRefusals,
    ).toBeUndefined();
  }
});

test("entity-free OGG compares the pinned derivatives to the original inputs and taxonomy", () => {
  const [worm, fly] = comparisonCases({ suite: "ogg-archive-entity-free" });
  for (const [caseEntry, subset, taxonomy] of [
    [worm, "ce", "obo-ogg-archive-taxon-ce"],
    [fly, "dm", "obo-ogg-archive-taxon-dm"],
  ]) {
    const { input, definition, imports } = caseEntry;
    expect(input.id).toBe("obo-ogg-archive-" + subset + "-entity-free");
    expect(definition).toMatchObject({
      scenario: "direct-load",
      behaviorProfileId: "java-owlapi-5.5.1",
      parsingMode: "compatible",
      importPolicy: "mapped",
      originalRdfXml: {
        document: {
          id: "obo-ogg-archive-" + subset,
          documentIRI: input.documentIRI,
        },
        recipe: "jaxp-sax-v1",
      },
    });
    expect(imports.map(([, fixture]) => fixture.id)).toEqual([taxonomy]);
    expect(definition.expectedLoadRefusals).toBeUndefined();
  }
  const changed = {
    ...comparisonCatalogue,
    fixtures: comparisonCatalogue.fixtures.map((fixture) =>
      fixture.id === "obo-ogg-archive-ce"
        ? { ...fixture, sha256: "0".repeat(64) }
        : fixture,
    ),
  };
  expect(() =>
    comparisonCases({ suite: "ogg-archive-entity-free" }, changed),
  ).toThrow(/original/u);
  for (const source of [
    { ...worm.input.source, totalEntitySizeLimit: 2147483647 },
    { kind: "generated", text: "Ontology()" },
  ]) {
    const altered = {
      ...comparisonCatalogue,
      fixtures: comparisonCatalogue.fixtures.map((fixture) =>
        fixture.id === worm.input.id ? { ...fixture, source } : fixture,
      ),
    };
    expect(() =>
      comparisonCases({ suite: "ogg-archive-entity-free" }, altered),
    ).toThrow(/approved original/u);
  }
});

test("entity-free OVAE compares the pinned original without imports", () => {
  const [original] = comparisonCases({
    input: "obo-ovae",
    profile: "java-owlapi-5.5.1",
  });
  const request = { input: "obo-ovae-entity-free" };
  const [expanded] = comparisonCases(request);

  expect(expanded.definition).toMatchObject({
    scenario: "direct-load",
    behaviorProfileId: "java-owlapi-5.5.1",
    parsingMode: "compatible",
    imports: [],
    requiredImportClosure: [
      {
        ontologyIRI: original.definition.input.documentIRI,
        versionIRI: null,
      },
    ],
    originalRdfXml: {
      document: original.definition.input,
      recipe: "jaxp-sax-v1",
      limits: { entityExpansionLimit: 30000, totalEntitySizeLimit: 800000 },
    },
  });
  expect(expanded.definition.input.documentIRI).toBe(
    original.definition.input.documentIRI,
  );
  expect(expanded.definition.input.sha256).not.toBe(
    original.definition.input.sha256,
  );
  expect(() =>
    comparisonCases({ ...request, profile: "normative-v1" }),
  ).toThrow(/Java-compatible direct load/u);
  expect(
    compareExpandedRdfXmlDocuments(
      expanded.definition,
      {},
      { structure: { status: "match" } },
    ),
  ).toBe("match");
  expect(compareExpandedRdfXmlDocuments(expanded.definition, {}, {})).toBe(
    "inconclusive",
  );
});

test("entity-free OGG requires structural measurements", async () => {
  await withScratch((directory) =>
    expect(
      runComparison(
        {
          action: "run",
          suite: "ogg-archive-entity-free",
          measurements: ["behavior"],
        },
        { outputDirectory: join(directory, "unused"), memoryGuard: false },
      ),
    ).rejects.toThrow("requires a structural measurement"),
  );
});

test("upstream direct loads compare the same pinned documents and imports in both profiles", () => {
  const input = ["w3c-owl-time-rdfxml", "w3c-skos", "w3c-time-gregorian"];
  const javaRequest = {
    input,
    profile: "java-owlapi-5.5.1",
    parsingMode: "compatible",
  };
  const requests = [
    javaRequest,
    { input, profile: "normative-v1", parsingMode: "compatible" },
    { input, profile: "normative-v1", parsingMode: "strict" },
  ];
  const entries = requests.flatMap((request) => comparisonCases(request));
  const cases = entries.map(({ definition }) => definition);
  expect(cases).toHaveLength(9);

  const byInput = Map.groupBy(cases, ({ input }) => input.id);
  expect([...byInput.keys()]).toEqual(input);
  for (const [java, compatible, strict] of byInput.values()) {
    expect(java).toMatchObject({
      scenario: "direct-load",
      behaviorProfileId: "java-owlapi-5.5.1",
      parsingMode: "compatible",
    });
    expect(compatible).toMatchObject({
      scenario: "direct-load",
      behaviorProfileId: "normative-v1",
      parsingMode: "compatible",
      input: java.input,
      imports: java.imports,
      requiredImportClosure: java.requiredImportClosure,
    });
    expect(strict).toMatchObject({
      scenario: "direct-load",
      behaviorProfileId: "normative-v1",
      parsingMode: "strict",
      measurements: ["behavior"],
      input: java.input,
      imports: java.imports,
      expectedLoadRefusals: {
        js: { category: "UNSUPPORTED_CONSTRUCT" },
        java: { closure: java.requiredImportClosure },
      },
    });
  }
  const skosCaseIds = (definitions) =>
    definitions
      .filter(({ input }) => input.id === "w3c-skos")
      .map(({ caseId }) => caseId);
  expect(skosCaseIds(comparisonCases({ suite: "wider" }))).toEqual(
    skosCaseIds(entries),
  );
  const [gregorian] = byInput.get("w3c-time-gregorian");
  expect(gregorian.imports).toEqual([
    expect.objectContaining({
      id: "w3c-owl-time-rdfxml",
      ontologyIRI: "http://www.w3.org/2006/time",
    }),
  ]);
  gregorian.requiredImportClosure[1].versionIRI = "urn:changed";
  const [fresh] = comparisonCases({
    ...javaRequest,
    input: gregorian.input.id,
  });
  expect(fresh.definition.requiredImportClosure).toContainEqual({
    ontologyIRI: "http://www.w3.org/2006/time",
    versionIRI: "http://www.w3.org/2006/time#2026",
  });

  const swapped = {
    ...comparisonCatalogue,
    fixtures: comparisonCatalogue.fixtures.map((fixture) =>
      fixture.id === "w3c-time-gregorian"
        ? { ...fixture, imports: ["w3c-time"] }
        : fixture,
    ),
  };
  expect(() => comparisonCases(javaRequest, swapped)).toThrow(
    /exact pinned inputs for w3c-time-gregorian/u,
  );
});

test("entity-free OGG requires the native original comparison and its finite allowance", () => {
  const [{ definition }] = comparisonCases({
    suite: "ogg-archive-entity-free",
  });
  const { document, limits } = definition.originalRdfXml;
  const originalRdfXml = {
    source: { sha256: document.sha256, byteLength: document.byteLength },
    comparison: { status: "match" },
    closure: definition.requiredImportClosure,
    importRequests: Object.fromEntries(
      definition.imports.map(({ ontologyIRI, documentIRI }) => [
        ontologyIRI,
        documentIRI,
      ]),
    ),
  };
  const native = {
    originalRdfXml,
    xmlSettings: {
      "jdk.xml.entityExpansionLimit": String(limits.entityExpansionLimit),
      "jdk.xml.totalEntitySizeLimit": String(limits.totalEntitySizeLimit),
      "javax.xml.accessExternalDTD": "",
      "javax.xml.accessExternalSchema": "",
    },
  };
  expect(matchesOriginalRdfXml(definition, {}, native)).toBe(true);
  expect(
    matchesOriginalRdfXml(
      definition,
      {},
      {
        ...native,
        originalRdfXml: {
          ...originalRdfXml,
          comparison: { status: "mismatch" },
        },
      },
    ),
  ).toBe(false);
  expect(
    matchesOriginalRdfXml(
      definition,
      {},
      {
        ...native,
        xmlSettings: {
          ...native.xmlSettings,
          "jdk.xml.totalEntitySizeLimit": "0",
        },
      },
    ),
  ).toBe(false);
});

test("strict stock IDMP binds the refused annotation in direct and closure cases", () => {
  const request = {
    input: "pistoia-idmp",
    profile: "normative-v1",
    parsingMode: "strict",
  };
  const roster = corpusQualificationRoster(comparisonCases);
  for (const scenario of ["direct-load", "closure-roundtrip"]) {
    const [{ caseId, definition }] = comparisonCases({ ...request, scenario });
    expect(definition.expectedLoadRefusals).toMatchObject({
      js: {
        category: "UNSUPPORTED_CONSTRUCT",
        statement: {
          predicate: "http://purl.org/dc/terms/abstract",
          objectSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
        },
      },
      java: { diagnosticCode: "JAXP00010004" },
    });
    expect(roster.inapplicable).toContainEqual({
      caseId,
      input: request.input,
      measurement: "structure",
      prerequisite: "load",
      reason: "expected-undeclared-ontology-annotation",
    });
  }
  for (const changes of [
    { javaXml: "historical-idmp" },
    { imports: "none" },
    { scenario: "strict-first", parsingMode: "compatible" },
  ]) {
    const [alternative] = comparisonCases({ ...request, ...changes });
    expect(alternative.definition.expectedLoadRefusals).toBeUndefined();
  }
});

test("compatible IDMP observes both stock outcomes and keeps historical structural proof required", () => {
  const request = {
    input: "pistoia-idmp",
    profile: "normative-v1",
    parsingMode: "compatible",
  };
  const roster = corpusQualificationRoster(comparisonCases);
  for (const scenario of ["direct-load", "closure-roundtrip"]) {
    const [stock] = comparisonCases({ ...request, scenario });
    const [historical] = comparisonCases({
      ...request,
      scenario,
      javaXml: "historical-idmp",
    });
    expect(stock.definition.expectedLoadRefusals).toMatchObject({
      dependentStageReason: "expected-native-xml-entity-limit",
      js: { diagnostic: { code: "RDF_UNDECLARED_ANNOTATION_PROPERTY" } },
      java: { diagnosticCode: "JAXP00010004" },
    });
    expect(historical.definition.expectedLoadRefusals).toBeUndefined();
    expect(
      roster.cells
        .filter(({ caseId }) => caseId === stock.caseId)
        .map(({ measurement }) => measurement),
    ).toEqual(["behavior", "behavior"]);
    expect(
      roster.cells
        .filter(({ caseId }) => caseId === historical.caseId)
        .map(({ measurement }) => measurement),
    ).toEqual(["behavior", "structure", "behavior", "structure"]);
  }
});

test.each(["eu-epo-core", "entsoe-cgmes-eq", "iof-core", "esco-model"])(
  "%s observes the native default alongside the exact Java-profile closure save",
  (input) => {
    const selection = {
      input,
      profile: "java-owlapi-5.5.1",
      scenario: "closure-roundtrip",
    };
    const [closure] = comparisonCases(selection);
    expect(closure.definition.javaRdfXml).toEqual({
      addMissingTypes: false,
      observeDefault: true,
    });
    for (const changes of [
      { scenario: "direct-load" },
      { profile: "normative-v1", parsingMode: "strict" },
      { imports: "none" },
    ]) {
      const [alternative] = comparisonCases({ ...selection, ...changes });
      expect(alternative.definition.javaRdfXml).toBeUndefined();
    }
  },
);

test.each([
  [
    "eu-epo-core",
    "http://data.europa.eu/a4g/ontology#core",
    "http://purl.org/dc/terms/created",
  ],
  [
    "iof-core",
    "https://spec.industrialontologies.org/ontology/core/Core/",
    "http://purl.org/dc/terms/abstract",
  ],
  [
    "esco-model",
    "http://data.europa.eu/esco/model",
    "http://purl.org/dc/terms/abstract",
  ],
])(
  "%s scopes normative RDF/XML refusal and native save to the recorded closure",
  (input, subject, predicate) => {
    const request = {
      input,
      profile: "normative-v1",
      parsingMode: "compatible",
      scenario: "closure-roundtrip",
    };
    const [closure] = comparisonCases(request);
    expect(closure.definition.expectedJsRdfXmlWriteRefusal).toMatchObject({
      subject,
      predicate,
      objectSha256: expect.stringMatching(/^[\da-f]{64}$/u),
    });
    expect(closure.definition.javaRdfXml).toEqual({
      addMissingTypes: false,
      observeDefault: true,
    });
    closure.definition.expectedJsRdfXmlWriteRefusal.predicate = "urn:mutated";
    const [repeated] = comparisonCases(request);
    expect(repeated.definition.expectedJsRdfXmlWriteRefusal.predicate).toBe(
      predicate,
    );
    expect(repeated.caseId).toBe(closure.caseId);

    for (const variant of [
      { scenario: "direct-load" },
      { profile: "java-owlapi-5.5.1" },
      { parsingMode: "strict" },
      { imports: "none" },
    ]) {
      const [alternative] = comparisonCases({ ...request, ...variant });
      expect(
        alternative.definition.expectedJsRdfXmlWriteRefusal,
      ).toBeUndefined();
    }

    const altered = {
      ...comparisonCatalogue,
      fixtures: comparisonCatalogue.fixtures.map((fixture) =>
        fixture.id === input ? { ...fixture, sha256: "0".repeat(64) } : fixture,
      ),
    };
    const [alternative] = comparisonCases(request, altered);
    expect(alternative.definition.expectedJsRdfXmlWriteRefusal).toBeUndefined();
    expect(alternative.definition.javaRdfXml).toBeUndefined();
  },
);

test("recorded refusals and writer controls require their frozen import bytes", () => {
  const profile = "java-owlapi-5.5.1";
  const scenario = "closure-roundtrip";
  const request = { input: "pistoia-idmp", profile, scenario };
  const [stock] = comparisonCases(request);
  const [[iri, original]] = stock.imports;
  const changed = generatedFixture(
    original.id,
    original.documentIRI,
    "functional",
    `Ontology(<${iri}> Declaration(Class(<urn:owlapi:substituted>)))\n`,
  );
  const withImports = (input, extraImports) => ({
    ...comparisonCatalogue,
    fixtures: [
      ...comparisonCatalogue.fixtures.map((fixture) =>
        fixture.id === input
          ? {
              ...fixture,
              imports: [...(fixture.imports ?? []), ...extraImports],
            }
          : fixture,
      ),
      changed,
    ],
    standIns: comparisonCatalogue.standIns.filter((item) => item.iri !== iri),
  });
  const [alternative] = comparisonCases(
    request,
    withImports(request.input, [changed.id]),
  );
  expect(
    alternative.definition.imports.map(({ ontologyIRI, documentIRI }) => [
      ontologyIRI,
      documentIRI,
    ]),
  ).toEqual(
    stock.definition.imports.map(({ ontologyIRI, documentIRI }) => [
      ontologyIRI,
      documentIRI,
    ]),
  );
  expect(alternative.definition.expectedLoadRefusals).toBeUndefined();
  const ePo = { input: "eu-epo-core", profile, scenario };
  const [differentClosure] = comparisonCases(
    ePo,
    withImports(ePo.input, [changed.id]),
  );
  expect(differentClosure.definition.javaRdfXml).toBeUndefined();
});

test("the fully mapped ifcOWL case uses the two published imports and exact Java writer", () => {
  const request = {
    input: "building-smart-ifcowl",
    profile: "java-owlapi-5.5.1",
    scenario: "closure-roundtrip",
  };
  const [recorded] = comparisonCases(request);
  const [mapped] = comparisonCases({ ...request, imports: "mapped" });
  expect(
    recorded.imports.map(([iri, fixture]) => [iri, fixture.source.kind]),
  ).toEqual([["https://w3id.org/express", "generated"]]);
  expect(recorded.definition.javaRdfXml).toBeUndefined();
  expect(mapped.definition.input).toEqual(recorded.definition.input);
  expect(mapped.caseId).not.toBe(recorded.caseId);
  expect(mapped.imports.map(([iri, fixture]) => [iri, fixture.id])).toEqual([
    ["https://w3id.org/express", "ifcowl-express-20151211"],
    ["https://w3id.org/list", "ifcowl-list-20151211"],
  ]);
  expect(mapped.definition.javaRdfXml).toEqual({
    addMissingTypes: false,
    observeDefault: true,
  });
  const altered = {
    ...comparisonCatalogue,
    fixtures: comparisonCatalogue.fixtures.map((fixture) =>
      fixture.id === "ifcowl-list-20151211"
        ? { ...fixture, sha256: "0".repeat(64) }
        : fixture,
    ),
  };
  const [changed] = comparisonCases({ ...request, imports: "mapped" }, altered);
  expect(changed.definition.javaRdfXml).toBeUndefined();

  const module = { input: "ifcowl-express-20151211" };
  const [recordedModule] = comparisonCases({ ...module, imports: "recorded" });
  const [mappedModule] = comparisonCases({ ...module, imports: "mapped" });
  expect(recordedModule.imports.map(([iri]) => iri)).not.toContain(
    "https://w3id.org/list",
  );
  expect(mappedModule.imports.map(([iri]) => iri)).toEqual([
    "https://w3id.org/list",
  ]);
});

test("the release roster qualifies mapped ifcOWL and retains one recorded import control", () => {
  const input = "building-smart-ifcowl";
  const prospectCases = comparisonCases({ suite: "prospects" }).filter(
    (entry) => entry.input.id === input,
  );
  expect(prospectCases).toHaveLength(6);
  for (const { definition } of prospectCases) {
    expect(definition.importPolicy).toBe("mapped");
    expect(definition.imports.map(({ id }) => id)).toEqual([
      "ifcowl-express-20151211",
      "ifcowl-list-20151211",
    ]);
  }
  const recordedCases = comparisonCases({
    suite: "prospects",
    imports: "recorded",
  }).filter((entry) => entry.input.id === input);
  expect(recordedCases).toHaveLength(6);
  expect(
    recordedCases.every(
      ({ definition }) => definition.importPolicy === "recorded",
    ),
  ).toBe(true);
  const [recorded] = comparisonCases({
    input,
    imports: "recorded",
    profile: "java-owlapi-5.5.1",
  });
  expect(recorded.caseId).toBe(
    "f39fb0b737464105998d0cc5738bc05fb5ea0e828a26e393bdb1c5e15cf99a41",
  );
  const [control] = comparisonCases({ suite: "ifcowl-recorded" });
  expect(control.definition.input).toEqual(recorded.definition.input);
  expect(control.definition.imports).toEqual(recorded.definition.imports);
  expect(control.definition.measurements).toEqual(["behavior"]);
  expect(control.definition.expectedRecordedIfcowlMismatch).toBeDefined();
  expect(control.caseId).not.toBe(recorded.caseId);
  const changedCatalogue = {
    ...comparisonCatalogue,
    standIns: comparisonCatalogue.standIns.filter(
      ({ iri }) => iri !== "https://w3id.org/express",
    ),
  };
  expect(() =>
    comparisonCases({ suite: "ifcowl-recorded" }, changedCatalogue),
  ).toThrow("requires the exact historical inputs");

  const roster = corpusQualificationRoster(comparisonCases);
  expect(roster.policyVersion).toBe(3);
  const cells = roster.cells.filter((cell) => cell.input === input);
  const positive = new Set(prospectCases.map(({ caseId }) => caseId));
  expect(new Set(cells.map(({ caseId }) => caseId))).toEqual(
    new Set([...positive, control.caseId]),
  );
  expect(
    cells
      .filter(({ caseId }) => caseId === control.caseId)
      .map(({ measurement }) => measurement),
  ).toEqual(["behavior", "behavior"]);
  const strict = prospectCases.filter(
    ({ definition }) => definition.parsingMode === "strict",
  );
  expect(
    strict.every(
      ({ definition }) => definition.expectedLoadRefusals?.java.identity,
    ),
  ).toBe(true);
  expect(
    cells.filter(
      ({ caseId, measurement }) =>
        strict.some((entry) => entry.caseId === caseId) &&
        measurement === "structure",
    ),
  ).toHaveLength(0);
  const compatible = prospectCases.filter(
    ({ definition }) =>
      definition.behaviorProfileId === "normative-v1" &&
      definition.parsingMode === "compatible",
  );
  expect(
    compatible.every(({ definition }) =>
      definition.expectedDifferences?.ruleIds.includes(
        "IFCOWL-MAPPED-SINGLETON-UNIONS",
      ),
    ),
  ).toBe(true);
});

test("the recorded ifcOWL witness admits only counter renumbering", () => {
  const jvmError = (counter = "") =>
    `SubClassOf(<urn:example:Class> <http://org.semanticweb.owlapi/error#Error${counter}>)`;
  const axioms = {
    javaOnly: [jvmError()],
    jsOnly: ["SubClassOf(<urn:example:Class> <urn:example:Parent>)"],
  };
  const imports = [{ ontologyIRI: "urn:module", documentIRI: "urn:document" }];
  const definition = {
    imports,
    expectedRecordedIfcowlMismatch: {
      count: 1,
      oracleVersion: "pinned-oracle",
      sha256: comparisonIdentity({ axioms }),
    },
  };
  const js = { importRequests: imports };
  const native = {
    oracleVersion: "pinned-oracle",
    importRequests: { "urn:module": "urn:document" },
    javaLoad: { ontology: { unparsedRdf: [] } },
    functionalReparse: { status: "completed" },
    structure: {
      status: "mismatch",
      detailStatus: "completed",
      differences: { axioms: { ...axioms, javaOnly: [jvmError(99)] } },
    },
  };
  expect(matchesRecordedIfcowlMismatch(definition, js, native)).toBe(true);
  expect(
    matchesRecordedIfcowlMismatch(definition, { importRequests: [] }, native),
  ).toBe(false);
  const unrelated = structuredClone(native);
  unrelated.structure.differences.axioms.jsOnly[0] =
    "SubClassOf(<urn:example:Class> <urn:example:Unrelated>)";
  expect(matchesRecordedIfcowlMismatch(definition, js, unrelated)).toBe(false);
  const unexpected = structuredClone(native);
  unexpected.structure.differences.annotations = { javaOnly: ["unexpected"] };
  expect(matchesRecordedIfcowlMismatch(definition, js, unexpected)).toBe(false);
});

test("returning an ifcOWL case does not share its approved witness with later requests", () => {
  const recorded = { suite: "ifcowl-recorded" };
  const mapped = {
    input: "building-smart-ifcowl",
    imports: "mapped",
    profile: "normative-v1",
    scenario: "closure-roundtrip",
  };
  const [priorRecorded] = comparisonCases(recorded);
  const [priorMapped] = comparisonCases(mapped);
  priorRecorded.definition.expectedRecordedIfcowlMismatch.count = 1;
  const { structure, documentDifferences } =
    priorMapped.definition.expectedDifferences;
  structure.count = 1;
  documentDifferences["https://w3id.org/express"].count = 1;
  const [nextRecorded] = comparisonCases(recorded);
  const [nextMapped] = comparisonCases(mapped);
  expect(nextRecorded.caseId).toBe(priorRecorded.caseId);
  expect(nextRecorded.definition.expectedRecordedIfcowlMismatch.count).toBe(16);
  expect(nextMapped.caseId).toBe(priorMapped.caseId);
  expect(nextMapped.definition.expectedDifferences.structure.count).toBe(22);
  expect(
    nextMapped.definition.expectedDifferences.documentDifferences[
      "https://w3id.org/express"
    ].count,
  ).toBe(4);
});

test("mapped ifcOWL requires the resulting closure as well as mapper calls", () => {
  const [{ definition }] = comparisonCases({
    input: "building-smart-ifcowl",
    imports: "mapped",
    profile: "java-owlapi-5.5.1",
  });
  const { imports, requiredImportClosure } = definition;
  const js = {
    importRequests: imports,
    load: { closure: requiredImportClosure },
  };
  const native = {
    importRequests: Object.fromEntries(
      imports.map(({ ontologyIRI, documentIRI }) => [ontologyIRI, documentIRI]),
    ),
    javaLoad: { ontology: { closure: [...requiredImportClosure].reverse() } },
  };
  expect(requiredImportClosure).toHaveLength(3);
  expect(matchesComparisonImportClosure(definition, js, native)).toBe(true);
  expect(
    matchesComparisonImportClosure(
      definition,
      { ...js, load: { closure: requiredImportClosure.slice(0, 1) } },
      native,
    ),
  ).toBe(false);
  expect(
    matchesComparisonImportClosure(definition, js, {
      ...native,
      javaLoad: { ontology: { closure: requiredImportClosure.slice(0, 2) } },
    }),
  ).toBe(false);
});

test("ifcOWL singleton reconciliation requires the complete compared closure", () => {
  const root = "urn:example:root";
  const module = "urn:example:import";
  const imports = [{ ontologyIRI: module, documentIRI: module }];
  const differences = {
    axioms: {
      javaOnly: [
        "SubClassOf(<urn:example:Class> ObjectUnionOf(<urn:example:Parent>))",
      ],
      jsOnly: ["SubClassOf(<urn:example:Class> <urn:example:Parent>)"],
    },
  };
  const recorded = { count: 1, sha256: comparisonIdentity(differences) };
  const ruleIds = ["IFCOWL-MAPPED-SINGLETON-UNIONS"];
  const definition = {
    input: { documentIRI: root },
    imports,
    expectedDifferences: {
      oracleVersion: "pinned-oracle",
      ruleIds,
      structure: recorded,
      documentDifferences: { [root]: recorded },
    },
  };
  const expected = {
    status: "mismatch",
    detailStatus: "completed",
    differences,
  };
  const js = {
    importRequests: imports,
    documentModels: [root, module].map((documentIRI) => ({
      documentIRI,
      status: "completed",
      artifact: { sha256: "0".repeat(64) },
    })),
  };
  const native = {
    oracleVersion: "pinned-oracle",
    importRequests: { [module]: module },
    javaLoad: { ontology: { unparsedRdf: [] } },
    structure: expected,
    closurePropagation: { status: "match" },
    documentComparisons: [
      { documentIRI: root, unparsedRdf: [], comparison: expected },
      { documentIRI: module, unparsedRdf: [], comparison: { status: "match" } },
    ],
  };
  expect(reconcileIfcowlSingletonUnions(definition, js, native)).toEqual(
    ruleIds,
  );
  expect(
    reconcileIfcowlSingletonUnions(
      definition,
      { ...js, documentModels: js.documentModels.slice(0, 1) },
      {
        ...native,
        documentComparisons: native.documentComparisons.slice(0, 1),
      },
    ),
  ).toBeNull();
  expect(
    reconcileIfcowlSingletonUnions(definition, js, {
      ...native,
      closurePropagation: { status: "mismatch" },
    }),
  ).toBeNull();
});

test("mapped IDMP resolves its published imports without replacing the recorded closure", () => {
  const request = {
    input: "pistoia-idmp",
    profile: "normative-v1",
    parsingMode: "compatible",
    scenario: "direct-load",
    javaXml: "historical-idmp",
  };
  const [recorded] = comparisonCases(request);
  const [mapped] = comparisonCases({ ...request, imports: "mapped" });
  expect(mapped.definition.input).toEqual(recorded.definition.input);
  expect(recorded.caseId).toBe(
    "8ee36ca898e6c938cbfca68e14d8ad2f55eac35b3430d2687804b866bf914745",
  );
  expect(mapped.caseId).not.toBe(recorded.caseId);
  expect(recorded.imports).toHaveLength(22);
  expect(
    recorded.imports.every(
      ([, fixture]) => fixture.source.kind === "generated",
    ),
  ).toBe(true);
  expect(new Set(mapped.imports.map(([, fixture]) => fixture.id)).size).toBe(
    23,
  );
  expect(mapped.imports).toHaveLength(46);
  expect(
    mapped.imports.every(([, fixture]) => fixture.source.kind === "https"),
  ).toBe(true);
  expect(mapped.imports.map(([iri]) => iri)).toContain(
    "https://www.omg.org/spec/LCC/Languages/LanguageRepresentation/",
  );
});

test("relative imports bind distinct logical documents with the same basename", () => {
  const [entry] = comparisonCases({
    input: "relative-imports",
    scenario: "closure-roundtrip",
  });
  expect(
    entry.definition.imports.map(({ documentIRI }) => documentIRI),
  ).toEqual([
    "https://owlapi.example.test/comparison/left/same.ttl",
    "https://owlapi.example.test/comparison/right/same.ttl",
  ]);
  expect(entry.definition.jsLoaderOptions).toEqual({
    remoteImports: true,
    remoteJsonLdContexts: false,
  });
  const [denied] = comparisonCases({
    input: "relative-imports",
    imports: "none",
  });
  expect(denied.definition.imports).toEqual([]);
  expect(denied.definition.jsLoaderOptions).toBeUndefined();
  expect(denied.caseId).not.toEqual(entry.caseId);
});

test("strict-first retries have an identity distinct from a direct load", () => {
  const input = { input: "obo-fovt", profile: "java-owlapi-5.5.1" };
  const [direct] = comparisonCases(input);
  const [retry] = comparisonCases({ ...input, scenario: "strict-first" });

  expect(retry.caseId).not.toBe(direct.caseId);
  expect(retry.definition).toMatchObject({
    observationPoint: "public-strict-then-compatible-load",
    loadSequence: ["strict", "compatible"],
    parsingMode: "compatible",
    input: direct.definition.input,
  });
  expect(() =>
    comparisonCases({
      ...input,
      scenario: "strict-first",
      parsingMode: "strict",
    }),
  ).toThrow("requires a compatible retry");
});

test("the released OWLAPI Turtle parser variant has its own case identity", () => {
  const request = { input: "ogc-geosparql" };
  const [reference] = comparisonCases(request);
  const [owlapi] = comparisonCases({ ...request, javaTurtle: "owlapi" });
  expect(owlapi.definition.javaTurtle).toBe("owlapi");
  expect(owlapi.caseId).not.toBe(reference.caseId);
  expect(() =>
    comparisonCases({ input: "entsoe-cgmes-eq", javaTurtle: "owlapi" }),
  ).toThrow("requires Turtle inputs");
});

test("changing only a logical base or an input digest invalidates the case", () => {
  const request = { input: "entsoe-cgmes-eq" };
  const [original] = comparisonCases(request);
  for (const change of [
    { documentIRI: "https://other.example.test/base" },
    { sha256: "f".repeat(64) },
  ]) {
    const fixtures = comparisonCatalogue.fixtures.map((fixture) =>
      fixture.id === request.input ? { ...fixture, ...change } : fixture,
    );
    const [different] = comparisonCases(request, {
      ...comparisonCatalogue,
      fixtures,
    });
    expect(different.caseId).not.toBe(original.caseId);
  }
});

test("concurrent preparations admit one object, and an altered cache hit fails offline", () =>
  withScratch(async (cacheDirectory) => {
    const fixture = comparisonWitnesses.find(
      ({ id }) => id === "cgmes-range-less",
    );
    const environment = { cacheDirectory };
    const paths = await Promise.all([
      resolveComparisonFixture(fixture, environment, true),
      resolveComparisonFixture(fixture, environment, true),
    ]);
    expect(paths[0]).toBe(paths[1]);
    await writeFile(paths[0], Buffer.alloc(fixture.byteLength, "x"));
    await expect(
      resolveComparisonFixture(fixture, environment),
    ).rejects.toThrow("wrong digest");
  }));

test("a multi-megabyte completed diff is usable and a partial result is refused", () =>
  withScratch(async (directory) => {
    const caseId = "1".repeat(64);
    const executionId = "7".repeat(64);
    const resultPath = join(directory, "oracle.json");
    const result = {
      caseId,
      executionId,
      schemaVersion: 1,
      structure: {
        status: "mismatch",
        differences: "x".repeat(2 * 1024 * 1024),
      },
    };
    const bytes = Buffer.from(JSON.stringify(result));
    await writeFile(resultPath, bytes);
    const header = {
      caseId,
      executionId,
      schemaVersion: 1,
      stage: "native-comparison",
      byteLength: bytes.length,
      sha256: sha256(bytes),
    };
    const request = {
      caseId,
      executionId,
      resultPath,
      exitCode: 1,
      stdout: JSON.stringify(header),
      maxResultBytes: 3 * 1024 * 1024,
    };
    await expect(readNativeComparisonResult(request)).resolves.toMatchObject({
      result,
    });
    const otherAttempt = "8".repeat(64);
    await expect(
      readNativeComparisonResult({ ...request, executionId: otherAttempt }),
    ).rejects.toThrow("completion header");
    await expect(
      readNativeComparisonResult({
        ...request,
        executionId: otherAttempt,
        stdout: JSON.stringify({ ...header, executionId: otherAttempt }),
      }),
    ).rejects.toThrow("different case or execution");
    await expect(
      readNativeComparisonResult({ ...request, stdout: "" }),
    ).rejects.toThrow("completion header");
    await expect(
      readNativeComparisonResult({ ...request, exitCode: 9 }),
    ).rejects.toThrow("contradicts");
    await expect(
      readNativeComparisonResult({ ...request, maxResultBytes: 1024 * 1024 }),
    ).rejects.toThrow("byte limit");
    await writeFile(resultPath, bytes.subarray(0, -1));
    await expect(readNativeComparisonResult(request)).rejects.toThrow(
      "length differs",
    );
  }));
