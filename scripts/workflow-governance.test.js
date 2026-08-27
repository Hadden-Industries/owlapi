import { describe, expect, test } from "@jest/globals";

import { auditRepositoryControls } from "./workflow-governance.mjs";

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
});
