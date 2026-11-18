/** Pure, dependency-free admission over retained bytes. Never executes package code. */
import { isDeepStrictEqual } from "node:util";
import { readGzipTarEntries } from "./release-artifacts.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

export const DOCUMENTATION_CONTRACT = "owlapi-release-documentation-v1";
export const DOCUMENT_BYTES_LIMIT = 2 * 1024 * 1024;
const fail = (category, path, detail) => {
  throw new Error(`DOCUMENTATION_${category}: ${path}: ${detail}`);
};
const normalize = (text) => text.replace(/\r\n/gu, "\n");
const marker = (id, end) => `<!-- release-documentation:${id}:${end} -->`;
const repositoryLinksMarker = "<!-- release-documentation:repository-links -->";
const hasRepositoryLinks = (readme) => readme.includes(repositoryLinksMarker);

export const documentationBlock = (text, id) => {
  const start = marker(id, "start"),
    end = marker(id, "end");
  if (
    text.split(start).length !== 2 ||
    text.split(end).length !== 2 ||
    text.indexOf(end) < text.indexOf(start)
  )
    fail("BLOCK", "README.md", `missing, duplicate or reversed ${id}`);
  return text
    .slice(text.indexOf(start) + start.length, text.indexOf(end))
    .trim();
};

/** Small governed claims; the remaining prose still needs editorial review. */
export const renderDocumentationBlocks = (manifest) => {
  const coordinate = `${manifest.name}@${manifest.version}`;
  const importName = (key) =>
    key === "." ? "owlapi" : `owlapi/${key.slice(2)}`;
  const exports = Object.keys(manifest.exports).map(importName);
  return {
    identity: `This guide covers \`${coordinate}\`.`,
    install: [
      "Use the `owlapi` alias to follow the examples in this guide.",
      "",
      "```shell",
      `npm install --save-exact "owlapi@npm:${coordinate}"`,
      "```",
      "",
      `For imports that start with \`${manifest.name}\`, install the scoped package directly.`,
      "",
      "```shell",
      `npm install --save-exact ${coordinate}`,
      "```",
    ].join("\n"),
    exports: `Public imports with the \`owlapi\` alias:\n\n${exports.map((path) => `- \`${path}\``).join("\n")}\n\nFor a scoped installation, replace \`owlapi\` with \`${manifest.name}\`.`,
    profiles:
      "Omitting `behaviorProfileId` selects `normative-v1`.\nSelect `java-owlapi-5.5.1` for the documented Java behavior.\nFile and network access require separate authorization in either profile.",
    "import-map": `Deploy the verified \`${coordinate}\` package under \`/vendor/owlapi/${manifest.version}/\`.\nThis example maps OwlAPI's browser entry points.\nAdd mappings for the dependencies your application uses.\n\n\`\`\`html\n<script type="importmap">\n${JSON.stringify(
      {
        imports: Object.fromEntries(
          Object.entries(manifest.exports)
            .filter(([key]) => key !== "./io/node")
            .map(([key, target]) => [
              importName(key),
              `/vendor/owlapi/${manifest.version}/${target.slice(2)}`,
            ]),
        ),
      },
      null,
      2,
    )}\n</script>\n\`\`\``,
  };
};

const projectRepositoryLinks = (readme, manifest, required = false) => {
  // Older retained packages predate repository link projection.
  if (!required && !hasRepositoryLinks(readme)) return readme;
  if (readme.split(repositoryLinksMarker).length !== 2)
    fail("LINK", "README.md", "missing or duplicate repository-links marker");

  const repository =
    /^git\+(https:\/\/github\.com\/[\w.-]+\/[\w.-]+)\.git$/u.exec(
      manifest.repository?.url,
    )?.[1];
  if (!repository)
    fail("LINK", "package.json", "invalid GitHub repository URL");

  const source = `${repository}/blob/main`;
  const links = {
    "Upgrade or migrate": `${source}/docs/migration/0.1.0-java-api-parity.md`,
    "Browse GitHub releases": `${repository}/releases`,
    "Check the npm package": `https://www.npmjs.com/package/${manifest.name}?activeTab=versions`,
    "runtime support policy": `${source}/docs/release/runtime-policy.json`,
    "reference import map": `${source}/test/consumers/browser/import-map/reference-import-map.json`,
    "profile default comparison": `${source}/docs/compatibility/behavior-profiles.md#configuration-and-resource-defaults`,
    "W3C reporting plan": `${source}/docs/plans/w3c-test-conformance-reporting.md`,
    "`docs/provenance`": `${repository}/tree/main/docs/provenance`,
    "See what the rebuild estimate covers": `${source}/docs/development-investment.md`,
    "privacy notice": `${source}/PRIVACY.md`,
    "security policy": `${source}/SECURITY.md`,
    "Code of Conduct": `${source}/CODE_OF_CONDUCT.md`,
    "how to contribute": `${source}/CONTRIBUTING.md`,
    "private vulnerability reporting process": `${source}/SECURITY.md#privately-report-a-vulnerability`,
  };
  let result = readme;
  for (const [label, url] of Object.entries(links)) {
    const prefix = `[${label}](`;
    const parts = result.split(prefix);
    const destination = parts[1]?.match(/^[^\s)]+\)/u)?.[0];
    if (parts.length !== 2 || !destination)
      fail("LINK", "README.md", `expected one inline link for ${label}`);
    result = `${parts[0]}${prefix}${url})${parts[1].slice(destination.length)}`;
  }
  return result;
};

