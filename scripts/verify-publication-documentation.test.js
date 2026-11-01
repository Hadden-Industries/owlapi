import { jest } from "@jest/globals";
import { verifyPublicationDocumentation } from "./verify-publication-documentation.mjs";
import {
  inspectReleaseDocumentation,
  projectReadmeDocumentation,
} from "./release-documentation.mjs";
import {
  documentationManifest,
  documentationArchive,
  documentationSources,
} from "./fixtures/documentation-candidate.mjs";

const fixture = (version) => {
  const manifest = { ...documentationManifest, version };
  const files = documentationSources();
  files["README.md"] = projectReadmeDocumentation(files["README.md"], manifest);
  files["CHANGELOG.md"] = files["CHANGELOG.md"].replace(
    "## 0.1.0-rc.3",
    `## ${version}`,
  );
  for (const path of ["API.md", "docs/compatibility/java-api-surface.md"])
    files[path] = files[path].replaceAll(
      "`@hadden-industries/owlapi` 0.1.0-rc.3",
      `\`@hadden-industries/owlapi\` ${version}`,
    );
  const registry = JSON.parse(
    files["docs/compatibility/java-api-surface.json"],
  );
  registry.packageVersion = version;
  files["docs/compatibility/java-api-surface.json"] = JSON.stringify(registry);
  const tarball = documentationArchive(files, [], manifest);
  const documentation = inspectReleaseDocumentation(tarball, manifest);
  const identity = { commit: "a".repeat(40), runId: "123", runAttempt: 1 };
  return {
    manifest,
    tarball,
    identity,
    preflight: {
      result: "PASS",
      identity: { ...identity },
      documentation,
      candidate: {
        sha256: documentation.tarballSha256,
        coordinate: documentation.coordinate,
      },
    },
  };
};

test.each(["0.1.0-rc.9", "0.1.0"])(
  "admits exact preflight for %s and retains independently applicable evidence",
  (version) => {
    const input = fixture(version);
    input.preflight.producerContract = {
      retainedNativeEvidence: "not relabeled by documentation admission",
    };
    const previousContract = input.preflight.producerContract;
    expect(verifyPublicationDocumentation(input).result).toBe("PASS");
    input.identity.runAttempt = 2;
    expect(verifyPublicationDocumentation(input).result).toBe("PASS");
    expect(input.preflight.producerContract).toBe(previousContract);
  },
);

test.each([
  "missing",
  "policy",
  "repack",
  "source",
  "run",
  "future attempt",
  "failure",
])("refuses %s proof before the registry effect", (fault) => {
  const input = fixture("0.1.0-rc.9");
  const publish = jest.fn();
  if (fault === "missing") delete input.preflight.documentation;
  if (fault === "policy")
    input.preflight.documentation.contract = "old-contract";
  if (fault === "repack") input.preflight.candidate.sha256 = "b".repeat(64);
  if (fault === "source") input.preflight.identity.commit = "b".repeat(40);
  if (fault === "run") input.preflight.identity.runId = "122";
  if (fault === "future attempt") input.preflight.identity.runAttempt = 3;
  if (fault === "failure") input.preflight.result = "FAIL";
  expect(() => {
    verifyPublicationDocumentation(input);
    publish(input.tarball);
  }).toThrow();
  expect(publish).not.toHaveBeenCalled();
});
