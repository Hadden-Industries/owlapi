import { compareCodeUnits, stableJson } from "./digests.mjs";

const SCANCODE_OUTPUT_FORMAT_VERSION = "4.1.0";
export const SCANCODE_NORMALIZATION_VERSION = 1;
export const SCANCODE_NON_SEMANTIC_FILE_FIELDS = Object.freeze([
  "date",
  "file_type",
  "is_script",
  "mime_type",
]);

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

// Native Node add-ons are platform-specific opaque binaries. ScanCode 32.5.0
// can abort while identifying a foreign-ABI `.node` file, so the acquisition
// layer omits only regular files with this suffix after authenticating them.
// This must not become a ScanCode `--ignore` glob: ScanCode applies that glob
// to names, and a source directory such as `_optPlug.node` would hide all of
// its otherwise scannable descendants.
export const SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES = Object.freeze([
  ".node",
]);

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

const cloneEvidence = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneEvidence);
  }
  if (!isObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneEvidence(entry)]),
  );
};

const normalizeCodebasePath = (value, inputRoot, location) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `ScanCode returned an invalid codebase path at ${location}`,
    );
  }
  const relative = relativeScancodePath(value, inputRoot);
  return relative === "" ? "" : validateRelativePath(relative);
};

const normalizeCodebaseLocations = (findings, inputRoot) => {
  if (Array.isArray(findings.files)) {
    findings.files.forEach((file, index) => {
      if (!isObject(file)) {
        throw new Error(`ScanCode returned an invalid file at files[${index}]`);
      }
      file.path = normalizeCodebasePath(
        file.path,
        inputRoot,
        `files[${index}].path`,
      );
    });
  }

  if (findings.packages !== undefined) {
    if (!Array.isArray(findings.packages)) {
      throw new Error("ScanCode returned an invalid package inventory");
    }
    findings.packages.forEach((package_, packageIndex) => {
      if (!isObject(package_)) {
        throw new Error(
          `ScanCode returned an invalid package at packages[${packageIndex}]`,
        );
      }
      if (package_.datafile_paths === undefined) {
        return;
      }
      if (!Array.isArray(package_.datafile_paths)) {
        throw new Error(
          `ScanCode returned invalid datafile paths at packages[${packageIndex}].datafile_paths`,
        );
      }
      package_.datafile_paths = package_.datafile_paths.map((path, pathIndex) =>
        normalizeCodebasePath(
          path,
          inputRoot,
          `packages[${packageIndex}].datafile_paths[${pathIndex}]`,
        ),
      );
    });
  }

  if (findings.dependencies !== undefined) {
    if (!Array.isArray(findings.dependencies)) {
      throw new Error("ScanCode returned an invalid dependency inventory");
    }
    findings.dependencies.forEach((dependency, dependencyIndex) => {
      if (!isObject(dependency)) {
        throw new Error(
          `ScanCode returned an invalid dependency at dependencies[${dependencyIndex}]`,
        );
      }
      if (dependency.datafile_path === undefined) {
        return;
      }
      dependency.datafile_path = normalizeCodebasePath(
        dependency.datafile_path,
        inputRoot,
        `dependencies[${dependencyIndex}].datafile_path`,
      );
    });
  }

  // ScanCode's package model also has semantic `path` fields. For example,
  // npm lockfile dependency roots live in `file_references[].path` and may be
  // scoped package names such as `@babel/code-frame`. Only the three documented
  // codebase-location surfaces above are execution-rooted; retaining all other
  // path-shaped values prevents package metadata from being misclassified.
  return findings;
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

const splitTransientUuid = (value, location) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`ScanCode returned an invalid package UID at ${location}`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`ScanCode returned an invalid package UID at ${location}`);
  }
  if (url.protocol !== "pkg:") {
    throw new Error(`ScanCode returned a non-purl package UID at ${location}`);
  }

  const uuidValues = url.searchParams.getAll("uuid");
  if (uuidValues.length === 0) {
    return { purl: value, transient: false };
  }
  if (uuidValues.length !== 1 || uuidValues[0].length === 0) {
    throw new Error(
      `ScanCode returned an ambiguous package UID at ${location}`,
    );
  }
  url.searchParams.delete("uuid");
  return { purl: url.toString(), transient: true };
};

const validateSemanticPurl = (value, location) => {
  const { purl, transient } = splitTransientUuid(value, location);
  if (transient) {
    throw new Error(
      `ScanCode returned a transient UUID in a semantic PURL at ${location}`,
    );
  }
  return purl;
};