export const projectReadmeDocumentation = (
  readme,
  manifest,
  { requireRepositoryLinks = false } = {},
) => {
  let result = normalize(readme);
  for (const [id, body] of Object.entries(
    renderDocumentationBlocks(manifest),
  )) {
    documentationBlock(result, id);
    const start = marker(id, "start"),
      end = marker(id, "end");
    result =
      result.slice(0, result.indexOf(start) + start.length) +
      `\n\n${body}\n\n` +
      result.slice(result.indexOf(end));
  }
  return projectRepositoryLinks(result, manifest, requireRepositoryLinks);
};

const substantive = (text) =>
  text.replace(/\s/gu, "").length >= 35 &&
  !/\b(?:TODO|TBD|placeholder|coming soon)\b/iu.test(text);
export const selectReleaseNotes = (changelog, version) => {
  const sections = [
    ...normalize(changelog).matchAll(
      /^## ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gmu,
    ),
  ];
  const matches = sections.filter(
    ([, heading]) => heading.split(/\s/u)[0] === version,
  );
  if (matches.length !== 1)
    fail("NOTES", "CHANGELOG.md", `expected one exact ${version} section`);
  if (matches[0][1] !== version)
    fail(
      "STATUS",
      "CHANGELOG.md",
      "candidate heading must be release-neutral (no publication date/status)",
    );
  const body = matches[0][2].trim();
  const fields = [
    ...body.matchAll(
      /^### (Changes|Migration|Limitations)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gmu,
    ),
  ];
  for (const name of ["Changes", "Migration", "Limitations"]) {
    const values = fields.filter(([, heading]) => heading === name);
    if (values.length !== 1 || !substantive(values[0][2]))
      fail("NOTES", "CHANGELOG.md", `missing or non-substantive ${name}`);
    if (name === "Changes" && !/^[-*] .+/mu.test(values[0][2]))
      fail("NOTES", "CHANGELOG.md", "Changes needs an authored change list");
    const changes = values[0][2].match(/^[-*] .+/gmu) ?? [];
    if (
      name === "Changes" &&
      changes.every((line) =>
        /^[-*] (?:all (?:required )?(?:checks|tests|jobs)|(?:release )?qualification|(?:checks|tests|ci) (?:are |have |were )?(?:pass|complete)|PASS\b)/iu.test(
          line,
        ),
      )
    )
      fail("NOTES", "CHANGELOG.md", "qualification-only Changes");
  }
  return body;
};

export const README_EXAMPLE_IDS = Object.freeze([
  "load-ontology",
  "behavior-profiles",
]);
export const readDocumentationExamples = (readme) =>
  Object.fromEntries(
    README_EXAMPLE_IDS.map((id) => {
      const block = documentationBlock(normalize(readme), `example-${id}`);
      const match = /^```js\n([\s\S]+)\n```$/u.exec(block);
      if (!match)
        fail(
          "EXAMPLE",
          "README.md",
          `${id} must contain one complete JavaScript fence`,
        );
      return [id, match[1]];
    }),
  );

