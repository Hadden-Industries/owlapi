import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import {
  javaToolchainSelection,
  observeSelectedJavaJdk,
} from "../../scripts/java-toolchain.mjs";
import { compareBehaviorObservations } from "./compare-behavior-observations.mjs";
import { compareSelectedParity } from "./compare-selected-parity.mjs";
import {
  comparisonIdentity,
  publishComparisonJson,
  sha256,
} from "./comparison-evidence.mjs";
import { admitReleasedClasspath } from "./comparison-oracle.mjs";
import { replayBehaviorResearch } from "./replay-behavior-research.mjs";
import { replaySelectedParity } from "./replay-selected-parity.mjs";

const preserved = new URL(
  "../../docs/compatibility/profiles/java-owlapi-5.5.1/",
  import.meta.url,
);
const linuxBehaviorBaseline = new URL(
  "../../docs/development/java-toolchain/temurin-25.0.5-linux-x64-behavior.json",
  import.meta.url,
);
const suites = {
  "reference-behavior": {
    evidence: "central-observations.json",
    replay: replayBehaviorResearch,
    compare: compareBehaviorObservations,
  },
  "reference-selected-api": {
    evidence: "central-selected-parity.json",
    replay: replaySelectedParity,
    compare: compareSelectedParity,
  },
};

export function isReferenceCapture(suite) {
  return Object.hasOwn(suites, suite);
}

function captureCase(suite, observation) {
  const definition = {
    scenario: suite,
    version: 1,
    probeId: observation.probeId,
    args: observation.arguments,
    sourceSha256: observation.sourceSha256,
    authority: "released-owlapi-observation",
  };
  return { caseId: comparisonIdentity(definition), ...definition };
}

/** An independent platform capture accounts for every original invocation in order. */
export function bindLinuxBehaviorBaseline(original, baseline) {
  const reference = JSON.parse(original);
  const { basis, ...capture } = baseline;
  if (!Array.isArray(basis?.held) || !Array.isArray(capture.observations))
    throw new Error("Incomplete Linux behavior baseline");
  const suite = "reference-behavior";
  const ids = (observations) =>
    observations.map((observation) => captureCase(suite, observation).caseId);
  const all = ids(reference.observations);
  const held = new Map(basis.held.map((row) => [row.caseId, row.reason]));
  const resourceCase = reference.observations.find(
    (row) => row.probeId === "ObserveResourceContracts",
  );
  const reason =
    resourceCase && held.get(captureCase(suite, resourceCase).caseId);
  if (
    basis.platform !== "linux" ||
    basis.arch !== "x64" ||
    capture.javaToolchain?.vendor !== "Eclipse Adoptium" ||
    capture.javaToolchain.runtime !== "25.0.5+8-LTS" ||
    basis.originalSha256 !== sha256(original) ||
    basis.captureIdentity !== comparisonIdentity(capture) ||
    comparisonIdentity(reference.classpathEntries) !==
      comparisonIdentity(baseline.classpathEntries) ||
    basis.held.length !== 1 ||
    typeof reason !== "string" ||
    !reason.trim() ||
    comparisonIdentity(ids(baseline.observations)) !==
      comparisonIdentity(all.filter((id) => !held.has(id))) ||
    baseline.observations.some(
      (row) => row.exitCode !== 0 || row.error !== null || row.signal !== null,
    )
  )
    throw new Error(
      "Linux behavior baseline differs from the frozen probe inventory",
    );
  return held;
}

/** Resolve the byte-sensitive reference for the host doing the replay. */
export async function referenceCaptureBaseline(suite, original, frozen) {
  if (
    suite !== "reference-behavior" ||
    process.platform !== "linux" ||
    process.arch !== "x64"
  )
    return { reference: frozen, held: new Map() };
  const bytes = await readFile(linuxBehaviorBaseline);
  const reference = JSON.parse(bytes);
  return {
    reference,
    held: bindLinuxBehaviorBaseline(original, reference),
    platformBaseline: {
      platform: process.platform,
      arch: process.arch,
      sha256: sha256(bytes),
      jdk: reference.javaToolchain,
    },
  };
}

