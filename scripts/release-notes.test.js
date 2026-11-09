import {
  candidateReleaseNotes,
  observedChannelNotes,
  assertReleaseNoteReadback,
} from "./release-notes.mjs";
import { finalReleaseBody } from "./finalize-github-release.mjs";
import {
  documentationManifest as manifest,
  documentationArchive,
  documentationSources,
} from "./fixtures/documentation-candidate.mjs";

test("renders changes, migration and limitations from the exact tarball", () => {
  const files = documentationSources();
  files["CHANGELOG.md"] = files["CHANGELOG.md"].replace(
    "### Changes",
    "### Changes\n\n- Correct the independently observed ontology parser edge case.",
  );
  const notes = candidateReleaseNotes({
    tarball: documentationArchive(files),
    manifest,
  });
  expect(notes).toContain(
    "Correct the independently observed ontology parser edge case.",
  );
  for (const section of ["### Changes", "### Migration", "### Limitations"])
    expect(notes.split(section)).toHaveLength(2);
  expect(notes).not.toContain("## 0.1.0-rc.2");
  expect(() =>
    candidateReleaseNotes({
      tarball: documentationArchive(files),
      manifest,
      expectedSha256: "a".repeat(64),
    }),
  ).toThrow(/digest/u);
});

test("final bodies require substantive notes and use observed channels, not current-version equality", () => {
  const evidence = {
    package: { ...manifest },
    publication: {
      next: "0.1.0-rc.3",
      latest: "0.1.0-rc.2",
      verifiedAt: "2026-11-01T00:00:00Z",
    },
    requiredJobs: [],
    extendedTests: [],
  };
  expect(() => finalReleaseBody(evidence)).toThrow(/candidate changes/u);
  const body = finalReleaseBody(
    evidence,
    candidateReleaseNotes({ tarball: documentationArchive(), manifest }),
  );
  expect(body).toContain("`latest` selected `0.1.0-rc.2`");
  expect(body).toContain("### Migration");
  expect(
    observedChannelNotes({
      next: "0.1.0-alpha.0",
      latestPresent: false,
      verifiedAt: "2026-08-01T00:00:00Z",
    }),
  ).toContain("`latest` was absent");
  expect(() => observedChannelNotes({})).toThrow();
  expect(() =>
    assertReleaseNoteReadback({ body: "Later authorized human edit" }, body),
  ).toThrow(/no editorial overwrite/u);
  expect(() => assertReleaseNoteReadback({ body }, body)).not.toThrow();
});
