import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, jest, test } from "@jest/globals";
import { stableJson } from "./canonical-json.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import { reviewFactsDigest } from "./review-facts.mjs";
import {
  openRecipientMaterialCase,
  recipientMaterialDisposition,
} from "./recipient-material-case.mjs";
import { verifyQualifiedRecipientMaterial } from "./recipient-material-case-readmission.mjs";

const hash = (text) => sha256Buffer(Buffer.from(text));
const same = "a".repeat(64);
const originalDate = "2026-11-28T12:00:00.000Z";

test("an archived exception reverifies its signed Git object with the original rights authority and no network", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-rights-offline-"));
  expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
  try {
    const bare = join(root, "corpus.git");
    mkdirSync(bare);
    const git = (args, input) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Fixture Rights Owner",
          "-c",
          "user.email=rights@example.invalid",
          ...args,
        ],
        {
          cwd: bare,
          input,
          windowsHide: true,
          timeout: 10_000,
          env: {
            ...process.env,
            GIT_AUTHOR_DATE: "2026-11-28T09:00:00Z",
            GIT_COMMITTER_DATE: "2026-11-28T09:00:00Z",
          },
        },
      )
        .toString()
        .trim();
    git(["init", "--bare", "--quiet", "--object-format=sha1"]);
    const writeBlob = (value) =>
      git(["hash-object", "-w", "--stdin"], stableJson(value));
    const tree = (entries) =>
      git(
        ["mktree"],
        Object.entries(entries)
          .map(
            ([name, [mode, type, oid]]) => `${mode} ${type} ${oid}\t${name}\n`,
          )
          .join(""),
      );
    const treeEntry = (oid) => ["040000", "tree", oid];
    const blobEntry = (value) => ["100644", "blob", writeBlob(value)];
    const key = join(root, "fixture-signing-key");
    const ssh = (args, input) =>
      execFileSync("ssh-keygen", args, {
        cwd: root,
        input,
        windowsHide: true,
        timeout: 10_000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    ssh(["-q", "-t", "ed25519", "-N", "", "-f", key]);
    const fingerprint = ssh(["-lf", `${key}.pub`])
      .toString()
      .split(" ")[1];
    const publicKey = readFileSync(`${key}.pub`, "utf8")
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" ");
    const signer = {
      id: "fixture-2026",
      naturalPersonName: "Fixture Rights Owner",
      githubIdentity: "FixtureOwner",
      fingerprint,
      publicKey,
      status: "ACTIVE",
      validFrom: "2026-11-26",
      validUntil: "2026-11-29",
    };
    const policy = JSON.parse(
      readFileSync(
        new URL("../docs/provenance/rights-inventory.json", import.meta.url),
      ),
    );
    const identity = `https://github.com/${signer.githubIdentity}`;
    policy.contributors = [{ name: signer.naturalPersonName, identity }];
    policy.materialClasses.find(
      ({ id }) => id === "package-owned-source-and-metadata",
    ).rightsHolder = `${signer.naturalPersonName} for his contributions`;
    policy.review.factsSha256 = reviewFactsDigest("rights", policy);
    const provenance = tree({
      "release-signers.json": blobEntry({ signers: [signer] }),
      "rights-inventory.json": blobEntry(policy),
    });
    const docs = tree({ provenance: treeEntry(provenance) });
    const commit = git([
      "commit-tree",
      tree({ docs: treeEntry(docs) }),
      "-m",
      "Original policy fixture",
    ]);

    const manifest = '{"name":"registry-case"}\n',
      lock = '{"lockfileVersion":3}\n';
    const resolution = {
      schemaVersion: 1,
      manifestSha256: hash(manifest),
      lockSha256: hash(lock),
      tarballSha256: same,
    };
    const evidence = { schemaVersion: 1, manifest, lock, resolution };
    const role = "public-alias";
    const origin = {
      scope: "GITHUB_ACTIONS",
      workflow: ".github/workflows/release-registry.yml",
      job: "material",
      runId: 77,
      attempt: 1,
      commit,
    };
    const context = {
      kind: "PUBLIC_OBSERVATION",
      stage: { stageId: "original-stage" },
      lane: "runner-node",
    };
    const resolutionSha256 = hash(stableJson(resolution));
    const material = stableJson({
      schemaVersion: 1,
      status: "REQUIRES_HUMAN_REVIEW",
      policy: "DEC-004-2026-11-26-v1",
      archivePolicySha256: same,
      registryKeysSha256: same,
      canonicalEvidence: {},
      subject: {
        resolutionSha256,
        lockSha256: resolution.lockSha256,
        tarballSha256: resolution.tarballSha256,
      },
      artifacts: [
        {
          artifactId: "example",
          name: "example",
          version: "1.0.0",
          resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
          integrity: "sha512-fixture",
          tarball: { sha256: same },
          archive: { evidence: { sha256: same } },
          scan: { evidence: { sha256: same } },
        },
      ],
      decisions: [
        {
          artifactId: "example",
          disposition: "REQUIRES_HUMAN_REVIEW",
          scope: "SEPARATELY_INSTALLED_EXTERNAL_RUNTIME",
        },
      ],
    });
    const recordSha256 = hash(material);
    const caseText = stableJson({
      schemaVersion: 1,
      status: "REQUIRES_HUMAN_REVIEW",
      role,
      origin,
      context,
      evidence,
      material: { original: material, sha256: recordSha256 },
    });
    const caseSha256 = hash(caseText);
    const original = openRecipientMaterialCase(
      Buffer.from(caseText),
      caseSha256,
    );
    const selected = {
      artifactId: 77,
      artifactSha256: same,
      resolutionSha256,
      caseSha256,
      role,
    };
    const approved = recipientMaterialDisposition(original, {
      capacity: "PROJECT_RIGHTS_OWNER",
      signerId: signer.id,
      fingerprint,
      identity,
      rightsFactsSha256: policy.review.factsSha256,
    });
    const members = {
      "recipient-material-cases.json": { schemaVersion: 1, cases: [selected] },
      [`recipient-material-${caseSha256}.json`]: approved,
    };
    const files = Object.entries(members).map(([name, value]) => ({
      name,
      bytes: Buffer.byteLength(stableJson(value)),
      sha256: hash(stableJson(value)),
      disclosure: "PUBLIC",
    }));
    const inventory = tree({
      ...Object.fromEntries(
        Object.entries(members).map(([name, value]) => [
          name,
          blobEntry(value),
        ]),
      ),
      "checkpoint.json": blobEntry({
        schemaVersion: 1,
        disclosure: "APPROVED_FOR_PUBLIC_GIT",
        repository: REPOSITORY,
        files,
      }),
    });
    const checkpointCommit = git([
      "commit-tree",
      tree({ evidence: treeEntry(inventory) }),
      "-m",
      "Closed rights checkpoint",
    ]);
    const tag = Buffer.from(
      `object ${checkpointCommit}\ntype commit\ntag owlapi-release-history/recipient-offline-fixture\ntagger Fixture Rights Owner <rights@example.invalid> ${Date.parse("2026-11-28T11:00:00Z") / 1000} +0000\n\nArchived fixture.\n`,
    );
    const checkpoint = git(
      ["mktag"],
      Buffer.concat([tag, ssh(["-Y", "sign", "-f", key, "-n", "git"], tag)]),
    );
    expect(git(["for-each-ref"])).toBe("");
    git(["config", "gpg.ssh.program", "unavailable-current-ssh-program"]);
    git([
      "config",
      "gpg.ssh.revocationFile",
      join(root, "current-revocations"),
    ]);

    const reader = {
      verifyRetained: jest.fn(async () => ({ record: original.record })),
    };
    const client = {
      read: jest.fn(async () => {
        throw new Error("Archived rights proof cannot use the network");
      }),
    };
    const retained = {
      recordBytes: Buffer.from(material),
      recordSha256,
      resolution,
      lockfileBytes: Buffer.from(lock),
    };
    const options = {
      client,
      scope: { evidence, role, sourceCommit: commit, caseContext: context },
      rights: { ...selected, checkpoint, origin, context },
      archived: { verifiedAt: originalDate, localRepository: bare },
    };
    await expect(
      verifyQualifiedRecipientMaterial(reader, retained, options),
    ).resolves.toMatchObject({
      rights: { checkpoint, authority: { fingerprint } },
    });
    expect(reader.verifyRetained).toHaveBeenCalledTimes(1);
    await expect(
      verifyQualifiedRecipientMaterial(reader, retained, {
        ...options,
        archived: {
          ...options.archived,
          verifiedAt: "2026-11-30T12:00:00.000Z",
        },
      }),
    ).rejects.toThrow(/was not authorized on 2026-11-30/u);
    const unsigned = git(["mktag"], tag);
    await expect(
      verifyQualifiedRecipientMaterial(reader, retained, {
        ...options,
        rights: { ...options.rights, checkpoint: unsigned },
      }),
    ).rejects.toThrow(/no signature found/iu);
    await expect(
      verifyQualifiedRecipientMaterial(reader, retained, {
        ...options,
        rights: { ...options.rights, checkpoint: "f".repeat(40) },
      }),
    ).rejects.toThrow(/Restore the original signed history Git object/u);
    expect(reader.verifyRetained).toHaveBeenCalledTimes(1);
    expect(client.read).not.toHaveBeenCalled();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
