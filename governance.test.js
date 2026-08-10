import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

import { OWLOntologyLoaderConfiguration } from "./io/index.js";

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("../../util/generate-owlapi-benchmark-fixtures.js");

const readJson = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

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
        .filter(({ phase }) => phase !== null && phase <= 2)
        .every(({ progress }) => progress === "COMPLETE"),
    ).toBe(true);
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

  it("gives every legacy migration artifact one definitive disposition", () => {
    const manifest = readJson(
      "../../docs/owlapi-js/provenance/provenance.json",
    );
    const ids = manifest.items.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const item of manifest.items) {
      expect(manifest.dispositions).toContain(item.disposition);
      expect(item.disposition).not.toBe("REVIEW_EXCEPTION");
      expect(manifest.provenanceCategories).toHaveProperty(
        item.provenanceCategory,
      );
      expect(item.licenseCopyright).toBeTruthy();
      expect(manifest.decisionReferences).toHaveProperty(item.decisionRef);
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
        (path) => path.startsWith("src/owl2vowl/js/") && !path.includes("*"),
      )
      .sort();
    expect(inventoriedModules).toEqual(productionModules);
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
      expect([1, 2]).toContain(record.phase);
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
    for (const research of manifest.compatibilityResearch) {
      expect(research.sourceRevision).toBe(manifest.referenceOwlapi.revision);
      expect(research.implementationSourcesInspected.length).toBeGreaterThan(0);
      expect(research.productionUse).toMatch(/No implementation text/);
      expect(research.evidence).toBeTruthy();
    }
  });

  it("pins immutable external and behavioral reference revisions", () => {
    const manifest = readJson("../../docs/owlapi-js/conformance/suites.json");

    for (const suite of manifest.suites) {
      expect(suite.revision).toBeTruthy();
      expect(suite.revision).not.toMatch(/^(main|master|latest)$/i);
    }
  });

  it("pins selected dependency versions and their replacement boundaries", () => {
    const governance = readJson(
      "../../docs/owlapi-js/dependency-governance.json",
    );
    const packageJson = readJson("../../package.json");
    const lock = readJson("../../package-lock.json");

    expect(governance.dependencies).toHaveLength(5);
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
    for (const rule of manifest.rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.selector).toMatch(/^\$/);
      expect(manifest.atomicDifferenceTypes).toContain(rule.differenceType);
      expect(manifest.sides).toContain(rule.side);
      expect(rule.rationale).toBeTruthy();
      expect(rule.authority).toBeTruthy();
    }
  });

  it("pins upstream conformance manifest paths before adapter phases", () => {
    const suites = readJson("../../docs/owlapi-js/conformance/suites.json");
    const classifications = readJson(
      "../../docs/owlapi-js/conformance/classification-manifests.json",
    );
    const revisions = new Map(
      suites.suites.map(({ id, revision }) => [id, revision]),
    );

    for (const manifest of classifications.manifests) {
      expect(manifest.revision).toBe(revisions.get(manifest.suite));
      expect(manifest.paths.length).toBeGreaterThan(0);
      expect(manifest.classificationOwnerPhases.length).toBeGreaterThan(0);
      const ids = manifest.entries.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const entry of manifest.entries) {
        expect(classifications.classifications).toContain(entry.classification);
      }
    }

    const w3cSuite = suites.suites.find(({ id }) => id === "w3c-owl2");
    const w3cManifest = classifications.manifests.find(
      ({ suite }) => suite === "w3c-owl2",
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
