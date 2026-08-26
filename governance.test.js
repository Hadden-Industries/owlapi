import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { OWLOntologyLoaderConfiguration } from "./model/index.js";
import {
  ANNOTATION_VALUE_KINDS,
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  DATA_PROPERTY_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  ENTITY_KINDS,
  INDIVIDUAL_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
} from "./model/index.js";

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./util/generate-owlapi-benchmark-fixtures.cjs");

const readJson = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

// Governance output must not depend on the host's ICU build or locale data.
// JavaScript's relational comparison has specified UTF-16 code-unit ordering,
// which is sufficient because every governed path and identifier is normalized.
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const validateAgainstSchema = (documentPath, schemaPath) => {
  const document = readJson(documentPath);
  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return {
    document,
    errors: validate(document) ? [] : validate.errors,
  };
};

const validateDocumentAgainstSchema = (document, schemaPath) => {
  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return validate(document) ? [] : validate.errors;
};

const REPOSITORY_ROOT = fileURLToPath(new URL("./", import.meta.url));

const git = (...args) =>
  execFileSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

// A shallow clone or a checkout without Git metadata cannot answer ancestry at
// all, and both occur in this repository's pipelines: Travis clones at its
// default depth and .dockerignore excludes .git from the image context. The
// unavailability is therefore proved rather than assumed, so this gate can only
// be bypassed where it is genuinely impossible to evaluate.
const completeHistoryUnavailableReason = () => {
  try {
    return git("rev-parse", "--is-shallow-repository") === "true"
      ? "shallow repository"
      : undefined;
  } catch {
    return "git metadata unavailable";
  }
};

const isAncestorOfHead = (revision) => {
  try {
    git("merge-base", "--is-ancestor", revision, "HEAD");
    return true;
  } catch {
    return false;
  }
};

const listProductionModules = (directory, prefix) =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        return listProductionModules(
          new URL(`${entry.name}/`, directory),
          relativePath,
        );
      }
      return entry.name.endsWith(".js") &&
        !entry.name.endsWith(".test.js") &&
        entry.name !== "index.js"
        ? [relativePath]
        : [];
    })
    .sort();

// Index modules are public facades rather than independent implementations.
// Enumerating only the five public namespaces and the private implementation
// root also prevents installed dependencies and repository tooling from being
// mistaken for governed package source.
const PRODUCTION_MODULE_ROOTS = [
  ["apibinding", "apibinding"],
  ["formats", "formats"],
  ["internal", "internal"],
  ["io", "io"],
  ["model", "model"],
];

const currentProductionModules = () =>
  PRODUCTION_MODULE_ROOTS.flatMap(([directory, prefix]) =>
    listProductionModules(new URL(`./${directory}/`, import.meta.url), prefix),
  ).sort();