export const assertDocumentationFiles = (files, manifest, sourceFiles) => {
  const readme = normalize(files["README.md"]);
  // Line endings are normalized above; line boundaries inside commands are significant.
  for (const [id, body] of Object.entries(renderDocumentationBlocks(manifest)))
    if (documentationBlock(readme, id) !== body)
      fail(
        "CLAIM",
        "README.md",
        `${id} disagrees with ${manifest.name}@${manifest.version}`,
      );
  if (projectRepositoryLinks(readme, manifest) !== readme)
    fail(
      "CLAIM",
      "README.md",
      "inline repository links disagree with manifest",
    );
  readDocumentationExamples(readme);
  const notes = selectReleaseNotes(files["CHANGELOG.md"], manifest.version);
  if (!readme.includes(`engine admission range \`${manifest.engines.node}\``))
    fail(
      "RUNTIME",
      "README.md",
      "runtime-policy engine range disagrees with manifest",
    );
  const registry = JSON.parse(
    files["docs/compatibility/java-api-surface.json"],
  );
  if (
    registry.packageName !== manifest.name ||
    registry.packageVersion !== manifest.version
  )
    fail(
      "IDENTITY",
      "docs/compatibility/java-api-surface.json",
      "candidate identity mismatch",
    );
  for (const [path, suffix] of [
    ["API.md", "."],
    ["docs/compatibility/java-api-surface.md", " with"],
  ])
    if (
      !files[path].includes(`\`${manifest.name}\` ${manifest.version}${suffix}`)
    )
      fail("IDENTITY", path, "candidate identity mismatch");
  if (sourceFiles)
    for (const [path, text] of Object.entries(files)) {
      if (
        sourceFiles[path] === undefined ||
        normalize(text) !== normalize(sourceFiles[path])
      )
        fail(
          "PACKED_DRIFT",
          path,
          "retained bytes differ from reviewed source",
        );
    }
  return { notes };
};

export const DOCUMENTATION_PATHS = Object.freeze([
  "README.md",
  "CHANGELOG.md",
  "API.md",
  "docs/compatibility/java-api-surface.json",
  "docs/compatibility/java-api-surface.md",
  "docs/compatibility/behavior-profiles.md",
  "docs/compatibility/default-behavior-inventory.md",
]);
export const inspectReleaseDocumentationContents = (
  tarball,
  expectedManifest,
  sourceFiles,
) => {
  const entries = readGzipTarEntries(tarball);
  const decode = (path) => {
    const matches = entries.filter((entry) => entry.path === path);
    if (matches.length !== 1) fail("FILE", path, "missing or duplicate member");
    if (matches[0].size > DOCUMENT_BYTES_LIMIT)
      fail("LIMIT", path, "document exceeds 2 MiB");
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        matches[0].content,
      );
    } catch {
      return fail("ENCODING", path, "invalid UTF-8");
    }
  };
  const manifest = JSON.parse(decode("package.json"));
  if (
    !expectedManifest ||
    !isDeepStrictEqual(
      [manifest.name, manifest.version, manifest.exports, manifest.engines],
      [
        expectedManifest.name,
        expectedManifest.version,
        expectedManifest.exports,
        expectedManifest.engines,
      ],
    )
  )
    fail(
      "IDENTITY",
      "package.json",
      "unexpected candidate name/version/exports/engines",
    );
  const files = Object.fromEntries(
    DOCUMENTATION_PATHS.map((path) => [path, decode(path)]),
  );
  if (
    hasRepositoryLinks(files["README.md"]) &&
    manifest.repository?.url !== expectedManifest.repository?.url
  )
    fail("IDENTITY", "package.json", "unexpected repository URL");
  const { notes } = assertDocumentationFiles(files, manifest, sourceFiles);
  return {
    result: "PASS",
    contract: DOCUMENTATION_CONTRACT,
    coordinate: `${manifest.name}@${manifest.version}`,
    notes,
  };
};

export const inspectReleaseDocumentation = (
  tarball,
  expectedManifest,
  sourceFiles,
) => ({
  ...inspectReleaseDocumentationContents(
    tarball,
    expectedManifest,
    sourceFiles,
  ),
  tarballSha256: sha256Buffer(tarball),
});

export const assertDocumentationAdmission = (report, documentation) => {
  if (
    report?.result !== "PASS" ||
    report.documentation?.contract !== DOCUMENTATION_CONTRACT ||
    !isDeepStrictEqual(report.documentation, documentation) ||
    report.candidate?.sha256 !== documentation.tarballSha256 ||
    report.candidate?.coordinate !== documentation.coordinate
  )
    fail(
      "ADMISSION",
      "publication-preflight",
      "missing, stale or mismatched artifact-bound documentation result",
    );
};
