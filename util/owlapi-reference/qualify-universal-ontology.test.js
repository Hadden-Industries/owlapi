import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertSourceQualificationOutputDirectory,
  captureSourceIdentity,
  materializePinnedOntologySources,
  parseQualificationArguments,
  reconcileFamilyEvidence,
  verifyEvidenceDigests,
} from "./qualify-universal-ontology.mjs";

const directories = [];

test("public-registry qualification selects only the exact scoped RC without a candidate fallback", () => {
  const args = ["--ontology-repository", "uo", "--output", "evidence"];
  expect(
    parseQualificationArguments([...args, "--registry-version", "0.1.0-rc.1"]),
  ).toEqual({
    ontologyRepository: "uo",
    outputDirectory: "evidence",
    registryVersion: "0.1.0-rc.1",
  });
  expect(() =>
    parseQualificationArguments([...args, "--registry-version", "next"]),
  ).toThrow(/exact scoped RC/u);
  expect(() =>
    parseQualificationArguments([
      ...args,
      "--registry-version",
      "0.1.0-rc.1",
      "--candidate",
      "local",
    ]),
  ).toThrow(/mutually exclusive/u);
});
const temporaryDirectory = async () => {
  const path = await mkdtemp(join(tmpdir(), "owlapi-source-parity-test-"));
  directories.push(path);
  return path;
};

// Package composition belongs to Node's loader, not Jest's experimental VM linker.
const generateOntologyEvidenceWithNativeNode = async (options) => {
  const execution = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "./generate-ontology-evidence.test-process.mjs",
          import.meta.url,
        ),
      ),
    ],
    {
      input: JSON.stringify(options),
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    },
  );
  if (execution.error) throw execution.error;
  if (execution.status !== 0)
    throw new Error(
      execution.stderr ||
        `Native qualification exited with ${execution.status}`,
    );
  return JSON.parse(execution.stdout);
};

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

test("family qualification requires parsing, native propagation, zero loss and both closure formats", async () => {
  const id = { ontologyIRI: "urn:root", versionIRI: null };
  const differences = {
    ontologyId: null,
    imports: { javaOnly: [], jsOnly: [] },
    annotations: { javaOnly: [], jsOnly: [] },
    axioms: { javaOnly: [], jsOnly: [] },
    anonymousIndividualGraphs: { javaOnly: [], jsOnly: [] },
    anonymousIndividualComparison: "NOT_REQUIRED",
  };
  const oracle = {
    pinnedRevision: "java-pin",
    comparisonOutcome: "MATCH",
    structuralComparisonOutcome: "MATCH",
    structuralDifferences: differences,
    outputUnparsedTriples: [],
    sourceDiagnostics: [{ ontologyID: id, unparsedNQuads: "" }],
    closureMemberIds: [id],
    networkEvidence: { networkAccessAttemptCount: 0 },
    propagationEvidence: {
      comparisonOutcome: "MATCH",
      structuralDifferences: differences,
    },
  };
  const evidence = {
    source: { sourceLosslessness: "PASS", closureMembers: [id] },
    documents: [{ sourceDocumentPath: "root", ontologyID: id, oracle }],
    closures: ["FUNCTIONAL", "RDF_XML"].map((format) => ({
      format,
      diagnostics: [],
      oracle,
    })),
  };
  const context = {
    fixtureFor: () => "fixture",
    rules: [],
    referenceRevision: "java-pin",
  };
  expect((await reconcileFamilyEvidence(evidence, context)).status).toBe(
    "PASS",
  );
  for (const mutate of [
    (value) => {
      value.source.sourceLosslessness = "FAIL";
    },
    (value) => {
      value.documents[0].oracle.structuralDifferences.axioms.jsOnly.push(
        "unknown",
      );
    },
    (value) => {
      value.closures.pop();
    },
    (value) => {
      value.closures[0].oracle.propagationEvidence = null;
    },
    (value) => {
      value.closures[0].oracle.outputUnparsedTriples = ["ignored"];
    },
    (value) => {
      value.closures[0].oracle.networkEvidence.networkAccessAttemptCount = 1;
    },
    (value) => {
      value.documents[0].oracle.comparisonOutcome = "ERROR";
      value.documents[0].oracle.mismatchCategory = "COMPARISON_LIMIT";
    },
    (value) => {
      value.documents[0].oracle.sourceDiagnostics = [];
    },
  ]) {
    const invalid = structuredClone(evidence);
    mutate(invalid);
    expect((await reconcileFamilyEvidence(invalid, context)).status).toBe(
      "FAIL",
    );
  }
});

