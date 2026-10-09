import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertReleasePreflight,
  assertReconciledLifecycle,
  verifyParityCheckpointSignature,
  assertSelectedPublicReleases,
} from "./release-preflight.mjs";

const manifest = {
  name: "@hadden-industries/owlapi",
  version: "0.1.0-rc.1",
  publishConfig: {
    access: "public",
    registry: "https://registry.npmjs.org/",
    tag: "next",
  },
};

const publication = {
  enabled: true,
  mode: "DIRECT_BOOTSTRAP",
  coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
  channel: "next",
  reason: "npm requires an existing package before trusted-publisher setup.",
  reviewedOn: "2026-08-28",
};

const accepted = {
  sourceRef: "refs/heads/main",
  checkoutHead: "a".repeat(40),
  capturedSha: "a".repeat(40),
  remoteMain: "a".repeat(40),
  canonicalTagLookupStatus: 1,
  manifest,
  publication,
};

describe("release preflight", () => {
  test("source qualification does not grant publication for an unassigned public release", () => {
    expect(() =>
      assertSelectedPublicReleases({
        bindings: [
          {
            id: "model.Configuration",
            exposure: "PUBLIC",
            firstPublicRelease: null,
          },
        ],
      }),
    ).toThrow(/immutable first release/u);
    expect(() =>
      assertSelectedPublicReleases({
        bindings: [
          {
            id: "model.Configuration",
            exposure: "PUBLIC",
            firstPublicRelease: "0.1.0-rc.2",
          },
          {
            id: "internal.Helper",
            exposure: "INTERNAL",
            firstPublicRelease: null,
          },
        ],
      }),
    ).not.toThrow();
  });
  test("native qualification-only entry point excludes publication human-review admission", () => {
    const repository = fileURLToPath(new URL("../", import.meta.url));
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repository,
      encoding: "utf8",
    }).trim();
    const invoke = (qualificationOnly) =>
      spawnSync(process.execPath, ["scripts/release-preflight.mjs"], {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          OWLAPI_QUALIFICATION_ONLY: qualificationOnly,
          GITHUB_REF: "refs/heads/ci/qualification-entry-point-regression",
          GITHUB_SHA: head,
        },
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
    const qualification = invoke("true");
    expect(qualification.error).toBeUndefined();
    expect(qualification.stderr).toBe("");
    expect(qualification.status).toBe(0);
    expect(JSON.parse(qualification.stdout)).toEqual({
      result: "PASS",
      mode: "QUALIFICATION_ONLY",
      sourceCommit: head,
      sourceRef: "refs/heads/ci/qualification-entry-point-regression",
      publicationEnabled: false,
    });
    for (const flag of ["false", "TRUE", "1"]) {
      const publication = invoke(flag);
      expect(publication.error).toBeUndefined();
      expect(publication.status).not.toBe(0);
      expect(publication.stderr).toMatch(
        /human fact review|must target refs\/heads\/main|immutable first release/u,
      );
    }
  });

  test("an exact branch can qualify with every publication boundary disabled", () => {
    const input = {
      ...accepted,
      qualificationOnly: true,
      sourceRef: "refs/heads/ci/unified-owl-contract-qualification",
      remoteMain: "b".repeat(40),
      canonicalTagLookupStatus: 0,
    };
    expect(assertReleasePreflight(input)).toEqual({
      result: "PASS",
      mode: "QUALIFICATION_ONLY",
      sourceCommit: accepted.checkoutHead,
      sourceRef: input.sourceRef,
      publicationEnabled: false,
    });
    expect(() =>
      assertReleasePreflight({ ...input, qualificationOnly: false }),
    ).toThrow(/main/);
    expect(() =>
      assertReleasePreflight({ ...input, checkoutHead: "b".repeat(40) }),
    ).toThrow(/exact/);
    expect(() =>
      assertReleasePreflight({ ...input, qualificationOnly: "true" }),
    ).toThrow(/boolean/);
  });
  test("refuses provisional lifecycle evidence before a publication run", () => {
    expect(() =>
      assertReconciledLifecycle({
        qualification: "PRE_INTEGRATION",
        phase21: { status: "IN_PROGRESS" },
        phase22: { status: "IN_PROGRESS" },
      }),
    ).toThrow(/completed reconciled Phase 21 and Phase 22/u);
  });

  test("requires an immutable parity checkpoint and both registry digests", () => {
    const ledger = {
      qualification: "RECONCILED",
      phase21: { status: "COMPLETE", registrySha256: "a".repeat(64) },
      phase22: {
        status: "COMPLETE",
        registrySha256: "b".repeat(64),
        phase21Checkpoint: {
          commit: "c".repeat(40),
          registrySha256: "a".repeat(64),
        },
      },
    };
    expect(() => assertReconciledLifecycle(ledger)).not.toThrow();
    for (const field of ["registrySha256", "phase21Checkpoint"]) {
      const invalid = structuredClone(ledger);
      delete invalid.phase22[field];
      expect(() => assertReconciledLifecycle(invalid)).toThrow(/checkpoint/u);
    }
    ledger.phase22.phase21Checkpoint.registrySha256 = "d".repeat(64);
    expect(() => assertReconciledLifecycle(ledger)).toThrow(/checkpoint/u);
  });

  test("accepts the reviewed direct-bootstrap release boundary", () => {
    expect(assertReleasePreflight(accepted)).toEqual({
      result: "PASS",
      sourceCommit: "a".repeat(40),
      sourceRef: "refs/heads/main",
      canonicalTagAbsent: "v0.1.0-rc.1",
      publicationEnabled: true,
      publicationMode: "DIRECT_BOOTSTRAP",
      coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
      channel: "next",
    });
  });

  test("rc.2 requires OIDC and rejects the obsolete bootstrap route", () => {
    const current = {
      ...accepted,
      manifest: { ...manifest, version: "0.1.0-rc.2" },
      publication: {
        ...publication,
        mode: "DIRECT_OIDC",
        coordinate: "@hadden-industries/owlapi@0.1.0-rc.2",
      },
    };
    expect(assertReleasePreflight(current)).toMatchObject({
      publicationMode: "DIRECT_OIDC",
      canonicalTagAbsent: "v0.1.0-rc.2",
    });
    current.publication.mode = "DIRECT_BOOTSTRAP";
    expect(() => assertReleasePreflight(current)).toThrow(/version-specific/u);
  });

  test.each([
    [
      "a disabled publication boundary",
      { publication: { ...publication, enabled: false, mode: "UNRESOLVED" } },
    ],
    ["a non-main dispatch", { sourceRef: "refs/heads/release/0.1.0-rc.1" }],
    [
      "a checkout different from the captured commit",
      { checkoutHead: "b".repeat(40) },
    ],
    [
      "a dispatch different from current origin/main",
      { remoteMain: "b".repeat(40) },
    ],
    ["an existing canonical tag", { canonicalTagLookupStatus: 0 }],
    ["an indeterminate tag lookup", { canonicalTagLookupStatus: 2 }],
    [
      "an unreviewed publication mode",
      { publication: { ...publication, reviewedOn: null } },
    ],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      assertReleasePreflight({ ...accepted, ...override }),
    ).toThrow();
  });
});

