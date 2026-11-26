/** Read-only release CI shadow verdict. No package, registry or repository writes. */
import { pathToFileURL } from "node:url";
import { contextFromEnvironment, emit } from "./ci-verification-command.mjs";
import { verifyReleaseCi, verifyRetentionCi } from "./ci-verification.mjs";
import { FROZEN_RUNTIME_MATRIX } from "./ci-qualification.mjs";
import { runtimeDigest } from "./consumer-runtime-matrix.mjs";
import { projectPromotedCi } from "./promoted-release-proof.mjs";

import { GitHubReleaseClient } from "./github-release.mjs";
import { createRepositoryReader } from "./github-evidence-reader.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import {
  readQualifiedZip,
  verifyReleaseCiPackage,
} from "./release-ci-package.mjs";

/** The caller owns fresh release-only obligations even when CI evidence is valid. */
export function readReleaseCiEvidence(env = process.env) {
  return readMainCiEvidence(env, verifyReleaseCi);
}

/** The retention workflow can be driven by the exact verified upstream push as well as an owner dispatch. */
export function readRetentionCiEvidence(env = process.env) {
  return readMainCiEvidence(env, verifyRetentionCi);
}

async function readMainCiEvidence(env, verify) {
  if (!FROZEN_RUNTIME_MATRIX)
    throw new Error("The release needs its frozen runtime matrix.");
  const context = contextFromEnvironment(env);
  const budgetMs = 180_000;
  const deadline = performance.now() + budgetMs;
  const read = createRepositoryReader({
    repository: context.repository,
    token: env.GH_TOKEN,
    now: () => performance.now(),
    budgetMs,
    deadline,
    requestLimit: 128,
  });
  const client = new GitHubReleaseClient({
    repository: context.repository,
    token: env.GH_TOKEN,
    reader: read,
  });
  const download = (artifact, maximumBytes) =>
    downloadReleaseArtifact(client, artifact, maximumBytes, { deadline });
  return verify({
    context,
    read,
    downloadReceipt: async ({ artifact }) => {
      const files = await readQualifiedZip(download, artifact, 64 * 1024, [
        "verification.json",
      ]);
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          files.get("verification.json"),
        ),
      );
    },
    verifyPackage: (source) =>
      verifyReleaseCiPackage({
        source,
        client,
        read,
        download,
      }),
  });
}

async function main() {
  let outputs;
  let summary;
  try {
    const result = await readReleaseCiEvidence();
    const { candidate, proof } = result.qualifiedPackage;
    const retained = projectPromotedCi(
      result,
      runtimeDigest(FROZEN_RUNTIME_MATRIX),
    );
    const earliestExpiry = [
      retained.candidate,
      retained.packageProof,
      retained.main.receipt,
      retained.build.receipt,
    ]
      .map(({ expiresAt }) => expiresAt)
      .sort()[0];
    outputs = {
      eligible: "true",
      landed_sha: result.landed.commit,
      build_sha: result.source.receipt.snapshot.commit,
      candidate_id: candidate.id,
      proof_id: proof.id,
      evidence: JSON.stringify(retained),
    };
    summary =
      "CI evidence verified. The earliest required artifact expires " +
      earliestExpiry +
      ". Release-only qualification is still required.";
  } catch (error) {
    outputs = { eligible: "false" };
    summary =
      "CI evidence is unavailable: " +
      error.message.replaceAll(/[\r\n]/gu, " ").slice(0, 350) +
      ". Inspect the original CI run or deliberately select fresh read-only qualification.";
  }
  emit(outputs, summary);
  if (outputs.eligible === "false") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
