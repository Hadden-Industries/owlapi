import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceFingerprint } from "../../scripts/ci-check-coverage.mjs";
import Ajv from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(readFileSync(join(here, "pinned-version.json"), "utf8"));
const settings = join(here, "reference-reuse-settings.xml");
const toolchains = join(here, "reference-empty-toolchains.xml");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digestSchema = { type: "string", pattern: "^[a-f0-9]{64}$" };
const environmentFields = [
  "runtime",
  "java.version",
  "java.vendor",
  "java.vm.name",
  "java.vm.version",
  "os.name",
  "os.version",
  "os.arch",
  "file.encoding",
  "native.encoding",
  "stdout.encoding",
  "stderr.encoding",
  "locale",
  "timezone",
];
const validateInputs = new Ajv({ strict: true }).compile({
  type: "object",
  additionalProperties: false,
  required: [
    "sourceCommit",
    "sourceTree",
    "externalSha256",
    "runtimeGraphSha256",
    "mavenDistributionSha256",
    "jdkDistributionSha256",
    "environment",
    "host",
  ],
  properties: {
    sourceCommit: { const: "d7e997a53b470e32700de89cc610d9daf01ea769" },
    sourceTree: { const: "8f871bacef5ab767afda979e60b1a1e0c98d6323" },
    externalSha256: digestSchema,
    runtimeGraphSha256: digestSchema,
    mavenDistributionSha256: digestSchema,
    jdkDistributionSha256: digestSchema,
    environment: {
      type: "object",
      additionalProperties: false,
      required: environmentFields,
      properties: Object.fromEntries(
        environmentFields.map((name) => [
          name,
          { type: "string", minLength: 1, maxLength: 256, pattern: "^[ -~]+$" },
        ]),
      ),
    },
    host: {
      type: "object",
      additionalProperties: false,
      required: ["os", "architecture", "image", "imageVersion"],
      properties: {
        os: { enum: ["Linux", "Windows"] },
        architecture: { const: "X64" },
        image: { enum: ["ubuntu24", "LOCAL_WINDOWS_EXPERIMENT"] },
        imageVersion: { type: "string", minLength: 1, maxLength: 64 },
      },
    },
  },
});

/** The recipe is qualified only for this pinned upstream tree. Any source/policy
 * change requires a new native preparation/build-closure comparison. The signature
 * is an explicit plugin input declared by upstream pom.xml, not a transitive lock.
 */
export const REFERENCE_RECIPE = Object.freeze({
  version: 1,
  sourceCommit: pin.sourceRevision,
  sourceTree: "8f871bacef5ab767afda979e60b1a1e0c98d6323",
  maven: "3.10.0",
  mavenZipSha512:
    "22d31676d5b92ed53308c19ecded3245d0efd0cddfec51ec7bab62f4f13ad70ddddceff8e62940e0e8e2421f3cde8106737f4becec0aa034ffeff2a754e88337",
  help: "org.apache.maven.plugins:maven-help-plugin:3.5.2",
  dependency: "org.apache.maven.plugins:maven-dependency-plugin:3.11.0",
  declaredSignature: "org.codehaus.mojo.signature:java18:1.0:signature",
  // The qualified preparation can otherwise observe this tool input only on
  // some cold runs. Resolve the conservative union; never erase a native input.
  preparationSupplement: "org.slf4j:jcl-over-slf4j:1.7.32:jar",
  repository: "https://repo.maven.apache.org/maven2",
  nativeSummary:
    "checksums-central-8fac3ebd6edbaca3c794783fa38088af0aa128e7.sha512",
  environmentPolicy: "EXACT_IMAGE_CONTROLLED_JVM_V1",
  crossImageEquivalence: false,
});

export const REFERENCE_JVM_OPTIONS = Object.freeze([
  "-Duser.language=en",
  "-Duser.country=GB",
  "-Duser.timezone=UTC",
  "-Dfile.encoding=UTF-8",
  "-Dstdout.encoding=UTF-8",
  "-Dstderr.encoding=UTF-8",
]);

