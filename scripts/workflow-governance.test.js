import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";

import {
  auditReleaseReconciliationMutationBoundary,
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
      "release-reconciliation.yml",
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

  test("rejects authority added to the read-only reconciliation source job", () => {
    const reconciliation = readFileSync(
      ".github/workflows/release-reconciliation.yml",
      "utf8",
    );
    const broadened = reconciliation.replace(
      "      actions: read\n      contents: read",
      "      actions: read\n      contents: read\n      id-token: write\n      NPM_BOOTSTRAP_TOKEN: duplicated",
    );

    expect(auditReleaseReconciliationMutationBoundary(broadened)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /source_verification contains forbidden authority/u,
        ),
        expect.stringMatching(/exactly one id-token writer/u),
        expect.stringMatching(/exactly one bootstrap-token reference/u),
      ]),
    );
  });

  test("rejects a reconciliation download detached from the pinned source run", () => {
    const reconciliation = readFileSync(
      ".github/workflows/release-reconciliation.yml",
      "utf8",
    );
    const detached = reconciliation.replace(
      "run-id: ${{ steps.metadata.outputs.source_run_id }}",
      "run-id: ${{ github.run_id }}",
    );

    expect(auditReleaseReconciliationMutationBoundary(detached)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/closed source-run selector/u),
      ]),
    );
  });
});
