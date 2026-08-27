import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import semver from "semver";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const deriveWorkflowMetadata = ({
  manifest,
  publication,
  runId,
  runAttempt,
}) => {
  if (manifest.name !== "owlapi" || !semver.valid(manifest.version)) {
    throw new Error("The workflow manifest coordinate is invalid.");
  }
  const prerelease = semver.prerelease(manifest.version);
  const channel = prerelease ? "next" : "latest";
  if (manifest.publishConfig?.tag !== channel) {
    throw new Error(
      `publishConfig.tag ${manifest.publishConfig?.tag} disagrees with SemVer channel ${channel}.`,
    );
  }
  const coordinate = `${manifest.name}@${manifest.version}`;
  if (
    publication.coordinate !== coordinate ||
    publication.channel !== channel ||
    (publication.enabled && publication.mode === "UNRESOLVED") ||
    (!publication.enabled && publication.mode !== "UNRESOLVED") ||
    (publication.enabled && !publication.reviewedOn)
  ) {
    throw new Error(
      "The reviewed publication-control record is internally inconsistent.",
    );
  }

  const artifactName =
    runId && runAttempt
      ? `owlapi-${manifest.version}-candidate-${runId}-${runAttempt}`
      : `owlapi-${manifest.version}-candidate-local-0`;
  const values = {
    artifact_name: artifactName,
    candidate_directory: `.release/candidate/${manifest.version}`,
    channel,
    coordinate,
    publication_enabled: String(publication.enabled),
    publication_mode: publication.mode,
    tag: `v${manifest.version}`,
    version: manifest.version,
  };
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Za-z0-9@._+/-]+$/u.test(value)) {
      throw new Error(`Workflow metadata ${name} contains an unsafe value.`);
    }
  }
  return values;
};

const main = () => {
  const manifest = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"),
  );
  const publication = JSON.parse(
    readFileSync(
      join(REPOSITORY_ROOT, "docs", "release", "publication-control.json"),
      "utf8",
    ),
  );
  const values = deriveWorkflowMetadata({
    manifest,
    publication,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  });
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${Object.entries(values)
        .map(([name, value]) => `${name}=${value}`)
        .join("\n")}\n`,
      "utf8",
    );
  }
  process.stdout.write(`${JSON.stringify(values, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
