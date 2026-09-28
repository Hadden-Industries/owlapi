import { jest } from "@jest/globals";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileOntologyReferenceOracles,
  parseOasisXmlCatalog,
  resolvePinnedReferenceEnvironment,
} from "./run-import-closure-contract.mjs";
import { executeOntologyParsingOracle } from "./run-ontology-parsing-contract.mjs";

jest.setTimeout(120_000);
const fixtureDirectory = fileURLToPath(
  new URL("./fixtures/import-closure/", import.meta.url),
);
const fixturePath = (name) => join(fixtureDirectory, name);
const reference = process.env.OWLAPI_REFERENCE_CHECKOUT
  ? await resolvePinnedReferenceEnvironment()
  : null;
const describePinnedOracle = reference ? describe : describe.skip;

describePinnedOracle(
  "pinned Java direct-ontology parsing reconciliation",
  () => {
    let directory;
    let compiledOracleDirectory;
    let catalogMappings;
    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), "owlapi-parsing-oracle-"));
      compiledOracleDirectory = join(directory, "java");
      catalogMappings = await parseOasisXmlCatalog(fixturePath("catalog.xml"));
      await compileOntologyReferenceOracles(reference, compiledOracleDirectory);
    });
    afterAll(async () => {
      if (directory) await rm(directory, { recursive: true, force: true });
    });
    const compareDocument = (
      sourceDocumentPath,
      verifyOutputPath = sourceDocumentPath,
    ) =>
      executeOntologyParsingOracle(
        {
          rootPath: fixturePath("root.ofn"),
          sourceDocumentPath,
          verifyOutputPath,
          catalogMappings,
          compiledOracleDirectory,
        },
        reference,
      );

    it("compares direct root content while loading the original import context", async () => {
      const { result } = await compareDocument(fixturePath("root.ofn"));
      expect(result).toMatchObject({
        comparisonKind: "ONTOLOGY_PARSING",
        comparisonOutcome: "MATCH",
        expectedCounts: { axioms: 6, directImports: 1, ontologyAnnotations: 1 },
        actualCounts: { axioms: 6, directImports: 1, ontologyAnnotations: 1 },
        networkEvidence: { networkAccessAttemptCount: 0 },
      });
      expect(result.closureMemberIds).toHaveLength(3);
    });

    it("compares an imported document's own annotations without adding root axioms", async () => {
      const { result } = await compareDocument(fixturePath("member-a.ofn"));
      expect(result).toMatchObject({
        comparisonOutcome: "MATCH",
        expectedCounts: { axioms: 3, directImports: 1, ontologyAnnotations: 1 },
        actualCounts: { axioms: 3, directImports: 1, ontologyAnnotations: 1 },
      });
    });

    it("rejects merged output as evidence of direct-ontology parsing parity", async () => {
      const { result } = await compareDocument(
        fixturePath("root.ofn"),
        fixturePath("collapsed.ofn"),
      );
      expect(result).toMatchObject({
        comparisonOutcome: "MISMATCH",
        mismatchCategory: "IMPORTS",
      });
      expect(result.structuralDifferences.imports.javaOnly).toEqual([
        "urn:owlapi-js:import-closure:member-a",
      ]);
      expect(result.structuralDifferences.axioms.jsOnly.length).toBeGreaterThan(
        0,
      );
    });

    it("detects changed imported ontology metadata even though merging excludes it", async () => {
      const source = await readFile(fixturePath("member-a.ofn"), "utf8");
      const changedPath = join(directory, "changed-member.ofn");
      await writeFile(
        changedPath,
        source.replace(
          "imported ontology annotation must not be copied",
          "changed annotation",
        ),
      );
      const { result } = await compareDocument(
        fixturePath("member-a.ofn"),
        changedPath,
      );
      expect(result).toMatchObject({
        comparisonOutcome: "MISMATCH",
        mismatchCategory: "ONTOLOGY_ANNOTATIONS",
      });
      expect(result.structuralDifferences.annotations.javaOnly).toHaveLength(1);
      expect(result.structuralDifferences.annotations.jsOnly).toHaveLength(1);
    });
  },
);
