import {
  documentationManifest as manifest,
  documentationSources as sources,
  documentationArchive as archive,
} from "./fixtures/documentation-candidate.mjs";
import {
  assertDocumentationAdmission,
  assertDocumentationFiles,
  inspectReleaseDocumentation,
  projectReadmeDocumentation,
  selectReleaseNotes,
} from "./release-documentation.mjs";

const coordinate = `${manifest.name}@${manifest.version}`;
const installAlias = `npm install --save-exact "owlapi@npm:${coordinate}"`;
const installScoped = `npm install --save-exact ${coordinate}`;
const releaseHeading = `\n## ${manifest.version}\n`;

test("the packed guides identify their version and include upgrade notes", () => {
  const files = sources();
  const result = inspectReleaseDocumentation(archive(files), manifest, files);
  expect(result).toMatchObject({
    result: "PASS",
    contract: "owlapi-release-documentation-v1",
    coordinate,
  });
  expect(result.notes).toContain("### Migration");
  expect(result.notes).toContain("ChangeApplied");
});

test.each([
  [
    "stale exact pin",
    installScoped,
    "npm install --save-exact @hadden-industries/owlapi@0.1.0-rc.1",
  ],
  [
    "stale current identity",
    `This guide covers \`${coordinate}\`.`,
    "Latest published release: `@hadden-industries/owlapi@0.1.0-rc.2`.",
  ],
  [
    "unpublished profiles",
    "Select `java-owlapi-5.5.1` for the documented Java behavior.",
    "The Java behavior profile is unpublished.",
  ],
  [
    "wrong default",
    "Omitting `behaviorProfileId` selects `normative-v1`",
    "Omitting `behaviorProfileId` selects `java-owlapi-5.5.1`",
  ],
  [
    "wrong import map",
    `/vendor/owlapi/${manifest.version}/index.js`,
    "/vendor/owlapi/0.1.0-rc.1/index.js",
  ],
  ["invented export", "- `owlapi/search`", "- `owlapi/unknown`"],
])("rejects %s in otherwise valid retained bytes", (_, before, after) => {
  const files = sources();
  expect(files["README.md"]).toContain(before);
  files["README.md"] = files["README.md"].replace(before, after);
  expect(() => inspectReleaseDocumentation(archive(files), manifest)).toThrow(
    /DOCUMENTATION_CLAIM/u,
  );
});

test("legitimate history and a moving tag do not have to match an unpublished candidate", () => {
  const files = sources();
  files["README.md"] +=
    "\n## Previous releases\n\nObserved 2026-10-10: rc.2 was published. The convenience @latest instruction may resolve that predecessor.\n";
  expect(() => assertDocumentationFiles(files, manifest)).not.toThrow();
  const future = { ...manifest, version: "0.1.0-rc.9" };
  const projected = projectReadmeDocumentation(files["README.md"], future);
  expect(projected).toContain(
    "npm install --save-exact @hadden-industries/owlapi@0.1.0-rc.9",
  );
  expect(projected).toContain("Observed 2026-10-10: rc.2 was published.");
  expect(projected).not.toContain(`This guide covers \`${coordinate}\`.`);
});

test("source-good but tarball-stale and repacked documentation invalidate old admission", () => {
  const files = sources(),
    tarball = archive(files);
  const documentation = inspectReleaseDocumentation(tarball, manifest, files);
  const report = {
    result: "PASS",
    documentation,
    candidate: {
      sha256: documentation.tarballSha256,
      coordinate: documentation.coordinate,
    },
  };
  expect(() =>
    assertDocumentationAdmission(report, documentation),
  ).not.toThrow();
  const edited = {
    ...files,
    "README.md": `${files["README.md"]}\nAn editorial clarification.\n`,
  };
  expect(() => inspectReleaseDocumentation(tarball, manifest, edited)).toThrow(
    /PACKED_DRIFT/u,
  );
  const newDocumentation = inspectReleaseDocumentation(
    archive(edited),
    manifest,
    edited,
  );
  expect(newDocumentation.tarballSha256).not.toBe(documentation.tarballSha256);
  expect(() => assertDocumentationAdmission(report, newDocumentation)).toThrow(
    /ADMISSION/u,
  );
  expect(() =>
    assertDocumentationAdmission(
      { ...report, documentation: undefined },
      documentation,
    ),
  ).toThrow(/ADMISSION/u);
  expect(() =>
    assertDocumentationAdmission(
      {
        ...report,
        documentation: { ...documentation, contract: "old-contract" },
      },
      documentation,
    ),
  ).toThrow(/ADMISSION/u);
});

