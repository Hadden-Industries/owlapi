import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
const workspace = process.argv[2];
if (!workspace)
  throw new Error(
    "Usage: record-released-oracle-evidence.mjs QUALIFICATION_WORKSPACE",
  );
const root = path
  .resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
  .split(path.sep)
  .join("/");
const destination = root + "/docs/compatibility/profiles/java-owlapi-5.5.1";
const provenance = JSON.parse(
  fs.readFileSync(destination + "/provenance.json"),
);
if (provenance.qualification.status === "qualified")
  throw new Error(
    "Qualified provenance is immutable; create a separately reviewed observation record",
  );
const jsonOptions = {
  ...(await resolveConfig(destination + "/provenance.json")),
  parser: "json",
};
const writeJson = async (path, value) =>
  fs.writeFileSync(path, await format(JSON.stringify(value), jsonOptions));
fs.mkdirSync(destination + "/evidence", { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalize = (text) => {
  for (const [absolute, placeholder] of [
    [path.resolve(workspace), "${QUALIFICATION_WORKSPACE}"],
    [root, "${OWLAPI_SOURCE}"],
    [process.env.USERPROFILE, "${USER_PROFILE}"],
  ]) {
    if (!absolute) continue;
    text = text.replaceAll(absolute.replaceAll("\\", "/"), placeholder);
    let escaped = absolute.replaceAll("/", "\\");
    // Browser diagnostics can themselves contain a JSON-encoded log string.
    for (let nesting = 0; nesting < 3; nesting += 1) {
      text = text.replaceAll(escaped, placeholder);
      escaped = escaped.replaceAll("\\", "\\\\");
    }
  }
  return text;
};
const evidence = [];
async function preserve(source, target) {
  const bytes = fs.readFileSync(workspace + "/" + source);
  const normalized = normalize(bytes.toString("utf8")).replaceAll("\r\n", "\n");
  const portable = Buffer.from(
    target.endsWith(".json")
      ? await format(normalized, jsonOptions)
      : normalized,
  );
  fs.writeFileSync(destination + "/" + target, portable);
  evidence.push({
    path: target,
    sha256: hash(portable),
    byteLength: portable.length,
    originalSha256: hash(bytes),
  });
}
for (const [source, target] of [
  ["central-probes/observations.json", "central-observations.json"],
  ["source-probes/observations.json", "source-observations.json"],
  [
    "javascript-baseline/observations.json",
    "javascript-baseline-observations.json",
  ],
  ["oracle/java-dependencies.lock.json", "java-dependencies.lock.json"],
  ["oracle/probe-comparison.json", "behavior-comparison.json"],
  ["oracle/behavior-contracts.txt", "evidence/behavior-contracts.txt"],
  ["oracle/jar-comparison.json", "evidence/jar-comparison.json"],
  ["oracle/tool-identities.json", "evidence/tool-identities.json"],
  ["oracle/effective-source-pom.xml", "evidence/effective-source-pom.xml"],
  ["oracle/plugins.txt", "evidence/plugins.txt"],
  ["oracle/active-profiles.txt", "evidence/active-profiles.txt"],
  ["source-build.log", "evidence/source-build.log"],
  ["offline-source-build.log", "evidence/offline-source-build.log"],
  ["oracle/resolve.log", "evidence/resolve.log"],
  ["oracle/jar-signature.log", "evidence/jar-signature.log"],
  ["oracle/pom-signature.log", "evidence/pom-signature.log"],
  ["oracle/signing-key.asc", "evidence/signing-key.asc"],
  ["oracle/owlapi-distribution-5.5.1.jar.asc", "evidence/distribution.jar.asc"],
  ["oracle/owlapi-distribution-5.5.1.pom.asc", "evidence/distribution.pom.asc"],
  ["oracle/runtime-tree.json", "evidence/runtime-tree.json"],
])
  await preserve(source, target);
const tools = JSON.parse(
  fs.readFileSync(workspace + "/oracle/tool-identities.json"),
);
const comparison = JSON.parse(
  fs.readFileSync(workspace + "/oracle/jar-comparison.json"),
);
provenance.qualification = {
  status: "unqualified",
  completedAt: null,
  evidenceManifestPath: "evidence-manifest.json",
};
for (const artifact of provenance.mavenCentral.artifacts) {
  const file =
    workspace +
    "/repository/net/sourceforge/owlapi/owlapi-distribution/5.5.1/owlapi-distribution-5.5.1." +
    artifact.artifactType;
  const bytes = fs.readFileSync(file);
  artifact.byteLength = bytes.length;
  artifact.sha256 = hash(bytes);
  artifact.signature = {
    verificationStatus: "verified",
    signerFingerprint: "C55B55B3B376584205FC74019B12DCAC50DE39AB",
    verificationEvidencePath:
      "evidence/" + artifact.artifactType + "-signature.log",
    signerTrustDecisionReference: "README.md#provenance-admission",
  };
}
provenance.mavenCentral.dependencyLock.sha256 = hash(
  fs.readFileSync(destination + "/java-dependencies.lock.json"),
);
provenance.mavenCentral.dependencyLock.oracleExecutionClosureStatus =
  "complete";
provenance.mavenCentral.dependencyLock.sourceBuildClosureStatus = "complete";
provenance.toolchain = {
  jdk: {
    distributionName: "Eclipse Temurin",
    version: "25.0.4.1+1-LTS",
    distributionArchiveSha256: null,
    installationIdentityEvidencePath: "evidence/tool-identities.json",
  },
  maven: {
    version: "3.9.15",
    distributionArchiveSha256: tools.mavenArchiveSha256,
  },
  operatingSystem: {
    name: "Windows 11",
    version: "10.0",
    architecture: "amd64",
  },
};
const sourceArgs = [
  "-B",
  "-ntp",
  "-s",
  "${OWLAPI_SOURCE}/util/owlapi-reference/reference-reuse-settings.xml",
  "-gs",
  "${OWLAPI_SOURCE}/util/owlapi-reference/reference-reuse-settings.xml",
  "-Dmaven.repo.local=${QUALIFICATION_WORKSPACE}/repository",
  "-f",
  "${QUALIFICATION_WORKSPACE}/source/pom.xml",
  "-pl",
  "distribution",
  "-am",
  "-Dmaven.test.skip=true",
  "-Dno-javadoc=true",
  "package",
  "org.apache.maven.plugins:maven-dependency-plugin:3.11.0:build-classpath",
  "-DincludeScope=runtime",
  "-Dmdep.outputFile=target/owlapi-runtime-classpath.txt",
];
provenance.sourceBuild.checkoutVerificationStatus = "clean";
provenance.sourceBuild.dependencyResolutionMode = "online-with-offline-replay";
provenance.sourceBuild.invocation = {
  executable: "mvn",
  arguments: sourceArgs,
  workingDirectory: "${OWLAPI_SOURCE}",
  environment: {},
};
provenance.sourceBuild.artifactComparison = {
  centralJarSha256: comparison.centralJarSha256,
  rebuiltJarSha256: comparison.rebuiltJarSha256,
  areJarsByteIdentical: false,
  byteDifferenceExplanation: "README.md#source-build-comparison",
  behavioralComparisonEvidencePath: "behavior-comparison.json",
};
const fixturePaths = [
  "util/owlapi-reference/replay-behavior-research.mjs",
  "util/owlapi-reference/ObserveBehaviorContracts.java",
  "util/owlapi-reference/compare-behavior-observations.mjs",
  "util/owlapi-reference/ObserveMutationContracts.java",
  "util/owlapi-reference/validate-released-oracle.mjs",
  "util/owlapi-reference/record-released-oracle-evidence.mjs",
  "docs/compatibility/research/java-api-behavior/2026-10-13-owlapi-api-behavior-evidence.json",
  "docs/compatibility/research/java-api-behavior/2026-10-13-owlapi-api-behavior-gap-closure-evidence.json",
];
const fixtures = fixturePaths.map((file) => ({
  path: path
    .relative(destination, root + "/" + file)
    .split(path.sep)
    .join("/"),
  sha256: hash(fs.readFileSync(root + "/" + file)),
}));
await writeJson(destination + "/fixture-manifest.json", {
  schemaVersion: 1,
  fixtures,
});
provenance.oracle = {
  harnessSourceCommitObjectId: null,
  fixtureManifestSha256: hash(
    fs.readFileSync(destination + "/fixture-manifest.json"),
  ),
  observationManifestSha256: hash(
    fs.readFileSync(destination + "/central-observations.json"),
  ),
  invocation: {
    executable: "node",
    arguments: [
      "util/owlapi-reference/replay-behavior-research.mjs",
      "${QUALIFICATION_WORKSPACE}/oracle/classpath.txt",
      "${QUALIFICATION_WORKSPACE}/central-probes",
    ],
    workingDirectory: ".",
    environment: {},
  },
  classpathLockSha256: provenance.mavenCentral.dependencyLock.sha256,
};
await writeJson(destination + "/provenance.json", provenance);
await writeJson(destination + "/evidence-manifest.json", {
  schemaVersion: 1,
  evidence,
});
process.stdout.write(
  JSON.stringify({
    files: evidence.length,
    qualification: provenance.qualification.status,
  }) + "\n",
);
