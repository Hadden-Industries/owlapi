import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, isAbsolute, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { compareBehaviorObservations } from "./compare-behavior-observations.mjs";
import { compareSelectedParity } from "./compare-selected-parity.mjs";

const defaultDirectory = fileURLToPath(
  new URL(
    "../../docs/compatibility/profiles/java-owlapi-5.5.1/",
    import.meta.url,
  ),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const artifactKey = (artifact) =>
  [
    artifact.groupId,
    artifact.artifactId,
    artifact.artifactType,
    artifact.classifier ?? "",
    artifact.version,
  ].join(":");

/** Verify retained evidence, without fetching artifacts or silently refreshing
 * hashes. Admission of the Java oracle is distinct from implementation support.
 */
export function validateReleasedOracle({
  profileDirectory = defaultDirectory,
  requireQualified = true,
  readArtifact = readFileSync,
  localMavenRepository,
} = {}) {
  const directory = resolve(profileDirectory);
  const repository = resolve(directory, "../../../..");
  const read = (path) => {
    assert(
      typeof path === "string" && !isAbsolute(path),
      "Evidence paths must be relative",
    );
    const absolute = resolve(directory, path.split("#", 1)[0]);
    const withinRepository = relative(repository, absolute);
    assert(
      !withinRepository.startsWith("..") && !isAbsolute(withinRepository),
      "Evidence path escapes the repository",
    );
    return readArtifact(absolute);
  };
  const json = (path) => JSON.parse(read(path).toString("utf8"));
  const provenance = json("provenance.json");
  const schema = addFormats(new Ajv({ strict: true, allErrors: true })).compile(
    json("provenance.schema.json"),
  );
  assert(
    schema(provenance),
    `Invalid released-oracle provenance: ${JSON.stringify(schema.errors)}`,
  );
  assert(
    !requireQualified || provenance.qualification.status === "qualified",
    "Released oracle is unqualified",
  );
  const evidence = json(provenance.qualification.evidenceManifestPath).evidence;
  assert(evidence.length > 0, "Evidence manifest is empty");
  const evidencePaths = new Set();
  for (const record of evidence) {
    assert(!evidencePaths.has(record.path), "Duplicate evidence path");
    evidencePaths.add(record.path);
    const bytes = read(record.path);
    assert(
      bytes.length === record.byteLength && digest(bytes) === record.sha256,
      `Changed evidence artifact: ${record.path}`,
    );
  }
  const fixtures = json("fixture-manifest.json").fixtures;
  assert(fixtures.length > 0, "Fixture manifest is empty");
  for (const fixture of fixtures)
    assert(
      digest(read(fixture.path)) === fixture.sha256,
      `Changed oracle fixture: ${fixture.path}`,
    );
  if (provenance.qualification.status === "qualified") {
    const commit = provenance.oracle.harnessSourceCommitObjectId;
    for (const fixture of fixtures) {
      const path = relative(repository, resolve(directory, fixture.path))
        .split("\\")
        .join("/");
      const committed = spawnSync("git", ["show", `${commit}:${path}`], {
        cwd: repository,
        maxBuffer: 16 * 1024 * 1024,
      });
      assert(
        committed.status === 0 && digest(committed.stdout) === fixture.sha256,
        `Frozen harness commit does not contain the measured fixture: ${path}`,
      );
    }
  }
  const { oracle, mavenCentral, sourceBuild } = provenance;
  assert(
    digest(read("fixture-manifest.json")) === oracle.fixtureManifestSha256,
    "Fixture manifest hash differs",
  );
  assert(
    digest(read("central-observations.json")) ===
      oracle.observationManifestSha256,
    "Observation manifest hash differs",
  );
  const lockBytes = read(mavenCentral.dependencyLock.path);
  assert(
    digest(lockBytes) === mavenCentral.dependencyLock.sha256 &&
      digest(lockBytes) === oracle.classpathLockSha256,
    "Dependency lock hash differs",
  );
  assert(
    mavenCentral.dependencyLock.oracleExecutionClosureStatus === "complete" &&
      mavenCentral.dependencyLock.sourceBuildClosureStatus === "complete",
    "Dependency closure is incomplete",
  );
  const lock = JSON.parse(lockBytes);
  assert(
    lock.artifacts.length > 0 && lock.orderedExecutionClasspath.length > 0,
    "Dependency closure is empty",
  );
  const artifacts = new Map();
  for (const artifact of lock.artifacts) {
    assert(
      !artifacts.has(artifact.repositoryPath),
      "Duplicate dependency artifact",
    );
    assert(
      /^[a-f0-9]{64}$/u.test(artifact.sha256) &&
        Number.isSafeInteger(artifact.byteLength) &&
        artifact.byteLength > 0,
      "Unmeasured dependency artifact",
    );
    assert(
      artifact.repositoryUrl === mavenCentral.repositoryUrl,
      "Unexpected dependency repository",
    );
    artifacts.set(artifact.repositoryPath, artifact);
    if (localMavenRepository) {
      const path = resolve(localMavenRepository, artifact.repositoryPath);
      assert(
        !relative(resolve(localMavenRepository), path).startsWith(".."),
        "Dependency path escapes its repository",
      );
      const bytes = readArtifact(path);
      assert(
        bytes.length === artifact.byteLength &&
          digest(bytes) === artifact.sha256,
        `Changed acquired artifact: ${artifact.repositoryPath}`,
      );
    }
  }
  const classpath = lock.orderedExecutionClasspath.map((entry) => {
    const artifact = artifacts.get(entry);
    assert(
      artifact?.artifactType === "jar",
      "Classpath is missing from locked closure",
    );
    return artifact;
  });
  const coordinates = new Set(lock.artifacts.map(artifactKey));
  assert(
    lock.runtimeDependencyEdges.length > 0,
    "Runtime dependency graph is empty",
  );
  for (const edge of lock.runtimeDependencyEdges)
    assert(
      coordinates.has(edge.dependency),
      `Unresolved runtime dependency: ${edge.dependency}`,
    );
  assert(
    read(lock.sourceBuildModelPath).toString().includes("<projects>"),
    "Missing effective build model",
  );
  assert(
    read(lock.sourceBuildPluginGraphPath)
      .toString()
      .includes("maven-compiler-plugin"),
    "Missing plugin resolution graph",
  );
  assert(
    sourceBuild.checkoutVerificationStatus === "clean" &&
      sourceBuild.sourceCommitObjectId ===
        provenance.upstream.commit.commitObjectId,
    "Source reconstruction identity differs",
  );
  assert(
    read("evidence/offline-source-build.log")
      .toString()
      .includes("BUILD SUCCESS"),
    "Offline source reconstruction did not succeed",
  );
  for (const primary of mavenCentral.artifacts) {
    assert(
      lock.artifacts.some(
        (artifact) =>
          artifactKey(artifact) === artifactKey(primary) &&
          artifact.sha256 === primary.sha256,
      ),
      "Primary artifact is absent from closure",
    );
    const signature = primary.signature;
    assert(
      signature.verificationStatus === "verified" &&
        signature.signerTrustDecisionReference,
      "Signature verification or trust decision is missing",
    );
    assert(
      read(signature.verificationEvidencePath)
        .toString()
        .includes(`VALIDSIG ${signature.signerFingerprint}`),
      "Signature evidence does not match signer",
    );
    read(signature.signerTrustDecisionReference);
  }
  const central = json("central-observations.json");
  const rebuilt = json("source-observations.json");
  assert(
    central.classpathEntries.length === classpath.length &&
      central.classpathEntries.every(
        (entry, index) => entry.sha256 === classpath[index].sha256,
      ),
    "Executed oracle classpath differs from lock",
  );
  const comparison = compareBehaviorObservations(central, rebuilt);
  assert(
    comparison.every((row) => row.comparisonStatus !== "unresolved"),
    "Central and source observations contain unclassified differences",
  );
  const recordedComparison = json(
    sourceBuild.artifactComparison.behavioralComparisonEvidencePath,
  );
  assert(
    JSON.stringify(comparison) === JSON.stringify(recordedComparison),
    "Recorded behavioral comparison differs",
  );
  const selected = compareSelectedParity(
    json("central-selected-parity.json"),
    json("source-selected-parity.json"),
  );
  assert(
    selected.length === 15 &&
      selected.every((row) => row.areSelectedResultsEquivalent),
    "Selected native parity observations differ or are incomplete",
  );
  assert(
    JSON.stringify(selected) ===
      JSON.stringify(json("selected-parity-comparison.json")),
    "Recorded selected parity comparison differs",
  );
  for (const observation of central.observations) {
    assert(
      digest(read(observation.inputPath)) === observation.inputSha256,
      "Observed input identity differs",
    );
    assert(
      observation.signal === null && observation.error === null,
      "Oracle process did not complete normally",
    );
  }
  const jar = mavenCentral.artifacts.find(
    (artifact) => artifact.artifactType === "jar",
  );
  assert(
    sourceBuild.artifactComparison.centralJarSha256 === jar.sha256,
    "Compared Central artifact differs",
  );
  if (!sourceBuild.artifactComparison.areJarsByteIdentical)
    read(sourceBuild.artifactComparison.byteDifferenceExplanation);
  return {
    qualificationStatus: provenance.qualification.status,
    observationCount: comparison.length,
    selectedObservationCount: selected.length,
    dependencyArtifactCount: artifacts.size,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const report = validateReleasedOracle({
    requireQualified: !args.includes("--allow-unqualified"),
    localMavenRepository: args
      .find((arg) => arg.startsWith("--maven-repository="))
      ?.slice("--maven-repository=".length),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
