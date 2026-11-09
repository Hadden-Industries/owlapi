import { inspectReleaseDocumentation } from "./release-documentation.mjs";

export const candidateReleaseNotes = ({
  tarball,
  manifest,
  expectedSha256,
}) => {
  const result = inspectReleaseDocumentation(tarball, manifest);
  if (expectedSha256 !== undefined && result.tarballSha256 !== expectedSha256)
    throw new Error(
      "Release notes candidate digest differs from accepted evidence",
    );
  return `## Changes, migration and limitations\n\n${result.notes}`;
};

export const observedChannelNotes = (publication) => {
  const facts = [];
  for (const name of ["next", "latest"])
    if (typeof publication?.[name] === "string")
      facts.push(`\`${name}\` selected \`${publication[name]}\``);
  if (publication?.latestPresent === false) facts.push("`latest` was absent");
  if (!facts.length || !publication.verifiedAt)
    throw new Error("Release notes require observed channel facts");
  return `Registry observation at ${publication.verifiedAt}: ${facts.join("; ")}.`;
};

export const assertReleaseNoteReadback = (release, expectedBody) => {
  if (release?.body !== expectedBody)
    throw new Error(
      "GitHub release notes differ from the intended candidate notes; no editorial overwrite is authorized",
    );
};
