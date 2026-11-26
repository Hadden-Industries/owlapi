/** Bind the protected evaluator to the public registry run and original qualified candidate. */
import assert from "node:assert/strict";
import { readCheckpoint } from "./release-history-checkpoint.mjs";
import { approvedDraft, readStageContext } from "./staged-release-followup.mjs";
import {
  publicRecipientInput,
  qualificationRuntimeMatrix,
  readPublicAuditSubjects,
} from "./release-public-proof.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { assertConsumerNpm } from "./consumer-runtime-tools.mjs";

export async function loadPublicContext(client, env, npmCli) {
  const checkpoint = await readCheckpoint(client, env.HISTORY_OBJECT);
  const context = await readStageContext(client, env, checkpoint, "registry");
  await approvedDraft(client, context);
  const { manifest } = context;
  const matrix = qualificationRuntimeMatrix(manifest);
  const input = publicRecipientInput(context, matrix, { reconciled: true });
  const tarball = context.read(manifest.assets.tarball.name);
  assert.equal(sha256Buffer(tarball), input.tarballSha256);
  const operation = {
    publicRun: env.GITHUB_RUN_ID,
    publicAttempt: env.GITHUB_RUN_ATTEMPT,
    publicController: env.GITHUB_SHA,
  };
  return { checkpoint, operation, matrix, input, options: { tarball, npmCli } };
}

export async function loadPublicAuditBatch(client, env, npmCli) {
  assertConsumerNpm(npmCli);
  const { checkpoint, operation, matrix, input, options } =
    await loadPublicContext(client, env, npmCli);
  return readPublicAuditSubjects(
    client,
    checkpoint,
    operation,
    matrix,
    input,
    options,
  );
}
