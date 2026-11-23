import { expect, test } from "@jest/globals";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { comparisonCases, runComparison } from "./compare-java-js.mjs";
import { runWindowsComparisonJob } from "./comparison-job.mjs";
import { oracleLockPath, oracleVersion } from "./comparison-oracle.mjs";
import {
  corpusQualificationRoster,
  installedDependencyGraphIdentity,
  bindRetainedConsumerLock,
  reconcileCorpusReceipts,
} from "./comparison-release-evidence.mjs";
import {
  comparisonCatalogue,
  comparisonWitnesses,
  generatedFixture,
  resolveComparisonFixture,
} from "./comparison-fixtures.mjs";
import {
  comparisonStageFailure,
  exactComparedDocuments,
  readNativeComparisonResult,
  recordedNativeRdfXmlRoundTrip,
  sha256,
} from "./comparison-evidence.mjs";
import { loadPerformanceReport } from "./comparison-performance.mjs";

async function withScratch(run) {
  const directory = await mkdtemp(join(tmpdir(), "owlapi-comparison-test-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

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
  expect(wider.filter(({ input }) => input.sha256)).toHaveLength(178);
  expect(
    wider.filter(({ input }) => input.acquisition === "unavailable"),
  ).toHaveLength(23);
  expect(comparisonCatalogue.collections).toHaveLength(24);
  expect(comparisonCatalogue.standIns).toHaveLength(57);
  expect(comparisonCases({ suite: "july", ...named })).toHaveLength(11);
  for (const { definition } of comparisonCases({ suite: "july", ...named })) {
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
    { profile: "normative-v1" },
  ]) {
    const [different] = comparisonCases({ ...request, ...changes });
    expect(different.definition.expectedLoadRefusals).toBeUndefined();
    expect(different.caseId).not.toBe(stock.caseId);
  }
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
    { parsingMode: "compatible" },
    { javaXml: "historical-idmp" },
    { imports: "none" },
    { scenario: "strict-first", parsingMode: "compatible" },
  ]) {
    const [alternative] = comparisonCases({ ...request, ...changes });
    expect(alternative.definition.expectedLoadRefusals).toBeUndefined();
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
      { profile: "normative-v1" },
      { imports: "none" },
    ]) {
      const [alternative] = comparisonCases({ ...selection, ...changes });
      expect(alternative.definition.javaRdfXml).toBeUndefined();
    }
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

test("July closure propagation uses the OWL-Time approval only on its exact imported document", () => {
  const selection = {
    input: "july/core",
    profile: "normative-v1",
    scenario: "closure-roundtrip",
  };
  const [selected] = comparisonCases(selection);
  expect(selected.definition.javaRdfXml).toEqual({
    addMissingTypes: false,
    observeDefault: true,
  });
  const [time] = comparisonCases({
    ...selection,
    input: "july/time.rdf",
    scenario: "direct-load",
  });
  expect(selected.definition.expectedDifferences).toEqual({
    ...time.definition.expectedDifferences,
    memberDocumentIRI: "http://www.w3.org/2006/time",
  });
  for (const variant of [
    { input: "july/reference-data" },
    { profile: "java-owlapi-5.5.1" },
    { parsingMode: "strict" },
    { imports: "none" },
    { scenario: "direct-load" },
  ]) {
    const [alternate] = comparisonCases({ ...selection, ...variant });
    expect(alternate.definition.expectedDifferences).toBeUndefined();
    expect(alternate.definition.javaRdfXml).toEqual(
      variant.input === "july/reference-data"
        ? selected.definition.javaRdfXml
        : undefined,
    );
  }
});

test("the approved July Time differences bind only the exact normative compatible direct load", () => {
  const request = { input: "july/time.rdf", profile: "normative-v1" };
  const [compatible] = comparisonCases(request);
  expect(compatible.definition.expectedDifferences).toMatchObject({
    fixture:
      "universal-ontology@e2c667f3584b8fb705671cada0fe205b1000b617:src/external/time.rdf",
    ruleIds: expect.arrayContaining([
      "JULY-TIME-JAVA-UNPARSED-NAMED-RESTRICTIONS-B61EBE2",
    ]),
  });
  expect(compatible.definition.expectedDifferences.ruleIds).toHaveLength(7);
  for (const changes of [
    { profile: "java-owlapi-5.5.1" },
    { parsingMode: "strict" },
    { scenario: "closure-roundtrip" },
    { imports: "none" },
  ]) {
    const [different] = comparisonCases({ ...request, ...changes });
    expect(different.definition.expectedDifferences).toBeUndefined();
  }
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