test("requires a source repository and fresh output, not an arbitrary candidate", () => {
  expect(
    parseQualificationArguments([
      "--ontology-repository",
      "corpus",
      "--output",
      "result",
    ]),
  ).toEqual({ ontologyRepository: "corpus", outputDirectory: "result" });
  expect(() =>
    parseQualificationArguments(["--verify-output", "old-full"]),
  ).toThrow();
  expect(() =>
    parseQualificationArguments(["--ontology-repository", "corpus"]),
  ).toThrow();
});

test("evidence identity detects a changed compared model rather than trusting its recorded hash", async () => {
  const directory = await temporaryDirectory();
  const path = join(directory, "document.ofn");
  await writeFile(path, "");
  const entry = {
    path,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  };
  expect(await verifyEvidenceDigests([entry])).toEqual([]);
  await writeFile(path, "changed");
  expect(await verifyEvidenceDigests([entry])).toEqual([
    expect.objectContaining({ path, expected: entry.sha256 }),
  ]);
});

test("the dedicated command fails instead of skipping when Java is unavailable", () => {
  const execution = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("./qualify-universal-ontology.mjs", import.meta.url),
      ),
      "--ontology-repository",
      ".",
      "--output",
      join(tmpdir(), "owlapi-unused-qualification-output"),
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, OWLAPI_REFERENCE_CHECKOUT: "" },
    },
  );
  expect(execution.status).toBe(1);
  expect(execution.stderr).toMatch(/OWLAPI_REFERENCE_CHECKOUT/u);
});

test("source qualification rejects self-invalidating output before checking Java or creating files", () => {
  const execution = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("./qualify-universal-ontology.mjs", import.meta.url),
      ),
      "--ontology-repository",
      ".",
      "--output",
      fileURLToPath(new URL("../../nonignored-july-evidence", import.meta.url)),
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, OWLAPI_REFERENCE_CHECKOUT: "" },
    },
  );
  expect(execution.status).toBe(1);
  expect(execution.stderr).toMatch(/outside.*checkout.*Git-ignored/u);
  expect(execution.stderr).not.toMatch(/OWLAPI_REFERENCE_CHECKOUT/u);
});

test("native Git ignore rules permit owned source evidence without excluding other source inputs", async () => {
  const repository = await temporaryDirectory();
  execFileSync("git", ["-C", repository, "init", "--quiet"]);
  await writeFile(join(repository, ".gitignore"), ".release/\n");
  expect(() =>
    assertSourceQualificationOutputDirectory(
      repository,
      join(repository, ".release", "july"),
    ),
  ).not.toThrow();
  expect(() =>
    assertSourceQualificationOutputDirectory(
      repository,
      join(repository, "..", "external-evidence"),
    ),
  ).not.toThrow();
  expect(() =>
    assertSourceQualificationOutputDirectory(
      repository,
      join(repository, ".release-other"),
    ),
  ).toThrow(/Git-ignored/u);
  expect(() =>
    assertSourceQualificationOutputDirectory(repository, repository),
  ).toThrow(/Git-ignored/u);
});

test("native Git supplies exact committed source bytes, not dirty files or full artifacts", async () => {
  const repository = await temporaryDirectory();
  const output = await temporaryDirectory();
  const git = (args) =>
    execFileSync("git", ["-C", repository, ...args], {
      encoding: "utf8",
    }).trim();
  git(["init", "--quiet"]);
  await mkdir(join(repository, "src"));
  const original = "Ontology(<urn:root>)\n";
  await writeFile(join(repository, "src", "root"), original);
  await writeFile(
    join(repository, "src", "root-full"),
    "Never use this artifact",
  );
  git(["add", "src/root"]);
  git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "Fixture",
  ]);
  const revision = git(["rev-parse", "HEAD"]);
  const firstIdentity = await captureSourceIdentity(repository);
  await writeFile(join(repository, "src", "root"), "uncommitted replacement");
  const changedIdentity = await captureSourceIdentity(repository);
  expect(firstIdentity.head).toBe(changedIdentity.head);
  expect(firstIdentity.contentSha256).not.toBe(changedIdentity.contentSha256);
  const manifest = {
    revision,
    roots: [{ name: "root", path: "src/root" }],
    mappings: [],
  };
  const materialized = await materializePinnedOntologySources(
    repository,
    join(output, "sources"),
    manifest,
  );
  expect(await readFile(materialized.roots[0].documentPath, "utf8")).toBe(
    original,
  );
  expect(materialized.documents).toHaveLength(1);
  expect(materialized.documents[0].sha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(await readFile(join(repository, "src", "root"), "utf8")).toBe(
    "uncommitted replacement",
  );
  await expect(
    materializePinnedOntologySources(
      repository,
      join(output, "sources"),
      manifest,
    ),
  ).rejects.toThrow();
  await expect(
    materializePinnedOntologySources(repository, join(output, "forbidden"), {
      ...manifest,
      roots: [{ name: "root", path: "src/root-full" }],
    }),
  ).rejects.toThrow(/original.*source/i);
});

