import { createHash } from "node:crypto";

import { Linter } from "eslint";

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableJson = (value) => JSON.stringify(value, null, 2) + "\n";
const normalizedPath = (value) => value.replaceAll("\\", "/");
const excludedPrefixes = Object.freeze([
  "docs/owlapi-js/",
  "docs/provenance/",
  "node_modules/",
  "coverage/",
  "dist/",
  ".release/",
]);
const publicSpecifiers = new Set([
  "owlapi",
  "owlapi/apibinding",
  "owlapi/model",
  "owlapi/io",
  "owlapi/formats",
  "owlapi/util",
]);
const literalValue = (node) => {
  if (node?.type === "Literal" && typeof node.value === "string")
    return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis[0].value.cooked;
  return undefined;
};

/** ESLint owns JavaScript grammar, traversal and decoded identifier spelling. */
export const inspectWebVowlJavaScript = (source, path) => {
  const moduleSpecifiers = [];
  const sourceReaders = [];
  const forbiddenIdentifiers = [];
  const storageUses = [];
  const configurationMentions = [];
  const isConfiguration = /(?:^|[/.])(?:[^/]*\.)?config\.(?:c|m)?js$/u.test(
    path,
  );
  const messages = new Linter().verify(
    source,
    [
      {
        languageOptions: {
          ecmaVersion: "latest",
          sourceType: path.endsWith(".cjs") ? "commonjs" : "module",
        },
        plugins: {
          parity: {
            rules: {
              inspect: {
                meta: { schema: [] },
                create(context) {
                  const record = (node) => ({
                    path,
                    line: node.loc.start.line,
                    expression: context.sourceCode.getText(node),
                  });
                  const collectModule = (node) => {
                    const specifier = literalValue(node);
                    if (specifier !== undefined)
                      moduleSpecifiers.push({ ...record(node), specifier });
                  };
                  return {
                    ImportDeclaration: (node) => collectModule(node.source),
                    ExportAllDeclaration: (node) => collectModule(node.source),
                    ExportNamedDeclaration: (node) =>
                      collectModule(node.source),
                    ImportExpression: (node) => collectModule(node.source),
                    CallExpression(node) {
                      if (
                        node.callee.type === "Identifier" &&
                        node.callee.name === "require"
                      )
                        collectModule(node.arguments[0]);
                    },
                    MemberExpression(node) {
                      const property = node.computed
                        ? literalValue(node.property)
                        : node.property.name;
                      if (property === "getText") {
                        const call =
                          node.parent.type === "CallExpression" &&
                          node.parent.callee === node;
                        sourceReaders.push({
                          ...record(call ? node.parent : node),
                          call,
                        });
                      }
                    },
                    Property(node) {
                      if (
                        node.parent.type === "ObjectPattern" &&
                        (node.key.name ?? literalValue(node.key)) === "getText"
                      ) {
                        sourceReaders.push({ ...record(node), call: false });
                      }
                    },
                    Identifier(node) {
                      if (isConfiguration && node.name === "owlapi")
                        configurationMentions.push(record(node));
                      if (node.name === "UnrepresentableOntologyError")
                        forbiddenIdentifiers.push(record(node));
                      if (
                        [
                          "StringDocumentTarget",
                          "OWLOntologyStorageError",
                          "OWLStorerNotFoundError",
                          "saveOntology",
                        ].includes(node.name)
                      )
                        storageUses.push(record(node));
                    },
                    Literal(node) {
                      if (
                        isConfiguration &&
                        typeof node.value === "string" &&
                        /\bowlapi(?:-js)?\b/u.test(node.value)
                      )
                        configurationMentions.push(record(node));
                      if (node.value === "UnrepresentableOntologyError")
                        forbiddenIdentifiers.push(record(node));
                    },
                    TemplateLiteral(node) {
                      if (literalValue(node) === "UnrepresentableOntologyError")
                        forbiddenIdentifiers.push(record(node));
                    },
                  };
                },
              },
            },
          },
        },
        rules: { "parity/inspect": "error" },
      },
    ],
    { allowInlineConfig: false },
  );
  if (messages.length)
    throw new SyntaxError(
      "Cannot audit " +
        path +
        ": " +
        messages.map(({ line, message }) => line + ": " + message).join("; "),
    );
  return {
    moduleSpecifiers,
    sourceReaders,
    forbiddenIdentifiers,
    storageUses,
    configurationMentions,
  };
};

