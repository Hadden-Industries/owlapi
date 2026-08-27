import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import parseSpdxExpression from "spdx-expression-parse";
import { format as formatWithPrettier } from "prettier";
import { verifyEvidenceManifest } from "./third-party-evidence/evidence-manifest.mjs";

export const GENERATOR_VERSION = "3.0.0";

// Legal evidence must be byte-for-byte reproducible on every platform. JavaScript
// code-unit ordering avoids host locale and ICU-version differences.
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

// npm's @rubensworks/saxes tarball declares ISC in package metadata but omits
// its repository LICENSE file. Pinning the tagged upstream bytes closes that
// evidence gap without making ordinary generator checks network-dependent.
const EXTERNAL_LICENSE_EVIDENCE = new Map([
  [
    "node_modules/@rubensworks/saxes",
    [
      {
        url: "https://raw.githubusercontent.com/rubensworks/saxes/0f36739ccb43a87c50408e1e713382cda09e0b05/LICENSE",
        filename: "LICENSE",
        sha256:
          "0fac2374380621b22e6b50451057721a9c52935b02d16d106a9f04897f061d0e",
        observedOn: "2026-08-26",
        reason:
          "The installed npm tarball declares ISC but contains no top-level licence file; this is the exact licence at the immutable upstream commit behind v6.0.1.",
      },
    ],
  ],
]);

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  repositoryRoot,
  "docs/provenance/third-party-material.json",
);
const lockfilePath = resolve(repositoryRoot, "package-lock.json");
const packageJsonPath = resolve(repositoryRoot, "package.json");
const evidenceManifestPath = resolve(
  repositoryRoot,
  "docs/provenance/npm-package-evidence.json",
);
const evidenceRoot = resolve(repositoryRoot, "docs/provenance/evidence/npm");

const toRepositoryPath = (path) =>
  path
    .slice(repositoryRoot.length + 1)
    .split(sep)
    .join("/");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const normalizePerson = (person) => {
  if (typeof person === "string" && person.trim()) {
    return person.trim();
  }
  if (!person || typeof person !== "object") {
    return undefined;
  }
  const parts = [person.name, person.email, person.url].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : undefined;
};

const repositoryReference = (packageJson) => {
  const repository =
    typeof packageJson?.repository === "string"
      ? packageJson.repository
      : packageJson?.repository?.url;
  return typeof repository === "string" && repository.trim()
    ? repository.trim()
    : null;
};

