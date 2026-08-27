import { createHash } from "node:crypto";

export const PACKAGE_OWNED_RUNTIME_DEPENDENCIES = Object.freeze([
  "@rdfjs/data-model",
  "@rdfjs/dataset",
  "@xmldom/xmldom",
  "jsonld",
  "n3",
  "rdfxml-streaming-parser",
]);

const PUBLIC_SPECIFIER_REWRITES = Object.freeze([
  ["../../owlapi-js/io/index.js", "owlapi/io"],
  ["../../owlapi-js/manager/index.js", "owlapi/apibinding"],
  ["../../owlapi-js/model/index.js", "owlapi/model"],
]);

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const normalizedPath = (filePath) => filePath.replaceAll("\\", "/");

const lineNumberAt = (source, offset) =>
  source.slice(0, offset).split(/\r?\n/u).length;

const moduleSpecifiers = (source) => {
  const matches = [];
  const patterns = [
    /(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      matches.push({
        line: lineNumberAt(source, match.index),
        specifier: match[1],
      });
    }
  }
  return matches;
};

const packageNameOf = (specifier) => {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.includes(":")
  ) {
    return undefined;
  }
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
};

const packageOwnedPath = (filePath) => {
  const normalized = normalizedPath(filePath);
  return (
    normalized.startsWith("src/owlapi-js/") ||
    normalized.startsWith("docs/owlapi-js/") ||
    normalized.startsWith("util/owlapi-reference/") ||
    (/^util\//u.test(normalized) &&
      /(?:owlapi|generate-w3c-(?:jsonld|nquads|ntriples|rdf-to-owl|rdfxml|trig|turtle))/u.test(
        normalized,
      ))
  );
};

