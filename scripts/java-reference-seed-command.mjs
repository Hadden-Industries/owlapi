/** A bounded main decision consumes an already verified PR receipt and then
 * independently admits any concurrent seed. Missing seed proof selects FULL. */
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertQualificationRecord } from "./ci-qualification.mjs";
import { evidenceFingerprint } from "./ci-check-coverage.mjs";
import { JAVA_REFERENCE_POLICY } from "./java-reference-state.mjs";
import {
  createRepositoryReader,
  readDownloadedReceipt,
} from "./ci-verification-command.mjs";
import {
  needsFullMainSeed,
  selectReferenceArtifact,
  rereadReferenceArtifact,
  verifyReferenceQualification,
} from "./java-reference-reuse.mjs";

const ROOT = resolve(".release/java-reference-seed");
const SELECTION = join(ROOT, "selection.json");
const ADMISSION = join(ROOT, "admission.json");
const DOWNLOAD = join(ROOT, "download");
const fact = (condition, message) => {
  if (!condition) throw new Error(message);
};
const readJson = (path, maximum = 64 * 1024) => {
  const stat = lstatSync(path);
  fact(
    stat.isFile() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= maximum &&
      realpathSync.native(path) === resolve(path),
    "Invalid local seed evidence.",
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
const verifiedOutputs = (environment) => {
  const value = JSON.parse(environment.VERIFICATION_OUTPUTS_JSON ?? "{}");
  if (value.reuse !== "true") return { reuse: "false" };
  const record = JSON.parse(value.qualification);
  assertQualificationRecord(record);
  fact(
    record.role === "PR" && record.mode === "FULL",
    "Expected the verified FULL PR origin.",
  );
  return value;
};
export function selectSeedAwareStrategy({
  verified,
  referenceEnabled,
  seedRequested,
  availableNow,
}) {
  if (
    verified.reuse !== "true" ||
    needsFullMainSeed({
      referenceEnabled,
      prBuiltFresh: seedRequested,
      availableNow,
    })
  )
    return { reuse: "false" };
  return verified;
}
const emit = (values, summary) => {
  const permitted = [
    "reuse",
    "source_run_id",
    "source_run_attempt",
    "source_commit",
    "candidate_artifact_id",
    "candidate_artifact_digest",
    "source_receipt_id",
    "source_receipt_digest",
    "qualification",
    "available",
    "run_id",
    "artifact_ids",
  ];
  for (const [key, value] of Object.entries(values)) {
    fact(
      permitted.includes(key) &&
        typeof value === "string" &&
        !/[\r\n]/u.test(value),
      "Unsafe seed output.",
    );
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  process.stdout.write(`${JSON.stringify({ ...values, summary })}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
};
export async function runSeedCommand(mode) {
  fact(
    ["select", "admit", "strategy"].includes(mode),
    "Expected select, admit or strategy.",
  );
  const verified = verifiedOutputs(process.env);
  const origin =
    verified.reuse === "true" ? JSON.parse(verified.qualification) : null;
  const requested =
    JAVA_REFERENCE_POLICY.enabled &&
    origin?.javaReference?.seedRequested === true;
  if (mode === "strategy") {
    let availableNow = false;
    if (requested && existsSync(ADMISSION)) {
      const admitted = readJson(ADMISSION);
      availableNow =
        admitted.available === true &&
        admitted.keySha256 === origin.javaReference.inputs.keySha256 &&
        admitted.consumerRunId === Number(process.env.GITHUB_RUN_ID) &&
        admitted.consumerRunAttempt === Number(process.env.GITHUB_RUN_ATTEMPT);
    }
    const result = selectSeedAwareStrategy({
      verified,
      referenceEnabled: JAVA_REFERENCE_POLICY.enabled,
      seedRequested: requested,
      availableNow,
    });
    emit(
      result,
      result.reuse === "true"
        ? "Reuse the verified complete PR qualification; no unresolved Java seed is required."
        : "Execute FULL qualification; an unavailable seed never becomes inherited authority.",
    );
    return;
  }
  if (mode === "select") {
    const startedAt = Date.now();
    const selection = requested
      ? await selectReferenceArtifact({
          keySha256: origin.javaReference.inputs.keySha256,
          read: createRepositoryReader({
            repository: JAVA_REFERENCE_POLICY.repository,
            token: process.env.GH_TOKEN,
            deadline: startedAt + JAVA_REFERENCE_POLICY.lookupBudgetMs,
          }),
        })
      : { available: false, reason: "NO_JAVA_SEED_REQUIRED" };
    writeJson(SELECTION, {
      selection,
      startedAt,
      lookupElapsedMs: Date.now() - startedAt,
    });
    emit(
      selection.available
        ? {
            available: "true",
            run_id: String(selection.run.id),
            artifact_ids: `${selection.artifact.id},${selection.qualification.id}`,
          }
        : { available: "false" },
      selection.available
        ? "Concurrent seed selected for independent admission."
        : `No concurrent seed selected: ${selection.reason}.`,
    );
    return;
  }
  let available = false;
  let reason = "NO_JAVA_SEED_REQUIRED";
  if (requested) {
    try {
      fact(
        process.env.REFERENCE_SEED_DOWNLOAD_OUTCOME === "success" &&
          process.env.REFERENCE_SEED_TOOLS_OUTCOME === "success",
        "Seed transport or verifier unavailable.",
      );
      const saved = readJson(SELECTION, 256 * 1024);
      const deadline =
        saved.startedAt + JAVA_REFERENCE_POLICY.totalServiceBudgetMs;
      fact(
        Number.isSafeInteger(saved.startedAt) &&
          saved.startedAt <= Date.now() &&
          Number.isSafeInteger(saved.lookupElapsedMs) &&
          saved.lookupElapsedMs >= 0 &&
          saved.lookupElapsedMs < JAVA_REFERENCE_POLICY.lookupBudgetMs &&
          Date.now() < deadline,
        "Seed admission budget elapsed.",
      );
      const read = createRepositoryReader({
        repository: JAVA_REFERENCE_POLICY.repository,
        token: process.env.GH_TOKEN,
        deadline: Math.min(
          deadline,
          Date.now() +
            JAVA_REFERENCE_POLICY.lookupBudgetMs -
            saved.lookupElapsedMs,
        ),
      });
      const selection = await rereadReferenceArtifact({
        read,
        selection: saved.selection,
      });
      const product = join(DOWNLOAD, selection.artifact.name);
      const supplied = readJson(join(product, "input-record.json"));
      // These imports require the locked Ajv verifier, installed only for a
      // successfully transported candidate concurrent seed. No build runs here.
      const { createReferenceInputRecord } =
        await import("../util/owlapi-reference/reference-inputs.mjs");
      const { verifyPublishedReferenceBundle } =
        await import("../util/owlapi-reference/reference-bundle.mjs");
      const { recipeSha256, ...semantic } = supplied.semantic ?? {};
      const inputRecord = createReferenceInputRecord(semantic);
      fact(
        recipeSha256 === inputRecord.semantic.recipeSha256 &&
          inputRecord.keySha256 === origin.javaReference.inputs.keySha256 &&
          inputRecord.semantic.runtimeGraphSha256 ===
            origin.javaReference.inputs.runtimeGraphSha256 &&
          evidenceFingerprint(inputRecord.semantic.host) ===
            origin.javaReference.inputs.hostSha256,
        "Concurrent seed is incompatible with the already verified PR reference.",
      );
      const record = readDownloadedReceipt(
        join(DOWNLOAD, selection.qualification.name),
        selection.qualification.name,
      );
      const expected = await verifyReferenceQualification({
        read,
        selection,
        record,
        inputRecord,
      });
      verifyPublishedReferenceBundle({ bundleDirectory: product, expected });
      fact(Date.now() < deadline, "Seed payload admission budget elapsed.");
      available = true;
      reason = "VERIFIED_COMPATIBLE_CONCURRENT_SEED";
    } catch (error) {
      reason =
        typeof error.code === "string" && /^[A-Z_]{1,80}$/u.test(error.code)
          ? error.code
          : "CONCURRENT_SEED_UNAVAILABLE";
    }
  }
  writeJson(ADMISSION, {
    available,
    reason,
    keySha256: origin?.javaReference?.inputs?.keySha256 ?? null,
    consumerRunId: Number(process.env.GITHUB_RUN_ID),
    consumerRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  });
  emit({}, `Reevaluated Java seed: ${reason}.`);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await runSeedCommand(process.argv[2]);
