import { isDeepStrictEqual } from "node:util";

const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const executionIdentity = (job) => {
  const started = Date.parse(job?.started_at);
  const completed = Date.parse(job?.completed_at);
  return job &&
    typeof job.name === "string" &&
    job.name.length > 0 &&
    positiveId(job.run_id) &&
    /^[a-f0-9]{40}$/u.test(job.head_sha ?? "") &&
    positiveId(job.runner_id) &&
    Number.isFinite(started) &&
    Number.isFinite(completed) &&
    completed >= started
    ? [job.name, job.run_id, job.head_sha, job.runner_id, started, completed]
    : null;
};

/** Compare authenticated job executions, not GitHub's mutable attempt/job/check
 * labels: partial reruns can copy retained jobs with new IDs and attempt labels.
 * Missing execution identity throws, so inequality cannot turn an unknown
 * execution into proof of a new producer. Callers must separately authenticate
 * complete inventories, success and the claimed producing attempt.
 */
export const sameJobExecution = (first, second) => {
  const identity = executionIdentity(first);
  const other = executionIdentity(second);
  if (identity === null || other === null)
    throw new Error("Native job execution identity is unavailable.");
  return isDeepStrictEqual(identity, other);
};