const normalizeSourceUrl = (candidate) => {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return null;
  }
  let value = candidate.trim();
  const hostedShortcut = value.match(/^(?:github|gitlab|bitbucket):(.+)$/u);
  if (hostedShortcut) {
    const host = value.startsWith("github:")
      ? "github.com"
      : value.startsWith("gitlab:")
        ? "gitlab.com"
        : "bitbucket.org";
    value = `https://${host}/${hostedShortcut[1]}`;
  } else if (/^[^/:\s]+\/[^/\s]+$/u.test(value)) {
    value = `https://github.com/${value}`;
  } else if (/^git@[^:]+:/u.test(value)) {
    value = value.replace(/^git@([^:]+):/u, "https://$1/");
  } else {
    value = value
      .replace(/^git\+https:\/\//u, "https://")
      .replace(/^git:\/\//u, "https://")
      .replace(/^git\+ssh:\/\/git@/u, "https://")
      .replace(/^ssh:\/\/git@/u, "https://")
      .replace(/^http:\/\//u, "https://");
  }
  value = value.replace(/\.git(?=$|[#?])/u, "");
  return /^https:\/\//u.test(value) ? value : null;
};

const normalizeLicence = (value) => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return "NOASSERTION";
};

const validateSpdxExpression = (expression, subject) => {
  try {
    parseSpdxExpression(expression);
  } catch (error) {
    throw new Error(`Invalid SPDX expression for ${subject}: ${expression}`, {
      cause: error,
    });
  }
  return expression;
};

// This allowlist governs one narrow distribution relationship: npm installs
// these current runtime packages separately from owlapi. It is deliberately not
// represented as a universal legal compatibility ruling for AGPL distributions.
const SEPARATELY_INSTALLED_RUNTIME_LICENSES = new Set([
  "Apache-2.0",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);

const readEvidenceEnvelope = (reference, expectedKind, artifactId) => {
  const envelope = readJson(
    resolve(evidenceRoot, ...reference.path.split("/")),
  );
  if (
    envelope.schemaVersion !== 1 ||
    envelope.kind !== expectedKind ||
    envelope.artifactId !== artifactId
  ) {
    throw new Error(
      `Evidence envelope ${reference.path} is not bound to ${artifactId}/${expectedKind}`,
    );
  }
  return envelope.evidence;
};

const scanObservedLicences = (scan) =>
  [
    ...(scan.packages || []).map(
      ({ declared_license_expression_spdx: expression }) => expression,
    ),
    ...(scan.license_detections || []).map(
      ({ license_expression_spdx: expression }) => expression,
    ),
    ...(scan.files || []).map(
      ({ detected_license_expression_spdx: expression }) => expression,
    ),
  ]
    .filter((expression) => typeof expression === "string" && expression)
    .filter(
      (expression, index, expressions) =>
        expressions.indexOf(expression) === index,
    )
    .sort(compareCodeUnits);

const isSpdxExpression = (expression) => {
  try {
    parseSpdxExpression(expression);
    return true;
  } catch {
    return false;
  }
};

const artifactContext = (artifact) => ({
  artifact,
  archive: readEvidenceEnvelope(
    artifact.archive.evidence,
    "ARCHIVE_INVENTORY",
    artifact.artifactId,
  ),
  scan: readEvidenceEnvelope(
    artifact.scan.evidence,
    "SCANCODE_FINDINGS",
    artifact.artifactId,
  ),
});

const createComponentFacts = ({ occurrence, context, existingComponent }) => {
  const { artifact, archive, scan } = context;
  const packageJson = archive.packageMetadata;
  const lockfileDeclaredLicenseExpressions = artifact.lockfileLicenses;
  const rawTarballLicence = normalizeLicence(packageJson?.license);
  const tarballDeclaredLicenseExpression =
    rawTarballLicence === "NOASSERTION" ? null : rawTarballLicence;
  const scanObservedLicenseExpressions = scanObservedLicences(scan);
  const candidates = [
    ...lockfileDeclaredLicenseExpressions,
    tarballDeclaredLicenseExpression,
    ...scanObservedLicenseExpressions,
  ].filter(Boolean);
  const declaredLicenseExpression =
    candidates.find(isSpdxExpression) || "NOASSERTION";
  if (declaredLicenseExpression !== "NOASSERTION") {
    validateSpdxExpression(
      declaredLicenseExpression,
      `${artifact.name}@${artifact.version}`,
    );
  }
  // ScanCode observations include embedded third-party snippets and therefore
  // complement, rather than redefine, the package's declared licence. Only the
  // lockfile and authenticated package.json declarations are compared here.
  const distinctDeclarations = [
    ...new Set(
      [
        ...lockfileDeclaredLicenseExpressions,
        tarballDeclaredLicenseExpression,
      ].filter(Boolean),
    ),
  ];
  const licenseQualification =
    distinctDeclarations.length <= 1
      ? "LOCKFILE_TARBALL_AND_SCAN_EVIDENCE_AGREE"
      : `DECLARATION_MISMATCH: ${distinctDeclarations.join(" | ")}`;
  const relationship = occurrence.development
    ? "DEVELOPMENT_ONLY"
    : "EXTERNAL_RUNTIME_DEPENDENCY";
  const canPreserveConclusion =
    existingComponent?.name === artifact.name &&
    existingComponent?.version === artifact.version &&
    existingComponent?.declaredLicenseExpression ===
      declaredLicenseExpression &&
    isSpdxExpression(existingComponent?.concludedLicenseExpression);
  const concludedLicenseExpression = canPreserveConclusion
    ? existingComponent.concludedLicenseExpression
    : declaredLicenseExpression;
  const sourceReference = repositoryReference(packageJson);
  const sourceUrl = normalizeSourceUrl(
    sourceReference || packageJson?.homepage,
  );
  const distributionDisposition = canPreserveConclusion
    ? existingComponent.distributionDisposition
    : relationship === "DEVELOPMENT_ONLY"
      ? "DEVELOPMENT_ONLY_NOT_DISTRIBUTED"
      : SEPARATELY_INSTALLED_RUNTIME_LICENSES.has(concludedLicenseExpression)
        ? "ALLOWED_SEPARATELY_INSTALLED_EXTERNAL_RUNTIME"
        : "REQUIRES_HUMAN_REVIEW";
  const inspectedFiles = archive.evidenceFiles.map(
    ({ path, kind, sha256: digest, blob }) => ({
      path,
      kind,
      sha256: digest,
      blobSha256: blob.sha256,
      blobPath: blob.path,
    }),
  );
  const externalLicenseEvidence =
    EXTERNAL_LICENSE_EVIDENCE.get(occurrence.dependencyPath) || [];
  const hasLicenceFile = inspectedFiles.some(({ kind }) =>
    new Set(["LICENCE", "THIRD_PARTY_LICENCE"]).has(kind),
  );

  return {
    dependencyPath: occurrence.dependencyPath,
    artifactId: artifact.artifactId,
    name: artifact.name,
    version: artifact.version,
    relationship,
    lockfileDeclaredLicenseExpressions,
    tarballDeclaredLicenseExpression,
    scanObservedLicenseExpressions,
    declaredLicenseExpression,
    concludedLicenseExpression,
    licenseQualification,
    licenseConclusionRationale: canPreserveConclusion
      ? existingComponent.licenseConclusionRationale
      : "The conclusion selects the first SPDX-valid declaration in lockfile, authenticated tarball, then ScanCode order; every differing observation remains explicit for human review.",
    distributionDisposition,
    inspectionBasis: "LOCKED_REGISTRY_TARBALL",
    licenseFilePresence: hasLicenceFile
      ? "PRESENT"
      : externalLicenseEvidence.length > 0
        ? "EXTERNAL_EVIDENCE_ONLY"
        : "ABSENT",
    inspectedFiles,
    externalLicenseEvidence,
    authentication: {
      registrySignature: artifact.registrySignature.state,
      provenance: artifact.provenance.state,
      archive: artifact.archive.state,
      scan: artifact.scan.state,
    },
    artifactEvidence: {
      archiveSha256: artifact.archive.evidence.sha256,
      provenanceSha256: artifact.provenance.evidence.sha256,
      registrySignatureSha256: artifact.registrySignature.evidence.sha256,
      scanSha256: artifact.scan.evidence.sha256,
    },
    registryUrl: artifact.resolved,
    sourceReference,
    sourceUrl,
    packageAuthor: normalizePerson(packageJson?.author) || null,
    packageTarballScope: false,
    noticeDisposition:
      relationship === "EXTERNAL_RUNTIME_DEPENDENCY"
        ? "EXTERNAL_DEPENDENCY_RECORDED_NOT_PACKED"
        : "DEVELOPMENT_ONLY_RECORDED_NOT_PACKED",
    rationale:
      relationship === "EXTERNAL_RUNTIME_DEPENDENCY"
        ? "npm installs this authenticated component outside the owlapi tarball. Its own licence remains authoritative, while every downstream physical bundle must perform a separate distribution-scope review."
        : "This authenticated component belongs to the repository test, evidence, documentation, or release toolchain and is excluded from the owlapi tarball.",
    optional: occurrence.optional,
    platformSelectors: occurrence.platformSelectors,
  };
};

const walkFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareCodeUnits(left.name, right.name))
    .flatMap((entry) => {
      const absolutePath = resolve(directory, entry.name);
      return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
    });

const treeEvidence = (relativeRoot) => {
  const absoluteRoot = resolve(repositoryRoot, ...relativeRoot.split("/"));
  const entries = walkFiles(absoluteRoot).map((absolutePath) => ({
    path: toRepositoryPath(absolutePath),
    sha256: sha256(readFileSync(absolutePath)),
  }));
  const manifest = entries
    .map(({ path, sha256: digest }) => `${digest}  ${path}\n`)
    .join("");
  return {
    root: relativeRoot,
    fileCount: entries.length,
    manifestSha256: sha256(manifest),
  };
};

const evidenceFile = (relativePath) => ({
  path: relativePath,
  sha256: sha256(
    readFileSync(resolve(repositoryRoot, ...relativePath.split("/"))),
  ),
});

const countDeclaredLicences = (components) =>
  Object.fromEntries(
    [
      ...components.reduce((counts, { declaredLicenseExpression }) => {
        counts.set(
          declaredLicenseExpression,
          (counts.get(declaredLicenseExpression) || 0) + 1,
        );
        return counts;
      }, new Map()),
    ].sort(([left], [right]) => compareCodeUnits(left, right)),
  );

const licenseAssessment = ({
  scope,
  declaredLicenseExpression,
  concludedLicenseExpression = declaredLicenseExpression,
  licenseConclusionRationale,
  distributionDisposition,
}) => ({
  scope,
  declaredLicenseExpression: validateSpdxExpression(
    declaredLicenseExpression,
    scope,
  ),
  concludedLicenseExpression: validateSpdxExpression(
    concludedLicenseExpression,
    scope,
  ),
  licenseConclusionRationale,
  distributionDisposition,
});

const createMaterialFacts = () => [
  {
    id: "gnu-agpl-3.0-only-license-text",
    relationship: "EMBEDDED_OR_COPIED",
    name: "GNU Affero General Public License version 3 text",
    versionOrRevision: "AGPL-3.0-only SPDX canonical text observed 2026-08-26",
    licenseAssessments: [
      licenseAssessment({
        scope: "Unmodified package licence notice",
        declaredLicenseExpression: "AGPL-3.0-only",
        licenseConclusionRationale:
          "The retained LICENSE bytes are the canonical AGPL-3.0-only text identified by the package manifest.",
        distributionDisposition: "PACKED_UNDER_RECORDED_BASIS",
      }),
    ],
    sourceUrl:
      "https://raw.githubusercontent.com/spdx/license-list-data/main/text/AGPL-3.0-only.txt",
    evidenceFiles: [evidenceFile("LICENSE")],
    treeEvidence: null,
    attributionText: [
      "The unmodified licence text is redistributed as the legal notice governing package-owned material.",
    ],
    packageTarballScope: true,
    deployedApplicationScope: "REVIEW_REQUIRED_BY_CONSUMER",
    noticeDisposition: "PACKED_AS_LICENSE",
    rationale:
      "The LICENSE bytes are pinned separately from implementation and are required in the npm tarball.",
  },
  {
    id: "apache-2.0-license-text",
    relationship: "EMBEDDED_OR_COPIED",
    name: "Apache License version 2.0 text",
    versionOrRevision:
      "Authoritative Apache License 2.0 text retrieved 2026-08-26; wording matches OWLAPI 5.5.1 at d7e997a53b470e32700de89cc610d9daf01ea769",
    licenseAssessments: [
      licenseAssessment({
        scope: "Unmodified Apache License 2.0 wording",
        declaredLicenseExpression: "Apache-2.0",
        licenseConclusionRationale:
          "The packed file is byte-identical to the authoritative Apache License 2.0 text; the pinned Java OWLAPI source contains the same wording without the terminal LF.",
        distributionDisposition: "PACKED_UNDER_RECORDED_BASIS",
      }),
    ],
    sourceUrl: "https://www.apache.org/licenses/LICENSE-2.0.txt",
    evidenceFiles: [evidenceFile("LICENSES/Apache-2.0.txt")],
    treeEvidence: null,
    attributionText: [
      "The complete Apache License 2.0 text accompanies the elected licence basis for the packed Java OWLAPI compatibility facts.",
    ],
    packageTarballScope: true,
    deployedApplicationScope: "REVIEW_REQUIRED_BY_CONSUMER",
    noticeDisposition: "PACKED_AS_THIRD_PARTY_LICENSE",
    rationale:
      "The separately classified licence text accompanies the compatibility metadata without being conflated with its generated or project-authored expression.",
  },
  {
    id: "java-owlapi-api-identity-metadata",
    relationship: "GENERATED_FROM_THIRD_PARTY",
    name: "Java OWLAPI public API identity inventory",
    versionOrRevision:
      "OWLAPI 5.5.1 at d7e997a53b470e32700de89cc610d9daf01ea769",
    licenseAssessments: [
      licenseAssessment({
        scope: "Java OWLAPI public API identity and declaration facts",
        declaredLicenseExpression: "Apache-2.0 OR LGPL-3.0",
        concludedLicenseExpression: "Apache-2.0",
        licenseConclusionRationale:
          "The package elects the Apache-2.0 alternative declared by the pinned Java OWLAPI source for the public API identity and declaration facts distributed in the compatibility views.",
        distributionDisposition: "PACKED_UNDER_RECORDED_BASIS",
      }),
      licenseAssessment({
        scope: "Project-authored compatibility analysis and mappings",
        declaredLicenseExpression: "AGPL-3.0-only",
        licenseConclusionRationale:
          "The independently authored analysis and mapping expression is package-owned material under the package licence.",
        distributionDisposition: "PACKED_UNDER_RECORDED_BASIS",
      }),
    ],
    sourceUrl:
      "https://github.com/owlcs/owlapi/tree/d7e997a53b470e32700de89cc610d9daf01ea769",
    evidenceFiles: [
      evidenceFile("API.md"),
      evidenceFile("docs/compatibility/java-api-surface.json"),
      evidenceFile("docs/compatibility/java-api-surface.md"),
    ],
    treeEvidence: null,
    attributionText: [
      "Java OWLAPI public package/type/declaration identities are attributed to the owlcs/owlapi project and its contributors.",
      "The Apache-2.0 alternative is elected for those compatibility facts, and its complete text is packed at LICENSES/Apache-2.0.txt.",
      "owlapi is independently maintained and is not affiliated with or endorsed by the Java OWLAPI project.",
    ],
    packageTarballScope: true,
    deployedApplicationScope: "REVIEW_REQUIRED_BY_CONSUMER",
    noticeDisposition: "ATTRIBUTION_IN_PACKED_NOTICE",
    rationale:
      "Generated output is limited to public API identity/declaration facts and independently authored mappings; no Java implementation body or copied Java documentation is distributed.",
  },
  {
    id: "contributor-covenant-3.0",
    relationship: "EMBEDDED_OR_COPIED",
    name: "Contributor Covenant",
    versionOrRevision: "3.0",
    licenseAssessments: [
      licenseAssessment({
        scope: "Adapted repository Code of Conduct",
        declaredLicenseExpression: "CC-BY-SA-4.0",
        licenseConclusionRationale:
          "The retained policy identifies Contributor Covenant 3.0 and its CC BY-SA 4.0 terms.",
        distributionDisposition: "REPOSITORY_ONLY_NOT_IN_PACKAGE",
      }),
    ],
    sourceUrl: "https://www.contributor-covenant.org/version/3/0/",
    evidenceFiles: [evidenceFile("CODE_OF_CONDUCT.md")],
    treeEvidence: null,
    attributionText: [
      "Contributor Covenant is stewarded by the Organization for Ethical Source.",
      "The adapted policy retains the permanent version URL and CC BY-SA 4.0 attribution.",
    ],
    packageTarballScope: false,
    deployedApplicationScope: "NOT_APPLICABLE",
    noticeDisposition: "ATTRIBUTION_IN_REPOSITORY_POLICY",
    rationale:
      "The adapted Code of Conduct is repository governance and is deliberately excluded from the npm tarball.",
  },
  {
    id: "w3c-rdf-tests",
    relationship: "EMBEDDED_OR_COPIED",
    name: "W3C RDF test suites",
    versionOrRevision:
      "RDF/XML ad541a5f0479f0798608c4801369d97b8e08b36f; Turtle, TriG, N-Triples, and N-Quads 12774b0ebb385d17651b396654b19254d0fefbfa",
    licenseAssessments: [
      licenseAssessment({
        scope: "Pinned W3C RDF test-suite files",
        declaredLicenseExpression: "W3C-20150513 OR BSD-3-Clause",
        licenseConclusionRationale:
          "The conclusion preserves the W3C test-suite dual-licensing expression recorded by the retained upstream evidence.",
        distributionDisposition: "REPOSITORY_ONLY_NOT_IN_PACKAGE",
      }),
    ],
    sourceUrl: "https://github.com/w3c/rdf-tests",
    evidenceFiles: [
      evidenceFile("docs/conformance/upstream/w3c-rdf-tests/LICENSE.md"),
    ],
    treeEvidence: treeEvidence("docs/conformance/upstream/w3c-rdf-tests"),
    attributionText: [
      "W3C RDF test-suite files retained at the exact format-specific revisions recorded in docs/conformance/suites.json.",
    ],
    packageTarballScope: false,
    deployedApplicationScope: "NOT_APPLICABLE",
    noticeDisposition: "REPOSITORY_ONLY_RETAINED_LICENSE_SOURCE_AND_REVISION",
    rationale:
      "These copied tests provide release-relevant standards evidence but are excluded from the npm tarball and deployed application.",
  },
  {
    id: "w3c-json-ld-api-tests",
    relationship: "EMBEDDED_OR_COPIED",
    name: "W3C JSON-LD API test suite",
    versionOrRevision: "ffdb326121ea89b7b8280e76a5caea923834bcef",
    licenseAssessments: [
      licenseAssessment({
        scope: "Pinned W3C JSON-LD API test-suite files",
        declaredLicenseExpression: "W3C-20150513 OR BSD-3-Clause",
        licenseConclusionRationale:
          "The conclusion preserves the dual-licensing expression in the suite's retained LICENSE.md.",
        distributionDisposition: "REPOSITORY_ONLY_NOT_IN_PACKAGE",
      }),
    ],
    sourceUrl: "https://github.com/w3c/json-ld-api",
    evidenceFiles: [
      evidenceFile(
        "docs/conformance/upstream/w3c-json-ld-api/tests/LICENSE.md",
      ),
    ],
    treeEvidence: treeEvidence("docs/conformance/upstream/w3c-json-ld-api"),
    attributionText: [
      "The JSON-LD Test Suite uses the W3C test-suite dual-licensing approach identified in its retained LICENSE.md.",
    ],
    packageTarballScope: false,
    deployedApplicationScope: "NOT_APPLICABLE",
    noticeDisposition: "REPOSITORY_ONLY_RETAINED_LICENSE_AND_REVISION",
    rationale:
      "The copied test suite provides release-relevant JSON-LD evidence and is excluded from the npm tarball and deployed application.",
  },
  {
    id: "w3c-owl2-test-artifact",
    relationship: "EMBEDDED_OR_COPIED",
    name: "W3C OWL 2 conformance test artifact",
    versionOrRevision:
      "sha256:986ce4f9df655b1f44aec86a5753530d295355a8e9a16700e0253ac30759c4e1; recovered from OWLAPI 5.5.1 revision d7e997a53b470e32700de89cc610d9daf01ea769",
    licenseAssessments: [
      licenseAssessment({
        scope: "Recovered W3C OWL 2 conformance test artifact",
        declaredLicenseExpression: "W3C-20150513 OR BSD-3-Clause",
        licenseConclusionRationale:
          "The conclusion preserves the W3C test-suite licensing classification recorded with the recovered artifact's source and digest.",
        distributionDisposition: "REPOSITORY_ONLY_NOT_IN_PACKAGE",
      }),
    ],
    sourceUrl: "https://www.w3.org/2007/OWL/wiki/Test_Suite_Status",
    evidenceFiles: [
      evidenceFile("docs/conformance/upstream/w3c-owl2/README.md"),
    ],
    treeEvidence: treeEvidence("docs/conformance/upstream/w3c-owl2"),
    attributionText: [
      "W3C OWL 2 test-suite material retained for standards conformance evidence; the recovery path and digest are recorded in docs/conformance/suites.json.",
    ],
    packageTarballScope: false,
    deployedApplicationScope: "NOT_APPLICABLE",
    noticeDisposition:
      "REPOSITORY_ONLY_RETAINED_LICENSE_SOURCE_REVISION_AND_DIGEST",
    rationale:
      "The artifact is development/test evidence and is excluded from the npm tarball and deployed application.",
  },
  {
    id: "generated-w3c-conformance-manifests",
    relationship: "GENERATED_FROM_THIRD_PARTY",
    name: "Project-generated W3C conformance manifests",
    versionOrRevision:
      "Derived from the pinned W3C revisions in docs/conformance/suites.json",
    licenseAssessments: [
      licenseAssessment({
        scope: "Upstream-derived W3C test identities and metadata",
        declaredLicenseExpression: "W3C-20150513 OR BSD-3-Clause",
        licenseConclusionRationale:
          "Upstream test identities retain the dual-licensing expression of the pinned W3C suites from which they are derived.",
        distributionDisposition: "REPOSITORY_ONLY_NOT_IN_PACKAGE",
      }),
      licenseAssessment({
        scope:
          "Project-authored classifications, exclusions, and execution metadata",
        declaredLicenseExpression: "AGPL-3.0-only",
        licenseConclusionRationale:
          "The generator logic and added project classifications are independently authored package-project material.",
        distributionDisposition: "REPOSITORY_ONLY_NOT_IN_PACKAGE",
      }),
    ],
    sourceUrl: "https://github.com/w3c",
    evidenceFiles: [],
    treeEvidence: treeEvidence("docs/conformance/generated"),
    attributionText: [
      "Generated manifests preserve upstream test identities and add project-owned classifications, exclusions, and execution metadata.",
    ],
    packageTarballScope: false,
    deployedApplicationScope: "NOT_APPLICABLE",
    noticeDisposition: "REPOSITORY_ONLY_SOURCE_AND_GENERATOR_ATTRIBUTION",
    rationale:
      "The generated records are release-relevant test evidence but are excluded from package and deployment bytes.",
  },
  {
    id: "java-owlapi-reference-fixtures",
    relationship: "GENERATED_FROM_THIRD_PARTY",
    name: "Java OWLAPI behavioral reference fixtures",
    versionOrRevision:
      "OWLAPI 5.5.1 at d7e997a53b470e32700de89cc610d9daf01ea769",
    licenseAssessments: [
      licenseAssessment({
        scope: "Observable Java OWLAPI behavior and source provenance",
        declaredLicenseExpression: "Apache-2.0 OR LGPL-3.0",
        licenseConclusionRationale:
          "The conclusion preserves the dual-licence expression declared by the pinned Java implementation used as a behavioral oracle.",
        distributionDisposition: "REPOSITORY_ONLY_NOT_IN_PACKAGE",
      }),
      licenseAssessment({
        scope:
          "Project-authored harnesses, classifications, and serialized observations",
        declaredLicenseExpression: "AGPL-3.0-only",
        licenseConclusionRationale:
          "The harnesses and clean-room behavioral classifications are independently authored project material.",
        distributionDisposition: "REPOSITORY_ONLY_NOT_IN_PACKAGE",
      }),
    ],
    sourceUrl:
      "https://github.com/owlcs/owlapi/tree/d7e997a53b470e32700de89cc610d9daf01ea769",
    evidenceFiles: [
      evidenceFile("docs/compatibility/krss1-behavioral-oracle.json"),
    ],
    treeEvidence: treeEvidence("util/owlapi-reference/fixtures"),
    attributionText: [
      "Fixtures record selected observable Java OWLAPI behavior generated by project-owned harnesses; they do not copy Java implementation bodies.",
    ],
    packageTarballScope: false,
    deployedApplicationScope: "NOT_APPLICABLE",
    noticeDisposition: "REPOSITORY_ONLY_SOURCE_REVISION_AND_METHOD_ATTRIBUTION",
    rationale:
      "Behavioral oracle output is kept on the characterization side of the clean implementation boundary and is excluded from package and deployment bytes.",
  },
];

const createInventory = async () => {
  const lockfileBytes = readFileSync(lockfilePath);
  const lockfile = JSON.parse(lockfileBytes.toString("utf8"));
  const rootPackage = lockfile.packages[""];
  const packageManifest = readJson(packageJsonPath);
  const evidenceManifestBytes = readFileSync(evidenceManifestPath);
  const evidenceManifest = JSON.parse(evidenceManifestBytes.toString("utf8"));
  await verifyEvidenceManifest({
    manifest: evidenceManifest,
    lockfileBytes,
    blobRoot: evidenceRoot,
  });
  const existing = existsSync(outputPath) ? readJson(outputPath) : undefined;
  const existingByPath = new Map(
    (existing?.components || []).map((component) => [
      component.dependencyPath,
      component,
    ]),
  );
  const contextByArtifact = new Map(
    evidenceManifest.artifacts.map((artifact) => [
      artifact.artifactId,
      artifactContext(artifact),
    ]),
  );
  const componentFacts = evidenceManifest.occurrences
    .map((occurrence) =>
      createComponentFacts({
        occurrence,
        context: contextByArtifact.get(occurrence.artifactId),
        existingComponent: existingByPath.get(occurrence.dependencyPath),
      }),
    )
    .sort((left, right) =>
      compareCodeUnits(left.dependencyPath, right.dependencyPath),
    );
  const materialFacts = createMaterialFacts().sort((left, right) =>
    compareCodeUnits(left.id, right.id),
  );
  const bundledDeclaration =
    packageManifest.bundleDependencies ?? packageManifest.bundledDependencies;
  const manifestRequestsBundling =
    bundledDeclaration === true ||
    (Array.isArray(bundledDeclaration) && bundledDeclaration.length > 0);
  const lockfileMarksBundledContent = Object.entries(lockfile.packages).some(
    ([dependencyPath, lockEntry]) =>
      dependencyPath.length > 0 && lockEntry.inBundle === true,
  );
  const packageFacts = {
    name: rootPackage.name,
    version: rootPackage.version,
    lockfile: "package-lock.json",
    lockfileVersion: lockfile.lockfileVersion,
    lockfileSha256: sha256(lockfileBytes),
    evidenceManifest: "docs/provenance/npm-package-evidence.json",
    evidenceManifestSha256: sha256(evidenceManifestBytes),
    evidenceCorpusRoot: evidenceManifest.corpusRoot,
    tarballDependenciesBundled:
      manifestRequestsBundling || lockfileMarksBundledContent,
  };
  const productionComponents = componentFacts.filter(
    ({ relationship }) => relationship === "EXTERNAL_RUNTIME_DEPENDENCY",
  );
  const developmentComponents = componentFacts.filter(
    ({ relationship }) => relationship === "DEVELOPMENT_ONLY",
  );
  const uniqueInspectedFiles = [
    ...new Map(
      componentFacts.flatMap(({ artifactId, inspectedFiles }) =>
        inspectedFiles.map((file) => [`${artifactId}:${file.path}`, file]),
      ),
    ).values(),
  ];
  const isLicenceEvidence = ({ kind }) =>
    new Set(["LICENCE", "THIRD_PARTY_LICENCE"]).has(kind);
  const summary = {
    componentCount: componentFacts.length,
    artifactCount: evidenceManifest.summary.artifactCount,
    productionComponentCount: productionComponents.length,
    developmentComponentCount: developmentComponents.length,
    authenticatedTarballArtifactCount:
      evidenceManifest.summary.archiveVerifiedCount,
    registrySignatureVerifiedArtifactCount:
      evidenceManifest.summary.registrySignatureVerifiedCount,
    provenanceVerifiedArtifactCount:
      evidenceManifest.summary.provenanceVerifiedCount,
    provenanceNotPublishedArtifactCount:
      evidenceManifest.summary.provenanceNotPublishedCount,
    scanVerifiedArtifactCount: evidenceManifest.summary.scanVerifiedCount,
    evidenceBlobCount: evidenceManifest.summary.blobCount,
    evidenceRetainedBytes: evidenceManifest.summary.retainedBytes,
    inspectedLicenceFileCount:
      uniqueInspectedFiles.filter(isLicenceEvidence).length,
    inspectedNoticeFileCount: uniqueInspectedFiles.filter(
      (file) => !isLicenceEvidence(file),
    ).length,
    productionInspectedLicenceFileCount: productionComponents.flatMap(
      ({ inspectedFiles }) => inspectedFiles.filter(isLicenceEvidence),
    ).length,
    productionInspectedNoticeFileCount: productionComponents.flatMap(
      ({ inspectedFiles }) =>
        inspectedFiles.filter((file) => !isLicenceEvidence(file)),
    ).length,
    productionComponentsWithoutInspectedLicence: productionComponents
      .filter(({ inspectedFiles }) => !inspectedFiles.some(isLicenceEvidence))
      .map(({ dependencyPath }) => dependencyPath),
    productionComponentsWithoutLicenceEvidence: productionComponents
      .filter(
        ({ inspectedFiles, externalLicenseEvidence }) =>
          !inspectedFiles.some(isLicenceEvidence) &&
          externalLicenseEvidence.length === 0,
      )
      .map(({ dependencyPath }) => dependencyPath),
    licenceDeclarationMismatchCount: componentFacts.filter(
      ({ licenseQualification }) =>
        licenseQualification.startsWith("DECLARATION_MISMATCH"),
    ).length,
    noAssertionCount: componentFacts.filter(
      ({ declaredLicenseExpression }) =>
        declaredLicenseExpression === "NOASSERTION",
    ).length,
    declaredLicenseCounts: countDeclaredLicences(componentFacts),
    productionDeclaredLicenseCounts:
      countDeclaredLicences(productionComponents),
    developmentDeclaredLicenseCounts: countDeclaredLicences(
      developmentComponents,
    ),
    materialCount: materialFacts.length,
  };
  const factsSha256 = sha256(
    stableJson({
      package: packageFacts,
      summary,
      components: componentFacts,
      materials: materialFacts,
    }),
  );

  // A review attests to one exact machine-generated fact set. Any dependency,
  // evidence-file, or scope change alters this digest and deliberately returns
  // the inventory to a human-review gate instead of carrying approval forward.
  const review =
    existing?.review?.factsSha256 === factsSha256
      ? existing.review
      : {
          status: "PENDING_HUMAN_REVIEW",
          factsSha256,
          reviewer: null,
          reviewedOn: null,
          capacity: null,
          conclusion: null,
        };
  return {
    $schema: "./third-party-material.schema.json",
    schemaVersion: 2,
    generatedBy: {
      path: "util/generate-third-party-material.mjs",
      version: GENERATOR_VERSION,
      authorities: [
        "package-lock.json and the authenticated npm package evidence corpus for exact dependency occurrences, tarball identities, recursive legal files, registry signatures, provenance, and ScanCode observations",
        "docs/provenance/npm-package-evidence.json plus its content-addressed blobs as the platform-independent authority for every required and optional npm artifact",
        "docs/conformance/suites.json and retained upstream trees for copied/generated standards-test provenance",
        "one atomic human review of the generated root facts digest",
      ],
    },
    package: packageFacts,
    review,
    summary,
    components: componentFacts,
    materials: materialFacts,
  };
};

const requestedWrite = process.argv.slice(2).includes("--write");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--write");
if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}

// The facts digest uses stable JSON member ordering; the checked-in artifact is
// additionally rendered by the repository formatter so generation and the
// formatting gate have one canonical representation instead of fighting.
const expected = await formatWithPrettier(stableJson(await createInventory()), {
  parser: "json",
});
if (requestedWrite) {
  writeFileSync(outputPath, expected, "utf8");
  process.stdout.write(`Wrote ${toRepositoryPath(outputPath)}\n`);
} else {
  if (!existsSync(outputPath)) {
    throw new Error(
      "docs/provenance/third-party-material.json is missing; run this generator with --write",
    );
  }
  const actual = readFileSync(outputPath, "utf8");
  if (actual !== expected) {
    throw new Error(
      "docs/provenance/third-party-material.json is stale; review the changed facts and regenerate with --write",
    );
  }
  process.stdout.write("Third-party material inventory is current.\n");
}
