import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { deriveWorkflowMetadata } from "./workflow-metadata.mjs";
import {
  buildAllowedSigners,
  selectAuthorizedSigner,
} from "./release-signers.mjs";
import { parseSshVerification } from "./verify-release-tag.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const runGit = (
  arguments_,
  { allowMissing = false, cwd = repositoryRoot } = {},
) => {
  const result = spawnSync("git", arguments_, {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0 && !allowMissing) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.stdout}${result.stderr}`,
    );
  }
  return result;
};

/** Check the immutable predecessor against the reviewed public signer registry. */
export const verifyParityCheckpointSignature = ({
  commit,
  registry,
  repository = repositoryRoot,
  releaseDate = new Date().toISOString().slice(0, 10),
}) => {
  if (!/^[a-f0-9]{40}$/u.test(commit ?? "")) {
    throw new Error("The parity checkpoint must be an exact commit OID.");
  }
  const allowedSignersPath = join(
    tmpdir(),
    `owlapi-checkpoint-signers-${randomUUID()}`,
  );
  writeFileSync(allowedSignersPath, buildAllowedSigners(registry), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    const verification = runGit(
      [
        "-c",
        "gpg.format=ssh",
        "-c",
        `gpg.ssh.allowedSignersFile=${allowedSignersPath}`,
        "verify-commit",
        "--raw",
        commit,
      ],
      { cwd: repository },
    );
    const local = parseSshVerification(
      `${verification.stdout}${verification.stderr}`,
    );
    const signer = selectAuthorizedSigner(registry, {
      fingerprint: local.fingerprint,
      releaseDate,
    });
    if (local.principal !== signer.githubIdentity) {
      throw new Error(
        "The parity checkpoint signature has an unregistered principal.",
      );
    }
    return { result: "PASS", commit, signerId: signer.id };
  } finally {
    unlinkSync(allowedSignersPath);
  }
};

/** Publication consumes reconciled acceptance, never a provisional CI pass. */
export const assertReconciledLifecycle = (ledger) => {
  if (
    ledger.qualification !== "RECONCILED" ||
    ledger.phase21?.status !== "COMPLETE" ||
    ledger.phase22?.status !== "COMPLETE"
  ) {
    throw new Error(
      "Publication requires completed reconciled Phase 21 and Phase 22 evidence.",
    );
  }
  const checkpoint = ledger.phase22.phase21Checkpoint;
  if (
    !/^[a-f0-9]{40}$/u.test(checkpoint?.commit ?? "") ||
    !/^[a-f0-9]{64}$/u.test(ledger.phase21.registrySha256 ?? "") ||
    !/^[a-f0-9]{64}$/u.test(ledger.phase22.registrySha256 ?? "") ||
    checkpoint.registrySha256 !== ledger.phase21.registrySha256
  ) {
    throw new Error(
      "Publication requires the exact Phase 21 checkpoint and both registry digests.",
    );
  }
};

export const assertReleasePreflight = ({
  sourceRef,
  checkoutHead,
  capturedSha,
  remoteMain,
  canonicalTagLookupStatus,
  manifest,
  publication,
  qualificationOnly = false,
}) => {
  if (typeof qualificationOnly !== "boolean")
    throw new Error(
      "Qualification-only admission must be an explicit boolean.",
    );
  if (qualificationOnly) {
    if (
      !/^refs\/heads\/[A-Za-z0-9_./-]+$/u.test(sourceRef ?? "") ||
      !/^[a-f0-9]{40}$/u.test(capturedSha ?? "") ||
      checkoutHead !== capturedSha
    )
      throw new Error(
        "Qualification-only dispatch requires an exact captured branch checkout.",
      );
    return {
      result: "PASS",
      mode: "QUALIFICATION_ONLY",
      sourceCommit: checkoutHead,
      sourceRef,
      publicationEnabled: false,
    };
  }
  if (sourceRef !== "refs/heads/main") {
    throw new Error(
      `Release dispatch must target refs/heads/main, not ${sourceRef}.`,
    );
  }
  if (!capturedSha || checkoutHead !== capturedSha) {
    throw new Error(
      `Checked-out HEAD ${checkoutHead} does not equal captured ${capturedSha}.`,
    );
  }
  if (remoteMain !== checkoutHead) {
    throw new Error(
      `Captured release commit ${checkoutHead} is not current origin/main ${remoteMain}.`,
    );
  }
  const metadata = deriveWorkflowMetadata({ manifest, publication });
  if (canonicalTagLookupStatus === 0) {
    throw new Error(
      `Canonical tag ${metadata.tag} already exists before qualification.`,
    );
  }
  if (canonicalTagLookupStatus !== 1) {
    throw new Error(
      `Unable to establish absence of canonical tag ${metadata.tag}.`,
    );
  }
  if (!publication.enabled || publication.mode !== "DIRECT_BOOTSTRAP") {
    throw new Error(
      "This release workflow requires the reviewed DIRECT_BOOTSTRAP boundary.",
    );
  }
  if (
    manifest.publishConfig?.access !== "public" ||
    manifest.publishConfig.registry !== "https://registry.npmjs.org/"
  ) {
    throw new Error(
      "The package must retain the reviewed public npm registry configuration.",
    );
  }
  return {
    result: "PASS",
    sourceCommit: checkoutHead,
    sourceRef,
    canonicalTagAbsent: metadata.tag,
    publicationEnabled: true,
    publicationMode: publication.mode,
    coordinate: metadata.coordinate,
    channel: metadata.channel,
  };
};

const main = () => {
  const qualificationOnly = process.env.OWLAPI_QUALIFICATION_ONLY === "true";
  const readJson = (path) =>
    JSON.parse(readFileSync(join(repositoryRoot, path), "utf8"));
  const ledger = readJson("docs/compatibility/java-api-parity-decisions.json");
  assertReconciledLifecycle(ledger);
  const registryPath = "docs/compatibility/java-api-surface.json";
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  if (
    digest(readFileSync(join(repositoryRoot, registryPath))) !==
    ledger.phase22.registrySha256
  ) {
    throw new Error("The qualified Phase 22 API registry bytes have changed.");
  }
  for (const baseline of [
    ledger.integrationBaseline,
    ledger.phase22.phase21Checkpoint,
  ]) {
    runGit(["merge-base", "--is-ancestor", baseline.commit, "HEAD"]);
    const registry = runGit([
      "show",
      `${baseline.commit}:${registryPath}`,
    ]).stdout;
    if (digest(registry) !== baseline.registrySha256) {
      throw new Error(
        `The registry at required ancestor ${baseline.commit} differs from its accepted digest.`,
      );
    }
  }
  const predecessor = JSON.parse(
    runGit([
      "show",
      `${ledger.phase22.phase21Checkpoint.commit}:docs/compatibility/java-api-parity-decisions.json`,
    ]).stdout,
  );
  if (
    predecessor.phase21?.status !== "COMPLETE" ||
    predecessor.phase21.registrySha256 !== ledger.phase21.registrySha256
  ) {
    throw new Error(
      "The claimed predecessor is not the completed Phase 21 checkpoint.",
    );
  }
  verifyParityCheckpointSignature({
    commit: ledger.phase22.phase21Checkpoint.commit,
    registry: readJson("docs/provenance/release-signers.json"),
  });
  if (!qualificationOnly) {
    for (const path of [
      "docs/provenance/scoped-package-name-review.json",
      "docs/provenance/rights-inventory.json",
      "docs/provenance/third-party-material.json",
    ]) {
      if (readJson(path).review.status !== "REVIEWED") {
        throw new Error(
          `Publication still requires the human fact review in ${path}.`,
        );
      }
    }
  }
  const checkoutHead = runGit(["rev-parse", "HEAD"]).stdout.trim();
  const remoteMain = runGit([
    "rev-parse",
    "refs/remotes/origin/main",
  ]).stdout.trim();
  const manifest = JSON.parse(
    readFileSync(join(repositoryRoot, "package.json"), "utf8"),
  );
  const publication = JSON.parse(
    readFileSync(
      join(repositoryRoot, "docs", "release", "publication-control.json"),
      "utf8",
    ),
  );
  const metadata = deriveWorkflowMetadata({ manifest, publication });
  const tagLookup = runGit(
    ["show-ref", "--verify", "--quiet", `refs/tags/${metadata.tag}`],
    { allowMissing: true },
  );
  const report = assertReleasePreflight({
    qualificationOnly,
    sourceRef: process.env.GITHUB_REF,
    checkoutHead,
    capturedSha: process.env.GITHUB_SHA,
    remoteMain,
    canonicalTagLookupStatus: tagLookup.status,
    manifest,
    publication,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
