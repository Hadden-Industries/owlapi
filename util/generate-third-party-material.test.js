import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

describe("third-party-material prospective generation", () => {
  it("writes an alternate output without changing the reviewed inventory", () => {
    const repositoryRoot = resolve(import.meta.dirname, "..");
    const canonicalPath = join(
      repositoryRoot,
      "docs/provenance/third-party-material.json",
    );
    const prospectivePath = join(
      tmpdir(),
      `owlapi-third-party-material-${process.pid}.json`,
    );
    const canonicalBefore = readFileSync(canonicalPath);

    try {
      const result = spawnSync(
        process.execPath,
        [
          "util/generate-third-party-material.mjs",
          "--write",
          `--output=${prospectivePath}`,
        ],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const prospective = JSON.parse(readFileSync(prospectivePath, "utf8"));
      expect(prospective).toMatchObject({
        schemaVersion: 2,
        review: {
          status: "PENDING_HUMAN_REVIEW",
        },
      });
      expect(
        prospective.components.every(
          ({ licenseConclusionRationale }) =>
            !licenseConclusionRationale.includes("installed package metadata"),
        ),
      ).toBe(true);
      expect(
        prospective.components.find(
          ({ dependencyPath }) =>
            dependencyPath === "node_modules/@xmldom/xmldom",
        ),
      ).toMatchObject({
        declaredLicenseExpression: "MIT",
        licenseQualification: "LOCKFILE_TARBALL_DECLARATIONS_CONSISTENT",
        licenseConclusionRationale:
          "The concluded SPDX expression preserves an equivalent prior recorded conclusion when present; otherwise it selects the first SPDX-valid lockfile declaration, then authenticated package.json declaration, and only then ScanCode evidence. The distribution disposition likewise preserves an equivalent prior decision when present; otherwise it follows development/runtime scope and the concluded-licence policy. The lockfile and authenticated package.json declarations are consistent where present. ScanCode's additional file-level observations remain separately recorded and do not silently redefine the package declaration.",
        scanObservedLicenseExpressions: ["MIT", "MIT AND LGPL-2.0-or-later"],
      });
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      addFormats(ajv);
      const validate = ajv.compile(
        JSON.parse(
          readFileSync(
            join(
              repositoryRoot,
              "docs/provenance/third-party-material.schema.json",
            ),
            "utf8",
          ),
        ),
      );
      expect(validate(prospective)).toBe(true);
      expect(validate.errors).toBeNull();
      expect(readFileSync(canonicalPath)).toEqual(canonicalBefore);
    } finally {
      rmSync(prospectivePath, { force: true });
    }
  });
});