/** Pure argv composition: native Maven owns resolution/model/plugin semantics. */
export function referenceBuildRecipe({
  localRepository,
  userHome,
  reportsDirectory,
  summaryDirectory,
}) {
  const common = [
    "-B",
    "-ntp",
    "-s",
    settings,
    "-gs",
    settings,
    "-t",
    toolchains,
    "-gt",
    toolchains,
    `-Dmaven.repo.local=${resolve(localRepository)}`,
    `-Duser.home=${resolve(userHome)}`,
    "-Dmaven.test.skip=true",
    "-Dno-javadoc=true",
  ];
  const reactor = ["-pl", "distribution", "-am"];
  const recording = [
    "-Daether.checksums.checksumAlgorithms=SHA-512,SHA-1,MD5",
    "-Daether.trustedChecksumsSource.summaryFile=true",
    `-Daether.trustedChecksumsSource.summaryFile.basedir=${resolve(summaryDirectory)}`,
    "-Daether.trustedChecksumsSource.summaryFile.originAware=true",
    "-Daether.artifactResolver.postProcessor.trustedChecksums=true",
    "-Daether.artifactResolver.postProcessor.trustedChecksums.scope=all",
    "-Daether.artifactResolver.postProcessor.trustedChecksums.checksumAlgorithms=SHA-512",
    "-Daether.artifactResolver.postProcessor.trustedChecksums.snapshots=true",
    "-Daether.artifactResolver.postProcessor.trustedChecksums.record=true",
  ];
  const output = resolve(reportsDirectory);
  return {
    settings,
    toolchains,
    preparation: [
      [
        ...common,
        ...reactor,
        `${REFERENCE_RECIPE.dependency}:go-offline`,
        ...recording,
      ],
      [
        ...common,
        ...reactor,
        `${REFERENCE_RECIPE.help}:effective-pom`,
        "-Dverbose=true",
        `-Doutput=${join(output, "effective-pom.xml")}`,
        ...recording,
      ],
      [
        ...common,
        ...reactor,
        `${REFERENCE_RECIPE.help}:active-profiles`,
        ...recording,
      ],
      [
        ...common,
        "-N",
        `${REFERENCE_RECIPE.dependency}:get`,
        `-Dartifact=${REFERENCE_RECIPE.declaredSignature}`,
        "-Dtransitive=false",
        ...recording,
      ],
      [
        ...common,
        "-N",
        `${REFERENCE_RECIPE.dependency}:get`,
        `-Dartifact=${REFERENCE_RECIPE.preparationSupplement}`,
        "-Dtransitive=false",
        ...recording,
      ],
      [
        ...common,
        ...reactor,
        `${REFERENCE_RECIPE.dependency}:tree`,
        "-Dscope=runtime",
        "-DoutputType=json",
        "-DoutputFile=target/reference-runtime-tree.json",
        "-DappendOutput=false",
        ...recording,
      ],
    ],
    build: [
      ...common,
      ...reactor,
      "package",
      `${REFERENCE_RECIPE.dependency}:build-classpath`,
      "-DincludeScope=runtime",
      "-Dmdep.outputFile=target/owlapi-runtime-classpath.txt",
      ...recording,
    ],
    jvmOptions: [...REFERENCE_JVM_OPTIONS, `-Duser.home=${resolve(userHome)}`],
  };
}

/** Validate native checksum output, not Maven coordinates or inheritance. No
 * generated reactor artifacts or absolute locations enter this external input set.
 * The caller supplies the exact configured native repository partition separately.
 */
export function readNativeChecksums(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 1024 * 1024)
    throw new Error("Native checksums exceed their input bounds.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const lines = text.split(/\r?\n/u);
  // Maven's native summary may end at a complete record without a newline.
  // Remove only one optional terminator; blank and partial records still fail.
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0 || lines.length > 4096)
    throw new Error("Native checksum inventory is incomplete or oversized.");
  const result = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{128}) {2}([A-Za-z0-9_.+/-]{1,512})$/u.exec(line);
    if (
      !match ||
      match[2].split("/").some((p) => !p || p === "." || p === "..") ||
      match[2].includes("SNAPSHOT") ||
      result.has(match[2])
    )
      throw new Error("Native checksum inventory contains unsupported inputs.");
    result.set(match[2], match[1]);
  }
  return result;
}

/** Called after an actual package build before production can publish. Preparation
 * may be a conservative superset, but every resolved external build byte must agree.
 */
export function assertNativeBuildClosure(preparedBytes, builtBytes) {
  const prepared = readNativeChecksums(preparedBytes);
  const built = readNativeChecksums(builtBytes);
  for (const [path, checksum] of built) {
    if (prepared.get(path) !== checksum)
      throw new Error(
        "Build resolved an input absent or changed after preparation.",
      );
  }
  return {
    prepared: prepared.size,
    built: built.size,
    preparedSha256: sha256(preparedBytes),
    builtSha256: sha256(builtBytes),
  };
}