const replaceRootTestImport = (source) =>
  source.replace(
    /import\s*\{([^;]*?)\}\s*from\s*["']\.\.\/\.\.\/owlapi-js\/index\.js["'];/gu,
    (_whole, bindings) => {
      const names = bindings
        .split(",")
        .map((binding) => binding.trim())
        .filter(Boolean)
        .sort(compareCodeUnits);
      const expected = [
        "IRI",
        "ResourceLimitError",
        "SecurityPolicyError",
      ].sort(compareCodeUnits);
      if (stableJson(names) !== stableJson(expected)) {
        throw new Error(
          `Unexpected WebVOWL root-facade test bindings: ${JSON.stringify(names)}`,
        );
      }
      return [
        'import { ResourceLimitError, SecurityPolicyError } from "owlapi/io";',
        'import { IRI } from "owlapi/model";',
      ].join("\n");
    },
  );

const assertExpectedSourceSeam = (files) => {
  const expected = new Map([
    [
      "src/owl2vowl/js/index.js",
      PUBLIC_SPECIFIER_REWRITES.map(([from]) => from),
    ],
    [
      "src/owl2vowl/js/importResolver.js",
      ["../../owlapi-js/io/index.js", "../../owlapi-js/model/index.js"],
    ],
    ["src/owl2vowl/js/vowlBuilder.js", ["../../owlapi-js/model/index.js"]],
  ]);
  for (const [filePath, specifiers] of expected) {
    if (!files.has(filePath)) {
      continue;
    }
    const source = files.get(filePath);
    for (const specifier of specifiers) {
      if (!source.includes(specifier)) {
        throw new Error(
          `The expected WebVOWL source seam ${specifier} is absent from ${filePath}; review source drift before qualifying a candidate.`,
        );
      }
    }
  }
};

/**
 * Produces the exact source-level half of the Phase 19C disposable cutover.
 * The function intentionally validates old spellings before replacing them so
 * an upstream WebVOWL edit cannot silently turn this into a partial migration.
 */
export const applyWebVowlSourceCutover = (inputFiles) => {
  const files = new Map(
    [...inputFiles].map(([filePath, source]) => [
      normalizedPath(filePath),
      source,
    ]),
  );
  assertExpectedSourceSeam(files);
  const changedFiles = [];

  for (const [filePath, original] of files) {
    let source = original;
    for (const [from, to] of PUBLIC_SPECIFIER_REWRITES) {
      source = source.replaceAll(from, to);
    }
    if (filePath === "src/owl2vowl/js/index.js") {
      // The staging tree grouped loader configuration with document sources by
      // physical path. The public package follows OWLAPI concepts instead:
      // configuration is model state, while StringDocumentSource is I/O.
      source = source
        .replace(
          /import\s*\{\s*OWLOntologyLoaderConfiguration,\s*StringDocumentSource,?\s*\}\s*from\s*["']owlapi\/io["'];/u,
          'import { StringDocumentSource } from "owlapi/io";',
        )
        .replace(
          /import \{ IRI \} from ["']owlapi\/model["'];/u,
          'import { IRI, OWLOntologyLoaderConfiguration } from "owlapi/model";',
        );
    }
    if (filePath === "src/owl2vowl/js/importResolver.test.js") {
      source = replaceRootTestImport(source);
    }
    if (
      filePath === "src/owl2vowl/js/vowlBuilder.builtins.test.js" ||
      filePath === "src/owl2vowl/js/vowlBuilder.header.test.js" ||
      filePath === "src/owl2vowl/js/vowlBuilder.punning.test.js"
    ) {
      source = source
        .replace(
          /\r?\nimport \{ createOntologyID \} from ["']\.\.\/\.\.\/owlapi-js\/model\/structural\.js["'];\r?\n/u,
          "\n",
        )
        .replaceAll("createOntologyID(", "factory.getOWLOntologyID(");
    }
    if (filePath === "src/testRunnerScope.architecture.test.js") {
      source = source
        .split(/(?<=\n)/u)
        .filter((line) => !line.includes('"src/owlapi-js/'))
        .join("");
    }
    if (source !== original) {
      files.set(filePath, source);
      changedFiles.push(filePath);
    }
  }

  const remainingReachIns = [];
  for (const [filePath, source] of files) {
    if (
      (filePath.startsWith("src/owl2vowl/") ||
        filePath === "src/testRunnerScope.architecture.test.js") &&
      moduleSpecifiers(source).some(({ specifier }) =>
        specifier.includes("owlapi-js"),
      )
    ) {
      remainingReachIns.push(filePath);
    }
  }
  if (remainingReachIns.length > 0) {
    throw new Error(
      `The WebVOWL cutover left source-tree imports in ${remainingReachIns.sort(compareCodeUnits).join(", ")}.`,
    );
  }

  return {
    changedFiles: changedFiles.sort(compareCodeUnits),
    files,
  };
};

/**
 * Records module ownership before dependency removal. Textual references are
 * retained separately so comments and bundle-inspection markers remain visible
 * without being mistaken for executable application dependencies.
 */
export const createDependencyOwnershipInventory = (files, { sourceCommit }) => {
  const normalizedFiles = new Map(
    [...files].map(([filePath, source]) => [normalizedPath(filePath), source]),
  );
  const manifest = JSON.parse(normalizedFiles.get("package.json") ?? "{}");
  const declared = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  };
  const names = new Set(Object.keys(declared));
  const occurrences = new Map();

  for (const [filePath, source] of normalizedFiles) {
    if (filePath === "package-lock.json") {
      continue;
    }
    for (const { line, specifier } of moduleSpecifiers(source)) {
      const packageName = packageNameOf(specifier);
      if (!packageName) {
        continue;
      }
      names.add(packageName);
      const list = occurrences.get(packageName) ?? [];
      list.push({ file: filePath, line, specifier });
      occurrences.set(packageName, list);
    }
  }

  const dependencies = {};
  for (const name of [...names].sort(compareCodeUnits)) {
    const allOccurrences = (occurrences.get(name) ?? []).sort(
      (left, right) =>
        compareCodeUnits(left.file, right.file) || left.line - right.line,
    );
    const packageOccurrences = allOccurrences.filter(({ file }) =>
      packageOwnedPath(file),
    );
    const applicationOccurrences = allOccurrences.filter(
      ({ file }) => !packageOwnedPath(file),
    );
    const intendedRemoval = PACKAGE_OWNED_RUNTIME_DEPENDENCIES.includes(name);
    dependencies[name] = {
      declaredVersion: declared[name] ?? null,
      packageOwnedOccurrences: packageOccurrences,
      applicationOwnedOccurrences: applicationOccurrences,
      removalDisposition: intendedRemoval
        ? applicationOccurrences.length === 0
          ? "REMOVE_FROM_WEBVOWL_ROOT"
          : "BLOCKED_BY_APPLICATION_USE"
        : "RETAIN_IN_WEBVOWL_ROOT",
    };
  }

  return {
    schemaVersion: 1,
    sourceCommit,
    scannedFileCount: normalizedFiles.size,
    scannedPathClasses: [
      "source",
      "tests",
      "scripts",
      "configuration",
      "HTML",
      "copied-assets",
    ],
    dependencies,
  };
};

const jsString = (value) => JSON.stringify(value);

/**
 * Generates a candidate-only boundary test with immutable inputs baked into
 * the file. The maintained WebVOWL cutover replaces the local specifier with
 * the exact registry coordinate; there is deliberately no environment-driven
 * switch that could survive as a production escape hatch.
 */
export const createCandidateArchitectureTest = ({
  packageSpecifier,
  packageVersion,
  tarballSha256,
}) => `import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXPECTED_PACKAGE_SPECIFIER = ${jsString(packageSpecifier)};
const EXPECTED_PACKAGE_VERSION = ${jsString(packageVersion)};
const EXPECTED_TARBALL_SHA256 = ${jsString(tarballSha256)};
const CANDIDATE_ONLY_LOCAL_TARBALL = true;
const PACKAGE_ONLY_DEPENDENCIES = ${JSON.stringify(PACKAGE_OWNED_RUNTIME_DEPENDENCIES)};
const ALLOWED_OWLAPI_SPECIFIERS = new Set([
  "owlapi",
  "owlapi/apibinding",
  "owlapi/model",
  "owlapi/io",
  "owlapi/formats",
]);
const SPECIFIER_PATTERNS = [
  /(?:import|export)\\s+(?:[\\s\\S]*?\\sfrom\\s*)?["']([^"']+)["']/gu,
  /\\bimport\\s*\\(\\s*["']([^"']+)["']\\s*\\)/gu,
  /\\brequire\\s*\\(\\s*["']([^"']+)["']\\s*\\)/gu,
];

const walk = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  });

const sha256File = (filePath) => createHash("sha256")
  .update(readFileSync(filePath))
  .digest("hex");

describe("installed owlapi consumer boundary", () => {
  test("binds this disposable trial to the retained tarball", () => {
    expect(CANDIDATE_ONLY_LOCAL_TARBALL).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(manifest.dependencies?.owlapi).toBe(EXPECTED_PACKAGE_SPECIFIER);
    expect(manifest.devDependencies?.owlapi).toBeUndefined();
    for (const dependency of PACKAGE_ONLY_DEPENDENCIES) {
      expect(manifest.dependencies?.[dependency]).toBeUndefined();
      expect(manifest.devDependencies?.[dependency]).toBeUndefined();
    }
    const tarballPath = EXPECTED_PACKAGE_SPECIFIER.slice("file:".length);
    expect(existsSync(tarballPath)).toBe(true);
    expect(sha256File(tarballPath)).toBe(EXPECTED_TARBALL_SHA256);
    const installed = JSON.parse(readFileSync(path.join(ROOT, "node_modules", "owlapi", "package.json"), "utf8"));
    expect(installed.name).toBe("owlapi");
    expect(installed.version).toBe(EXPECTED_PACKAGE_VERSION);
  });

  test("uses only declared public package specifiers", () => {
    expect(existsSync(path.join(ROOT, "src", "owlapi-js"))).toBe(false);
    const violations = [];
    for (const filePath of walk(path.join(ROOT, "src")).filter((candidate) => /\\.(?:c|m)?js$/u.test(candidate))) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          const specifier = match[1];
          if (specifier.includes("owlapi-js") ||
              (specifier.startsWith("owlapi/") && !ALLOWED_OWLAPI_SPECIFIERS.has(specifier))) {
            violations.push({ file: path.relative(ROOT, filePath).replaceAll("\\\\", "/"), specifier });
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("has no resolver alias around the package exports map", () => {
    const configPaths = ["package.json", "vite.config.mjs", "eslint.config.js"];
    const aliasViolations = configPaths
      .filter((filePath) => existsSync(path.join(ROOT, filePath)))
      .filter((filePath) => /alias[\\s\\S]{0,300}owlapi/u.test(readFileSync(path.join(ROOT, filePath), "utf8")));
    expect(aliasViolations).toEqual([]);
  });
});
`;

export const webVowlCutoverDigest = (files) =>
  sha256(
    [...files]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([filePath, source]) => `${normalizedPath(filePath)}\0${source}`)
      .join("\0"),
  );
