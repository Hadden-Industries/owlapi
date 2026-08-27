import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema = JSON.parse(
  readFileSync(
    new URL("../docs/release/gate-results.schema.json", import.meta.url),
    "utf8",
  ),
);

const validResult = () => ({
  $schema: "../../../release/gate-results.schema.json",
  schemaVersion: 1,
  package: { name: "owlapi", version: "0.1.0-alpha.0" },
  phase: 19,
  sourceCommit: "a".repeat(40),
  recordedAt: "2026-08-27T12:00:00.000Z",
  accepted: true,
  definitionDigests: {
    gateRegistrySha256: "1".repeat(64),
    gateSchemaSha256: "2".repeat(64),
    resultSchemaSha256: "3".repeat(64),
    catalogueSha256: "4".repeat(64),
    checklistCoverageSha256: "5".repeat(64),
  },
  requirements: [
    {
      requirementId: "P19-SCOPE-001",
      requirementDigest: `sha256:${"6".repeat(64)}`,
      finalResult: "PASS",
      leafResults: [
        {
          gateId: "P19-SCOPE-001-VERIFY",
          finalResult: "PASS",
          evidence: [
            {
              kind: "FILE",
              location: "evidence/scope.json",
              sha256: "7".repeat(64),
            },
          ],
        },
      ],
      evidence: [
        {
          kind: "FILE",
          location: "evidence/scope.json",
          sha256: "7".repeat(64),
        },
      ],
    },
  ],
});

describe("release-gate result schema", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  it("accepts a digest-bound terminal result", () => {
    expect(validate(validResult())).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it("never permits INFRASTRUCTURE_ERROR as a terminal result", () => {
    const result = validResult();
    result.requirements[0].finalResult = "INFRASTRUCTURE_ERROR";

    expect(validate(result)).toBe(false);
  });

  it("requires a closed reason for NOT_APPLICABLE", () => {
    const result = validResult();
    result.requirements[0].finalResult = "NOT_APPLICABLE";

    expect(validate(result)).toBe(false);
  });
});
