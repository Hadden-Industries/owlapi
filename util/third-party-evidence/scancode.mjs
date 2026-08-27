import { compareCodeUnits, stableJson } from "./digests.mjs";

const SCANCODE_OUTPUT_FORMAT_VERSION = "4.1.0";

// These switches define the semantic scan. Execution-only settings such as the
// input directory are intentionally excluded from the normalized evidence.
// `--package` covers package manifests. `--package-in-compiled` is deliberately
// absent: optional npm artifacts include foreign-ABI native binaries, while
// ScanCode 32.5.0 only supports compiled-package extraction for Go and Rust and
// can abort the otherwise portable licence scan when it encounters those files.
export const SCANCODE_SEMANTIC_OPTIONS = Object.freeze(
  [
    "--copyright",
    "--generated",
    "--info",
    "--license",
    "--license-references",
    "--license-text",
    "--package",
    "--unknown-licenses",
  ].sort(compareCodeUnits),
);

// ScanCode 32.5.0's Python 3.14 distribution has an upstream-reported memory
// regression when it fans out across many workers. A single worker also makes
// release-evidence acquisition resource-bounded and repeatable across hosts.
export const SCANCODE_EXECUTION_OPTIONS = Object.freeze(["--processes", "1"]);

export const SCANCODE_TOOL = Object.freeze({
  name: "scancode-toolkit",
  version: "32.5.0",
  pythonVersion: "3.14",
  outputFormatVersion: SCANCODE_OUTPUT_FORMAT_VERSION,
  assets: Object.freeze({
    windows: Object.freeze({
      url: "https://github.com/aboutcode-org/scancode-toolkit/releases/download/v32.5.0/scancode-toolkit-v32.5.0_py3.14-windows.zip",
      sha256:
        "74dfca9f0f2a607dbc90cfbfd03df1ed5b3e7e4b3a12dbb028e0d158c1311ec5",
    }),
    linux: Object.freeze({
      url: "https://github.com/aboutcode-org/scancode-toolkit/releases/download/v32.5.0/scancode-toolkit-v32.5.0_py3.14-linux.tar.gz",
      sha256:
        "02be93341e2f9775f88b4abd03cdd74f2e4de91941a12a1d8cd150eeb72a0945",
    }),
  }),
});

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const assertString = (value, name) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
};

export const buildScancodeArguments = ({ outputPath, inputRoot } = {}) => {
  assertString(outputPath, "outputPath");
  assertString(inputRoot, "inputRoot");
  return [
    ...SCANCODE_SEMANTIC_OPTIONS,
    ...SCANCODE_EXECUTION_OPTIONS,
    "--json-pp",
    outputPath,
    inputRoot,
  ];
};

const assertNoScanErrors = (value, location = "report") => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoScanErrors(entry, `${location}[${index}]`),
    );
    return;
  }
  if (!isObject(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (
      (key === "errors" || key === "scan_errors") &&
      Array.isArray(entry) &&
      entry.length > 0
    ) {
      throw new Error(`ScanCode scan error at ${location}.${key}`);
    }
    assertNoScanErrors(entry, `${location}.${key}`);
  }
};

const slashPath = (value) => value.replaceAll("\\", "/").replace(/\/+$/u, "");

const isAbsolutePath = (value) =>
  value.startsWith("/") || /^[A-Za-z]:\//u.test(value);

const isWindowsPath = (value) => /^[A-Za-z]:\//u.test(value);

const relativeToInputRoot = (candidate, inputRoot) => {
  const normalizedCandidate = slashPath(candidate);
  const normalizedRoot = slashPath(inputRoot);
  const caseFold = isWindowsPath(normalizedRoot);
  const comparedCandidate = caseFold
    ? normalizedCandidate.toLowerCase()
    : normalizedCandidate;
  const comparedRoot = caseFold ? normalizedRoot.toLowerCase() : normalizedRoot;

  if (comparedCandidate === comparedRoot) {
    return "";
  }
  if (!comparedCandidate.startsWith(`${comparedRoot}/`)) {
    throw new Error(
      `ScanCode path is outside the ScanCode input root: ${candidate}`,
    );
  }
  return normalizedCandidate.slice(normalizedRoot.length + 1);
};

