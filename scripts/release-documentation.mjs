/** Pure, dependency-free admission over retained bytes. Never executes package code. */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readGzipTarEntries } from "./release-artifacts.mjs";

export const DOCUMENTATION_CONTRACT = "owlapi-release-documentation-v1";
export const DOCUMENT_BYTES_LIMIT = 2 * 1024 * 1024;
const fail = (category, path, detail) => {
  throw new Error(`DOCUMENTATION_${category}: ${path}: ${detail}`);
};
const normalize = (text) => text.replace(/\r\n/gu, "\n");
const marker = (id, end) => `<!-- release-documentation:${id}:${end} -->`;

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
  const exports = Object.keys(manifest.exports).map((key) =>
    key === "." ? "owlapi" : `owlapi/${key.slice(2)}`,
  );
  return {
    identity: `This package: \`${coordinate}\`.\nThese instructions describe this exact version; they do not assert registry availability.\nConsumer engine admission: Node.js \`${manifest.engines.node}\`.`,
    install: `Install this exact version after it is published:\n\n\`\`\`shell\nnpm install --save-exact "owlapi@npm:${coordinate}"\nnpm install --save-exact ${coordinate}\n\`\`\``,
    exports: `Public import paths (native alias):\n\n${exports.map((path) => `- \`${path}\``).join("\n")}\n\nFor a scoped installation, replace \`owlapi\` with \`${manifest.name}\`.`,
    profiles:
      "Both `normative-v1` and `java-owlapi-5.5.1` are implemented in this package.\nOmitting `behaviorProfileId` selects `normative-v1`.\nSelect `java-owlapi-5.5.1` explicitly for the documented Java behavior; neither profile grants host I/O authority.",
    "import-map": `Deploy the verified \`${coordinate}\` distribution under \`/vendor/owlapi/${manifest.version}/\`.\nThis abbreviated map shows application-owned URLs, not a complete dependency map:\n\n\`\`\`html\n<script type="importmap">\n${JSON.stringify(
      {
        imports: Object.fromEntries(
          Object.entries(manifest.exports)
            .filter(([key]) => key !== "./io/node")
            .map(([key, target]) => [
              key === "." ? "owlapi" : `owlapi/${key.slice(2)}`,
              `/vendor/owlapi/${manifest.version}/${target.slice(2)}`,
            ]),
        ),
      },
      null,
      2,
    )}\n</script>\n\`\`\``,
  };
};

export const projectReadmeDocumentation = (readme, manifest) => {
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
  return result;
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
  const projected = projectReadmeDocumentation(readme, manifest);
  // Line endings are normalized above; line boundaries inside commands are significant.
  for (const id of Object.keys(renderDocumentationBlocks(manifest)))
    if (documentationBlock(readme, id) !== documentationBlock(projected, id))
      fail(
        "CLAIM",
        "README.md",
        `${id} disagrees with ${manifest.name}@${manifest.version}`,
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
export const inspectReleaseDocumentation = (
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
  const { notes } = assertDocumentationFiles(files, manifest, sourceFiles);
  return {
    result: "PASS",
    contract: DOCUMENTATION_CONTRACT,
    coordinate: `${manifest.name}@${manifest.version}`,
    tarballSha256: createHash("sha256").update(tarball).digest("hex"),
    notes,
  };
};

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