describe("parity checkpoint signature", () => {
  test("trusts only an active registered signer for the exact commit", () => {
    const directory = mkdtempSync(join(tmpdir(), "owlapi-checkpoint-test-"));
    const run = (command, args) =>
      execFileSync(command, args, {
        cwd: directory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const git = (...args) => run("git", args);
    try {
      const key = join(directory, "fixture-key");
      run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
      const publicKey = readFileSync(`${key}.pub`, "utf8")
        .trim()
        .split(/\s+/u)
        .slice(0, 2)
        .join(" ");
      const fingerprint = /SHA256:[A-Za-z0-9+/]{43}/u.exec(
        run("ssh-keygen", ["-lf", `${key}.pub`, "-E", "sha256"]),
      )[0];
      const registry = {
        signers: [
          {
            id: "fixture",
            githubIdentity: "FixtureSigner",
            publicKey,
            fingerprint,
            status: "ACTIVE",
            validFrom: "2026-01-01",
            validUntil: null,
            revokedOn: null,
          },
        ],
      };
      git("init", "--quiet");
      git(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "-c",
        "commit.gpgSign=false",
        "commit",
        "--allow-empty",
        "-m",
        "unsigned fixture",
      );
      const unsigned = git("rev-parse", "HEAD");
      git(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "-c",
        "gpg.format=ssh",
        "-c",
        `user.signingkey=${key.replaceAll("\\", "/")}`,
        "commit",
        "-S",
        "--allow-empty",
        "-m",
        "signed fixture",
      );
      const signed = git("rev-parse", "HEAD");
      const verify = (commit, signers = registry) =>
        verifyParityCheckpointSignature({
          commit,
          registry: signers,
          repository: directory,
          releaseDate: "2026-10-02",
        });
      expect(verify(signed)).toEqual({
        result: "PASS",
        commit: signed,
        signerId: "fixture",
      });
      expect(() => verify(unsigned)).toThrow(/verify-commit|signature/u);
      expect(() => verify(signed, { signers: [] })).toThrow(
        /verify-commit|signature/u,
      );
      expect(() =>
        verify(signed, {
          signers: [{ ...registry.signers[0], validUntil: "2026-09-01" }],
        }),
      ).toThrow(/not authorized/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