const relativeScancodePath = (candidate, inputRoot) => {
  const normalizedCandidate = slashPath(candidate);
  if (isAbsolutePath(normalizedCandidate)) {
    return relativeToInputRoot(normalizedCandidate, inputRoot);
  }

  // Output format 4.1 roots relative paths at the scanned directory's parent,
  // so every resource starts with the input directory's basename.
  const normalizedRoot = slashPath(inputRoot);
  const rootName = normalizedRoot.split("/").at(-1);
  const caseFold = isWindowsPath(normalizedRoot);
  const comparedCandidate = caseFold
    ? normalizedCandidate.toLowerCase()
    : normalizedCandidate;
  const comparedRootName = caseFold ? rootName.toLowerCase() : rootName;
  if (comparedCandidate === comparedRootName) {
    return "";
  }
  if (!comparedCandidate.startsWith(`${comparedRootName}/`)) {
    throw new Error(
      `ScanCode path is outside the ScanCode input root: ${candidate}`,
    );
  }
  return normalizedCandidate.slice(rootName.length + 1);
};

const validateRelativePath = (value) => {
  const normalized = slashPath(value).replace(/^\.\//u, "");
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`ScanCode returned an unsafe relative path: ${value}`);
  }
  return normalized;
};

const isPathProperty = (key) => key === "path" || key.endsWith("_path");

const normalizePaths = (value, inputRoot, propertyName = "") => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePaths(entry, inputRoot, propertyName));
  }
  if (!isObject(value)) {
    if (typeof value === "string" && isPathProperty(propertyName)) {
      const relative = relativeScancodePath(value, inputRoot);
      return relative === "" ? "" : validateRelativePath(relative);
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      normalizePaths(entry, inputRoot, key),
    ]),
  );
};

const sortEvidenceCollections = (value) => {
  if (Array.isArray(value)) {
    // ScanCode models these arrays as finding collections rather than ordered
    // sequences. Canonical sorting prevents worker/OS traversal order from
    // changing the corpus digest while retaining every substantive finding.
    return value
      .map(sortEvidenceCollections)
      .sort((left, right) =>
        compareCodeUnits(stableJson(left), stableJson(right)),
      );
  }
  if (!isObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareCodeUnits)
      .map((key) => [key, sortEvidenceCollections(value[key])]),
  );
};

export const normalizeScancodeReport = (
  report,
  { artifactId, inputRoot } = {},
) => {
  if (!isObject(report)) {
    throw new TypeError("ScanCode report must be an object");
  }
  assertString(artifactId, "artifactId");
  assertString(inputRoot, "inputRoot");
  if (!Array.isArray(report.headers) || report.headers.length !== 1) {
    throw new Error("ScanCode report must contain exactly one header");
  }

  const header = report.headers[0];
  if (!isObject(header)) {
    throw new TypeError("ScanCode header must be an object");
  }
  if (header.tool_name !== SCANCODE_TOOL.name) {
    throw new Error(`Unexpected ScanCode tool name: ${header.tool_name}`);
  }
  if (header.tool_version !== SCANCODE_TOOL.version) {
    throw new Error(
      `Unexpected ScanCode version: ${header.tool_version}; expected ${SCANCODE_TOOL.version}`,
    );
  }
  if (header.output_format_version !== SCANCODE_OUTPUT_FORMAT_VERSION) {
    throw new Error(
      `Unexpected ScanCode output format: ${header.output_format_version}`,
    );
  }
  if (!isObject(header.options)) {
    throw new Error("ScanCode report does not record its semantic options");
  }
  for (const option of SCANCODE_SEMANTIC_OPTIONS) {
    if (header.options[option] !== true) {
      throw new Error(`Required ScanCode semantic option is absent: ${option}`);
    }
  }
  if (header.options["--processes"] !== 1) {
    throw new Error(
      "Required ScanCode execution option is absent: --processes must be 1",
    );
  }

  assertNoScanErrors(report);

  const findings = Object.fromEntries(
    Object.entries(report)
      .filter(([key]) => key !== "headers")
      .map(([key, value]) => [key, normalizePaths(value, inputRoot)]),
  );
  if (!Array.isArray(findings.files)) {
    throw new Error("ScanCode report must contain a file inventory");
  }
  // Directory records describe the materialized scan tree, including implicit
  // parents absent from the tar headers. Archive evidence covers directories;
  // ScanCode evidence is retained for authenticated regular-file bytes only.
  findings.files = findings.files.filter((entry) => {
    if (!isObject(entry) || !["directory", "file"].includes(entry.type)) {
      throw new Error("ScanCode returned an unexpected resource type");
    }
    return entry.type === "file";
  });

  return sortEvidenceCollections({
    artifactId,
    scanner: {
      name: SCANCODE_TOOL.name,
      version: SCANCODE_TOOL.version,
      outputFormatVersion: SCANCODE_OUTPUT_FORMAT_VERSION,
      semanticOptions: SCANCODE_SEMANTIC_OPTIONS,
      executionOptions: SCANCODE_EXECUTION_OPTIONS,
      message: header.message ?? null,
      warnings: header.warnings ?? [],
    },
    ...findings,
  });
};
