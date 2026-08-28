import {
  parseSshVerification,
  verifyReleaseTagFacts,
} from "./verify-release-tag.mjs";

const registry = {
  schemaVersion: 1,
  signers: [
    {
      id: "maksym-shostak-github-ssh-2026",
      naturalPersonName: "Maksym Shostak",
      githubIdentity: "MaksymShostak",
      npmIdentity: "maksymshostak",
      publicKey:
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGpqSjJMHCFWXzxM8jB87C66pKkTWLNi4a7scQ/KSDo/",
      fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
      validFrom: "2026-08-01",
      validUntil: null,
      revokedOn: null,
      status: "ACTIVE",
    },
  ],
};

describe("release-tag verification", () => {
  test("extracts the verified SSH fingerprint and principal", () => {
    expect(
      parseSshVerification(
        'Good "git" signature for MaksymShostak with ED25519 key SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU',
      ),
    ).toEqual({
      fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
      principal: "MaksymShostak",
    });
  });

  test("combines local and GitHub verification at the captured commit", () => {
    expect(
      verifyReleaseTagFacts({
        expectedTag: "v0.1.0-alpha.0",
        expectedCommit: "a".repeat(40),
        objectType: "tag",
        targetCommit: "a".repeat(40),
        localVerification:
          'Good "git" signature for MaksymShostak with ED25519 key SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU',
        githubTag: {
          tag: "v0.1.0-alpha.0",
          object: { type: "commit", sha: "a".repeat(40) },
          verification: {
            verified: true,
            reason: "valid",
            verified_at: "2026-08-28T08:00:00Z",
          },
        },
        registry,
        releaseDate: "2026-08-28",
      }),
    ).toEqual({
      result: "PASS",
      tag: "v0.1.0-alpha.0",
      sourceCommit: "a".repeat(40),
      signerId: "maksym-shostak-github-ssh-2026",
      signerPrincipal: "MaksymShostak",
      fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
      githubVerifiedAt: "2026-08-28T08:00:00Z",
    });
  });

  test("rejects a GitHub tag object that targets another commit", () => {
    expect(() =>
      verifyReleaseTagFacts({
        expectedTag: "v0.1.0-alpha.0",
        expectedCommit: "a".repeat(40),
        objectType: "tag",
        targetCommit: "a".repeat(40),
        localVerification:
          'Good "git" signature for MaksymShostak with ED25519 key SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU',
        githubTag: {
          tag: "v0.1.0-alpha.0",
          object: { type: "commit", sha: "b".repeat(40) },
          verification: { verified: true, reason: "valid" },
        },
        registry,
        releaseDate: "2026-08-28",
      }),
    ).toThrow(/GitHub tag object/u);
  });
});