const occurrenceKey = ({ path, line, expression }) =>
  JSON.stringify([path, line, expression]);

/**
 * This is a reviewed-use inventory, not JavaScript type inference. Each source
 * reader is an exact evidence-bearing exception bound to the resulting digest.
 * Historical exclusions are fixed; callers cannot hide application paths.
 */
export const auditWebVowlJavaParityConsumers = (
  files,
  {
    baselineCommit,
    sourceReaderAllowlist = [],
    negativeMentionAllowlist = [],
    migration = null,
    ...unsupportedOptions
  },
) => {
  if (
    Object.keys(unsupportedOptions).length ||
    !/^[a-f0-9]{40}$/u.test(baselineCommit ?? "")
  ) {
    throw new Error(
      "Consumer audit requires an exact baseline and the fixed audited scope.",
    );
  }
  if (
    migration &&
    (!Array.isArray(migration.changedPaths) ||
      migration.changedPaths.length === 0 ||
      new Set(migration.changedPaths).size !== migration.changedPaths.length ||
      migration.changedPaths.some(
        (path) =>
          !/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u.test(path),
      ) ||
      !/^[a-f0-9]{64}$/u.test(migration.reviewedPatchSha256 ?? "") ||
      (migration.migrationCommit !== null &&
        !/^[a-f0-9]{40}$/u.test(migration.migrationCommit ?? "")))
  )
    throw new Error(
      "Migration requires verified changed paths, patch digest and optional authorized commit.",
    );
  const inventory = [];
  const readers = [];
  const forbidden = [];
  const storageUses = [];
  const violations = [];
  const paths = new Set();
  for (const [rawPath, content] of [...files].sort(([a], [b]) =>
    compare(a, b),
  )) {
    const path = normalizedPath(rawPath);
    if (/^(?:\/|[a-z]:)|(?:^|\/)\.\.(?:\/|$)/iu.test(path) || paths.has(path))
      throw new Error("Invalid or duplicate inventory path " + path);
    paths.add(path);
    if (path.startsWith("src/owlapi-js/"))
      throw new Error(
        "The consumer still contains the removed package staging tree.",
      );
    const source =
      typeof content === "string" ? content.replaceAll("\r\n", "\n") : null;
    if (
      source === null &&
      /\.(?:(?:c|m)?js|json|md|html|[yt]oml|ya?ml|py|css|svg)$/u.test(path)
    ) {
      throw new Error(
        "An audited text path cannot be classified as a binary asset: " + path,
      );
    }
    const exclusion =
      excludedPrefixes.find((prefix) => path.startsWith(prefix)) ??
      (source === null ? "binary-asset" : null);
    inventory.push({ path, sha256: sha256(source ?? content), exclusion });
    if (exclusion) continue;
    if (path === "package.json") {
      const manifest = JSON.parse(source);
      for (const key of ["imports", "overrides", "resolutions", "workspaces"]) {
        if (Object.hasOwn(manifest, key))
          violations.push({
            path,
            problem: "unapproved package resolution setting",
            key,
          });
      }
    }
    if (/\.(?:c|m)?js$/u.test(path)) {
      const inspected = inspectWebVowlJavaScript(source, path);
      readers.push(...inspected.sourceReaders);
      forbidden.push(...inspected.forbiddenIdentifiers);
      storageUses.push(...inspected.storageUses);
      violations.push(...inspected.configurationMentions);
      for (const entry of inspected.moduleSpecifiers) {
        if (
          entry.specifier.includes("owlapi-js") ||
          entry.specifier.includes("node_modules/owlapi") ||
          (entry.specifier.startsWith("owlapi/") &&
            !publicSpecifiers.has(entry.specifier))
        )
          violations.push(entry);
      }
    } else {
      // Textual policy search for prose/HTML/configuration, not a format parser.
      for (const [index, line] of source.split("\n").entries()) {
        for (const match of line.matchAll(
          /\bUnrepresentableOntologyError\b|\b[A-Za-z_$][\w$]*\.getText\s*\([^)]*\)|\bgetText\b/gu,
        )) {
          const entry = { path, line: index + 1, expression: match[0] };
          if (match[0] === "UnrepresentableOntologyError")
            forbidden.push(entry);
          else readers.push({ ...entry, call: true });
        }
      }
    }
  }
  const seenReaders = new Set();
  const approvedReaders = new Map();
  for (const reader of sourceReaderAllowlist) {
    const key = occurrenceKey(reader);
    if (
      reader.receiverType !== "StringDocumentSource" ||
      !reader.evidence?.trim() ||
      approvedReaders.has(key)
    )
      throw new Error("Invalid or duplicate source-reader review record.");
    approvedReaders.set(key, reader);
  }
  for (const reader of readers) {
    const key = occurrenceKey(reader);
    if (!reader.call || !approvedReaders.has(key) || seenReaders.has(key))
      violations.push(reader);
    seenReaders.add(key);
  }
  for (const [key, reader] of approvedReaders) {
    if (!seenReaders.has(key))
      violations.push({
        ...reader,
        problem: "reviewed source reader moved or disappeared",
      });
  }
  const seenNegativeMentions = new Set();
  for (const occurrence of forbidden) {
    const key = occurrenceKey(occurrence);
    const permission = negativeMentionAllowlist.find(
      (entry) => occurrenceKey(entry) === key,
    );
    // Only exact negative documentation or literal-name assertions are eligible.
    // Imports, aliases and executable identifiers are never exceptions.
    const nonExecutable =
      /\.md$/u.test(occurrence.path) ||
      (/\.test\.(?:c|m)?js$/u.test(occurrence.path) &&
        /^["']/u.test(occurrence.expression));
    if (
      !permission?.evidence?.trim() ||
      !nonExecutable ||
      seenNegativeMentions.has(key)
    )
      violations.push(occurrence);
    seenNegativeMentions.add(key);
  }
  for (const entry of negativeMentionAllowlist) {
    if (!seenNegativeMentions.has(occurrenceKey(entry)))
      violations.push({
        ...entry,
        problem: "negative mention moved or disappeared",
      });
  }
  const record = {
    schemaVersion: 1,
    baselineCommit,
    auditedPathClasses: [
      "source",
      "tests",
      "scripts",
      "configuration",
      "HTML",
      "maintained-documentation",
    ],
    excludedPathClasses: [...excludedPrefixes, "binary-asset"],
    inventory,
    sourceReaderAllowlist,
    negativeMentionAllowlist,
    storageUses,
    obsoleteOccurrences: violations,
    obsoleteUseCount: violations.length,
    changedPaths: migration?.changedPaths ?? [],
    ...(migration
      ? {
          migrationCommit: migration.migrationCommit,
          reviewedPatchSha256: migration.reviewedPatchSha256,
        }
      : {}),
    disposition: violations.length
      ? "UNRESOLVED"
      : migration
        ? "MIGRATED"
        : "NO_OBSOLETE_USAGE",
  };
  const audit = { ...record, scanSha256: sha256(stableJson(record)) };
  if (violations.length) {
    const error = new Error(
      "WebVOWL parity audit requires review: " + JSON.stringify(violations),
    );
    error.audit = audit;
    throw error;
  }
  return audit;
};

export const assertReviewedWebVowlAudit = (actual, reviewed) => {
  if (
    !reviewed ||
    actual.baselineCommit !== reviewed.baselineCommit ||
    actual.scanSha256 !== reviewed.scanSha256 ||
    actual.disposition !== reviewed.disposition
  ) {
    throw new Error(
      "WebVOWL baseline, audit digest or disposition changed without a reviewed migration record.",
    );
  }
};

/** Bind the consumer's existing dependency before the disposable tarball trial. */
export const assertReviewedWebVowlPackageDependency = ({
  manifest,
  reviewedPackageSpecifier,
  retainedGitPackageSpecifier,
}) => {
  if (
    typeof reviewedPackageSpecifier !== "string" ||
    !reviewedPackageSpecifier ||
    (reviewedPackageSpecifier !== "0.1.0" &&
      reviewedPackageSpecifier !== retainedGitPackageSpecifier) ||
    manifest.dependencies?.owlapi !== reviewedPackageSpecifier ||
    Object.hasOwn(manifest.devDependencies ?? {}, "owlapi")
  ) {
    throw new Error(
      "The WebVOWL baseline does not declare the reviewed exact package coordinate.",
    );
  }
};

export const webVowlCutoverDigest = (files) =>
  sha256(
    [...files]
      .sort(([a], [b]) => compare(a, b))
      .map(([path, source]) => normalizedPath(path) + "\0" + source)
      .join("\0"),
  );

/** Immutable inputs are baked into a disposable installed-candidate test. */
export const createCandidateArchitectureTest = ({
  packageSpecifier,
  packageVersion,
  tarballSha256,
  publicExports,
  audit,
}) =>
  [
    'import { createHash } from "node:crypto";',
    'import { existsSync, readFileSync } from "node:fs";',
    'import path from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'import * as io from "owlapi/io";',
    'import { OWLDocumentFormats } from "owlapi/formats";',
    'import { StringDocumentSource, StringDocumentTarget, OWLOntologyStorageError, OWLStorerNotFoundError } from "owlapi/io";',
    'import { exerciseImportClosureStorage } from "./owlapiQualification/public-contract.js";',
    'import documents from "./owlapiQualification/documents.js";',
    'const ROOT = fileURLToPath(new URL("..", import.meta.url));',
    "const EXPECTED_PACKAGE_SPECIFIER = " +
      JSON.stringify(packageSpecifier) +
      ";",
    "const EXPECTED_PACKAGE_VERSION = " + JSON.stringify(packageVersion) + ";",
    "const EXPECTED_TARBALL_SHA256 = " + JSON.stringify(tarballSha256) + ";",
    "const EXPECTED_EXPORTS = " + JSON.stringify(publicExports) + ";",
    "const EXPECTED_AUDIT = " + JSON.stringify(audit) + ";",
    "const CANDIDATE_ONLY_LOCAL_TARBALL = true;",
    'const readJson = (name) => JSON.parse(readFileSync(path.join(ROOT, name), "utf8"));',
    'describe("installed owlapi consumer boundary", () => {',
    '  test("binds this disposable trial to the retained tarball and reviewed baseline", () => {',
    "    expect(CANDIDATE_ONLY_LOCAL_TARBALL).toBe(true);",
    '    const manifest = readJson("package.json");',
    "    expect(manifest.dependencies.owlapi).toBe(EXPECTED_PACKAGE_SPECIFIER);",
    "    expect(manifest.devDependencies?.owlapi).toBeUndefined();",
    '    const lock = readJson("package-lock.json");',
    '    expect(lock.packages[""].dependencies.owlapi).toBe(EXPECTED_PACKAGE_SPECIFIER);',
    '    expect(createHash("sha256").update(readFileSync(EXPECTED_PACKAGE_SPECIFIER.slice(5))).digest("hex")).toBe(EXPECTED_TARBALL_SHA256);',
    '    const installed = readJson("node_modules/owlapi/package.json");',
    '    expect(installed.name).toBe("owlapi");',
    "    expect(installed.version).toBe(EXPECTED_PACKAGE_VERSION);",
    "    expect(installed.exports).toEqual(EXPECTED_EXPORTS);",
    '    expect(existsSync(path.join(ROOT, "src/owlapi-js"))).toBe(false);',
    '    const audit = readJson("src/owlapiQualification/audit.json");',
    "    expect({ baselineCommit: audit.baselineCommit, scanSha256: audit.scanSha256, disposition: audit.disposition }).toEqual(EXPECTED_AUDIT);",
    "  });",
    '  test("preserves the precise Phase 21 target, source and error surface", () => {',
    "    const target = new StringDocumentTarget();",
    '    expect(target.toString()).toBe("");',
    '    expect("getText" in target).toBe(false);',
    '    expect(new StringDocumentSource("source text").getText()).toBe("source text");',
    "    expect(new OWLStorerNotFoundError(OWLDocumentFormats.FUNCTIONAL)).toBeInstanceOf(OWLOntologyStorageError);",
    '    expect(new OWLOntologyStorageError("not representable", { reason: "ONTOLOGY_NOT_REPRESENTABLE" }).reason).toBe("ONTOLOGY_NOT_REPRESENTABLE");',
    '    expect(Object.hasOwn(io, "UnrepresentableOntologyError")).toBe(false);',
    "  });",
    '  test("preserves the exact closure in both formats and retains a successful target after failure", async () => {',
    "    const result = await exerciseImportClosureStorage(documents);",
    "    expect(result.summary).toEqual({ closureCount: 4, importLoadCount: 3, directAxiomCount: 26,",
    '      rootAnnotationCount: 1, anonymousIndividualCount: 4, formats: ["functional", "rdfxml"],',
    "      reloadLoaderCalls: 0, diagnosticCount: 0, retainedTargetAfterFailure: true, sourceReaderPreserved: true });",
    "  });",
    "});",
  ].join("\n") + "\n";
