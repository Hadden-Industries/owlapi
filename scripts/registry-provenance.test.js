import { createHash } from "node:crypto";
import { assertReleaseProvenance } from "./registry-provenance.mjs";
import { PACKAGE_PURL } from "./package-identity.mjs";

const tarball = Buffer.from("retained scoped candidate");
const commit = "a".repeat(40);
const fixture = () => ({
  tarball,
  commit,
  runId: "123",
  runAttempt: 2,
  statement: {
    _type: "https://in-toto.io/Statement/v1",
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [
      {
        name: PACKAGE_PURL,
        digest: { sha512: createHash("sha512").update(tarball).digest("hex") },
      },
    ],
    predicate: {
      buildDefinition: {
        buildType:
          "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: {
          workflow: {
            repository: "https://github.com/Hadden-Industries/owlapi",
            path: ".github/workflows/release.yml",
            ref: "refs/heads/main",
          },
        },
        resolvedDependencies: [
          {
            uri: "git+https://github.com/Hadden-Industries/owlapi@refs/heads/main",
            digest: { gitCommit: commit },
          },
        ],
      },
      runDetails: {
        builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: {
          invocationId:
            "https://github.com/Hadden-Industries/owlapi/actions/runs/123/attempts/2",
        },
      },
    },
  },
});
test("binds the npm CLI provenance statement to the scoped package, bytes and workflow run", () => {
  expect(assertReleaseProvenance(fixture())).toEqual({
    sourceCommit: commit,
    sourceRef: "refs/heads/main",
    workflow: ".github/workflows/release.yml",
    subjectSha256: createHash("sha256").update(tarball).digest("hex"),
    runId: "123",
    runAttempt: 2,
  });
});
test("resumed verification accepts the immutable earlier publication attempt in the same run", () => {
  const input = fixture();
  input.runAttempt = 3;
  expect(assertReleaseProvenance(input)).toMatchObject({
    runId: "123",
    runAttempt: 2,
  });
});
test.each([
  [
    "unscoped subject",
    (value) => {
      value.statement.subject[0].name = "pkg:npm/owlapi@0.1.0-rc.1";
    },
  ],
  [
    "different tarball",
    (value) => {
      value.tarball = Buffer.from("other bytes");
    },
  ],
  [
    "different commit",
    (value) => {
      value.commit = "b".repeat(40);
    },
  ],
  [
    "different run",
    (value) => {
      value.runId = "124";
    },
  ],
  [
    "different attempt",
    (value) => {
      value.runAttempt = 1;
    },
  ],
  [
    "reconciliation workflow",
    (value) => {
      value.statement.predicate.buildDefinition.externalParameters.workflow.path =
        ".github/workflows/release-reconciliation.yml";
    },
  ],
  [
    "different repository",
    (value) => {
      value.statement.predicate.buildDefinition.externalParameters.workflow.repository =
        "https://github.com/other/owlapi";
    },
  ],
  [
    "multiple subjects",
    (value) => {
      value.statement.subject.push(value.statement.subject[0]);
    },
  ],
])("rejects %s", (_label, change) => {
  const input = fixture();
  change(input);
  expect(() => assertReleaseProvenance(input)).toThrow(/provenance/u);
});
