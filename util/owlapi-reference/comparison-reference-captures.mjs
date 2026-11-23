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

export async function runReferenceCapture(request, environment) {
  const worker = suites[request.suite];
  const original = await readFile(new URL(worker.evidence, preserved));
  const frozen = JSON.parse(original);
  const cases = frozen.observations.map(
    ({ probeId, arguments: args, sourceSha256 }) => {
      const definition = {
        scenario: request.suite,
        version: 1,
        probeId,
        args,
        sourceSha256,
        authority: "released-owlapi-observation",
      };
      return { caseId: comparisonIdentity(definition), ...definition };
    },
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
  });
  const disposition = worker.compare(frozen, observations, {
    sameRelease: true,
  });
  if (disposition.length !== cases.length)
    throw new Error("Native capture coverage changed");
  const result = {
    schemaVersion: 1,
    action: "run",
    evidenceRole: "java-to-java-same-release",
    originalSha256: sha256(original),
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
    cases: cases.map((entry, index) => ({
      ...entry,
      status:
        disposition[index].comparisonStatus === "identical" ||
        disposition[index].areSelectedResultsEquivalent === true
          ? "observed"
          : "failed",
      comparison: disposition[index],
    })),
  };
  await publishComparisonJson(directory, "capture-comparison.json", result);
  return result;
}
