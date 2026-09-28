import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as releaseTagVerifier from "./verify-release-tag.mjs";

const { parseSshVerification, verifyReleaseTagFacts } = releaseTagVerifier;

const TEST_TAG = "v1.0.0-test.0";
const TEST_RELEASE_DATE = "2026-08-31";

const run = (executable, arguments_, cwd) =>
  execFileSync(executable, arguments_, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const git = (repository, ...arguments_) => run("git", arguments_, repository);

const createSigningKey = (directory, name) => {
  const privateKeyPath = join(directory, name);
  run("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    name,
    "-f",
    privateKeyPath,
  ]);
  const [algorithm, encodedKey] = readFileSync(`${privateKeyPath}.pub`, "utf8")
    .trim()
    .split(/\s+/u);
  const fingerprint = /SHA256:[A-Za-z0-9+/]{43}/u.exec(
    run("ssh-keygen", ["-lf", `${privateKeyPath}.pub`, "-E", "sha256"]),
  )?.[0];
  if (!fingerprint) {
    throw new Error(`Could not read the fingerprint for ${name}.`);
  }
  return {
    fingerprint,
    privateKeyPath,
    publicKey: `${algorithm} ${encodedKey}`,
  };
};

const signerRegistry = (signingKey) => ({
  schemaVersion: 1,
  signers: [
    {
      id: "registered-test-signer",
      naturalPersonName: "Registered Test Signer",
      githubIdentity: "RegisteredTestSigner",
      npmIdentity: "registered-test-signer",
      publicKey: signingKey.publicKey,
      fingerprint: signingKey.fingerprint,
      validFrom: "2026-01-01",
      validUntil: null,
      revokedOn: null,
      status: "ACTIVE",
    },
  ],
});

const createTagRepository = ({ kind, signingKey }) => {
  const repository = mkdtempSync(join(tmpdir(), "owlapi-release-tag-test-"));
  git(repository, "init", "--quiet");
  git(repository, "config", "user.name", "Release Tag Test");
  git(repository, "config", "user.email", "release-tag@example.test");
  git(repository, "config", "commit.gpgSign", "false");
  git(repository, "config", "tag.gpgSign", "false");

  writeFileSync(join(repository, "fixture.txt"), "first\n", "utf8");
  git(repository, "add", "fixture.txt");
  git(repository, "commit", "--quiet", "-m", "first fixture commit");
  const firstCommit = git(repository, "rev-parse", "HEAD");

  writeFileSync(join(repository, "fixture.txt"), "second\n", "utf8");
  git(repository, "add", "fixture.txt");
  git(repository, "commit", "--quiet", "-m", "second fixture commit");
  const secondCommit = git(repository, "rev-parse", "HEAD");

  if (kind === "signed") {
    git(
      repository,
      "-c",
      "gpg.format=ssh",
      "-c",
      `user.signingkey=${signingKey.privateKeyPath.replaceAll("\\", "/")}`,
      "tag",
      "-s",
      TEST_TAG,
      "-m",
      "signed fixture tag",
      firstCommit,
    );
  } else if (kind === "unsigned") {
    git(
      repository,
      "tag",
      "-a",
      TEST_TAG,
      "-m",
      "unsigned fixture tag",
      firstCommit,
    );
  } else if (kind === "lightweight") {
    git(repository, "tag", TEST_TAG, firstCommit);
  } else {
    throw new Error(`Unknown tag fixture kind ${kind}.`);
  }

  return { firstCommit, repository, secondCommit };
};

const verifyLocalFixture = ({ expectedCommit, registeredKey, repository }) =>
  releaseTagVerifier.verifyLocalReleaseTag({
    repositoryRoot: repository,
    expectedTag: TEST_TAG,
    expectedCommit,
    registry: signerRegistry(registeredKey),
    releaseDate: TEST_RELEASE_DATE,
  });

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
  test("creates the parent directory before persisting tag evidence", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "owlapi-tag-evidence-"));
    const outputPath = join(temporaryRoot, "nested", "tag-verification.json");
    const report = { result: "PASS", tag: "v0.1.0-alpha.0" };

    try {
      expect(typeof releaseTagVerifier.writeReleaseTagReport).toBe("function");
      releaseTagVerifier.writeReleaseTagReport(outputPath, report);
      expect(JSON.parse(readFileSync(outputPath, "utf8"))).toEqual(report);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

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

describe("local registered-signer tag verification", () => {
  let keyDirectory;
  let registeredKey;
  let unregisteredKey;

  beforeAll(() => {
    keyDirectory = mkdtempSync(join(tmpdir(), "owlapi-release-tag-keys-"));
    registeredKey = createSigningKey(keyDirectory, "registered");
    unregisteredKey = createSigningKey(keyDirectory, "unregistered");
  });

  afterAll(() => {
    rmSync(keyDirectory, { recursive: true, force: true });
  });

  test("accepts an annotated tag signed by the registered signer at the expected commit", () => {
    const fixture = createTagRepository({
      kind: "signed",
      signingKey: registeredKey,
    });

    try {
      expect(
        verifyLocalFixture({
          expectedCommit: fixture.firstCommit,
          registeredKey,
          repository: fixture.repository,
        }),
      ).toEqual({
        result: "PASS",
        tag: TEST_TAG,
        sourceCommit: fixture.firstCommit,
        signerId: "registered-test-signer",
        signerPrincipal: "RegisteredTestSigner",
        fingerprint: registeredKey.fingerprint,
      });
    } finally {
      rmSync(fixture.repository, { recursive: true, force: true });
    }
  });

  test("rejects a lightweight tag even when it targets the expected commit", () => {
    const fixture = createTagRepository({
      kind: "lightweight",
      signingKey: registeredKey,
    });

    try {
      expect(() =>
        verifyLocalFixture({
          expectedCommit: fixture.firstCommit,
          registeredKey,
          repository: fixture.repository,
        }),
      ).toThrow(/annotated tag/u);
    } finally {
      rmSync(fixture.repository, { recursive: true, force: true });
    }
  });

  test("rejects an unsigned annotated tag", () => {
    const fixture = createTagRepository({
      kind: "unsigned",
      signingKey: registeredKey,
    });

    try {
      expect(() =>
        verifyLocalFixture({
          expectedCommit: fixture.firstCommit,
          registeredKey,
          repository: fixture.repository,
        }),
      ).toThrow(/signature|verify-tag/u);
    } finally {
      rmSync(fixture.repository, { recursive: true, force: true });
    }
  });

  test("rejects a tag signed by a key absent from the signer registry", () => {
    const fixture = createTagRepository({
      kind: "signed",
      signingKey: unregisteredKey,
    });

    try {
      expect(() =>
        verifyLocalFixture({
          expectedCommit: fixture.firstCommit,
          registeredKey,
          repository: fixture.repository,
        }),
      ).toThrow(/signature|verify-tag/u);
    } finally {
      rmSync(fixture.repository, { recursive: true, force: true });
    }
  });

  test("rejects a valid registered signature over a different commit", () => {
    const fixture = createTagRepository({
      kind: "signed",
      signingKey: registeredKey,
    });

    try {
      expect(() =>
        verifyLocalFixture({
          expectedCommit: fixture.secondCommit,
          registeredKey,
          repository: fixture.repository,
        }),
      ).toThrow(/targets .* not captured commit/u);
    } finally {
      rmSync(fixture.repository, { recursive: true, force: true });
    }
  });
});