test.each([
  "missing",
  "duplicate",
  "date",
  "unpublished",
  "migration",
  "placeholder",
])("rejects %s candidate notes", (fault) => {
  let text = sources()["CHANGELOG.md"];
  const notes = selectReleaseNotes(text, manifest.version);
  if (fault === "missing")
    text = text.replace(releaseHeading, "\n## 0.1.0-rc.9\n");
  if (fault === "duplicate") text += `${releaseHeading}\nDuplicate\n`;
  if (fault === "date")
    text = text.replace(
      releaseHeading,
      `\n## ${manifest.version} — published 1 November 2026\n`,
    );
  if (fault === "unpublished")
    text = text.replace(
      releaseHeading,
      `\n## ${manifest.version} — unpublished\n`,
    );
  if (fault === "migration")
    text = text.replace(
      notes,
      notes.replace("### Migration", "### Internal checks"),
    );
  if (fault === "placeholder")
    text = text.replace(
      notes,
      notes.replace(
        "### Changes",
        "### Changes\n\nTODO: explain this release.",
      ),
    );
  expect(() => selectReleaseNotes(text, manifest.version)).toThrow(
    /DOCUMENTATION_(?:NOTES|STATUS)/u,
  );
});

test("duplicate blocks, duplicate/missing files, malformed UTF-8 and oversized documents fail closed", () => {
  const files = sources();
  expect(() =>
    inspectReleaseDocumentation(
      archive(files, [["README.md", files["README.md"]]]),
      manifest,
    ),
  ).toThrow(/DOCUMENTATION_FILE/u);
  expect(() =>
    inspectReleaseDocumentation(
      archive({ ...files, "README.md": Buffer.from([0xff]) }),
      manifest,
    ),
  ).toThrow(/ENCODING/u);
  expect(() =>
    inspectReleaseDocumentation(
      archive({ ...files, "README.md": Buffer.alloc(2 * 1024 * 1024 + 1) }),
      manifest,
    ),
  ).toThrow(/LIMIT/u);
  expect(() =>
    inspectReleaseDocumentation(
      archive({
        ...files,
        "README.md": `${files["README.md"]}\n<!-- release-documentation:identity:start -->`,
      }),
      manifest,
    ),
  ).toThrow(/BLOCK/u);
  delete files["README.md"];
  expect(() => inspectReleaseDocumentation(archive(files), manifest)).toThrow(
    /DOCUMENTATION_FILE/u,
  );
});

test("qualification-only notes do not explain a release", () => {
  const text = `${releaseHeading}\n### Changes\n\n- All required checks passed with registry signatures and provenance.\n\n### Migration\n\nNo migration is required because public behavior and dependencies are unchanged.\n\n### Limitations\n\nThe existing documented unsupported APIs remain unavailable in this release.\n`;
  expect(() => selectReleaseNotes(text, manifest.version)).toThrow(
    /qualification-only/u,
  );
});

test.each(["joined commands", "split command"])(
  "rejects shell-significant whitespace changes: %s",
  (fault) => {
    const files = sources();
    const before =
      fault === "joined commands"
        ? installAlias
        : 'npm install --save-exact "owlapi@npm:';
    expect(files["README.md"]).toContain(before);
    files["README.md"] = files["README.md"].replace(
      before,
      fault === "joined commands"
        ? `${installAlias} ${installScoped}`
        : 'npm\ninstall --save-exact "owlapi@npm:',
    );
    expect(() => inspectReleaseDocumentation(archive(files), manifest)).toThrow(
      /DOCUMENTATION_CLAIM/u,
    );
  },
);
