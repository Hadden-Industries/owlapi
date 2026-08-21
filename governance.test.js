import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { OWLOntologyLoaderConfiguration } from "./io/index.js";

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("../../util/generate-owlapi-benchmark-fixtures.js");

const readJson = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

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

describe("owlapi-js governance artifacts", () => {
  it("classifies every capability exactly once with a normative status", () => {
    const matrix = readJson(
      "../../docs/owlapi-js/compatibility/capabilities.json",
    );
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
    const matrix = readJson(
      "../../docs/owlapi-js/compatibility/capabilities.json",
    );
    const byId = new Map(
      matrix.capabilities.map((capability) => [capability.id, capability]),
    );
    const expectedPhases = new Map([
      ["rdf.dataset-graph-policy", 5],
      ["mapping.rdf-to-owl", 5],
      ["parser.rdfxml", 6],
      ["webvowl.vowl-builder", 7],
      ["webvowl.legacy-output-parity", 7],
      ["webvowl.production-cutover", 8],
      ["parser.turtle", 9],
      ["parser.dl", 10],
      ["parser.krss2", 11],
      ["format.krss1.identity", 11],
      ["parser.ntriples", 12],
      ["parser.nquads", 13],
      ["parser.trig", 14],
      ["parser.jsonld", 15],
      ["mapping.owl-to-rdf", 16],
      ["packaging.native-esm", 18],
    ]);

    for (const [id, phase] of expectedPhases) {
      expect(byId.get(id)?.phase).toBe(phase);
    }
    expect(byId.get("webvowl.production-cutover")?.status).toBe("REQUIRED_V1");
    expect(byId.get("parser.turtle")).toMatchObject({
      delegate: "n3",
      progress: "COMPLETE",
      status: "DELEGATED",
    });
    expect(byId.get("parser.n3-language")).toMatchObject({
      status: "DEFERRED",
      phase: null,
    });
  });

  it("keeps KRSS1 and KRSS2 as distinct compatibility identities", () => {
    const matrix = readJson(
      "../../docs/owlapi-js/compatibility/capabilities.json",
    );
    const byId = new Map(
      matrix.capabilities.map((capability) => [capability.id, capability]),
    );

    expect(byId.get("parser.krss1").status).toBe("DEFERRED");
    expect(byId.get("format.krss1.identity").status).toBe("REQUIRED_V1");
    expect(byId.get("parser.krss2").status).toBe("REQUIRED_V1");
  });

  it("defines every mandatory finite resource limit", () => {
    const budget = readJson(
      "../../docs/owlapi-js/performance/resource-budgets.json",
    );
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
    const budget = readJson(
      "../../docs/owlapi-js/performance/resource-budgets.json",
    );
    const configuration = OWLOntologyLoaderConfiguration.defaults();

    for (const [name, { value }] of Object.entries(budget.limits)) {
      expect(configuration[name]).toBe(value);
    }
  });

  it("gives every legacy migration artifact a governed disposition", () => {
    const manifest = readJson(
      "../../docs/owlapi-js/provenance/provenance.json",
    );
    const ids = manifest.items.map(({ id }) => id);
    const paths = manifest.items.map(({ path }) => path);
    const revisionSelectors = manifest.revisionDispositionPolicy.selectors;

    expect(manifest.schemaVersion).toBe(3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(revisionSelectors).toEqual(["AT_REVISION", "AFTER_REVISION"]);
    for (const item of manifest.items) {
      expect(manifest.dispositions).toContain(item.disposition);
      expect(item.disposition).not.toBe("REVIEW_EXCEPTION");
      expect(manifest.provenanceCategories).toHaveProperty(
        item.provenanceCategory,
      );
      expect(item.licenseCopyright).toBeTruthy();
      expect(manifest.decisionReferences).toHaveProperty(item.decisionRef);
      for (const revisionDisposition of item.revisionDispositions || []) {
        expect(revisionSelectors).toContain(revisionDisposition.selector);
        expect(revisionDisposition.revision).toMatch(/^[0-9a-f]{40}$/);
        expect(manifest.dispositions).toContain(
          revisionDisposition.disposition,
        );
        expect(revisionDisposition.disposition).not.toBe("REVIEW_EXCEPTION");
      }
    }

    const productionModules = readdirSync(
      new URL("../owl2vowl/js/", import.meta.url),
    )
      .filter((fileName) => fileName.endsWith(".js"))
      .filter((fileName) => !fileName.endsWith(".test.js"))
      .map((fileName) => `src/owl2vowl/js/${fileName}`)
      .sort();
    const inventoriedModules = manifest.items
      .map(({ path }) => path)
      .filter(
        (path) =>
          path.startsWith("src/owl2vowl/js/") &&
          !path.includes("*") &&
          !path.endsWith(".test.js"),
      )
      .sort();
    expect(inventoriedModules).toEqual(productionModules);
  });

  it("pins the approved commit-bounded reuse dispositions", () => {
    const manifest = readJson(
      "../../docs/owlapi-js/provenance/provenance.json",
    );
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
    const manifest = readJson(
      "../../docs/owlapi-js/provenance/provenance.json",
    );
    const records = manifest.implementationRecords;
    const paths = records.map(({ path }) => path).sort();
    const productionModules = listProductionModules(
      new URL("./", import.meta.url),
      "src/owlapi-js",
    );

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(productionModules);
    for (const record of records) {
      expect([1, 2, 3, 4, 5, 6, 9, 10]).toContain(record.phase);
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
      "src/owlapi-js/parser/functional/descriptor.js",
      "src/owlapi-js/parser/functional/lexer.js",
      "src/owlapi-js/parser/functional/parser.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 3)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "src/owlapi-js/parser/manchester/descriptor.js",
      "src/owlapi-js/parser/manchester/lexer.js",
      "src/owlapi-js/parser/manchester/parser.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 4)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "src/owlapi-js/parser/owlxml/descriptor.js",
      "src/owlapi-js/parser/owlxml/grammar.js",
      "src/owlapi-js/parser/owlxml/parser.js",
      "src/owlapi-js/parser/xml/xmlEntityPolicy.js",
      "src/owlapi-js/parser/xml/xmlParserAdapter.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 5)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "src/owlapi-js/rdf/rdfToOwlTranslator.js",
      "src/owlapi-js/rdf/vocabulary.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 6)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "src/owlapi-js/parser/rdfxml/descriptor.js",
      "src/owlapi-js/parser/rdfxml/parser.js",
      "src/owlapi-js/parser/rdfxml/rdfXmlSyntaxAdapter.js",
    ]);
    expect(
      records
        .filter(({ phase }) => phase === 9)
        .map(({ path }) => path)
        .sort(),
    ).toEqual([
      "src/owlapi-js/parser/rdf/n3SyntaxAdapter.js",
      "src/owlapi-js/parser/turtle/descriptor.js",
      "src/owlapi-js/parser/turtle/parser.js",
    ]);
    expect(
      records
        .find(({ path }) => path === "src/owlapi-js/rdf/graphPolicy.js")
        ?.laterPhaseChanges?.map(({ phase }) => phase),
    ).toContain(5);
    expect(
      records
        .find(
          ({ path }) => path === "src/owlapi-js/manager/owlOntologyManager.js",
        )
        ?.laterPhaseChanges?.map(({ phase }) => phase),
    ).toContain(6);
    expect(
      records
        .find(({ path }) => path === "src/owlapi-js/rdf/rdfToOwlTranslator.js")
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
    const manifest = readJson("../../docs/owlapi-js/conformance/suites.json");

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

  it("keeps RDF/XML and Turtle pinned to the W3C revisions actually ingested", () => {
    const suites = readJson("../../docs/owlapi-js/conformance/suites.json");
    const classifications = readJson(
      "../../docs/owlapi-js/conformance/classification-manifests.json",
    );
    const suite = suites.suites.find(({ id }) => id === "w3c-rdf-tests");
    const manifests = new Map(
      classifications.manifests.map((manifest) => [manifest.id, manifest]),
    );

    expect(suite.revisionScopes).toEqual([
      {
        formats: ["RDF/XML", "N-Triples", "N-Quads", "TriG"],
        revision: "ad541a5f0479f0798608c4801369d97b8e08b36f",
      },
      {
        formats: ["Turtle"],
        revision: "12774b0ebb385d17651b396654b19254d0fefbfa",
      },
    ]);
    expect(manifests.get("w3c-rdf-tests.rdfxml")?.revision).toBe(
      "ad541a5f0479f0798608c4801369d97b8e08b36f",
    );
    expect(manifests.get("w3c-rdf-tests.turtle")?.revision).toBe(
      "12774b0ebb385d17651b396654b19254d0fefbfa",
    );
  });

  it("resolves every recorded reuse-boundary revision on the current branch", () => {
    const manifest = readJson(
      "../../docs/owlapi-js/provenance/provenance.json",
    );
    const revisions = [
      ...new Set(
        manifest.items.flatMap((item) =>
          (item.revisionDispositions || []).map(({ revision }) => revision),
        ),
      ),
    ];
    const unavailable = completeHistoryUnavailableReason();

    expect(revisions.length).toBeGreaterThan(0);
    if (unavailable) {
      expect(["shallow repository", "git metadata unavailable"]).toContain(
        unavailable,
      );
      return;
    }
    for (const revision of revisions) {
      expect({ onCurrentBranch: isAncestorOfHead(revision), revision }).toEqual(
        {
          onCurrentBranch: true,
          revision,
        },
      );
    }
  });

  it("resolves every declared conformance runner and harness on disk", () => {
    const manifest = readJson("../../docs/owlapi-js/conformance/suites.json");

    for (const suite of manifest.suites) {
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
          exists: existsSync(new URL(`../../${path}`, import.meta.url)),
          path,
        }).toEqual({ exists: true, path });
      }
    }
  });

  it("pins the recovered VOWL 2 specification and verifies its hashes", () => {
    const manifest = readJson("../../docs/owlapi-js/conformance/suites.json");
    const suite = manifest.suites.find(({ id }) => id === "vowl-2");
    const directory = new URL(
      `../../${suite.manifestArtifact}/`,
      import.meta.url,
    );
    const sums = readFileSync(new URL("SHA256SUMS", directory), "utf8");

    expect(suite.documentVersion).toBe("2.0");
    expect(suite.documentDate).toBe("2014-04-07");
    expect(suite.revision).toBe("61abca1ad6aeb5108be7f06e9590c702d4013e7a");

    const entries = sums
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(/ \*?\.\//u));
    expect(entries.length).toBeGreaterThan(0);
    for (const [expected, relativePath] of entries) {
      const actual = createHash("sha256")
        .update(readFileSync(new URL(relativePath, directory)))
        .digest("hex");
      expect({ path: relativePath, sha256: actual }).toEqual({
        path: relativePath,
        sha256: expected,
      });
    }
  });

  it("declares the Phase 7 VOWL semantic differential against the OWL2VOWL oracle", () => {
    const manifest = readJson("../../docs/owlapi-js/conformance/suites.json");
    const suite = manifest.suites.find(({ id }) => id === "owl2vowl-reference");

    expect(suite.applicable).toContain("VOWL semantic snapshot");
    expect(suite.runner).toBe(
      "src/owl2vowl/test/vowlBuilder.differential.test.js",
    );
  });

  it("pins selected dependency versions and their replacement boundaries", () => {
    const governance = readJson(
      "../../docs/owlapi-js/dependency-governance.json",
    );
    const packageJson = readJson("../../package.json");
    const lock = readJson("../../package-lock.json");

    expect(governance.dependencies).toHaveLength(6);
    for (const dependency of governance.dependencies) {
      expect(packageJson.dependencies[dependency.name]).toBe(
        dependency.version,
      );
      expect(lock.packages[`node_modules/${dependency.name}`].version).toBe(
        dependency.version,
      );
      expect(dependency.adapterBoundary).toMatch(/^src\/owlapi-js\//);
      expect(dependency.license).toBeTruthy();
      expect(dependency.networkBehavior).toBeTruthy();
      expect(dependency.runtimeDependencies).toBeInstanceOf(Array);
    }

    const rdfXml = governance.dependencies.find(
      ({ name }) => name === "rdfxml-streaming-parser",
    );
    expect(rdfXml.adapterBoundary).toBe(
      "src/owlapi-js/parser/rdfxml/rdfXmlSyntaxAdapter.js",
    );
    expect(rdfXml.conformanceEvidence).toEqual(
      expect.arrayContaining([
        "docs/owlapi-js/conformance/classification-manifests.json#w3c-rdf-tests.rdfxml",
        "src/owlapi-js/parser/rdfxml/rdfXml.conformance.test.js",
        "src/owlapi-js/parser/rdfxml/rdfXmlSyntaxAdapter.test.js",
        "src/owlapi-js/parser/rdfxml/rdfXmlSyntaxAdapter.resource.test.js",
      ]),
    );
    expect(rdfXml.browserCost).toMatch(/163,163-minified-byte/u);
    expect(rdfXml.securityReview).toMatchObject({
      advisoryDatabaseResult: "NO_EXACT_PACKAGE_MATCHES",
      reviewedOn: "2026-08-13",
    });
    expect(rdfXml.securityReview.packages).toEqual([
      "rdfxml-streaming-parser",
      "@rubensworks/saxes",
      "@types/readable-stream",
      "buffer",
      "rdf-data-factory",
      "readable-stream",
      "relative-to-absolute-iri",
      "validate-iri",
    ]);
  });

  it("defines a zero-tolerance expected-difference gate", () => {
    const manifest = readJson(
      "../../docs/owlapi-js/compatibility/expected-differences.json",
    );

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
    const suites = readJson("../../docs/owlapi-js/conformance/suites.json");
    const classifications = readJson(
      "../../docs/owlapi-js/conformance/classification-manifests.json",
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
      runner: "src/owlapi-js/rdf/rdfToOwlTranslator.conformance.test.js",
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
      runner: "src/owlapi-js/parser/rdfxml/rdfXml.conformance.test.js",
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
      runner: "src/owlapi-js/parser/turtle/turtle.conformance.test.js",
      sourceTestCount: 387,
    });
    expect(turtleManifest.entries).toHaveLength(387);
    expect(turtleRequired).toHaveLength(387);
    for (const artifact of turtleManifest.localManifestArtifacts) {
      expect(existsSync(new URL(`../../${artifact}`, import.meta.url))).toBe(
        true,
      );
    }

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
    const inventory = readJson(
      "../../docs/owlapi-js/conformance/rdf-to-owl-mapping.json",
    );
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
      expect(
        existsSync(new URL(`../../${evidencePath}`, import.meta.url)),
      ).toBe(true);
    }
  });

  it("pins real and generated benchmark corpus identities", () => {
    const corpus = readJson(
      "../../docs/owlapi-js/performance/benchmark-corpus.json",
    );
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
    const pinned = readJson("../../util/owlapi-reference/pinned-version.json");
    const suites = readJson("../../docs/owlapi-js/conformance/suites.json");
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