const normalizePackageGraphIdentities = (findings) => {
  const packageUidMap = new Map();
  const packagePurls = new Set();

  for (const [index, package_] of (findings.packages ?? []).entries()) {
    if (!isObject(package_)) {
      throw new Error(
        `ScanCode returned an invalid package at packages[${index}]`,
      );
    }
    const purl = validateSemanticPurl(package_.purl, `packages[${index}].purl`);
    if (packagePurls.has(purl)) {
      throw new Error(`ScanCode returned a duplicate package PURL: ${purl}`);
    }
    packagePurls.add(purl);
    packageUidMap.set(purl, purl);

    if (package_.package_uid === undefined) {
      continue;
    }
    const rawUid = package_.package_uid;
    const normalizedUid = splitTransientUuid(
      rawUid,
      `packages[${index}].package_uid`,
    ).purl;
    if (normalizedUid !== purl) {
      throw new Error(
        `ScanCode package UID does not match packages[${index}].purl`,
      );
    }
    packageUidMap.set(rawUid, purl);
    delete package_.package_uid;
  }

  const normalizePackageReference = (value, location) => {
    const parsed = splitTransientUuid(value, location);
    const exact = packageUidMap.get(value);
    if (parsed.transient && exact === undefined) {
      throw new Error(
        `ScanCode returned an unresolved package UID reference at ${location}`,
      );
    }
    const purl = exact ?? parsed.purl;
    if (!packagePurls.has(purl)) {
      throw new Error(
        `ScanCode returned an unresolved package UID reference at ${location}`,
      );
    }
    return purl;
  };

  for (const [fileIndex, file] of (findings.files ?? []).entries()) {
    if (file.for_packages === undefined) {
      continue;
    }
    if (!Array.isArray(file.for_packages)) {
      throw new Error(
        `ScanCode returned invalid package references at files[${fileIndex}].for_packages`,
      );
    }
    file.for_packages = file.for_packages.map((uid, uidIndex) =>
      normalizePackageReference(
        uid,
        `files[${fileIndex}].for_packages[${uidIndex}]`,
      ),
    );
  }

  for (const [index, dependency] of (findings.dependencies ?? []).entries()) {
    if (!isObject(dependency)) {
      throw new Error(
        `ScanCode returned an invalid dependency at dependencies[${index}]`,
      );
    }
    if (Object.hasOwn(dependency, "for_package_purl")) {
      throw new Error(
        `ScanCode returned a reserved normalized field at dependencies[${index}].for_package_purl`,
      );
    }
    if (Object.hasOwn(dependency, "for_package_uid")) {
      dependency.for_package_purl =
        dependency.for_package_uid === null
          ? null
          : normalizePackageReference(
              dependency.for_package_uid,
              `dependencies[${index}].for_package_uid`,
            );
      delete dependency.for_package_uid;
    }
    if (dependency.dependency_uid === undefined) {
      continue;
    }
    const purl = validateSemanticPurl(
      dependency.purl,
      `dependencies[${index}].purl`,
    );
    const normalizedUid = splitTransientUuid(
      dependency.dependency_uid,
      `dependencies[${index}].dependency_uid`,
    ).purl;
    if (normalizedUid !== purl) {
      throw new Error(
        `ScanCode dependency UID does not match dependencies[${index}].purl`,
      );
    }
    delete dependency.dependency_uid;
  }

  // ScanCode's UUIDv4 qualifiers identify one in-memory scan invocation. npm
  // PURLs identify the package release across tools and runs, while dependency
  // assertions remain distinct through their complete requirement/scope record.
  return findings;
};

const omitNonSemanticFileFields = (findings) => {
  for (const file of findings.files ?? []) {
    // ScanCode obtains classifications from host libmagic/filesystem state and
    // the date from the newly materialized scan tree. Neither describes the
    // authenticated archive bytes or a substantive legal finding.
    for (const field of SCANCODE_NON_SEMANTIC_FILE_FIELDS) {
      delete file[field];
    }
  }
  return findings;
};

export const canonicalizeScancodeFindings = (findings, { artifactId } = {}) => {
  if (!isObject(findings)) {
    throw new TypeError("ScanCode findings must be an object");
  }
  assertString(artifactId, "artifactId");
  const canonical = cloneEvidence(findings);
  if (
    canonical.artifactId !== undefined &&
    canonical.artifactId !== artifactId
  ) {
    throw new Error("ScanCode findings do not match their artifact identity");
  }
  canonical.artifactId = artifactId;
  if (!isObject(canonical.scanner)) {
    throw new Error("ScanCode findings must record their scanner");
  }
  if (
    canonical.scanner.normalizationVersion !== undefined &&
    canonical.scanner.normalizationVersion !== SCANCODE_NORMALIZATION_VERSION
  ) {
    throw new Error("Unsupported ScanCode normalization version");
  }
  canonical.scanner.normalizationVersion = SCANCODE_NORMALIZATION_VERSION;
  normalizePackageGraphIdentities(canonical);
  omitNonSemanticFileFields(canonical);
  return sortEvidenceCollections(canonical);
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
  if (header.options["--ignore"] !== undefined) {
    throw new Error("ScanCode path ignores are not permitted");
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
      .map(([key, value]) => [key, cloneEvidence(value)]),
  );
  normalizeCodebaseLocations(findings, inputRoot);
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

  return canonicalizeScancodeFindings(
    {
      artifactId,
      scanner: {
        name: SCANCODE_TOOL.name,
        version: SCANCODE_TOOL.version,
        outputFormatVersion: SCANCODE_OUTPUT_FORMAT_VERSION,
        normalizationVersion: SCANCODE_NORMALIZATION_VERSION,
        semanticOptions: SCANCODE_SEMANTIC_OPTIONS,
        preScanExcludedFileSuffixes: SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES,
        executionOptions: SCANCODE_EXECUTION_OPTIONS,
        message: header.message ?? null,
        warnings: header.warnings ?? [],
      },
      ...findings,
    },
    { artifactId },
  );
};