test("public composition creates both formats, excludes imported ontology metadata and resolves only exact mappings", async () => {
  const directory = await temporaryDirectory();
  const rootPath = join(directory, "root.ofn");
  const leafPath = join(directory, "leaf.ofn");
  await writeFile(
    rootPath,
    `Ontology(<urn:root> <urn:root:version> Import(<urn:leaf>)
    Annotation(<http://www.w3.org/2000/01/rdf-schema#label> "root") Declaration(Class(<urn:A>)))`,
  );
  await writeFile(
    leafPath,
    `Ontology(<urn:leaf>
    Annotation(<http://www.w3.org/2000/01/rdf-schema#label> "imported") Declaration(Class(<urn:B>)))`,
  );
  const generated = await generateOntologyEvidenceWithNativeNode({
    rootPath,
    catalogMappings: [{ ontologyIRI: "urn:leaf", documentPath: leafPath }],
    outputDirectory: join(directory, "candidates"),
  });
  expect(generated.candidates.map(({ format }) => format)).toEqual([
    "FUNCTIONAL",
    "RDF_XML",
  ]);
  expect(generated.importRequests).toEqual([pathToFileURL(leafPath).href]);
  expect(generated.closureMembers).toHaveLength(2);
  expect(generated.documents).toHaveLength(2);
  expect(generated.sourceLosslessness).toBe("PASS");
  const rootDocument = generated.documents.find(
    ({ sourceDocumentPath }) => sourceDocumentPath === rootPath,
  );
  const leafDocument = generated.documents.find(
    ({ sourceDocumentPath }) => sourceDocumentPath === leafPath,
  );
  expect(await readFile(rootDocument.path, "utf8")).toContain(
    "Import(<urn:leaf>)",
  );
  expect(await readFile(leafDocument.path, "utf8")).toContain('"imported"');
  expect(await readFile(leafDocument.path, "utf8")).not.toContain("urn:A");
  expect(generated.sourceConfiguration.parsingMode).toBe("compatible");
  expect(generated.verificationConfiguration.parsingMode).toBe("strict");
  for (const candidate of generated.candidates) {
    const text = await readFile(candidate.path, "utf8");
    expect(text).toContain("root");
    expect(text).not.toContain("imported");
    expect(candidate.standaloneImports).toBe(0);
    expect(candidate.sha256).toMatch(/^[a-f0-9]{64}$/u);
  }
  await expect(
    generateOntologyEvidenceWithNativeNode({
      rootPath,
      catalogMappings: [],
      outputDirectory: join(directory, "missing-mapping"),
    }),
  ).rejects.toThrow(/exact.*mapping/i);
});

test.each([
  "http://www.w3.org/2002/07/owl#unknownPredicate",
  "urn:unknownPredicate",
])(
  "compatible source evidence retains dropped RDF through %s without qualifying it as lossless",
  async (predicate) => {
    const directory = await temporaryDirectory();
    const rootPath = join(directory, "root.ttl");
    await writeFile(
      rootPath,
      `@prefix owl: <http://www.w3.org/2002/07/owl#> .
    <urn:root> a owl:Ontology. <urn:subject> <${predicate}> <urn:object>.`,
    );
    const generated = await generateOntologyEvidenceWithNativeNode({
      rootPath,
      catalogMappings: [],
      outputDirectory: join(directory, "candidates"),
    });
    expect(generated.sourceLosslessness).toBe("FAIL");
    expect(
      generated.diagnostics.flatMap(({ diagnostics }) => diagnostics),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: expect.stringMatching(/^RDF_UNCONSUMED/u),
        }),
      ]),
    );
    expect(generated.documents).toHaveLength(1);
    expect(generated.candidates).toHaveLength(2);
  },
);

test("a lossless named datatype restriction recovery survives both strict closure formats", async () => {
  const directory = await temporaryDirectory();
  const rootPath = join(directory, "root.ttl");
  await writeFile(
    rootPath,
    `@prefix owl: <http://www.w3.org/2002/07/owl#> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    <urn:root> a owl:Ontology.
    <urn:code> a rdfs:Datatype; owl:onDatatype xsd:string; owl:withRestrictions ([xsd:pattern "[A-Z]+"]).`,
  );
  const evidence = await generateOntologyEvidenceWithNativeNode({
    rootPath,
    catalogMappings: [],
    outputDirectory: join(directory, "evidence"),
  });
  expect(evidence.sourceLosslessness).toBe("PASS");
  expect(await readFile(evidence.documents[0].path, "utf8")).toContain(
    "DatatypeDefinition",
  );
  for (const candidate of evidence.candidates)
    expect(candidate.diagnostics).toEqual([]);
});
