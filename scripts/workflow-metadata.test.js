import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { deriveWorkflowMetadata } from "./workflow-metadata.mjs";

const manifest = {
  name: "owlapi",
  version: "0.1.0-alpha.0",
  publishConfig: { tag: "next" },
};

const disabledPublication = {
  enabled: false,
  mode: "UNRESOLVED",
  coordinate: "owlapi@0.1.0-alpha.0",
  channel: "next",
  reviewedOn: null,
};

describe("workflow metadata", () => {
  test("prepares the first-release candidate without authorizing publication or alpha reconciliation", () => {
    const currentManifest = JSON.parse(readFileSync("package.json", "utf8"));
    const publication = JSON.parse(
      readFileSync("docs/release/publication-control.json", "utf8"),
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
      coordinate: "owlapi@0.1.0-rc.1",
      tag: "v0.1.0-rc.1",
      channel: "next",
      publication_enabled: "false",
      publication_mode: "UNRESOLVED",
    });
    expect(validate({ ...publication, coordinate: "owlapi@0.2.0" })).toBe(
      false,
    );
    expect(validate({ ...publication, channel: "latest" })).toBe(false);
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
      artifact_name: "owlapi-0.1.0-alpha.0-candidate-12345-2",
      candidate_directory: ".release/candidate/0.1.0-alpha.0",
      channel: "next",
      coordinate: "owlapi@0.1.0-alpha.0",
      publication_enabled: "false",
      publication_mode: "UNRESOLVED",
      tag: "v0.1.0-alpha.0",
      version: "0.1.0-alpha.0",
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
