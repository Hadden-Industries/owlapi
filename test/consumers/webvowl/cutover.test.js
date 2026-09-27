import { describe, expect, test } from "@jest/globals";
import * as cutoverModule from "./cutover.mjs";

describe("package-based WebVOWL qualification", () => {
  test("generates an installed contract bound to immutable candidate and audit inputs", () => {
    const source = cutoverModule.createCandidateArchitectureTest({
      packageSpecifier: "file:C:/candidate/owlapi.tgz",
      packageVersion: "0.1.0-alpha.0",
      tarballSha256: "b".repeat(64),
      publicExports: { "./util": "./util/index.js" },
      audit: {
        baselineCommit: "a".repeat(40),
        scanSha256: "c".repeat(64),
        disposition: "NO_OBSOLETE_USAGE",
      },
    });
    expect(source).toContain("exerciseImportClosureStorage");
    expect(source).toContain("OWLStorerNotFoundError");
    expect(source).toContain("UnrepresentableOntologyError");
    expect(source).toContain("ONTOLOGY_NOT_REPRESENTABLE");
    expect(source).toContain("b".repeat(64));
    expect(source).toContain("c".repeat(64));
    expect(source).not.toContain("process.env");
    expect(() =>
      cutoverModule.inspectWebVowlJavaScript(source, "src/candidate.test.js"),
    ).not.toThrow();
  });

  test("uses ESLint for static, dynamic and CommonJS specifiers, not comments or string examples", () => {
    const source = [
      'import { IRI } from "owlapi/model";',
      'export * from "owlapi/util";',
      'void import("owlapi/io");',
      'require("owlapi/formats");',
      '// import x from "owlapi/private";',
      "const example = 'import \"owlapi/private\";';",
    ].join("\n");
    expect(
      cutoverModule
        .inspectWebVowlJavaScript(source, "src/test.js")
        .moduleSpecifiers.map(({ specifier }) => specifier),
    ).toEqual(["owlapi/model", "owlapi/util", "owlapi/io", "owlapi/formats"]);
  });
});

