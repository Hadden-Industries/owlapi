import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@jest/globals";
import { PACKAGE_NAME } from "./release-identity.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";
import { readStageJournal } from "./staged-release.mjs";
import { submittedStagePolicy } from "./release-stage-continuation.mjs";

const digest = "a".repeat(64);
const receiptFor = (
  manifest,
  { controller = manifest.commit, qualificationAdvisory } = {},
) => {
  const subject = {
    schemaVersion: 1,
    package: PACKAGE_NAME,
    version: manifest.package.version,
    workflow: ".github/workflows/stage-release.yml",
    commit: manifest.commit,
    controller,
    qualificationRun: manifest.runId,
    qualificationAttempt: manifest.attempt,
    manifestSha256: digest,
    runId: "70",
    attempt: "1",
    channel: "pilot",
    ...(qualificationAdvisory ? { qualificationAdvisory } : {}),
  };
  const journal = [
    { ...subject, state: "REQUESTED" },
    {
      ...subject,
      state: "STAGED",
      stageId: "00000000-0000-4000-8000-000000000070",
    },
  ]
    .map((row) => JSON.stringify(row))
    .join("\n");
  return readStageJournal(Buffer.from(journal), manifest, digest, {
    runId: "70",
    attempt: "1",
    controller,
  });
};

const withStageHistory = (callback) => {
  const localRepository = mkdtempSync(join(tmpdir(), "owlapi-stage-cutover-"));
  expect(isStrictDescendantPath(tmpdir(), localRepository)).toBe(true);
  const git = (args, input) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Stage Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        ...args,
      ],
      {
        cwd: localRepository,
        input,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
  try {
    git(["init", "--bare", "--quiet", "--object-format=sha1"]);
    const stages = (source) => {
      const blob = git(["hash-object", "-w", "--stdin"], source);
      const script = git(
        ["mktree"],
        `100644 blob ${blob}\tstaged-release.mjs\n`,
      );
      return git(["mktree"], `040000 tree ${script}\tscripts\n`);
    };
    const legacyTree = stages(
      "async function stage() { await stageOnce(); }\n",
    );
    const currentTree = stages(
      readFileSync(new URL("./staged-release.mjs", import.meta.url)),
    );
    const commit = (tree, name, ...parents) =>
      git([
        "commit-tree",
        tree,
        ...parents.flatMap((p) => ["-p", p]),
        "-m",
        name,
      ]);
    const qualification = commit(legacyTree, "Original qualification");
    const submitted = commit(
      legacyTree,
      "Pre-activation production stage",
      qualification,
    );
    const feature = commit(
      currentTree,
      "Prepared on detached developer history",
      qualification,
    );
    expect(git(["for-each-ref"])).toBe("");
    return callback({
      localRepository,
      legacyTree,
      currentTree,
      commit,
      qualification,
      submitted,
      feature,
    });
  } finally {
    rmSync(localRepository, { recursive: true, force: true });
  }
};

test.each(["linear", "merge", "squash"])(
  "authentic earlier stage and qualification use the original policy after %s activation",
  (integration) =>
    withStageHistory(
      ({
        localRepository,
        currentTree,
        commit,
        qualification,
        submitted,
        feature,
      }) => {
        const activation = commit(
          currentTree,
          `${integration} introduced policy 2`,
          submitted,
          ...(integration === "merge" ? [feature] : []),
        );
        const modernCommit = commit(
          currentTree,
          "Subsequent protected main work",
          activation,
        );
        const source = { controller: modernCommit, localRepository };
        const manifest = {
          commit: qualification,
          package: { version: "0.1.0" },
          runId: "69",
          attempt: "1",
        };
        const legacy = receiptFor(manifest, { controller: submitted });
        expect(submittedStagePolicy(manifest, legacy, source)).toBe(1);
        expect(() =>
          submittedStagePolicy(
            manifest,
            { ...legacy, state: "REQUESTED" },
            source,
          ),
        ).toThrow();
        expect(() =>
          submittedStagePolicy(
            manifest,
            receiptFor(manifest, { controller: activation }),
            source,
          ),
        ).toThrow(/original pre-reconciliation stage/u);
        expect(() =>
          submittedStagePolicy(
            manifest,
            receiptFor(manifest, { controller: feature }),
            source,
          ),
        ).toThrow(/original pre-reconciliation stage/u);
        expect(() =>
          submittedStagePolicy(manifest, legacy, {
            ...source,
            controller: "0".repeat(40),
          }),
        ).toThrow(/original pre-reconciliation stage/u);
        const downgraded = { ...manifest, commit: modernCommit };
        expect(() =>
          submittedStagePolicy(downgraded, receiptFor(downgraded), source),
        ).toThrow(/original pre-reconciliation stage/u);
        const current = { ...downgraded, consumerResolutionPolicy: 2 };
        const qualificationAdvisory = {
          verifiedAt: "2026-11-26T12:00:00.000Z",
          policySha256: digest,
          subjectsSha256: digest,
          descriptor: {
            artifactId: 33,
            artifactDigest: `sha256:${digest}`,
            jobId: 57,
            signatureSha256: digest,
            statementSha256: digest,
          },
        };
        expect(
          submittedStagePolicy(
            current,
            receiptFor(current, { qualificationAdvisory }),
          ),
        ).toBe(2);
        expect(() =>
          submittedStagePolicy(current, receiptFor(downgraded)),
        ).toThrow(/qualification advisory marker/u);
      },
    ),
);
