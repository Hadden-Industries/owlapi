import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { deriveWorkflowMetadata } from "./workflow-metadata.mjs";

const manifest = {
  name: "@hadden-industries/owlapi",
  version: "0.1.0-rc.1",
  publishConfig: { tag: "next" },
};

const disabledPublication = {
  enabled: false,
  mode: "UNRESOLVED",
  coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
  channel: "next",
  reviewedOn: null,
};

describe("workflow metadata", () => {
  test("selects the scoped RC and rejects the blocked bare identity or another scope", () => {
    const scopedManifest = {
      ...manifest,
      name: "@hadden-industries/owlapi",
      version: "0.1.0-rc.1",
    };
    const publication = {
      ...disabledPublication,
      coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
    };
    expect(
      deriveWorkflowMetadata({ manifest: scopedManifest, publication }),
    ).toMatchObject({
      coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
      artifact_name: "hadden-industries-owlapi-0.1.0-rc.1-candidate-local-0",
      publication_enabled: "false",
    });
    for (const name of ["owlapi", "@someone-else/owlapi"]) {
      expect(() =>
        deriveWorkflowMetadata({
          manifest: { ...scopedManifest, name },
          publication: { ...publication, coordinate: `${name}@0.1.0-rc.1` },
        }),
      ).toThrow(/coordinate/u);
    }
  });

  test("preserves the historical rc.1 bootstrap decision and rejects contradictory controls", () => {
    const currentManifest = {
      ...JSON.parse(readFileSync("package.json", "utf8")),
      version: "0.1.0-rc.1",
    };
    const publication = JSON.parse(
      readFileSync(
        "docs/release/history/0.1.0-rc.1-publication-control.json",
        "utf8",
      ),
    );
    const schema = JSON.parse(
      readFileSync("docs/release/publication-control.schema.json", "utf8"),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(currentManifest.version).toBe("0.1.0-rc.1");
    expect(validate(publication)).toBe(true);
    expect(publication.reconciliation).toBeNull();
    expect(
      deriveWorkflowMetadata({ manifest: currentManifest, publication }),
    ).toMatchObject({
      coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
      tag: "v0.1.0-rc.1",
      channel: "next",
      publication_enabled: "true",
      publication_mode: "DIRECT_BOOTSTRAP",
    });
    expect(validate({ ...publication, coordinate: "owlapi@0.2.0" })).toBe(
      false,
    );
    expect(validate({ ...publication, channel: "latest" })).toBe(false);
    expect(
      validate({
        ...publication,
        enabled: false,
        mode: "UNRESOLVED",
        reviewedOn: null,
      }),
    ).toBe(true);
    for (const invalidControls of [
      { enabled: false },
      { mode: "UNRESOLVED" },
      { mode: "OIDC_STAGED" },
      { reviewedOn: null },
      { reviewedOn: "2026-13-03" },
      { reconciliation: {} },
    ]) {
      expect(validate({ ...publication, ...invalidControls })).toBe(false);
    }
  });

  test("derives one safe coordinate, channel, tag, and same-run artifact identity", () => {
    expect(
      deriveWorkflowMetadata({
        manifest,
        publication: disabledPublication,
        runId: "12345",
        runAttempt: "2",
      }),
    ).toEqual({
      artifact_name: "hadden-industries-owlapi-0.1.0-rc.1-candidate-12345-2",
      candidate_directory: ".release/candidate/0.1.0-rc.1",
      channel: "next",
      coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
      publication_enabled: "false",
      publication_mode: "UNRESOLVED",
      tag: "v0.1.0-rc.1",
      version: "0.1.0-rc.1",
    });
  });

  test("rejects manifest and publication-control channel disagreement", () => {
    expect(() =>
      deriveWorkflowMetadata({
        manifest: { ...manifest, publishConfig: { tag: "latest" } },
        publication: disabledPublication,
      }),
    ).toThrow(/publishConfig\.tag latest disagrees/u);
  });

  test("rejects an enabled publication boundary without a resolved reviewed mode", () => {
    expect(() =>
      deriveWorkflowMetadata({
        manifest,
        publication: { ...disabledPublication, enabled: true },
      }),
    ).toThrow(/publication-control record is internally inconsistent/u);
  });
});