describe("Phase 21 consumer audit", () => {
  const path = "src/reader.js";
  const source =
    'const source = new StringDocumentSource("text");\nsource.getText();';
  const reader = {
    path,
    line: 2,
    expression: "source.getText()",
    receiverType: "StringDocumentSource",
    evidence:
      "The receiver is the immediately preceding StringDocumentSource construction.",
  };
  const options = {
    baselineCommit: "a".repeat(40),
    sourceReaderAllowlist: [reader],
  };
  const audit = (text = source, settings = options) =>
    cutoverModule.auditWebVowlJavaParityConsumers(
      new Map([[path, text]]),
      settings,
    );

  test("retains exact source reads and a digest-bound zero-use disposition", () => {
    const result = audit();
    expect(result.sourceReaderAllowlist).toEqual([reader]);
    expect(result.obsoleteOccurrences).toEqual([]);
    expect(result.disposition).toBe("NO_OBSOLETE_USAGE");
    expect(result.scanSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  test.each([
    `${source}\ntarget.getText();`,
    `${source}\ntarget["getText"]();`,
    `${source}\nconst { getText: read } = target;`,
    `${source}\nimport { UnrepresentableOntologyError as OldError } from "owlapi/io";`,
    `${source}\nconst alias = io["UnrepresentableOntologyError"];`,
    `${source}\nsource.getText();`,
    `\n${source}`,
    source.replace("source.getText();", "source.toString();"),
    `${source}\nimport broken from`,
  ])(
    "fails closed on unknown, moved, removed, duplicated, or invalid use",
    (text) => {
      expect(() => audit(text)).toThrow();
    },
  );

  test("does not widen exceptions or hide audited application paths", () => {
    expect(() =>
      audit(source, {
        ...options,
        sourceReaderAllowlist: [reader, { ...reader, path: "src/new.js" }],
      }),
    ).toThrow();
    expect(() =>
      audit(source, { ...options, excludedPathClasses: ["src/"] }),
    ).toThrow();
    expect(audit(`${source}\ntarget.toString();`).obsoleteOccurrences).toEqual(
      [],
    );
  });

  test("binds the exact baseline, normalized inventory, disposition and reviewed source-reader evidence", () => {
    const result = audit();
    expect(() =>
      cutoverModule.assertReviewedWebVowlAudit(result, result),
    ).not.toThrow();
    for (const key of ["baselineCommit", "scanSha256", "disposition"]) {
      expect(() =>
        cutoverModule.assertReviewedWebVowlAudit(result, {
          ...result,
          [key]: "changed",
        }),
      ).toThrow(/reviewed/u);
    }
    expect(audit(source.replaceAll("\n", "\r\n")).scanSha256).toBe(
      result.scanSha256,
    );
    expect(audit(`${source}\n// reviewed bytes changed`).scanSha256).not.toBe(
      result.scanSha256,
    );
  });

  test.each([
    [
      "vite.config.mjs",
      'export default { resolve: { alias: { owlapi: "./copy" } } };',
    ],
    [
      "package.json",
      '{"dependencies":{"owlapi":"0.1.0"},"overrides":{"owlapi":"file:copy"}}',
    ],
    ["src/private.js", 'import "owlapi/internal/model.js";'],
    ["src/owlapi-js/index.js", "export {};"],
    ["README.md", "Do target.getText() here."],
    ["src/index.html", '<script>target["getText"]()</script>'],
  ])("rejects obsolete usage and runtime escapes in %s", (file, text) => {
    expect(() =>
      cutoverModule.auditWebVowlJavaParityConsumers(
        new Map([
          [path, source],
          [file, text],
        ]),
        options,
      ),
    ).toThrow();
  });

  test("keeps historical material visible as excluded inventory without trusting arbitrary exclusions", () => {
    const result = cutoverModule.auditWebVowlJavaParityConsumers(
      new Map([
        [path, source],
        ["docs/owlapi-js/old.md", "target.getText()"],
      ]),
      options,
    );
    expect(
      result.inventory.find((entry) => entry.path.endsWith("old.md")).exclusion,
    ).toBe("docs/owlapi-js/");
    expect(() =>
      cutoverModule.auditWebVowlJavaParityConsumers(
        new Map([["src/hidden.js", Buffer.from("target.getText()")]]),
        { baselineCommit: options.baselineCommit },
      ),
    ).toThrow(/text/u);
  });

  test("requires exact reviewed negative mentions and never excepts executable identifiers", () => {
    const file = "docs/migration.md";
    const text = "Do not use UnrepresentableOntologyError.";
    const negative = {
      path: file,
      line: 1,
      expression: "UnrepresentableOntologyError",
      evidence: "Negative migration guidance.",
    };
    expect(() =>
      cutoverModule.auditWebVowlJavaParityConsumers(new Map([[file, text]]), {
        baselineCommit: options.baselineCommit,
      }),
    ).toThrow();
    expect(
      cutoverModule.auditWebVowlJavaParityConsumers(new Map([[file, text]]), {
        baselineCommit: options.baselineCommit,
        negativeMentionAllowlist: [negative],
      }).obsoleteUseCount,
    ).toBe(0);
    expect(() =>
      cutoverModule.auditWebVowlJavaParityConsumers(
        new Map([
          ["src/negative.test.js", "void UnrepresentableOntologyError;"],
        ]),
        {
          baselineCommit: options.baselineCommit,
          negativeMentionAllowlist: [
            { ...negative, path: "src/negative.test.js" },
          ],
        },
      ),
    ).toThrow();
  });

  test("preserves a verified migration disposition and binds its actual changed paths and patch", () => {
    const migration = {
      changedPaths: [path],
      reviewedPatchSha256: "b".repeat(64),
      migrationCommit: null,
    };
    const migrated = audit(source, { ...options, migration });
    expect(migrated.disposition).toBe("MIGRATED");
    expect(migrated.changedPaths).toEqual([path]);
    expect(migrated.scanSha256).not.toBe(audit().scanSha256);
    expect(() =>
      cutoverModule.assertReviewedWebVowlAudit(migrated, migrated),
    ).not.toThrow();
    expect(() =>
      audit(source, {
        ...options,
        migration: { ...migration, changedPaths: [] },
      }),
    ).toThrow();
    expect(() =>
      audit(`${source}\ntarget.getText()`, { ...options, migration }),
    ).toThrow();
  });
});