/** Compare complete captures against the reference selected for that platform. */
export function referenceCaptureVerdicts(
  suite,
  cases,
  reference,
  observations,
  held,
) {
  const selected = cases.filter(({ caseId }) => !held.has(caseId));
  const disposition = suites[suite].compare(reference, observations, {
    sameRelease: true,
  });
  if (disposition.length !== selected.length)
    throw new Error("Native capture coverage changed");
  const compared = new Map(
    selected.map((c, index) => [c.caseId, disposition[index]]),
  );
  return cases.map((entry) => {
    if (held.has(entry.caseId))
      return { ...entry, status: "incomplete", reason: held.get(entry.caseId) };
    const comparison = compared.get(entry.caseId);
    return {
      ...entry,
      status:
        comparison.comparisonStatus === "identical" ||
        comparison.areSelectedResultsEquivalent === true
          ? "observed"
          : "failed",
      comparison,
    };
  });
}

export async function runReferenceCapture(request, environment) {
  const worker = suites[request.suite];
  const original = await readFile(new URL(worker.evidence, preserved));
  const frozen = JSON.parse(original);
  const cases = frozen.observations.map((row) =>
    captureCase(request.suite, row),
  );
  if (request.action === "list") return { schemaVersion: 1, cases };
  if (
    request.action !== "run" ||
    !isAbsolute(environment.outputDirectory ?? "") ||
    request.input ||
    request.profile
  ) {
    throw new Error(
      "Select the complete native capture suite and an absolute output directory",
    );
  }
  const directory = environment.outputDirectory;
  if (
    environment.reuseObservations &&
    (request.suite !== "reference-behavior" ||
      !isAbsolute(environment.reuseObservations))
  ) {
    throw new Error(
      "Reuse requires an absolute retained behavior observation file",
    );
  }
  if (
    environment.javaHeapMiB !== undefined &&
    (!Number.isSafeInteger(environment.javaHeapMiB) ||
      environment.javaHeapMiB < 64 ||
      (environment.memoryBudgetMiB &&
        environment.javaHeapMiB >= environment.memoryBudgetMiB))
  ) {
    throw new Error("Java heap must fit within the selected comparison job");
  }
  const { reference, held, platformBaseline } = await referenceCaptureBaseline(
    request.suite,
    original,
    frozen,
  );
  const classpath = await admitReleasedClasspath(environment);
  const selection =
    environment.javaSelection === undefined
      ? undefined
      : javaToolchainSelection(environment.javaSelection);
  const jdk = observeSelectedJavaJdk(environment.javaHome, selection);
  await mkdir(directory);
  const classpathFile = join(directory, "locked-java-classpath");
  await writeFile(classpathFile, classpath.jars.join(delimiter), {
    flag: "wx",
  });
  const observations = worker.replay({
    classpathFile,
    outputDirectory: directory,
    java: jdk.javaPath,
    selection,
    javaHeapMiB: environment.javaHeapMiB,
    reuseFrom: environment.reuseObservations,
    ...(held.size ? { requiredObservations: reference.observations } : {}),
  });
  const result = {
    schemaVersion: 1,
    action: "run",
    evidenceRole: "java-to-java-same-release",
    originalSha256: sha256(original),
    ...(platformBaseline ? { platformBaseline } : {}),
    ...(environment.reuseObservations
      ? {
          reusedInputSha256: sha256(
            await readFile(environment.reuseObservations),
          ),
        }
      : {}),
    ...(environment.javaHeapMiB
      ? { javaHeapMiB: environment.javaHeapMiB }
      : {}),
    oracle: { ...classpath.identity, jdk: jdk.identity },
    cases: referenceCaptureVerdicts(
      request.suite,
      cases,
      reference,
      observations,
      held,
    ),
  };
  await publishComparisonJson(directory, "capture-comparison.json", result);
  return result;
}
