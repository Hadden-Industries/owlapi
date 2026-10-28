import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BEHAVIOR_PROFILES,
  BENCHMARK_DEFINITIONS,
  DEFAULT_JAVA_BASELINE_PATH,
  compareBenchmarkSuites,
  findMissingJavaBaselineIds,
  formatComparisonMarkdown,
  loadJavaBaseline,
  prepareSharedFixtureDirectory,
  resolveJavaBaselineSuite,
  runJsProfileBenchmarks,
  runPublicApiParityBenchmarkSuite,
  writeJavaBaseline,
} from "./benchmark-owlapi-java-parity.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");

describe("Public API performance parity harness (JS vs Java OWLAPI 5.5.1)", () => {
  test("defines 70 unique public API benchmarks across all 12 API categories and both behavior profiles", () => {
    expect(BEHAVIOR_PROFILES).toEqual(["java-owlapi-5.5.1", "normative-v1"]);
    expect(BENCHMARK_DEFINITIONS).toHaveLength(70);

    const ids = new Set(BENCHMARK_DEFINITIONS.map((def) => def.id));
    expect(ids.size).toBe(BENCHMARK_DEFINITIONS.length);

    const categories = new Set(
      BENCHMARK_DEFINITIONS.map((def) => def.category),
    );
    expect([...categories]).toEqual([
      "Manager & Configuration",
      "DataFactory & Structural Model",
      "Parsing & Loading",
      "Ontology Lifecycle & Mutations",
      "Ontology Queries - General & Signature",
      "Ontology Queries - Specific Axiom Indexes",
      "Storage / Serialization",
      "EntitySearcher",
      "Utilities",
      "Manchester Object Renderer",
      "Modularity / Locality",
      "OWL 2 Language Profiles",
    ]);
  });

  test("executes JS benchmarks across both java-owlapi-5.5.1 and normative-v1 profiles and compares with Java baseline", async () => {
    const sampleIds = [
      "manager.createOWLOntologyManager",
      "formats.RDFXMLDocumentFormat.prefixes",
      "model.dispatch",
      "load.functional",
      "manager.addAxioms.bulk",
      "ontology.getReferencingAxioms",
      "save.functional",
      "search.propertyHierarchyAndDomainsRanges",
      "util.OWLOntologyMerger",
      "renderer.ManchesterOWLSyntaxOWLObjectRendererImpl",
      "locality.extract.BOTTOM",
      "profiles.OWL2DLProfile.checkOntology",
    ];

    const sharedFixtures = prepareSharedFixtureDirectory({
      syntaxCount: 20,
      importClosureCount: 4,
    });

    try {
      const jsSuites = {};
      for (const profileId of BEHAVIOR_PROFILES) {
        jsSuites[profileId] = await runJsProfileBenchmarks(profileId, {
          warmupCount: 0,
          runCount: 1,
          filterIds: sampleIds,
          sharedFixtures,
        });
        expect(jsSuites[profileId].results).toHaveLength(sampleIds.length);
        for (const row of jsSuites[profileId].results) {
          expect(row.verificationCount).toBeGreaterThan(0);
          expect(row.median.wallMs).toBeGreaterThanOrEqual(0);
        }
      }

      const syntheticJavaSuite = {
        javaVersion: "21.0.10",
        javaVmName: "OpenJDK 64-Bit Server VM",
        owlapiVersion: "5.5.1",
        results: jsSuites["java-owlapi-5.5.1"].results.map((row) => ({
          id: row.id,
          verificationCount: row.verificationCount,
          firstUseWallMs: 1,
          measurements: [{ wallMs: 1, retainedHeapDeltaBytes: 1024 }],
          median: { wallMs: 1, retainedHeapDeltaBytes: 1024 },
        })),
      };

      const comparison = compareBenchmarkSuites({
        javaSuite: syntheticJavaSuite,
        jsSuites,
        warmupCount: 0,
        runCount: 1,
      });

      expect(comparison.summary.totalBenchmarks).toBe(sampleIds.length);
      expect(comparison.comparisons).toHaveLength(sampleIds.length);

      const markdown = formatComparisonMarkdown(comparison);
      expect(markdown).toContain(
        "# Public API Performance Comparison: JS OWLAPI vs. Java OWLAPI 5.5.1",
      );
      expect(markdown).toContain("`manager.addAxioms.bulk`");
      expect(markdown).toContain("`ontology.getReferencingAxioms`");
    } finally {
      sharedFixtures.cleanup();
    }
  }, 30000);

  test("maintains a pinned Java OWLAPI 5.5.1 per-API baseline file covering all 70 benchmarks", () => {
    expect(fs.existsSync(DEFAULT_JAVA_BASELINE_PATH)).toBe(true);
    const baseline = loadJavaBaseline(DEFAULT_JAVA_BASELINE_PATH);
    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.owlapiRelease).toBe("5.5.1");
    expect(baseline.results).toHaveLength(BENCHMARK_DEFINITIONS.length);
    expect(findMissingJavaBaselineIds(baseline)).toEqual([]);

    for (const row of baseline.results) {
      expect(typeof row.id).toBe("string");
      expect(row.verificationCount).toBeGreaterThanOrEqual(0);
      expect(typeof row.firstUseWallMs).toBe("number");
      expect(typeof row.median.wallMs).toBe("number");
      expect(typeof row.median.retainedHeapDeltaBytes).toBe("number");
    }
  });

  test("reuses pinned Java baseline on comparison runs without invoking Java and incrementally profiles only missing APIs when requested", async () => {
    const sampleIds = [
      "manager.createOWLOntologyManager",
      "formats.RDFXMLDocumentFormat.prefixes",
    ];
    let javaCallCount = 0;
    const neverCallJava = () => {
      javaCallCount += 1;
      throw new Error("Java should not be executed when baseline is complete");
    };

    const report = await runPublicApiParityBenchmarkSuite({
      warmupCount: 0,
      runCount: 1,
      filterIds: sampleIds,
      syntaxCount: 15,
      importClosureCount: 3,
      javaBaselinePath: DEFAULT_JAVA_BASELINE_PATH,
      runJava: neverCallJava,
    });
    expect(javaCallCount).toBe(0);
    expect(report.javaBaselinePath).toBe(
      "docs/performance/java-owlapi-5.5.1-baseline.json",
    );
    expect(report.summary.totalBenchmarks).toBe(sampleIds.length);

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "owlapi-java-baseline-test-"),
    );
    try {
      const partialBaselinePath = path.join(tempDir, "partial-baseline.json");
      const fullBaseline = loadJavaBaseline(DEFAULT_JAVA_BASELINE_PATH);
      const partialData = {
        schemaVersion: 1,
        owlapiRelease: "5.5.1",
        fixtureGeneratorVersion: fullBaseline.fixtureGeneratorVersion,
        parameters: fullBaseline.parameters,
        environment: {
          platform: fullBaseline.platform,
          javaVersion: fullBaseline.javaVersion,
          javaVmName: fullBaseline.javaVmName,
          owlapiVersion: fullBaseline.owlapiVersion,
        },
        results: fullBaseline.results.filter(
          (row) => row.id !== "formats.RDFXMLDocumentFormat.prefixes",
        ),
      };
      await writeJavaBaseline(partialData, partialBaselinePath);

      await expect(
        resolveJavaBaselineSuite({
          javaBaselinePath: partialBaselinePath,
          filterIds: sampleIds,
          updateMissingJavaBaseline: false,
          runJava: neverCallJava,
        }),
      ).rejects.toThrow(
        /missing 1 benchmark ID\(s\): formats\.RDFXMLDocumentFormat\.prefixes/,
      );
      expect(javaCallCount).toBe(0);

      const incrementalCalls = [];
      const incrementalJavaStub = ({ filterIds }) => {
        incrementalCalls.push(filterIds);
        return {
          javaVersion: fullBaseline.javaVersion,
          javaVmName: fullBaseline.javaVmName,
          owlapiVersion: fullBaseline.owlapiVersion,
          results: [
            {
              id: "formats.RDFXMLDocumentFormat.prefixes",
              verificationCount: 3200,
              firstUseWallMs: 4.5,
              median: {
                wallMs: 0.75,
                retainedHeapDeltaBytes: 512000,
              },
            },
          ],
        };
      };

      const updatedBaseline = await resolveJavaBaselineSuite({
        javaBaselinePath: partialBaselinePath,
        filterIds: sampleIds,
        updateMissingJavaBaseline: true,
        runJava: incrementalJavaStub,
      });

      expect(incrementalCalls).toEqual([
        ["formats.RDFXMLDocumentFormat.prefixes"],
      ]);
      expect(updatedBaseline.results).toHaveLength(
        BENCHMARK_DEFINITIONS.length,
      );
      expect(findMissingJavaBaselineIds(updatedBaseline)).toEqual([]);
      const preservedRow = updatedBaseline.results.find(
        (r) => r.id === "manager.createOWLOntologyManager",
      );
      const originalRow = fullBaseline.results.find(
        (r) => r.id === "manager.createOWLOntologyManager",
      );
      expect(preservedRow.median.wallMs).toBe(originalRow.median.wallMs);
      const appendedRow = updatedBaseline.results.find(
        (r) => r.id === "formats.RDFXMLDocumentFormat.prefixes",
      );
      expect(appendedRow.median.wallMs).toBe(0.75);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("records durable Java 5.5.1 vs JS comparison artifacts covering all 70 benchmarks", () => {
    const jsonPath = path.join(
      REPO_ROOT,
      "docs/performance/java-api-performance-comparison.json",
    );
    const mdPath = path.join(
      REPO_ROOT,
      "docs/performance/java-api-performance-comparison.md",
    );

    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);

    const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(report.schemaVersion).toBe(1);
    expect(report.javaBaselinePath).toBe(
      "docs/performance/java-owlapi-5.5.1-baseline.json",
    );
    expect(report.parameters.profiles).toEqual([
      "java-owlapi-5.5.1",
      "normative-v1",
    ]);
    expect(report.summary.totalBenchmarks).toBe(70);
    expect(report.comparisons).toHaveLength(70);
    expect(report.slowerApisRanked.length).toBe(report.summary.slowerInJsCount);

    for (const entry of report.comparisons) {
      expect(entry.java551.verificationCount).toBeGreaterThanOrEqual(0);
      expect(entry.jsJavaOwlapi551.verificationCount).toBeGreaterThanOrEqual(0);
      expect(entry.jsNormativeV1.verificationCount).toBeGreaterThanOrEqual(0);
      expect(typeof entry.java551.medianWallMs).toBe("number");
      expect(typeof entry.jsJavaOwlapi551.medianWallMs).toBe("number");
      expect(typeof entry.jsNormativeV1.medianWallMs).toBe("number");
    }
  });
});