export const referenceRecipeIdentity = () =>
  evidenceFingerprint({
    recipe: REFERENCE_RECIPE,
    jvmOptions: REFERENCE_JVM_OPTIONS,
    settingsSha256: sha256(readFileSync(settings)),
    toolchainsSha256: sha256(readFileSync(toolchains)),
    implementationSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    environmentProbeSha256: sha256(
      readFileSync(join(here, "ReferenceBuildEnvironment.java")),
    ),
    nativeCollectorSha256: sha256(
      readFileSync(join(here, "reference-native-build.mjs")),
    ),
    costObservationSha256: sha256(
      readFileSync(join(here, "reference-cost-observation.mjs")),
    ),
    verifierSha256: sha256(readFileSync(join(here, "reference-bundle.mjs"))),
    publicationSchemaSha256: sha256(
      readFileSync(join(here, "reference-publication.schema.json")),
    ),
    publicationBuilderSha256: sha256(
      readFileSync(join(here, "reference-publication-build.mjs")),
    ),
    publicationCatalogueSha256: sha256(
      readFileSync(join(here, "reference-publication-catalogue.json")),
    ),
    producerVerifierSha256: sha256(
      readFileSync(join(here, "../../scripts/java-reference-reuse.mjs")),
    ),
    referenceStateSha256: sha256(
      readFileSync(join(here, "../../scripts/java-reference-state.mjs")),
    ),
    referenceCommandSha256: sha256(
      readFileSync(join(here, "../../scripts/java-reference-command.mjs")),
    ),
    publicationStateSha256: sha256(
      readFileSync(join(here, "../../scripts/java-reference-publication.mjs")),
    ),
    seedDecisionSha256: sha256(
      readFileSync(join(here, "../../scripts/java-reference-seed-command.mjs")),
    ),
    workflowSha256: sha256(
      readFileSync(join(here, "../../.github/workflows/ci.yml")),
    ),
  });

/** Semantic identity is separate from production run/timestamp/artifact provenance.
 * Inputs must come from the trusted bounded native collector, never a downloaded
 * manifest. This pure constructor validates a record; it does not authenticate its
 * caller, prove actual command completion, or qualify arbitrary plugin environments.
 */
export function createReferenceInputRecord(inputs) {
  if (
    !validateInputs(inputs) ||
    inputs.environment.runtime !== "25.0.4.1+1-LTS" ||
    inputs.environment["java.version"] !== "25.0.4.1" ||
    inputs.environment["java.vendor"] !== "Eclipse Adoptium" ||
    inputs.environment["java.vm.version"] !== "25.0.4.1+1-LTS" ||
    inputs.environment["file.encoding"] !== "UTF-8" ||
    inputs.environment["stdout.encoding"] !== "UTF-8" ||
    inputs.environment["stderr.encoding"] !== "UTF-8" ||
    inputs.environment.locale !== "en-GB" ||
    inputs.environment.timezone !== "UTC" ||
    inputs.environment["os.arch"] !== "amd64" ||
    inputs.environment["os.name"] !==
      (inputs.host.os === "Linux" ? "Linux" : "Windows 11") ||
    (inputs.host.os === "Linux"
      ? inputs.host.image !== "ubuntu24" ||
        !/^\d{8}\.\d+(?:\.\d+)?$/u.test(inputs.host.imageVersion)
      : inputs.host.image !== "LOCAL_WINDOWS_EXPERIMENT")
  ) {
    throw new Error("Reference build inputs or environment are unsupported.");
  }
  const semantic = {
    sourceCommit: inputs.sourceCommit,
    sourceTree: inputs.sourceTree,
    externalSha256: inputs.externalSha256,
    runtimeGraphSha256: inputs.runtimeGraphSha256,
    mavenDistributionSha256: inputs.mavenDistributionSha256,
    jdkDistributionSha256: inputs.jdkDistributionSha256,
    environment: Object.fromEntries(
      environmentFields.map((name) => [name, inputs.environment[name]]),
    ),
    host: {
      os: inputs.host.os,
      architecture: inputs.host.architecture,
      image: inputs.host.image,
      imageVersion: inputs.host.imageVersion,
    },
    recipeSha256: referenceRecipeIdentity(),
  };
  return {
    schemaVersion: 1,
    purpose: "JAVA_REFERENCE_BUILD_INPUTS",
    scope:
      inputs.host.os === "Linux" ? "HOSTED_EXACT_IMAGE" : "LOCAL_EXPERIMENT",
    environmentPolicy: REFERENCE_RECIPE.environmentPolicy,
    semantic,
    keySha256: evidenceFingerprint(semantic),
  };
}
