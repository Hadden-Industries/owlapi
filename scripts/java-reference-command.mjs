import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evidenceFingerprint } from "./ci-check-coverage.mjs";
import {
  createRepositoryReader,
  readDownloadedReceipt,
  readGitSnapshot,
} from "./ci-verification-command.mjs";
import {
  JAVA_REFERENCE_POLICY,
  JAVA_REFERENCE_POLICY_SHA256,
} from "./java-reference-state.mjs";
import {
  referenceArtifactName,
  rereadReferenceArtifact,
  selectReferenceArtifact,
  verifyReferenceQualification,
  selectReferenceIndex,
  referenceProducerHint,
} from "./java-reference-reuse.mjs";
import { prepareReferenceBuild } from "../util/owlapi-reference/reference-native-build.mjs";
import { createReferenceInputRecord } from "../util/owlapi-reference/reference-inputs.mjs";
import {
  materializePublishedReferenceBundle,
  verifyMaterializedPublishedReferenceBundle,
} from "../util/owlapi-reference/reference-bundle.mjs";
import { buildReferencePublication } from "../util/owlapi-reference/reference-publication-build.mjs";
import {
  referencePublicationProvenance,
  referencePublicationState,
} from "./java-reference-publication.mjs";

const ROOT = resolve(".release/java-reference-reuse");
const NATIVE = join(ROOT, "native");
const SELECTED = join(ROOT, "selection.json");
const RESTORED = join(ROOT, "restored.json");
const DOWNLOAD = join(ROOT, "download");
const PRODUCT = join(ROOT, "materialized");
const STATE = join(ROOT, "materialization.json");
const INDEX = join(ROOT, "index.json");
const INDEX_DOWNLOAD = join(ROOT, "index-download");
const PUBLICATION = join(ROOT, "publication");
const PUBLICATION_RECORD = join(ROOT, "publication.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fact = (condition, message) => {
  if (!condition) throw new Error(message);
};
const readJson = (path, maximumBytes = 256 * 1024) => {
  const stat = lstatSync(path);
  fact(
    stat.isFile() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= maximumBytes &&
      realpathSync.native(path) === resolve(path),
    "Invalid private reference evidence.",
  );
  return JSON.parse(readFileSync(path, "utf8"));
};
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
};
const emit = (values, summary) => {
  for (const [key, value] of Object.entries(values)) {
    fact(
      /^[a-z_]+$/u.test(key) && !/[\r\n]/u.test(String(value)),
      "Unsafe reference output.",
    );
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  process.stdout.write(`${JSON.stringify({ ...values, summary })}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
};
function nativeOptions(resume = false) {
  fact(
    !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN,
    "API credentials cannot reach a build step.",
  );
  fact(
    process.env.RUNNER_OS === "Linux" &&
      process.env.RUNNER_ARCH === "X64" &&
      process.env.RUNNER_TEMP &&
      process.env.JAVA_HOME,
    "Qualified runner/tool paths are required.",
  );
  return {
    sourceDirectory: resolve(".release/java-owlapi"),
    workspaceDirectory: NATIVE,
    jdkDirectory: process.env.JAVA_HOME,
    mavenDirectory: join(
      process.env.RUNNER_TEMP,
      "reference-maven-3.10.0/apache-maven-3.10.0",
    ),
    host: {
      os: process.env.RUNNER_OS,
      architecture: process.env.RUNNER_ARCH,
      image: process.env.ImageOS,
      imageVersion: process.env.ImageVersion,
    },
    resume,
  };
}
function localInputs() {
  const input = readJson(join(NATIVE, "input-record.json"), 64 * 1024);
  const { recipeSha256, ...semantic } = input.semantic ?? {};
  const actual = createReferenceInputRecord(semantic);
  fact(
    JSON.stringify(actual) === JSON.stringify(input) &&
      recipeSha256 === actual.semantic.recipeSha256 &&
      actual.scope === "HOSTED_EXACT_IMAGE",
    "Native input record no longer matches this implementation.",
  );
  return actual;
}
const optionalReason = (error) =>
  typeof error?.code === "string" && /^[A-Z_]{1,80}$/u.test(error.code)
    ? error.code
    : "REFERENCE_ADMISSION_UNAVAILABLE";

/** Mode boundaries keep read-only API credentials out of native build processes.
 * Only discovery/download/admission failures are optional. Preparation/package
 * and all current behavior tests retain their ordinary failure semantics. */
export async function runReferenceCommand(mode) {
  fact(
    [
      "prepare",
      "index",
      "select",
      "admit",
      "build",
      "package",
      "publication",
    ].includes(mode),
    "Expected prepare, select, admit, build, package or publication.",
  );
  if (mode === "index") {
    const startedAt = Date.now();
    let selection = null;
    try {
      fact(
        JAVA_REFERENCE_POLICY.enabled,
        "Shared reference activation is pending.",
      );
      localInputs();
      const event = readJson(process.env.GITHUB_EVENT_PATH);
      const snapshot = readGitSnapshot();
      const baseCommit =
        process.env.GITHUB_EVENT_NAME === "pull_request"
          ? event.pull_request?.base?.sha
          : snapshot.parents[0];
      selection = await selectReferenceIndex({
        baseCommit,
        read: createRepositoryReader({
          repository: JAVA_REFERENCE_POLICY.repository,
          token: process.env.GH_TOKEN,
          deadline: startedAt + JAVA_REFERENCE_POLICY.lookupBudgetMs,
        }),
      });
    } catch (error) {
      emit({}, `No exact-base discovery index: ${optionalReason(error)}.`);
    }
    writeJson(INDEX, {
      selection,
      startedAt,
      lookupElapsedMs: Date.now() - startedAt,
    });
    emit(
      selection
        ? {
            available: "true",
            run_id: selection.run.id,
            artifact_id: selection.qualification.id,
          }
        : { available: "false" },
      "The base index is only a direct producer lookup hint; product qualification is independent.",
    );
    return;
  }
  if (mode === "package") {
    const state = readJson(STATE);
    if (
      !JAVA_REFERENCE_POLICY.enabled ||
      process.env.GITHUB_EVENT_NAME !== "push" ||
      state?.materialization !== "FRESH" ||
      state.inputs === null
    ) {
      emit(
        { publish: "false" },
        "No eligible activated fresh main reference product to publish.",
      );
      return;
    }
    try {
      const options = nativeOptions(true);
      // Recheck the exact source/tool environment and sealed native key. This
      // does not compile again; an unkeyed resume is ineligible for publication.
      const prepared = prepareReferenceBuild(options);
      fact(
        prepared.inputRecord?.keySha256 === state.inputs.keySha256,
        "Fresh producer inputs changed after behavioral checks.",
      );
      const provenance = referencePublicationProvenance({
        environment: process.env,
        event: readJson(process.env.GITHUB_EVENT_PATH),
        snapshot: readGitSnapshot(),
        state,
      });
      const product = buildReferencePublication({
        ...options,
        nativeWorkspace: NATIVE,
        destination: PUBLICATION,
        provenance,
      });
      writeJson(PUBLICATION_RECORD, product);
      emit(
        {
          publish: "true",
          artifact_name: referenceArtifactName(
            state.inputs.keySha256,
            provenance.runId,
            provenance.runAttempt,
          ),
        },
        `Fresh main reference product prepared: ${product.payloadBytes} bytes, ${product.entryCount} entries. It is reusable only after independent successful main qualification.`,
      );
    } catch (error) {
      // Tests already ran and retain their outcomes. A finite source/notice
      // packaging failure yields no reusable product; there is no retry.
      emit(
        { publish: "false" },
        `No reference product retained: ${optionalReason(error)}.`,
      );
    }
    return;
  }
  if (mode === "publication") {
    let state = readJson(STATE);
    if (process.env.REFERENCE_UPLOAD_OUTCOME === "success") {
      try {
        fact(
          !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN,
          "No API credentials in publication state construction.",
        );
        state = referencePublicationState({
          state,
          product: readJson(PUBLICATION_RECORD),
          artifactId: Number(process.env.REFERENCE_ARTIFACT_ID),
          artifactDigest: process.env.REFERENCE_ARTIFACT_DIGEST,
        });
      } catch (error) {
        emit(
          {},
          `Upload is not qualified for reuse: ${optionalReason(error)}.`,
        );
      }
    }
    writeJson(join(ROOT, "publication-state.json"), state);
    emit(
      { reference: JSON.stringify(state) },
      state?.publication
        ? "Recorded exact service upload ID and digest; overall main success and independent qualification remain mandatory."
        : "No reusable Java publication is claimed.",
    );
    return;
  }
  if (mode === "prepare") {
    mkdirSync(ROOT, { recursive: true, mode: 0o700 });
    const startedAt = Date.now();
    const prepared = prepareReferenceBuild(nativeOptions());
    emit(
      {
        key: prepared.inputRecord?.keySha256 ?? "",
        enabled: String(JAVA_REFERENCE_POLICY.enabled),
      },
      prepared.inputRecord
        ? "Observed current native inputs before compilation; behavioral qualification remains mandatory."
        : "Native key unavailable; fresh compilation and all current behavioral checks remain required.",
    );
    const nativePreparationElapsedMs = Date.now() - startedAt;
    const baselinePath = resolve(
      ".release/java-reference-cost-baseline/observation.json",
    );
    if (existsSync(baselinePath)) {
      const baseline = readJson(baselinePath, 4096);
      fact(
        baseline.purpose === "HOSTED_NATIVE_COST_OBSERVATION" &&
          Number.isSafeInteger(baseline.elapsedMs) &&
          baseline.elapsedMs > 0,
        "Invalid matched baseline cost observation.",
      );
      writeJson(join(ROOT, "cost-comparison.json"), {
        purpose: "HOSTED_NATIVE_COST_SCREEN",
        freshBaselineMs: baseline.elapsedMs,
        nativePreparationElapsedMs,
        optimisticSavingBeforeTransportMs:
          baseline.elapsedMs - nativePreparationElapsedMs,
        operatingAcceptance: "NOT_ESTABLISHED",
      });
      emit(
        {},
        `Matched native cost screen: fresh baseline ${baseline.elapsedMs} ms; key preparation ${nativePreparationElapsedMs} ms. Transfer, admission and seed costs remain additional.`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({ nativeInputs: prepared.inputRecord, nativePreparationElapsedMs })}\n`,
    );
    return;
  }
  if (mode === "select") {
    let input;
    try {
      input = localInputs();
    } catch {
      input = null;
    }
    const indexed = readJson(INDEX);
    const startedAt = indexed.startedAt;
    let producerHint = null;
    if (
      indexed.selection &&
      input &&
      process.env.REFERENCE_INDEX_DOWNLOAD_OUTCOME === "success"
    ) {
      try {
        const record = readDownloadedReceipt(
          INDEX_DOWNLOAD,
          indexed.selection.qualification.name,
        );
        producerHint = referenceProducerHint({
          index: indexed.selection,
          record,
          keySha256: input.keySha256,
        });
      } catch (error) {
        emit({}, `No usable direct producer hint: ${optionalReason(error)}.`);
      }
    }
    const lookupStartedAt = Date.now();
    const selection =
      JAVA_REFERENCE_POLICY.enabled && input !== null
        ? await selectReferenceArtifact({
            keySha256: input.keySha256,
            producerHint,
            read: createRepositoryReader({
              repository: JAVA_REFERENCE_POLICY.repository,
              token: process.env.GH_TOKEN,
              deadline: Math.min(
                startedAt + JAVA_REFERENCE_POLICY.totalServiceBudgetMs,
                lookupStartedAt +
                  JAVA_REFERENCE_POLICY.lookupBudgetMs -
                  indexed.lookupElapsedMs,
              ),
            }),
          })
        : {
            available: false,
            keySha256: input?.keySha256 ?? null,
            reason:
              input === null
                ? "NATIVE_KEY_UNAVAILABLE"
                : "REFERENCE_ACTIVATION_NOT_ACCEPTED",
          };
    writeJson(SELECTED, {
      selection,
      startedAt,
      lookupElapsedMs: indexed.lookupElapsedMs + Date.now() - lookupStartedAt,
    });
    emit(
      selection.available
        ? {
            available: "true",
            run_id: selection.run.id,
            artifact_ids: `${selection.artifact.id},${selection.qualification.id}`,
          }
        : { available: "false" },
      selection.available
        ? "Exact trusted-main product and independent qualification selected for official transport."
        : `Fresh native build required: ${selection.reason}.`,
    );
    return;
  }
  if (mode === "admit") {
    try {
      fact(
        JAVA_REFERENCE_POLICY.enabled &&
          process.env.REFERENCE_DOWNLOAD_OUTCOME === "success",
        "No downloaded product is eligible.",
      );
      const saved = readJson(SELECTED);
      const remainingLookup =
        JAVA_REFERENCE_POLICY.lookupBudgetMs - saved.lookupElapsedMs;
      const remainingTotal =
        saved.startedAt +
        JAVA_REFERENCE_POLICY.totalServiceBudgetMs -
        Date.now();
      fact(
        Number.isSafeInteger(saved.startedAt) &&
          saved.startedAt <= Date.now() &&
          Number.isSafeInteger(saved.lookupElapsedMs) &&
          saved.lookupElapsedMs >= 0 &&
          remainingLookup > 0 &&
          remainingTotal > 0,
        "Reference service budget elapsed.",
      );
      const read = createRepositoryReader({
        repository: JAVA_REFERENCE_POLICY.repository,
        token: process.env.GH_TOKEN,
        deadline: Date.now() + Math.min(remainingLookup, remainingTotal),
      });
      const input = localInputs();
      const selection = await rereadReferenceArtifact({
        read,
        selection: saved.selection,
      });
      const record = readDownloadedReceipt(
        join(DOWNLOAD, selection.qualification.name),
        selection.qualification.name,
      );
      const expected = await verifyReferenceQualification({
        read,
        selection,
        record,
        inputRecord: input,
      });
      fact(
        Date.now() <
          saved.startedAt + JAVA_REFERENCE_POLICY.totalServiceBudgetMs,
        "Reference service budget elapsed.",
      );
      materializePublishedReferenceBundle({
        bundleDirectory: join(
          DOWNLOAD,
          referenceArtifactName(
            input.keySha256,
            selection.run.id,
            selection.run.run_attempt,
          ),
        ),
        destination: PRODUCT,
        expected,
      });
      fact(
        Date.now() <
          saved.startedAt + JAVA_REFERENCE_POLICY.totalServiceBudgetMs,
        "Reference service budget elapsed before admission completed.",
      );
      writeJson(RESTORED, {
        keySha256: input.keySha256,
        expected,
        producer: {
          role: "MAIN",
          runId: selection.run.id,
          runAttempt: selection.run.run_attempt,
          commit: selection.run.head_sha,
          artifactId: selection.artifact.id,
          artifactDigest: selection.artifact.digest,
          qualificationId: selection.qualification.id,
          qualificationDigest: selection.qualification.digest,
        },
      });
      emit(
        { restored: "true" },
        "Admitted the exact qualified main build product; all current oracle checks still run.",
      );
    } catch (error) {
      emit(
        { restored: "false" },
        `Fresh native build required: ${optionalReason(error)}.`,
      );
    }
    return;
  }
  // No API token, no optional catch around source compilation or tool checks.
  const prepared = prepareReferenceBuild(nativeOptions(true));
  const startedAt = Date.now();
  let materialization = "FRESH";
  let producer = null;
  if (prepared.inputRecord !== null && existsSync(RESTORED)) {
    try {
      const restored = readJson(RESTORED);
      fact(
        restored.keySha256 === prepared.inputRecord.keySha256,
        "Restored reference does not match current native inputs.",
      );
      const checked = verifyMaterializedPublishedReferenceBundle({
        bundleDirectory: PRODUCT,
        expected: restored.expected,
      });
      writeFileSync(
        join(
          prepared.sourceDirectory,
          "distribution/target/owlapi-runtime-classpath.txt",
        ),
        readFileSync(checked.classpath),
        { flag: "wx", mode: 0o600 },
      );
      materialization = "REUSED";
      producer = restored.producer;
    } catch (error) {
      emit(
        { restored: "false" },
        `Fresh native build required after local handoff: ${optionalReason(error)}.`,
      );
    }
  }
  if (materialization === "FRESH") {
    const closure = prepared.buildFresh();
    process.stdout.write(`${JSON.stringify({ nativeClosure: closure })}\n`);
  }
  const runId = Number(process.env.GITHUB_RUN_ID);
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  fact(
    Number.isSafeInteger(runId) &&
      runId > 0 &&
      Number.isSafeInteger(runAttempt) &&
      runAttempt > 0 &&
      /^[a-f0-9]{40}$/u.test(process.env.GITHUB_SHA ?? ""),
    "Native run identity is unavailable.",
  );
  const inputBytes =
    prepared.inputRecord === null
      ? null
      : readFileSync(join(NATIVE, "input-record.json"));
  const state = JAVA_REFERENCE_POLICY.enabled
    ? {
        schemaVersion: 1,
        policySha256: JAVA_REFERENCE_POLICY_SHA256,
        materialization,
        inputs:
          inputBytes === null
            ? null
            : {
                keySha256: prepared.inputRecord.keySha256,
                inputRecordSha256: sha256(inputBytes),
                runtimeGraphSha256:
                  prepared.inputRecord.semantic.runtimeGraphSha256,
                hostSha256: evidenceFingerprint(
                  prepared.inputRecord.semantic.host,
                ),
              },
        execution: { runId, runAttempt, commit: process.env.GITHUB_SHA },
        producer,
        seedRequested:
          process.env.GITHUB_EVENT_NAME === "pull_request" &&
          materialization === "FRESH" &&
          prepared.inputRecord !== null,
        publication: null,
      }
    : null;
  writeJson(STATE, state);
  emit(
    { reference: JSON.stringify(state) },
    `${materialization} native reference; materialization took ${Date.now() - startedAt} ms. Current behavior coverage is recorded separately.`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await runReferenceCommand(process.argv[2]);
