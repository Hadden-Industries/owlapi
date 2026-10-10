import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { repositoryPythonTools } from "../scripts/repository-python-tools.mjs";

describe("third-party-material prospective generation", () => {
  it("binds installed scanner declarations to the native locked package graph", () => {
    const root = resolve(import.meta.dirname, "..");
    const lock = readFileSync(join(root, "util/scancode-runtime/uv.lock"));
    const inventory = JSON.parse(
      readFileSync(
        join(root, "LICENSES/development/scancode-runtime/inventory.json"),
        "utf8",
      ),
    );
    expect(inventory.lockSha256).toBe(
      createHash("sha256").update(lock).digest("hex"),
    );
    const tools = repositoryPythonTools();
    const parsed = spawnSync(
      tools.python,
      [
        "-I",
        "-c",
        "import json,tomllib; from pathlib import Path; p=[x for x in tomllib.loads(Path('util/scancode-runtime/uv.lock').read_text(encoding='utf-8'))['package'] if not x.get('source', {}).get('virtual')]; print(json.dumps({'packages': p, 'sourceBuilt': [x for x in p if x.get('sdist') and not x.get('wheels')]}))",
      ],
      { cwd: root, encoding: "utf8", timeout: 30000, windowsHide: true },
    );
    expect(parsed.status).toBe(0);
    const identities = (values) =>
      values
        .map(
          ({ name, version }) =>
            `${name.toLowerCase().replaceAll(/[-_.]+/gu, "-")}==${version}`,
        )
        .sort();
    const nativeGraph = JSON.parse(parsed.stdout);
    expect(identities(inventory.components)).toEqual(
      identities(nativeGraph.packages),
    );
    expect(identities(inventory.sourceBuiltComponents)).toEqual(
      identities(nativeGraph.sourceBuilt),
    );
    for (const component of inventory.components) {
      expect(component.noticeEvidenceStatus).toBe(
        component.notices.length
          ? "RETAINED"
          : "NOT_PROVIDED_BY_INSTALLED_DISTRIBUTION",
      );
      for (const notice of component.notices)
        expect(
          createHash("sha256")
            .update(readFileSync(join(root, notice.path)))
            .digest("hex"),
        ).toBe(notice.sha256);
    }
  });
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
      const shared = prospective.materials.find(
        ({ id }) => id === "shared-markdown-quality-development-tool",
      );
      expect(shared).toMatchObject({
        relationship: "DEVELOPMENT_ONLY",
        versionOrRevision: "47febbe1b6f3282814e77db7ea13eac72b4928ed",
        sourceUrl: "https://github.com/Hadden-Industries/markdown-quality",
        packageTarballScope: false,
      });
      const paths = prospective.materials.flatMap(({ evidenceFiles }) =>
        evidenceFiles.map(({ path }) => path),
      );
      expect(paths).not.toContain("scripts/documentation-quality.mjs");
      expect(paths).not.toContain("scripts/documentation-files.mjs");
      expect(paths).not.toContain("scripts/documentation-quality.test.js");
      expect(
        prospective.materials.some(
          ({ id }) => id === "snapper-development-tool",
        ),
      ).toBe(false);
      expect(shared.licenseAssessments[0].concludedLicenseExpression).toBe(
        "AGPL-3.0-only",
      );
    } finally {
      rmSync(prospectivePath, { force: true });
    }
  });
});
