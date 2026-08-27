import { describe, expect, test } from "@jest/globals";

import {
  PACKAGE_OWNED_RUNTIME_DEPENDENCIES,
  applyWebVowlSourceCutover,
  createCandidateArchitectureTest,
  createDependencyOwnershipInventory,
} from "./cutover.mjs";

const files = new Map([
  [
    "src/owl2vowl/js/index.js",
    [
      "import {",
      "  OWLOntologyLoaderConfiguration,",
      "  StringDocumentSource,",
      '} from "../../owlapi-js/io/index.js";',
      'import { OWLManager } from "../../owlapi-js/manager/index.js";',
      'import { IRI } from "../../owlapi-js/model/index.js";',
    ].join("\n"),
  ],
  [
    "src/owl2vowl/js/importResolver.test.js",
    [
      'import { jest } from "@jest/globals";',
      "",
      'import { IRI, ResourceLimitError, SecurityPolicyError } from "../../owlapi-js/index.js";',
    ].join("\n"),
  ],
  [
    "src/owl2vowl/js/vowlBuilder.header.test.js",
    [
      'import { IRI, OWLDataFactory } from "../../owlapi-js/model/index.js";',
      'import { createOntologyID } from "../../owlapi-js/model/structural.js";',
      "const factory = new OWLDataFactory();",
      'const ontologyID = createOntologyID(IRI.create("urn:test"));',
    ].join("\n"),
  ],
  [
    "src/testRunnerScope.architecture.test.js",
    [
      '"src/owl2vowl/test/vowlBuilder.differential.test.js",',
      '"src/owlapi-js/parser/turtle/turtle.differential.test.js",',
    ].join("\n"),
  ],
]);

describe("disposable WebVOWL consumer cutover", () => {
  test("rewrites every source reach-in to the narrowest public package export", () => {
    const result = applyWebVowlSourceCutover(files);

    expect(result.changedFiles).toEqual([
      "src/owl2vowl/js/importResolver.test.js",
      "src/owl2vowl/js/index.js",
      "src/owl2vowl/js/vowlBuilder.header.test.js",
      "src/testRunnerScope.architecture.test.js",
    ]);
    expect(result.files.get("src/owl2vowl/js/index.js")).toContain(
      'from "owlapi/io"',
    );
    expect(result.files.get("src/owl2vowl/js/index.js")).toContain(
      'from "owlapi/apibinding"',
    );
    expect(result.files.get("src/owl2vowl/js/index.js")).toContain(
      'from "owlapi/model"',
    );
    expect(result.files.get("src/owl2vowl/js/index.js")).toContain(
      "IRI, OWLOntologyLoaderConfiguration",
    );
    expect(result.files.get("src/owl2vowl/js/index.js")).not.toMatch(
      /OWLOntologyLoaderConfiguration,[\s\S]*from "owlapi\/io"/u,
    );
    expect(result.files.get("src/owl2vowl/js/importResolver.test.js")).toBe(
      [
        'import { jest } from "@jest/globals";',
        "",
        'import { ResourceLimitError, SecurityPolicyError } from "owlapi/io";',
        'import { IRI } from "owlapi/model";',
      ].join("\n"),
    );
    expect(
      result.files.get("src/owl2vowl/js/vowlBuilder.header.test.js"),
    ).not.toContain("createOntologyID");
    expect(
      result.files.get("src/owl2vowl/js/vowlBuilder.header.test.js"),
    ).toContain('factory.getOWLOntologyID(IRI.create("urn:test"))');
    expect(
      result.files.get("src/testRunnerScope.architecture.test.js"),
    ).not.toContain("src/owlapi-js/");
  });

  test("refuses source drift instead of silently producing a partial patch", () => {
    const drifted = new Map(files);
    drifted.set(
      "src/owl2vowl/js/index.js",
      'import { IRI } from "../unexpected/model.js";',
    );

    expect(() => applyWebVowlSourceCutover(drifted)).toThrow(
      /expected WebVOWL source seam/u,
    );
  });

  test("classifies package-owned dependencies without hiding retained uses", () => {
    const inventory = createDependencyOwnershipInventory(
      new Map([
        ["package.json", JSON.stringify({ dependencies: { n3: "2.3.0" } })],
        ["src/owlapi-js/parser.js", 'import "n3";'],
        ["util/benchmark-owlapi.mjs", 'import "n3";'],
        ["src/app/js/app.js", 'import "d3";'],
      ]),
      { sourceCommit: "a".repeat(40) },
    );

    expect(inventory.sourceCommit).toBe("a".repeat(40));
    expect(inventory.dependencies.n3.applicationOwnedOccurrences).toEqual([]);
    expect(inventory.dependencies.n3.packageOwnedOccurrences).toHaveLength(2);
    expect(inventory.dependencies.n3.removalDisposition).toBe(
      "REMOVE_FROM_WEBVOWL_ROOT",
    );
    expect(inventory.dependencies.d3.removalDisposition).toBe(
      "RETAIN_IN_WEBVOWL_ROOT",
    );
  });

  test("candidate architecture test binds the one permitted local specifier", () => {
    const source = createCandidateArchitectureTest({
      packageSpecifier: "file:C:/candidate/owlapi-0.1.0-alpha.0.tgz",
      packageVersion: "0.1.0-alpha.0",
      tarballSha256: "b".repeat(64),
    });

    expect(source).toContain("CANDIDATE_ONLY_LOCAL_TARBALL");
    expect(source).toContain("b".repeat(64));
    expect(source).toContain("owlapi/formats");
    expect(source).toContain("owlapi-js");
    expect(source).not.toContain("process.env");
  });

  test("keeps the package-owned dependency list exact and reviewable", () => {
    expect(PACKAGE_OWNED_RUNTIME_DEPENDENCIES).toEqual([
      "@rdfjs/data-model",
      "@rdfjs/dataset",
      "@xmldom/xmldom",
      "jsonld",
      "n3",
      "rdfxml-streaming-parser",
    ]);
  });
});
