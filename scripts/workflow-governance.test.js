import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";

import {
  auditReleaseMutationBoundary,
  auditRepositoryControls,
} from "./workflow-governance.mjs";

describe("repository workflow governance", () => {
  test("the checked-in controls match the closed Phase 19 workflow policy", () => {
    const report = auditRepositoryControls();

    expect(report.workflowFiles).toEqual([
      "ci.yml",
      "extended-tests.yml",
      "maintenance.yml",
      "release.yml",
    ]);
    expect(report.issueFormFiles).toEqual([
      "bug.yml",
      "conformance.yml",
      "documentation.yml",
      "feature.yml",
      "java-compatibility.yml",
      "other.yml",
    ]);
    expect(report.violations).toEqual([]);
  });

  test("rejects publication authority duplicated outside the release job", () => {
    const release = readFileSync(".github/workflows/release.yml", "utf8");
    const broadened = release.replace(
      "      actions: read\n      contents: read",
      "      actions: read\n      contents: read\n      id-token: write\n      NPM_BOOTSTRAP_TOKEN: duplicated",
    );

    expect(auditReleaseMutationBoundary(broadened)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/exactly one id-token writer/u),
        expect.stringMatching(/exactly one bootstrap-token reference/u),
      ]),
    );
  });
});