describe("owlapi governance artifacts", () => {
  it("classifies every capability exactly once with a normative status", () => {
    const matrix = readJson("./docs/compatibility/capabilities.json");
    const ids = matrix.capabilities.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const capability of matrix.capabilities) {
      expect(matrix.normativeStatuses).toContain(capability.status);
      expect(matrix.progressStates).toContain(capability.progress);
    }
    expect(
      matrix.capabilities
        .filter(({ phase }) => phase !== null && phase <= 9)
        .every(({ progress }) => progress === "COMPLETE"),
    ).toBe(true);
  });

  it("pins the approved post-Phase-4 delivery order", () => {
    const matrix = readJson("./docs/compatibility/capabilities.json");
    const byId = new Map(
      matrix.capabilities.map((capability) => [capability.id, capability]),
    );
    const expectedPhases = new Map([
      ["rdf.dataset-graph-policy", 5],
      ["mapping.rdf-to-owl", 5],
      ["parser.rdfxml", 6],
      ["parser.turtle", 9],
      ["parser.dl", 10],
      ["parser.krss2", 11],
      ["format.krss1.identity", 11],
      ["parser.ntriples", 12],
      ["parser.nquads", 13],
      ["parser.trig", 14],
      ["parser.jsonld", 15],
      ["mapping.owl-to-rdf", 16],
      ["packaging.native-esm", 19],
    ]);

    for (const [id, phase] of expectedPhases) {
      expect(byId.get(id)?.phase).toBe(phase);
    }
    expect(byId.get("parser.turtle")).toMatchObject({
      delegate: "n3",
      progress: "COMPLETE",
      status: "DELEGATED",
    });
    expect(byId.get("parser.nquads")).toMatchObject({
      delegate: "n3",
      progress: "COMPLETE",
      status: "DELEGATED",
    });
    expect(byId.get("parser.trig")).toMatchObject({
      delegate: "n3",
      phase: 14,
      progress: "COMPLETE",
      status: "DELEGATED",
    });
    expect(byId.get("parser.jsonld")).toMatchObject({
      delegate: "jsonld",
      formatParameters: ["processingMode", "expandContext", "rdfDirection"],
      generalizedRdf: "UNSUPPORTED_BY_DESIGN",
      processingModes: ["json-ld-1.0", "json-ld-1.1"],
      progress: "COMPLETE",
      rdfDirectionModes: ["i18n-datatype", "compound-literal"],
      status: "DELEGATED",
    });
    expect(byId.get("parser.n3-language")).toMatchObject({
      status: "DEFERRED",
      phase: null,
    });
  });

  it("keeps KRSS1 and KRSS2 as distinct compatibility identities", () => {
    const matrix = readJson("./docs/compatibility/capabilities.json");
    const byId = new Map(
      matrix.capabilities.map((capability) => [capability.id, capability]),
    );

    expect(byId.get("parser.krss1")).toMatchObject({
      status: "REQUIRED_V1",
      progress: "COMPLETE",
      phase: 17,
    });
    expect(byId.get("format.krss1.identity").status).toBe("REQUIRED_V1");
    expect(byId.get("parser.krss2").status).toBe("REQUIRED_V1");
  });

  it("keeps KRSS evidence classes separate from the empty historical corpus", () => {
    const register = readJson("./docs/conformance/krss-corpus-register.json");

    expect(register.historicalCorpus).toMatchObject({
      qualifyingArtifactCount: 0,
      status: "NO_QUALIFYING_PUBLIC_ARTIFACT_VERIFIED",
    });
    expect(register.evidenceClasses.map(({ id }) => id)).toEqual([
      "PROJECT_OWNED_POSITIVE_GRAMMAR_FIXTURES",
      "HISTORICAL_ADJACENT_DIALECT_FIXTURES",
      "EXTENDED_KRSS2_NEGATIVE_FIXTURES",
      "CONVERTED_REAL_ONTOLOGY_FIXTURES",
      "FUTURE_FIRST_PARTY_STRICT_HISTORICAL_CORPUS",
    ]);
    expect(
      register.evidenceClasses
        .filter(({ historicalCorpus }) => historicalCorpus)
        .flatMap(({ artifacts }) => artifacts),
    ).toEqual([]);
  });

  it("defines every mandatory finite resource limit", () => {
    const budget = readJson("./docs/performance/resource-budgets.json");
    const required = [
      "maxInputBytes",
      "maxTokenLength",
      "maxTokenCount",
      "maxAxioms",
      "maxQuads",
      "maxBlankNodes",
      "maxRdfListLength",
      "maxExpressionDepth",
      "maxAnnotationDepth",
      "maxImportDepth",
      "maxImportCount",
      "maxXmlNestingDepth",
      "maxEntityDeclarations",
      "maxEntityReplacementLength",
      "maxEntityExpansionDepth",
      "maxExpandedXmlBytes",
      "maxRemoteDocumentBytes",
      "timeoutMs",
      "maxRedirects",
      "maxRetries",
    ];

    for (const name of required) {
      expect(Number.isFinite(budget.limits[name].value)).toBe(true);
      expect(budget.limits[name].value).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses the governed resource budgets as loader defaults", () => {
    const budget = readJson("./docs/performance/resource-budgets.json");
    const configuration = OWLOntologyLoaderConfiguration.defaults();

    for (const [name, { value }] of Object.entries(budget.limits)) {
      expect(configuration[name]).toBe(value);
    }
  });

  it("gives every legacy migration artifact a governed disposition", () => {
    const manifest = readJson("./docs/provenance/provenance.json");
    const ids = manifest.items.map(({ id }) => id);
    const paths = manifest.items.map(({ path }) => path);
    const revisionSelectors = manifest.revisionDispositionPolicy.selectors;
    const lifecycle = manifest.artifactLifecyclePolicy;

    expect(manifest.schemaVersion).toBe(4);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(revisionSelectors).toEqual(["AT_REVISION", "AFTER_REVISION"]);
    expect(lifecycle).toMatchObject({
      defaultState: "PRESENT",
      states: ["PRESENT", "DELETED"],
    });
    for (const item of manifest.items) {
      const repositoryState = item.repositoryState ?? lifecycle.defaultState;

      expect(manifest.dispositions).toContain(item.disposition);
      expect(item.disposition).not.toBe("REVIEW_EXCEPTION");
      expect(manifest.provenanceCategories).toHaveProperty(
        item.provenanceCategory,
      );
      expect(item.licenseCopyright).toBeTruthy();
      expect(manifest.decisionReferences).toHaveProperty(item.decisionRef);
      expect(lifecycle.states).toContain(repositoryState);
      if (repositoryState === "DELETED") {
        expect(item.retiredInPhase).toBe(18);
        expect(manifest.decisionReferences).toHaveProperty(
          item.retirementDecisionRef,
        );
        if (item.path.includes("*")) {
          expect(item.artifactPaths?.length).toBeGreaterThan(0);
        }
        for (const retiredPath of item.artifactPaths ?? [item.path]) {
          expect(existsSync(new URL(`./${retiredPath}`, import.meta.url))).toBe(
            false,
          );
        }
      }
      for (const revisionDisposition of item.revisionDispositions || []) {
        expect(revisionSelectors).toContain(revisionDisposition.selector);
        expect(revisionDisposition.revision).toMatch(/^[0-9a-f]{40}$/);
        expect(manifest.dispositions).toContain(
          revisionDisposition.disposition,
        );
        expect(revisionDisposition.disposition).not.toBe("REVIEW_EXCEPTION");
      }
    }

    const presentLegacyModules = manifest.items
      .filter(
        ({ repositoryState = lifecycle.defaultState }) =>
          repositoryState === "PRESENT",
      )
      .map(({ path }) => path)
      .filter(
        (path) =>
          path.startsWith("src/owl2vowl/js/") &&
          !path.includes("*") &&
          !path.endsWith(".test.js"),
      )
      .sort();
    // PRESENT describes the source WebVOWL repository at the recorded
    // lifecycle point; it does not admit application modules into this package.
    // Every such path must remain absent from the canonical standalone tree.
    expect(presentLegacyModules.length).toBeGreaterThan(0);
    for (const legacyPath of presentLegacyModules) {
      expect(existsSync(new URL(`./${legacyPath}`, import.meta.url))).toBe(
        false,
      );
    }
  });

  it("pins the approved commit-bounded reuse dispositions", () => {
    const manifest = readJson("./docs/provenance/provenance.json");
    const revisionBoundaries = new Map([
      [
        "src/owl2vowl/js/ontologyConverter.js",
        "f0dbf623a69adf08bc61f5867c7421fba9c2e750",
      ],
      [
        "src/owl2vowl/js/ontologyConverter.test.js",
        "f0dbf623a69adf08bc61f5867c7421fba9c2e750",
      ],
      [
        "src/owl2vowl/js/rdfParser.js",
        "f0dbf623a69adf08bc61f5867c7421fba9c2e750",
      ],
      [
        "src/owl2vowl/js/rdfParser.test.js",
        "f0dbf623a69adf08bc61f5867c7421fba9c2e750",
      ],
      [
        "src/owl2vowl/js/turtleParser.js",
        "5967a0fe0575e03f84e65cb8f18fd4229612b315",
      ],
      [
        "src/owl2vowl/js/turtleParser.test.js",
        "5967a0fe0575e03f84e65cb8f18fd4229612b315",
      ],
    ]);

    for (const [path, revision] of revisionBoundaries) {
      const item = manifest.items.find((candidate) => candidate.path === path);

      expect(item).toMatchObject({
        disposition: "REIMPLEMENT",
        decisionRef: "PROVENANCE-2026-08-11",
        repositoryState: "DELETED",
        retiredInPhase: 18,
        retirementDecisionRef: "PHASE18-2026-08-22",
      });
      expect(item.revisionDispositions).toEqual([
        {
          selector: "AT_REVISION",
          revision,
          disposition: "REUSE_ALLOWED",
        },
        {
          selector: "AFTER_REVISION",
          revision,
          disposition: "REIMPLEMENT",
        },
      ]);
    }

    const characterizationTests = manifest.items.find(
      ({ id }) => id === "LEGACY-CHARACTERIZATION-TESTS",
    );
    const exactTestPaths = [...revisionBoundaries.keys()]
      .filter((path) => path.endsWith(".test.js"))
      .sort();

    expect([...characterizationTests.excludedPaths].sort()).toEqual(
      exactTestPaths,
    );
  });

  it("records provenance for every completed semantic production module", () => {
    const manifest = readJson("./docs/provenance/provenance.json");
    const records = manifest.implementationRecords;
    const paths = records.map(({ path }) => path).sort();
    const productionModules = currentProductionModules();

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(productionModules);
    for (const record of records) {
      expect([
        1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19,
      ]).toContain(record.phase);
      expect(manifest.provenanceCategories).toHaveProperty(
        record.provenanceCategory,
      );
      expect(record.normativePublicSources.length).toBeGreaterThan(0);
      expect(record.compatibilityReferences.length).toBeGreaterThan(0);
      expect(record.referenceOwlapiRevision).toBe(
        manifest.referenceOwlapi.revision,
      );
      expect(record.focusedEvidence.length).toBeGreaterThan(0);
      expect(record.thirdPartyDependencies).toBeInstanceOf(Array);
      expect(["replaced", "excluded", "not-applicable"]).toContain(
        record.legacyDerivedImplementationDisposition,
      );
      expect(manifest.decisionReferences).toHaveProperty(record.decisionRef);
      for (const change of record.laterPhaseChanges || []) {
        expect(change.phase).toBeGreaterThan(record.phase);
        expect(change.normativePublicSources.length).toBeGreaterThan(0);
        expect(change.focusedEvidence.length).toBeGreaterThan(0);
        expect(manifest.decisionReferences).toHaveProperty(change.decisionRef);
      }
    }
    expect(
      records
        .filter(({ phase }) => phase === 2)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "internal/parsing/functional/descriptor.js",
      "internal/parsing/functional/lexer.js",
      "internal/parsing/functional/parser.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 3)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "internal/parsing/manchester/descriptor.js",
      "internal/parsing/manchester/lexer.js",
      "internal/parsing/manchester/parser.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 4)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "internal/parsing/owlxml/descriptor.js",
      "internal/parsing/owlxml/grammar.js",
      "internal/parsing/owlxml/parser.js",
      "internal/parsing/xml/xmlEntityPolicy.js",
      "internal/parsing/xml/xmlParserAdapter.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 5)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "internal/mapping/rdfToOwlTranslator.js",
      "internal/rdfjs/vocabulary.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 6)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "internal/parsing/rdfxml/descriptor.js",
      "internal/parsing/rdfxml/parser.js",
      "internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 9)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "internal/parsing/rdf/n3SyntaxAdapter.js",
      "internal/parsing/turtle/descriptor.js",
      "internal/parsing/turtle/parser.js",
    ]);
    expect(
      records
        .find(({ path }) => path === "internal/rdfjs/graphPolicy.js")
        ?.laterPhaseChanges?.map(({ phase }) => phase),
    ).toContain(5);
    expect(
      records
        .find(({ path }) => path === "model/owlOntologyManager.js")
        ?.laterPhaseChanges?.map(({ phase }) => phase),
    ).toContain(6);
    expect(
      records
        .find(({ path }) => path === "internal/mapping/rdfToOwlTranslator.js")
        ?.laterPhaseChanges?.map(({ phase }) => phase),
    ).toContain(6);
    // Plan section 22.2.1: the project has two reference implementations, and a
    // research record must pin the revision of the one it actually inspected.
    // `reference` names the manifest block; its absence means OWLAPI, which is
    // what every record predating that section assumed implicitly.
    for (const research of manifest.compatibilityResearch) {
      const reference = manifest[research.reference ?? "referenceOwlapi"];
      expect(reference).toBeDefined();
      expect(research.sourceRevision).toBe(reference.revision);
      expect(research.implementationSourcesInspected.length).toBeGreaterThan(0);
      expect(research.productionUse).toMatch(/No implementation text|None\./);
      expect(research.evidence).toBeTruthy();
    }
  });

  it("pins immutable external and behavioral reference revisions", () => {
    const manifest = readJson("./docs/conformance/suites.json");

    for (const suite of manifest.suites) {
      const revisions = suite.revisionScopes?.map(
        ({ revision }) => revision,
      ) ?? [suite.revision];
      expect(revisions.length).toBeGreaterThan(0);
      for (const revision of revisions) {
        expect(revision).toBeTruthy();
        expect(revision).not.toMatch(/^(main|master|latest)$/i);
      }
    }
  });

  it("keeps each RDF syntax pinned to the W3C revision actually ingested", () => {
    const suites = readJson("./docs/conformance/suites.json");
    const classifications = readJson(
      "./docs/conformance/classification-manifests.json",
    );
    const suite = suites.suites.find(({ id }) => id === "w3c-rdf-tests");
    const manifests = new Map(
      classifications.manifests.map((manifest) => [manifest.id, manifest]),
    );

    expect(suite.revisionScopes).toEqual([
      {
        formats: ["RDF/XML"],
        revision: "ad541a5f0479f0798608c4801369d97b8e08b36f",
      },
      {
        formats: ["Turtle", "N-Triples", "N-Quads", "TriG"],
        revision: "12774b0ebb385d17651b396654b19254d0fefbfa",
      },
    ]);
    expect(manifests.get("w3c-rdf-tests.rdfxml")?.revision).toBe(
      "ad541a5f0479f0798608c4801369d97b8e08b36f",
    );
    expect(manifests.get("w3c-rdf-tests.turtle")?.revision).toBe(
      "12774b0ebb385d17651b396654b19254d0fefbfa",
    );
    expect(manifests.get("w3c-rdf-tests.ntriples")?.revision).toBe(
      "12774b0ebb385d17651b396654b19254d0fefbfa",
    );
    expect(manifests.get("w3c-rdf-tests.nquads")?.revision).toBe(
      "12774b0ebb385d17651b396654b19254d0fefbfa",
    );
  });

  it("reconciles every reuse boundary with the accepted reconstruction lineage", () => {
    const manifest = readJson("./docs/provenance/provenance.json");
    const projectLineage = readJson(
      "./docs/provenance/history-reconstruction/reconstruction/project-lineage.json",
    );
    const boundaryLineage = readJson(
      "./docs/provenance/history-reconstruction/reuse-boundary-lineage.json",
    );
    const governedPathsByRevision = new Map();
    for (const item of manifest.items) {
      for (const { revision } of item.revisionDispositions || []) {
        const paths = governedPathsByRevision.get(revision) ?? new Set();
        paths.add(item.path);
        governedPathsByRevision.set(revision, paths);
      }
    }
    const projectByOriginal = new Map(
      projectLineage.records.map((record) => [
        record.originalCommitOid,
        record,
      ]),
    );
    const boundaryByOriginal = new Map(
      boundaryLineage.records.map((record) => [
        record.originalCommitOid,
        record,
      ]),
    );

    expect(governedPathsByRevision.size).toBeGreaterThan(0);
    for (const [revision, governedPaths] of governedPathsByRevision) {
      const projectRecord = projectByOriginal.get(revision);
      const boundaryRecord = boundaryByOriginal.get(revision);
      const result = projectRecord?.results.find(
        ({ commitOid }) => commitOid === boundaryRecord?.reconstructedCommitOid,
      );

      expect(projectRecord).toBeDefined();
      expect(boundaryRecord).toBeDefined();
      expect(new Set(boundaryRecord.governedPaths)).toEqual(governedPaths);
      expect(result).toMatchObject({
        repository: "Hadden-Industries/WebVOWL",
        resultKind: "RECONSTRUCTED_WEBVOWL_MAIN_COMMIT",
      });
    }

    // Rewritten package commits, unlike the original WebVOWL identities above,
    // must remain ancestors of the canonical package tip whenever complete Git
    // history is available. This preserves the old ancestry safeguard at the
    // repository boundary where it is semantically valid after extraction.
    const packageCommitOids = [
      ...new Set(
        projectLineage.records.flatMap(({ results }) =>
          results
            .filter(
              ({ repository }) => repository === "Hadden-Industries/owlapi",
            )
            .map(({ commitOid }) => commitOid),
        ),
      ),
    ];
    const unavailable = completeHistoryUnavailableReason();

    expect(packageCommitOids.length).toBeGreaterThan(0);
    if (unavailable) {
      expect(["shallow repository", "git metadata unavailable"]).toContain(
        unavailable,
      );
      return;
    }
    for (const commitOid of packageCommitOids) {
      expect({
        commitOid,
        onCurrentBranch: isAncestorOfHead(commitOid),
      }).toEqual({ commitOid, onCurrentBranch: true });
    }
  });

  it("resolves every declared conformance runner and harness on disk", () => {
    const manifest = readJson("./docs/conformance/suites.json");

    for (const suite of manifest.suites.filter(
      ({ repositoryOwner }) => repositoryOwner !== "Hadden-Industries/WebVOWL",
    )) {
      const declaredPaths = [
        suite.runner,
        suite.harness,
        suite.dlSyntax?.specializedHarness,
        suite.dlSyntax?.fixture,
        suite.dlSyntax?.snapshot,
        suite.dlSyntax?.runner,
        ...(suite.dlSyntax?.crossFormatCounterparts || []),
      ];
      for (const path of declaredPaths.filter(Boolean)) {
        expect({
          exists: existsSync(new URL(`./${path}`, import.meta.url)),
          path,
        }).toEqual({ exists: true, path });
      }
    }
  });

  it("declares the Phase 7 VOWL semantic differential against the OWL2VOWL oracle", () => {
    const manifest = readJson("./docs/conformance/suites.json");
    const suite = manifest.suites.find(({ id }) => id === "owl2vowl-reference");

    expect(suite.repositoryOwner).toBe("Hadden-Industries/WebVOWL");
    expect(suite.applicable).toContain("VOWL semantic snapshot");
    expect(suite.runner).toBe(
      "src/owl2vowl/test/vowlBuilder.differential.test.js",
    );
  });

  it("pins selected dependency versions and their replacement boundaries", () => {
    const governance = readJson("./docs/dependency-governance.json");
    const packageJson = readJson("./package.json");
    const lock = readJson("./package-lock.json");

    expect(governance.dependencies).toHaveLength(6);
    for (const dependency of governance.dependencies) {
      expect(packageJson.dependencies[dependency.name]).toBe(
        dependency.version,
      );
      expect(lock.packages[`node_modules/${dependency.name}`].version).toBe(
        dependency.version,
      );
      expect(dependency.adapterBoundary).toMatch(
        /^(?:internal\/(?:mapping|parsing|rdfjs)|model)\//,
      );
      expect(dependency.declaredLicenseExpression).toBeTruthy();
      expect(dependency.networkBehavior).toBeTruthy();
      expect(dependency.runtimeDependencies).toBeInstanceOf(Array);
    }

    const rdfXml = governance.dependencies.find(
      ({ name }) => name === "rdfxml-streaming-parser",
    );
    expect(rdfXml.adapterBoundary).toBe(
      "internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js",
    );
    expect(rdfXml.conformanceEvidence).toEqual(
      expect.arrayContaining([
        "docs/conformance/classification-manifests.json#w3c-rdf-tests.rdfxml",
        "internal/parsing/rdfxml/rdfXml.conformance.test.js",
        "internal/parsing/rdfxml/rdfXmlSyntaxAdapter.test.js",
        "internal/parsing/rdfxml/rdfXmlSyntaxAdapter.resource.test.js",
      ]),
    );
    expect(rdfXml.browserCost).toMatchObject({
      disposition: "MEASURED_LAZY_CLOSURE",
      gzipBytes: 46775,
      initialStaticClosureIncluded: false,
      minifiedBytes: 163134,
    });
    expect(rdfXml.securityDisposition).toMatchObject({
      assessedOn: "2026-08-26",
      riskClass: "COMPLEX_SYNTAX_PARSER",
    });
    expect(rdfXml.securityDisposition.controls).toContain(
      "External-entity retrieval is forbidden by the owlapi adapter",
    );
  });

  it("schema-validates and executes every private dependency seam", async () => {
    const schema = readJson(
      "./docs/compatibility/dependency-seams.schema.json",
    );
    const registry = readJson("./docs/compatibility/dependency-seams.json");
    const packageJson = readJson("./package.json");
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema,
    );

    expect(validate(registry)).toBe(true);
    expect(validate.errors).toBeNull();
    expect(registry.packageVersion).toBe(packageJson.version);
    expect(new Set(registry.seams.map(({ id }) => id)).size).toBe(
      registry.seams.length,
    );

    for (const seam of registry.seams) {
      expect(packageJson.dependencies[seam.package]).toBe(seam.version);
      const sourceUrl = new URL(`./${seam.sourceModule}`, import.meta.url);
      const source = readFileSync(sourceUrl, "utf8");
      expect(source.split(seam.literalSpecifier)).toHaveLength(2);

      const resolved = fileURLToPath(import.meta.resolve(seam.literalSpecifier))
        .replaceAll("\\", "/")
        .toLowerCase();
      expect(resolved.endsWith(seam.expectedResolvedSuffix.toLowerCase())).toBe(
        true,
      );

      const namespace = await import(seam.literalSpecifier);
      for (const namespacePath of seam.requiredNamespacePaths) {
        const value = namespacePath
          .split(".")
          .reduce((container, key) => container?.[key], namespace);
        expect(typeof value).toBe("function");
      }
      for (const evidencePath of seam.evidence) {
        expect(existsSync(new URL(`./${evidencePath}`, import.meta.url))).toBe(
          true,
        );
      }
    }
  });

  it("keeps the Java API inventory, public exports, and generated views in sync", async () => {
    const schema = readJson(
      "./docs/compatibility/java-api-surface.schema.json",
    );
    const registry = readJson("./docs/compatibility/java-api-surface.json");
    const capabilities = readJson("./docs/compatibility/capabilities.json");
    const packageJson = readJson("./package.json");
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema,
    );

    expect(validate(registry)).toBe(true);
    expect(validate.errors).toBeNull();
    expect(registry.packageVersion).toBe(packageJson.version);
    expect(registry.javaReference.revision).toBe(
      "d7e997a53b470e32700de89cc610d9daf01ea769",
    );

    const capabilityById = new Map(
      capabilities.capabilities.map((capability) => [
        capability.id,
        capability,
      ]),
    );
    const capabilityIds = new Set(capabilityById.keys());
    const bindingIds = registry.bindings.map(({ id }) => id);
    const javaNames = registry.javaTypes.map(({ javaName }) => javaName);
    expect(new Set(bindingIds).size).toBe(bindingIds.length);
    expect(new Set(javaNames).size).toBe(javaNames.length);
    expect(
      registry.javaTypes.some(
        ({ disposition }) => disposition === "UNCLASSIFIED",
      ),
    ).toBe(false);
    expect(registry.summary).toMatchObject({
      namespaceCount: registry.namespaces.length,
      publicBindingCount: registry.bindings.length,
      javaTypeCount: registry.javaTypes.length,
      unclassifiedJavaTypeCount: 0,
    });
    expect(
      Object.values(registry.summary.javaDispositionCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(registry.javaTypes.length);

    const modules = new Map(
      await Promise.all(
        Object.entries(packageJson.exports)
          .filter(([specifier]) => specifier !== ".")
          .map(async ([specifier, target]) => [
            `owlapi${specifier.slice(1)}`,
            await import(target),
          ]),
      ),
    );
    const registeredSpecifiers = registry.namespaces
      .filter(({ npmSpecifier }) => npmSpecifier !== "owlapi")
      .map(({ npmSpecifier }) => npmSpecifier)
      .sort();
    expect(registeredSpecifiers).toEqual([...modules.keys()].sort());

    for (const [specifier, moduleNamespace] of modules) {
      const registeredExports = registry.bindings
        .filter((binding) => binding.publicSpecifier === specifier)
        .map(({ jsExport }) => jsExport)
        .sort();
      expect(registeredExports).toEqual(Object.keys(moduleNamespace).sort());
    }

    const javaTypeByName = new Map(
      registry.javaTypes.map((type) => [type.javaName, type]),
    );
    for (const binding of registry.bindings) {
      expect(binding.exposure).toBe("PUBLIC");
      expect(binding.stability).toBe("PRERELEASE");
      expect(binding.capabilityIds.every((id) => capabilityIds.has(id))).toBe(
        true,
      );
      expect(
        binding.capabilityIds.every(
          (id) => capabilityById.get(id).status === binding.capabilityStatus,
        ),
      ).toBe(true);
      expect(
        binding.capabilityIds.every(
          (id) => capabilityById.get(id).progress === binding.progress,
        ),
      ).toBe(true);
      expect(
        existsSync(new URL(`./${binding.sourceModule}`, import.meta.url)),
      ).toBe(true);
      for (const evidencePath of binding.verification) {
        expect(existsSync(new URL(`./${evidencePath}`, import.meta.url))).toBe(
          true,
        );
      }
      if (binding.javaType !== null) {
        expect(javaTypeByName.get(binding.javaType)?.disposition).toBe(
          "PUBLIC_MAPPED",
        );
      }
    }

    for (const javaType of registry.javaTypes) {
      expect(javaType.capabilityIds.every((id) => capabilityIds.has(id))).toBe(
        true,
      );
      expect(javaType.stability).toBe(
        javaType.exposure === "PUBLIC" ? "PRERELEASE" : null,
      );
    }

    const digest = createHash("sha256")
      .update(
        readFileSync(
          new URL(
            "./docs/compatibility/java-api-surface.json",
            import.meta.url,
          ),
        ),
      )
      .digest("hex");
    for (const path of ["API.md", "docs/compatibility/java-api-surface.md"]) {
      const view = readFileSync(new URL(`./${path}`, import.meta.url), "utf8");
      expect(view).toContain(`registry-sha256: ${digest}`);
      expect(view).toContain(
        "not affiliated with, sponsored by, or endorsed by the Java OWLAPI project",
      );
      for (const binding of registry.bindings) {
        expect(view.split(`\`${binding.jsExport}\``)).toHaveLength(2);
      }
    }
  });

  it("keeps package-facing identity, scope, and licence statements aligned", () => {
    const packageJson = readJson("./package.json");
    const readme = readFileSync(
      new URL("./README.md", import.meta.url),
      "utf8",
    );
    const changelog = readFileSync(
      new URL("./CHANGELOG.md", import.meta.url),
      "utf8",
    );
    const license = readFileSync(new URL("./LICENSE", import.meta.url));
    const notice = readFileSync(new URL("./NOTICE", import.meta.url), "utf8");

    expect(packageJson.license).toBe("AGPL-3.0-only");
    expect(createHash("sha256").update(license).digest("hex")).toBe(
      "d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee",
    );
    expect(notice).toBe(`owlapi

Originally authored by Maksym Shostak
https://github.com/MaksymShostak

Copyright © 2026 Maksym Shostak.

Project stewardship: HADDEN INDUSTRIES LTD.
Registered in England and Wales under company number 07862561.
https://data.companieshouse.gov.uk/doc/company/07862561

Licensed under the GNU Affero General Public License, version 3 only
(SPDX: AGPL-3.0-only).
https://www.gnu.org/licenses/agpl-3.0.html

See LICENSE for the complete, unmodified licence text.

Ordinary npm dependencies are installed separately and remain under their own
licences. Neither LICENSE nor this NOTICE relicenses them. The version-matched
material inventory for this package version is maintained at:
https://github.com/Hadden-Industries/owlapi/blob/v0.1.0-alpha.0/docs/provenance/third-party-material.json

Java OWLAPI names and package identities appear in compatibility documentation
generated from the pinned Java OWLAPI reference. owlapi is independently
maintained and is not affiliated with or endorsed by the Java OWLAPI project.

WebVOWL is a separate downstream distribution and maintains its own deployed-
bundle licence and notice review.
`);

    for (const requiredText of [
      "## Why `owlapi` exists",
      "0.1.0-alpha.0",
      "npm install owlapi@next",
      "independently maintained JavaScript implementation",
      "not affiliated with, sponsored by, or endorsed by the Java OWLAPI project",
      "unrelated, now-unpublished Overwatch package",
      "does not reuse any of its historical versions",
      "does **not** provide a reasoner",
      "No official TypeScript declarations",
      "does not collect personal data",
      "Copyright © 2026 Maksym Shostak",
      "HADDEN INDUSTRIES LTD",
      "AGPL-3.0-only",
    ]) {
      expect(readme).toContain(requiredText);
    }
    for (const specifier of [
      "owlapi",
      "owlapi/apibinding",
      "owlapi/model",
      "owlapi/io",
      "owlapi/formats",
    ]) {
      expect(readme).toContain(`\`${specifier}\``);
    }
    expect(changelog).toContain("## 0.1.0-alpha.0 — pending publication");
    expect(changelog).toContain(
      "This alpha is a documented subset, not complete Java OWLAPI parity.",
    );
  });

  it("keeps the standalone capability matrix scoped to the package release", () => {
    const matrix = readJson("./docs/compatibility/capabilities.json");
    const capabilities = new Map(
      matrix.capabilities.map((capability) => [capability.id, capability]),
    );

    expect(matrix.release).toBe("0.1.0-alpha.0");
    expect(
      [...capabilities.keys()].filter((id) => id.startsWith("webvowl.")),
    ).toEqual([]);
    expect(capabilities.get("packaging.native-esm")?.progress).toBe("COMPLETE");
  });

  it("uses stable, release-independent identities for release-evidence schemas", () => {
    const expectedIds = new Map([
      [
        "./docs/provenance/third-party-material.schema.json",
        "https://haddenindustries.com/schemas/owlapi/third-party-material.v1.schema.json",
      ],
      [
        "./docs/provenance/rights-inventory.schema.json",
        "https://haddenindustries.com/schemas/owlapi/rights-inventory.v1.schema.json",
      ],
      [
        "./docs/dependency-governance.schema.json",
        "https://haddenindustries.com/schemas/owlapi/dependency-governance.v1.schema.json",
      ],
    ]);

    for (const [schemaPath, expectedId] of expectedIds) {
      expect({
        exists: existsSync(new URL(schemaPath, import.meta.url)),
        schemaPath,
      }).toEqual({ exists: true, schemaPath });
      const schema = readJson(schemaPath);
      expect(schema.$id).toBe(expectedId);
      expect(
        schema.properties.package.properties.version.const,
      ).toBeUndefined();
      expect(schema.properties.package.properties.version.pattern).toBeTruthy();
    }
  });

  it("rejects contradictory pending and reviewed release attestations", () => {
    for (const [documentPath, schemaPath] of [
      [
        "./docs/provenance/third-party-material.json",
        "./docs/provenance/third-party-material.schema.json",
      ],
      [
        "./docs/provenance/rights-inventory.json",
        "./docs/provenance/rights-inventory.schema.json",
      ],
      [
        "./docs/dependency-governance.json",
        "./docs/dependency-governance.schema.json",
      ],
    ]) {
      const document = readJson(documentPath);
      const reviewedWithoutReviewer = structuredClone(document);
      reviewedWithoutReviewer.review.status = "REVIEWED";
      reviewedWithoutReviewer.review.reviewer = null;
      reviewedWithoutReviewer.review.reviewedOn = null;
      reviewedWithoutReviewer.review.capacity = null;
      reviewedWithoutReviewer.review.conclusion = null;

      expect({
        documentPath,
        errors: validateDocumentAgainstSchema(
          reviewedWithoutReviewer,
          schemaPath,
        ),
      }).not.toEqual({ documentPath, errors: [] });

      const pendingWithConclusion = structuredClone(document);
      pendingWithConclusion.review.status = "PENDING_HUMAN_REVIEW";
      pendingWithConclusion.review.reviewer = "Maksym Shostak";
      pendingWithConclusion.review.reviewedOn = "2026-08-26";
      pendingWithConclusion.review.capacity = "Reviewer";
      pendingWithConclusion.review.conclusion = "Approved";

      expect({
        documentPath,
        errors: validateDocumentAgainstSchema(
          pendingWithConclusion,
          schemaPath,
        ),
      }).not.toEqual({ documentPath, errors: [] });
    }
  });

  it("records exact component evidence without heuristic attribution or duplicated review state", () => {
    const inventory = readJson("./docs/provenance/third-party-material.json");
    const inspectedPaths = new Set(
      inventory.components.flatMap(({ inspectedFiles }) =>
        inspectedFiles.map(({ path }) => path),
      ),
    );

    for (const component of inventory.components) {
      expect(component).not.toHaveProperty("attributionText");
      expect(component).not.toHaveProperty("reviewStatus");
      expect(component).toHaveProperty("packageAuthor");
      expect(component).toHaveProperty("sourceReference");
      expect(["INSTALLED_PACKAGE_FILES", "LOCKFILE_METADATA_ONLY"]).toContain(
        component.inspectionBasis,
      );
      if (component.sourceUrl !== null) {
        expect(component.sourceUrl).toMatch(/^https:\/\//u);
      }
    }

    for (const evidencePath of [
      "node_modules/prettier/THIRD-PARTY-NOTICES.md",
      "node_modules/playwright/ThirdPartyNotices.txt",
      "node_modules/playwright-core/ThirdPartyNotices.txt",
      "node_modules/rolldown/THIRD-PARTY-LICENSE",
    ]) {
      expect(inspectedPaths).toContain(evidencePath);
    }
  });

  it("uses SPDX-valid scoped licence conclusions and an explicit distribution policy", () => {
    const packageJson = readJson("./package.json");
    expect(packageJson.devDependencies["spdx-expression-parse"]).toBe("4.0.0");
    const parseSpdxExpression = require("spdx-expression-parse");
    const inventory = readJson("./docs/provenance/third-party-material.json");

    for (const component of inventory.components) {
      expect(() =>
        parseSpdxExpression(component.declaredLicenseExpression),
      ).not.toThrow();
      expect(() =>
        parseSpdxExpression(component.concludedLicenseExpression),
      ).not.toThrow();
      expect(component.licenseConclusionRationale).toBeTruthy();
      expect([
        "ALLOWED_SEPARATELY_INSTALLED_EXTERNAL_RUNTIME",
        "DEVELOPMENT_ONLY_NOT_DISTRIBUTED",
        "REQUIRES_HUMAN_REVIEW",
      ]).toContain(component.distributionDisposition);
    }

    const materialsById = new Map(
      inventory.materials.map((material) => [material.id, material]),
    );
    expect([...materialsById.keys()].sort(compareCodeUnits)).toEqual([
      "contributor-covenant-3.0",
      "generated-w3c-conformance-manifests",
      "gnu-agpl-3.0-only-license-text",
      "java-owlapi-api-identity-metadata",
      "java-owlapi-reference-fixtures",
      "w3c-json-ld-api-tests",
      "w3c-owl2-test-artifact",
      "w3c-rdf-tests",
    ]);
    for (const material of materialsById.values()) {
      expect(material).not.toHaveProperty("reviewStatus");
      expect(material.licenseAssessments.length).toBeGreaterThan(0);
      for (const assessment of material.licenseAssessments) {
        expect(() =>
          parseSpdxExpression(assessment.declaredLicenseExpression),
        ).not.toThrow();
        expect(() =>
          parseSpdxExpression(assessment.concludedLicenseExpression),
        ).not.toThrow();
        expect(assessment.licenseConclusionRationale).toBeTruthy();
      }
    }
    expect(
      materialsById.get("generated-w3c-conformance-manifests")
        .licenseAssessments,
    ).toHaveLength(2);
    expect(
      materialsById.get("java-owlapi-reference-fixtures").licenseAssessments,
    ).toHaveLength(2);
  });

  it("schema-validates structured dependency governance against the package and inventory", () => {
    const schemaPath = "./docs/dependency-governance.schema.json";
    expect(existsSync(new URL(schemaPath, import.meta.url))).toBe(true);
    const { document: governance, errors } = validateAgainstSchema(
      "./docs/dependency-governance.json",
      schemaPath,
    );
    const packageJson = readJson("./package.json");
    const lock = readJson("./package-lock.json");
    const inventory = readJson("./docs/provenance/third-party-material.json");
    const parseSpdxExpression = require("spdx-expression-parse");

    expect(errors).toEqual([]);
    expect(governance.package).toEqual({
      name: packageJson.name,
      version: packageJson.version,
    });
    expect(governance.productionAudit).toMatchObject({
      command: "npm audit --omit=dev --json",
      performedOn: "2026-08-26",
      productionPackageCount: 34,
      vulnerabilityCounts: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
      },
    });

    const inventoryByPath = new Map(
      inventory.components.map((component) => [
        component.dependencyPath,
        component,
      ]),
    );
    for (const dependency of governance.dependencies) {
      expect(packageJson.dependencies[dependency.name]).toBe(
        dependency.version,
      );
      expect(lock.packages[`node_modules/${dependency.name}`].version).toBe(
        dependency.version,
      );
      expect(dependency.browserCost).toEqual(
        expect.objectContaining({
          disposition: expect.any(String),
          initialStaticClosureIncluded: expect.any(Boolean),
          measurementReference: expect.any(String),
        }),
      );
      expect(dependency.securityDisposition).toEqual(
        expect.objectContaining({
          assessedOn: "2026-08-26",
          riskClass: expect.any(String),
          controls: expect.any(Array),
          rationale: expect.any(String),
        }),
      );
      expect(() =>
        parseSpdxExpression(dependency.declaredLicenseExpression),
      ).not.toThrow();
      expect(
        inventoryByPath.get(`node_modules/${dependency.name}`)
          ?.declaredLicenseExpression,
      ).toBe(dependency.declaredLicenseExpression);
    }

    expect(
      governance.dependencies.find(({ name }) => name === "jsonld").browserCost,
    ).toMatchObject({
      disposition: "MEASURED_LAZY_CLOSURE",
      fileCount: 3,
      gzipBytes: 50201,
      initialStaticClosureIncluded: false,
      minifiedBytes: 204727,
    });
  });

  it("pins the rights scope to an exact, singly classified packlist", () => {
    const npmCli = process.env.npm_execpath;
    expect(typeof npmCli).toBe("string");
    const output = execFileSync(
      process.execPath,
      [npmCli, "pack", "--dry-run", "--json"],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const result = JSON.parse(output);
    const pack = Array.isArray(result)
      ? result[0]
      : result[Object.keys(result)[0]];
    const packedPaths = pack.files
      .map(({ path }) => path)
      .sort(compareCodeUnits);
    const rights = readJson("./docs/provenance/rights-inventory.json");
    const inventory = readJson("./docs/provenance/third-party-material.json");

    for (const path of packedPaths) {
      const classificationIds = rights.materialClasses
        .filter(({ paths }) =>
          paths.some((candidate) =>
            candidate.endsWith("/")
              ? path.startsWith(candidate)
              : path === candidate,
          ),
        )
        .map(({ id }) => id);
      expect({ classificationIds, path }).toEqual({
        classificationIds: [expect.any(String)],
        path,
      });
    }

    const sourceManifest = packedPaths
      .map(
        (path) =>
          `${sha256(readFileSync(new URL(`./${path}`, import.meta.url)))}  ${path}\n`,
      )
      .join("");
    expect(rights.package.scopeAuthority).toEqual({
      method: "npm pack --dry-run --json plus local source-byte hashing",
      fileCount: packedPaths.length,
      sourceManifestSha256: sha256(sourceManifest),
    });
    expect(rights.externalDependencies.inventoryFactsSha256).toBe(
      inventory.review.factsSha256,
    );
    expect(inventory.package.tarballDependenciesBundled).toBe(
      packedPaths.some((path) => path.startsWith("node_modules/")),
    );
  });

  it("keeps the publication manifest free of undeclared package surfaces", () => {
    const packageJson = readJson("./package.json");
    const forbiddenFields = [
      "browser",
      "bundleDependencies",
      "bundledDependencies",
      "main",
      "module",
      "optionalDependencies",
      "overrides",
      "peerDependencies",
      "types",
      "typings",
    ];
    const forbiddenLifecycleScripts = [
      "install",
      "postinstall",
      "postpack",
      "preinstall",
      "prepack",
      "prepare",
      "prepublish",
      "prepublishOnly",
    ];

    for (const field of forbiddenFields) {
      expect(packageJson).not.toHaveProperty(field);
    }
    for (const script of forbiddenLifecycleScripts) {
      expect(packageJson.scripts).not.toHaveProperty(script);
    }
    expect(existsSync(new URL("./npm-shrinkwrap.json", import.meta.url))).toBe(
      false,
    );
  });

  it("schema-validates machine evidence and previously reviewed identity evidence", () => {
    const packageJson = readJson("./package.json");
    for (const [documentPath, schemaPath] of [
      [
        "./docs/provenance/rights-inventory.json",
        "./docs/provenance/rights-inventory.schema.json",
      ],
      [
        "./docs/provenance/third-party-material.json",
        "./docs/provenance/third-party-material.schema.json",
      ],
      [
        "./docs/dependency-governance.json",
        "./docs/dependency-governance.schema.json",
      ],
    ]) {
      const { document, errors } = validateAgainstSchema(
        documentPath,
        schemaPath,
      );
      expect({ documentPath, errors }).toEqual({ documentPath, errors: [] });
      expect(["PENDING_HUMAN_REVIEW", "REVIEWED"]).toContain(
        document.review.status,
      );
    }

    for (const [documentPath, schemaPath] of [
      [
        "./docs/provenance/npm-package-identity-history.json",
        "./docs/provenance/npm-package-identity-history.schema.json",
      ],
      [
        "./docs/provenance/package-name-review.json",
        "./docs/provenance/package-name-review.schema.json",
      ],
    ]) {
      const { document, errors } = validateAgainstSchema(
        documentPath,
        schemaPath,
      );
      expect({ documentPath, errors }).toEqual({ documentPath, errors: [] });
      expect(document.review.status).toBe("REVIEWED");
    }

    const rights = readJson("./docs/provenance/rights-inventory.json");
    expect(rights.review.factsSha256).toBe(
      sha256(
        stableJson({
          package: rights.package,
          contributors: rights.contributors,
          materialClasses: rights.materialClasses,
          externalDependencies: rights.externalDependencies,
          unresolvedExternalContributions:
            rights.unresolvedExternalContributions,
          conclusion: rights.conclusion,
        }),
      ),
    );
    expect(rights.unresolvedExternalContributions).toEqual([]);
    expect(rights.package).toMatchObject({
      name: packageJson.name,
      version: packageJson.version,
    });

    const inventory = readJson("./docs/provenance/third-party-material.json");
    expect(inventory.review.factsSha256).toBe(
      sha256(
        stableJson({
          package: inventory.package,
          summary: inventory.summary,
          components: inventory.components,
          materials: inventory.materials,
        }),
      ),
    );
    expect(inventory.package).toMatchObject({
      name: packageJson.name,
      version: packageJson.version,
    });

    const dependencyGovernance = readJson("./docs/dependency-governance.json");
    expect(dependencyGovernance.review.factsSha256).toBe(
      sha256(
        stableJson({
          package: dependencyGovernance.package,
          recordedOn: dependencyGovernance.recordedOn,
          productionAudit: dependencyGovernance.productionAudit,
          transitiveInventoryAuthority:
            dependencyGovernance.transitiveInventoryAuthority,
          upgradeGate: dependencyGovernance.upgradeGate,
          dependencies: dependencyGovernance.dependencies,
        }),
      ),
    );
    expect(dependencyGovernance.package).toEqual({
      name: packageJson.name,
      version: packageJson.version,
    });

    const identity = readJson(
      "./docs/provenance/npm-package-identity-history.json",
    );
    expect(identity.knownConsumedVersions).toEqual([
      "1.0.0",
      "1.1.0",
      "1.2.0",
      "1.2.1",
      "1.3.0",
      "2.0.0",
      "2.0.1",
    ]);
    expect(identity.intendedCoordinate).toBe("owlapi@0.1.0-alpha.0");

    const nameReview = readJson("./docs/provenance/package-name-review.json");
    expect(nameReview.decision.outcome).toBe("APPROVED_WITH_MITIGATIONS");
    expect(nameReview.externalLegalAdviceObtained).toBe(false);
  });

  const releaseReviewGate =
    process.env.OWLAPI_RELEASE_REVIEW_GATE === "1" ? it : it.skip;
  releaseReviewGate(
    "requires human attestation of every mutable release fact set",
    () => {
      const pendingDocuments = [
        "./docs/provenance/third-party-material.json",
        "./docs/provenance/rights-inventory.json",
        "./docs/dependency-governance.json",
      ]
        .map((documentPath) => ({
          documentPath,
          review: readJson(documentPath).review,
        }))
        .filter(({ review }) => review.status !== "REVIEWED");

      // Schema validation above proves that REVIEWED metadata is complete and
      // digest-bound. This release-only assertion reports every remaining human
      // action in one run instead of stopping at the first pending document.
      expect(pendingDocuments).toEqual([]);
    },
  );

  it("reconciles the generated third-party inventory with the installed lock graph", () => {
    execFileSync(process.execPath, ["util/generate-third-party-material.mjs"], {
      cwd: REPOSITORY_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const lockfile = readJson("./package-lock.json");
    const inventory = readJson("./docs/provenance/third-party-material.json");
    const lockPaths = Object.keys(lockfile.packages)
      .filter(Boolean)
      .sort(compareCodeUnits);
    const inventoryPaths = inventory.components
      .map(({ dependencyPath }) => dependencyPath)
      .sort(compareCodeUnits);

    expect(inventoryPaths).toEqual(lockPaths);
    expect(["PENDING_HUMAN_REVIEW", "REVIEWED"]).toContain(
      inventory.review.status,
    );
    expect(
      inventory.components.some(
        ({ declaredLicenseExpression }) =>
          declaredLicenseExpression === "NOASSERTION",
      ),
    ).toBe(false);
    expect(inventory.summary).toMatchObject({
      licenceDeclarationMismatchCount: 0,
      noAssertionCount: 0,
      productionComponentsWithoutLicenceEvidence: [],
    });

    const saxes = inventory.components.find(
      ({ dependencyPath }) =>
        dependencyPath === "node_modules/@rubensworks/saxes",
    );
    expect(saxes).toMatchObject({
      version: "6.0.1",
      declaredLicenseExpression: "ISC",
      inspectedFiles: [],
      externalLicenseEvidence: [
        {
          url: "https://raw.githubusercontent.com/rubensworks/saxes/0f36739ccb43a87c50408e1e713382cda09e0b05/LICENSE",
          sha256:
            "0fac2374380621b22e6b50451057721a9c52935b02d16d106a9f04897f061d0e",
        },
      ],
    });

    for (const component of inventory.components) {
      for (const evidence of component.inspectedFiles) {
        const actual = createHash("sha256")
          .update(readFileSync(new URL(`./${evidence.path}`, import.meta.url)))
          .digest("hex");
        expect({ path: evidence.path, sha256: actual }).toEqual({
          path: evidence.path,
          sha256: evidence.sha256,
        });
      }
    }
  });

  it("publishes separate contribution, security, conduct, and privacy policies", () => {
    const contributing = readFileSync(
      new URL("./CONTRIBUTING.md", import.meta.url),
      "utf8",
    );
    const security = readFileSync(
      new URL("./SECURITY.md", import.meta.url),
      "utf8",
    );
    const conduct = readFileSync(
      new URL("./CODE_OF_CONDUCT.md", import.meta.url),
      "utf8",
    );
    const privacy = readFileSync(
      new URL("./PRIVACY.md", import.meta.url),
      "utf8",
    );

    for (const requiredText of [
      "AGPL-3.0-only",
      "retain copyright",
      "authority to submit",
      "first external copyrightable contribution",
    ]) {
      expect(contributing).toContain(requiredText);
    }
    expect(contributing).toMatch(/must not be\s+merged/u);
    expect(security).toContain("security@haddenindustries.com");
    expect(security).toContain("five working days");
    expect(security).toContain("not an SLA");
    expect(conduct).toContain("conduct@haddenindustries.com");
    expect(conduct).toContain(
      "https://www.contributor-covenant.org/version/3/0/",
    );
    expect(conduct).toContain("must not adjudicate");
    expect(privacy).toContain("privacy@haddenindustries.com");
    expect(privacy).toContain("Google");
    expect(privacy).toContain("Article 6(1)(f)");
    expect(privacy).toContain("24 months");
    expect(privacy).toContain("Information Commissioner's Office");
  });

  it("keeps repository-governance and provenance records out of the package", () => {
    const npmCli = process.env.npm_execpath;
    expect(typeof npmCli).toBe("string");
    const output = execFileSync(
      process.execPath,
      [npmCli, "pack", "--dry-run", "--json"],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const result = JSON.parse(output);
    const pack = Array.isArray(result)
      ? result[0]
      : result[Object.keys(result)[0]];
    const packedPaths = pack.files.map(({ path }) => path);

    for (const forbiddenPath of [
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CODE_OF_CONDUCT.md",
      "PRIVACY.md",
      "package-lock.json",
      "docs/provenance/rights-inventory.json",
      "docs/provenance/third-party-material.json",
      "docs/provenance/npm-package-identity-history.json",
      "docs/provenance/package-name-review.json",
    ]) {
      expect(packedPaths).not.toContain(forbiddenPath);
    }
  });

  it("defines a zero-tolerance expected-difference gate", () => {
    const manifest = readJson("./docs/compatibility/expected-differences.json");

    expect(manifest.selectorLanguage).toBe("RFC 9535 JSONPath");
    expect(new Set(manifest.atomicDifferenceTypes)).toEqual(
      new Set(["EXTRA", "MISSING", "VALUE_CHANGED", "TYPE_CHANGED"]),
    );
    expect(Object.values(manifest.gate)).toEqual([0, 0, 0]);
    expect(new Set(manifest.rules.map(({ id }) => id)).size).toBe(
      manifest.rules.length,
    );
    for (const rule of manifest.rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.selector).toMatch(/^\$/);
      expect(rule.selector).not.toMatch(/\.\.|\[\*\]/u);
      expect(manifest.atomicDifferenceTypes).toContain(rule.differenceType);
      expect(manifest.sides).toContain(rule.side);
      expect(manifest.cardinalityForms).toContain(rule.cardinality.form);
      expect(rule.cardinality).toMatchObject({ form: "exact" });
      expect(Number.isSafeInteger(rule.cardinality.value)).toBe(true);
      expect(rule.cardinality.value).toBeGreaterThanOrEqual(0);
      expect(rule.artifactType).toBe("OWL structural snapshot");
      expect(rule.fixture).toMatch(/^util\/owlapi-reference\/fixtures\//u);
      expect(rule.parser).toBeTruthy();
      expect(rule.capability).toBeTruthy();
      expect(rule.differenceCategory).toBeTruthy();
      expect(rule).toHaveProperty("javaValue");
      expect(rule).toHaveProperty("jsValue");
      expect(rule.rationale).toBeTruthy();
      expect(rule.authority).toMatch(/^https:\/\//u);
    }
  });

  it("pins upstream conformance manifest paths before adapter phases", () => {
    const suites = readJson("./docs/conformance/suites.json");
    const classifications = readJson(
      "./docs/conformance/classification-manifests.json",
    );
    const revisions = new Map(
      suites.suites.map(({ id, revision, revisionScopes }) => [
        id,
        new Set(revisionScopes?.map((scope) => scope.revision) ?? [revision]),
      ]),
    );
    const manifestIds = classifications.manifests.map(({ id }) => id);

    expect(manifestIds.every(Boolean)).toBe(true);
    expect(new Set(manifestIds).size).toBe(manifestIds.length);

    for (const manifest of classifications.manifests) {
      expect(revisions.get(manifest.suite)).toContain(manifest.revision);
      expect(manifest.paths.length).toBeGreaterThan(0);
      expect(manifest.classificationOwnerPhases.length).toBeGreaterThan(0);
      const ids = manifest.entries.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const entry of manifest.entries) {
        expect(classifications.classifications).toContain(entry.classification);
      }
    }

    const byId = new Map(
      classifications.manifests.map((manifest) => [manifest.id, manifest]),
    );
    const expectedOwnerPhases = new Map([
      ["w3c-owl2.rdf-to-owl", [5]],
      ["w3c-rdf-tests.rdfxml", [6]],
      ["w3c-rdf-tests.turtle", [9]],
      ["w3c-rdf-tests.ntriples", [12]],
      ["w3c-rdf-tests.nquads", [13]],
      ["w3c-rdf-tests.trig", [14]],
      ["w3c-json-ld-api.to-from-rdf", [15]],
      ["w3c-json-ld-api.to-rdf", [15]],
      ["w3c-json-ld-api.from-rdf", [15]],
    ]);
    for (const [id, phases] of expectedOwnerPhases) {
      expect(byId.get(id)?.classificationOwnerPhases).toEqual(phases);
    }

    const rdfToOwlManifest = byId.get("w3c-owl2.rdf-to-owl");
    const rdfToOwlRequired = rdfToOwlManifest.entries.filter(
      ({ classification }) => classification === "REQUIRED",
    );
    const rdfToOwlNotApplicable = rdfToOwlManifest.entries.filter(
      ({ classification }) => classification === "NOT_APPLICABLE",
    );
    expect(rdfToOwlManifest).toMatchObject({
      requiredDocumentCount: 312,
      requiredTestCount: 233,
      runner: "internal/mapping/rdfToOwlTranslator.conformance.test.js",
      sourceTestCount: 338,
    });
    expect(rdfToOwlManifest.entries).toHaveLength(338);
    expect(rdfToOwlRequired).toHaveLength(233);
    expect(
      rdfToOwlRequired.reduce(
        (count, entry) => count + entry.rdfDocuments.length,
        0,
      ),
    ).toBe(312);
    expect(rdfToOwlNotApplicable).toHaveLength(105);
    expect(
      rdfToOwlNotApplicable.filter(
        ({ reasonCategory }) =>
          reasonCategory === "OUTSIDE_OWL2_DL_REVERSE_MAPPING",
      ),
    ).toHaveLength(89);
    expect(
      rdfToOwlNotApplicable.filter(
        ({ reasonCategory }) => reasonCategory === "DIFFERENT_SYNTAX",
      ),
    ).toHaveLength(16);

    const rdfXmlManifest = byId.get("w3c-rdf-tests.rdfxml");
    const rdfXmlRequired = rdfXmlManifest.entries.filter(
      ({ classification }) => classification === "REQUIRED",
    );
    const rdfXmlExcluded = rdfXmlManifest.excludedSourceDefinitions;
    expect(rdfXmlManifest).toMatchObject({
      evaluationTestCount: 126,
      excludedDefinitionCount: 7,
      manifestEntryCount: 166,
      negativeSyntaxTestCount: 40,
      requiredTestCount: 166,
      runner: "internal/parsing/rdfxml/rdfXml.conformance.test.js",
      sourceDefinitionCount: 173,
      sourceTestCount: 166,
    });
    expect(rdfXmlManifest.entries).toHaveLength(166);
    expect(rdfXmlRequired).toHaveLength(166);
    expect(rdfXmlExcluded).toHaveLength(7);
    expect(
      rdfXmlExcluded.every(
        ({ reasonCategory }) => reasonCategory === "COMMENTED_OUT_UPSTREAM",
      ),
    ).toBe(true);

    const turtleManifest = byId.get("w3c-rdf-tests.turtle");
    const turtleRequired = turtleManifest.entries.filter(
      ({ classification }) => classification === "REQUIRED",
    );
    expect(turtleManifest).toMatchObject({
      evaluationTestCount: 145,
      manifestEntryCount: 387,
      manifestEntryCounts: { rdf11: 313, rdf12Syntax: 74 },
      manifestSha256: {
        rdf11:
          "b90a85ee867279b7688033dc18088789580f0bcc2c59600b8c5796889414cf36",
        rdf12Syntax:
          "cd097ec4c5b312b04897eb9fcf0e7429381967936dfe14194fff9c7027a7203b",
      },
      negativeSyntaxTestCount: 127,
      positiveSyntaxTestCount: 115,
      requiredTestCount: 387,
      runner: "internal/parsing/turtle/turtle.conformance.test.js",
      sourceTestCount: 387,
    });
    expect(turtleManifest.entries).toHaveLength(387);
    expect(turtleRequired).toHaveLength(387);
    for (const artifact of turtleManifest.localManifestArtifacts) {
      expect(existsSync(new URL(`./${artifact}`, import.meta.url))).toBe(true);
    }

    const nQuadsManifest = byId.get("w3c-rdf-tests.nquads");
    const nQuadsRequired = nQuadsManifest.entries.filter(
      ({ classification }) => classification === "REQUIRED",
    );
    expect(nQuadsManifest).toMatchObject({
      manifestEntryCount: 114,
      manifestEntryCounts: { rdf11: 87, rdf12Syntax: 27 },
      manifestSha256: {
        rdf11:
          "aacaf7a803763a09ae68bba75575346847cb62405c7e4f33c8a0a244ffc11847",
        rdf12Syntax:
          "53eca8aa5ec0c0662e5b56b90603363e72093425fa9f71fff85e7f3c654b5af3",
      },
      negativeSyntaxTestCount: 54,
      positiveSyntaxTestCount: 60,
      requiredTestCount: 114,
      runner: "internal/parsing/nquads/nQuads.conformance.test.js",
      sourceTestCount: 114,
    });
    expect(nQuadsManifest.entries).toHaveLength(114);
    expect(nQuadsRequired).toHaveLength(114);
    for (const artifact of nQuadsManifest.localManifestArtifacts) {
      expect(existsSync(new URL(`./${artifact}`, import.meta.url))).toBe(true);
    }

    const triGManifest = byId.get("w3c-rdf-tests.trig");
    const triGRequired = triGManifest.entries.filter(
      ({ classification }) => classification === "REQUIRED",
    );
    const triGExcluded = triGManifest.entries.filter(
      ({ classification }) => classification === "EXCLUDED_WITH_REASON",
    );
    expect(triGManifest).toMatchObject({
      evaluationTestCount: 169,
      excludedTestCount: 5,
      manifestEntryCount: 418,
      manifestEntryCounts: { rdf11: 357, rdf12Eval: 26, rdf12Syntax: 35 },
      manifestSha256: {
        rdf11:
          "151cee87899fe6efc049c4ea606c5ea44a7074469e147df8e56df67b69e87ae2",
        rdf12Eval:
          "e341c4f3a810602ca7c26a677735740d5409298d7dba22782b03e878ff41a9d5",
        rdf12Syntax:
          "dd7edf4f760dc6c30fff3ed874ac1796130a253ebe4abaf37f8ac6b3721f0086",
      },
      negativeSyntaxTestCount: 126,
      positiveSyntaxTestCount: 123,
      requiredTestCount: 413,
      runner: "internal/parsing/trig/trig.conformance.test.js",
      sourceTestCount: 418,
    });
    expect(triGManifest.entries).toHaveLength(418);
    expect(triGRequired).toHaveLength(413);
    expect(triGExcluded).toHaveLength(5);
    expect(
      triGExcluded.map(({ id, sourceManifest }) => `${sourceManifest}:${id}`),
    ).toEqual([
      "rdf12Eval:trig12-rt-07",
      "rdf12Eval:trig12-rt-08",
      "rdf12Eval:trig12-annotation-03",
      "rdf12Eval:trig12-annotation-04",
      "rdf12Eval:trig12-annotation-09",
    ]);
    expect(
      triGExcluded.every(
        ({ reasonCategory, sourceManifest, testType }) =>
          reasonCategory === "N3JS_RDF12_TRIG_EVALUATION_GAP" &&
          sourceManifest === "rdf12Eval" &&
          testType === "EVALUATION",
      ),
    ).toBe(true);
    for (const artifact of triGManifest.localManifestArtifacts) {
      expect(existsSync(new URL(`./${artifact}`, import.meta.url))).toBe(true);
    }

    const jsonLdToRdfManifest = byId.get("w3c-json-ld-api.to-rdf");
    const jsonLdRequired = jsonLdToRdfManifest.entries.filter(
      ({ classification }) => classification === "REQUIRED",
    );
    const jsonLdExcluded = jsonLdToRdfManifest.entries.filter(
      ({ classification }) => classification === "EXCLUDED_WITH_REASON",
    );
    expect(jsonLdToRdfManifest.entries).toHaveLength(467);
    expect(jsonLdRequired).toHaveLength(462);
    expect(jsonLdExcluded).toHaveLength(5);
    expect(
      jsonLdExcluded.reduce((counts, { reasonCategory }) => {
        counts[reasonCategory] = (counts[reasonCategory] || 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      JSONLD_GENERALIZED_RDF_OUTSIDE_OWL_INGESTION: 2,
      JSONLDJS_9_CONFORMANCE_GAP: 3,
    });

    const jsonLdFromRdfManifest = byId.get("w3c-json-ld-api.from-rdf");
    expect(jsonLdFromRdfManifest.entries).toHaveLength(54);
    expect(
      jsonLdFromRdfManifest.entries.every(
        ({ classification, reasonCategory }) =>
          classification === "NOT_APPLICABLE" &&
          reasonCategory === "JSONLD_FROM_RDF_OUT_OF_SCOPE",
      ),
    ).toBe(true);

    const w3cSuite = suites.suites.find(({ id }) => id === "w3c-owl2");
    const w3cManifest = classifications.manifests.find(
      ({ id }) => id === "w3c-owl2.functional",
    );
    const required = w3cManifest.entries.filter(
      ({ classification }) => classification === "REQUIRED",
    );
    const notApplicable = w3cManifest.entries.filter(
      ({ classification }) => classification === "NOT_APPLICABLE",
    );
    expect(w3cManifest.entries).toHaveLength(w3cManifest.sourceTestCount);
    expect(required).toHaveLength(w3cManifest.requiredTestCount);
    expect(
      required.reduce(
        (count, entry) => count + entry.functionalDocuments.length,
        0,
      ),
    ).toBe(w3cManifest.requiredDocumentCount);
    expect(notApplicable).toHaveLength(
      w3cManifest.sourceTestCount - w3cManifest.requiredTestCount,
    );
    expect(
      notApplicable.every(
        ({ reasonCategory }) => reasonCategory === "DIFFERENT_SYNTAX",
      ),
    ).toBe(true);
    expect(w3cSuite.manifestArtifact).toBe(w3cManifest.paths[0]);
    expect(w3cSuite.runner).toBe(w3cManifest.runner);
  });

  it("keeps a finite, evidenced Phase 5 inventory for W3C mapping Tables 4 through 18", () => {
    const inventory = readJson("./docs/conformance/rdf-to-owl-mapping.json");
    const expectedTables = Array.from({ length: 15 }, (_, index) => index + 4);
    const ruleIds = inventory.tables.flatMap(({ rules }) =>
      rules.map(({ id }) => id),
    );
    const evidencePaths = new Set([
      inventory.implementation,
      ...inventory.sharedEvidence,
      ...inventory.tables.flatMap(({ rules }) =>
        rules.flatMap(({ evidence }) => evidence),
      ),
    ]);

    expect(inventory).toMatchObject({
      schemaVersion: 1,
      phase: 5,
      status: "COMPLETE",
    });
    expect(inventory.tables.map(({ table }) => table)).toEqual(expectedTables);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    for (const table of inventory.tables) {
      expect(table.status).toBe("COMPLETE");
      expect(table.handlers.length).toBeGreaterThan(0);
      expect(table.rules.length).toBeGreaterThan(0);
      for (const rule of table.rules) {
        expect(rule.status).toBe("COMPLETE");
        expect(rule.constructs.length).toBeGreaterThan(0);
        expect(rule.evidence.length).toBeGreaterThan(0);
      }
    }
    for (const evidencePath of evidencePaths) {
      expect(existsSync(new URL(`./${evidencePath}`, import.meta.url))).toBe(
        true,
      );
    }
  });

  it("keeps a finite, exhaustive Phase 16 inventory for W3C structural-to-RDF mapping", () => {
    const inventory = readJson("./docs/conformance/owl-to-rdf-mapping.json");
    const expectedSections = [
      "TABLE-1",
      "TABLE-2",
      "SECTION-2.3.1",
      "SECTION-2.3.2",
      "SECTION-2.3.3",
    ];
    const ruleIds = inventory.sections.flatMap(({ rules }) =>
      rules.map(({ id }) => id),
    );
    const evidencePaths = new Set([
      inventory.implementation,
      ...inventory.sharedEvidence,
      ...inventory.sections.flatMap(({ rules }) =>
        rules.flatMap(({ evidence }) => evidence),
      ),
      ...inventory.javaDifferentials.flatMap(({ evidence }) => evidence),
    ]);

    expect(inventory).toMatchObject({
      schemaVersion: 1,
      phase: 16,
      status: "COMPLETE",
    });
    expect(inventory.sections.map(({ id }) => id)).toEqual(expectedSections);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    expect([...inventory.coverage.entityKinds].sort()).toEqual(
      [...ENTITY_KINDS].sort(),
    );
    expect([...inventory.coverage.axiomKinds].sort()).toEqual(
      [...AXIOM_KINDS].sort(),
    );
    expect([...inventory.coverage.classExpressionKinds].sort()).toEqual(
      [...CLASS_EXPRESSION_KINDS].sort(),
    );
    expect([...inventory.coverage.dataRangeKinds].sort()).toEqual(
      [...DATA_RANGE_KINDS].sort(),
    );
    expect(
      [...inventory.coverage.objectPropertyExpressionKinds].sort(),
    ).toEqual([...OBJECT_PROPERTY_EXPRESSION_KINDS].sort());
    expect([...inventory.coverage.dataPropertyExpressionKinds].sort()).toEqual(
      [...DATA_PROPERTY_EXPRESSION_KINDS].sort(),
    );
    expect([...inventory.coverage.individualKinds].sort()).toEqual(
      [...INDIVIDUAL_KINDS].sort(),
    );
    expect([...inventory.coverage.annotationValueKinds].sort()).toEqual(
      [...ANNOTATION_VALUE_KINDS].sort(),
    );
    for (const section of inventory.sections) {
      expect(section.status).toBe("COMPLETE");
      expect(section.rules.length).toBeGreaterThan(0);
      for (const rule of section.rules) {
        expect(rule.status).toBe("COMPLETE");
        expect(rule.constructs.length).toBeGreaterThan(0);
        expect(rule.evidence.length).toBeGreaterThan(0);
      }
    }
    expect(inventory.javaDifferentials).toHaveLength(1);
    expect(inventory.javaDifferentials[0]).toMatchObject({
      exactOccurrences: 3,
      status: "CONTROLLED_NORMATIVE_DEVIATION",
    });
    for (const evidencePath of evidencePaths) {
      expect(existsSync(new URL(`./${evidencePath}`, import.meta.url))).toBe(
        true,
      );
    }
  });

  it("pins real and generated benchmark corpus identities", () => {
    const corpus = readJson("./docs/performance/benchmark-corpus.json");
    const ids = [...corpus.realWorldFixtures, ...corpus.generatedFixtures].map(
      ({ id }) => id,
    );

    expect(new Set(ids).size).toBe(ids.length);
    for (const fixture of corpus.realWorldFixtures) {
      expect(fixture.bytes).toBeGreaterThan(0);
      expect(fixture.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(fixture.roles.length).toBeGreaterThan(0);
    }
    for (const fixture of corpus.generatedFixtures) {
      expect(fixture.generator).toBe(GENERATOR_VERSION);
    }

    expect(generateBenchmarkFixture("functional", { count: 2 })).toContain(
      "Declaration(Class(:C1))",
    );
    expect(generateBenchmarkFixture("manchester", { count: 2 })).toContain(
      "Class: :C1",
    );
    expect(generateBenchmarkFixture("owlxml", { count: 2 })).toContain(
      "urn:owlapi-js:benchmark:C1",
    );
    expect(generateBenchmarkFixture("rdfxml", { count: 2 })).toContain(
      "<owl:Class",
    );
    expect(generateBenchmarkFixture("turtle", { count: 2 })).toContain(
      ":C1 a owl:Class",
    );
    expect(generateBenchmarkFixture("dl", { count: 2 })).toContain(
      "C1 ⊑ Parent1",
    );
    expect(generateBenchmarkFixture("dl-depth", { depth: 2 })).toBe(
      "Root ⊑ ∃ p.(∃ p.(Leaf))",
    );
    expect(generateBenchmarkFixture("krss2", { count: 2 })).toContain(
      "(implies C1 Parent1)",
    );
    expect(generateBenchmarkFixture("krss2-depth", { depth: 2 })).toBe(
      "(implies Root (some p (some p Leaf)))",
    );
    expect(generateBenchmarkFixture("krss1", { count: 2 })).toContain(
      "(define-primitive-concept C1 Parent1)",
    );
    expect(generateBenchmarkFixture("krss1-depth", { depth: 2 })).toBe(
      "(define-concept Root (some p (some p Leaf)))",
    );
    expect(generateBenchmarkFixture("ntriples", { count: 2 })).toContain(
      "<urn:owlapi-js:benchmark:ntriples#C1>",
    );
    expect(generateBenchmarkFixture("nquads", { count: 2 })).toContain(
      "<urn:owlapi-js:benchmark:nquads:graph>",
    );
    expect(generateBenchmarkFixture("trig", { count: 2 })).toContain(
      "<urn:owlapi-js:benchmark:trig:graph> {",
    );
    expect(
      generateBenchmarkFixture("functional-depth", { depth: 2 }),
    ).toContain("ObjectSomeValuesFrom(:p ObjectSomeValuesFrom(:p :Leaf))");
    expect(generateBenchmarkFixture("turtle-list", { count: 2 })).toContain(
      "(:C0 :C1)",
    );
    expect(
      Object.keys(
        JSON.parse(generateBenchmarkFixture("import-closure", { count: 2 }))
          .documents,
      ),
    ).toHaveLength(2);
    expect(generateBenchmarkFixture("mismatch", { bytes: 32 })).toHaveLength(
      32,
    );
  });

  it("separates and pins the Java structural and VOWL reference oracles", () => {
    const pinned = readJson("./util/owlapi-reference/pinned-version.json");
    const suites = readJson("./docs/conformance/suites.json");
    const owlapi = suites.suites.find(({ id }) => id === "owlapi-reference");
    const owl2vowl = suites.suites.find(
      ({ id }) => id === "owl2vowl-reference",
    );

    expect(pinned.sourceRevision).toBe(owlapi.revision);
    expect(pinned.productionRuntimeDependency).toBe(false);
    expect(pinned.owl2vowlOracle.structuralOracle).toBe(false);
    expect(owl2vowl.revision).toBe(`sha256:${pinned.owl2vowlOracle.sha256}`);
  });
});
