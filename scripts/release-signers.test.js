import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  assertReleaseTag,
  buildAllowedSigners,
  selectAuthorizedSigner,
} from "./release-signers.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

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

describe("release signer authorization", () => {
  test("the checked-in signer registry satisfies its strict schema", () => {
    const schema = JSON.parse(
      readFileSync(
        join(
          repositoryRoot,
          "docs",
          "provenance",
          "release-signers.schema.json",
        ),
        "utf8",
      ),
    );
    const record = JSON.parse(
      readFileSync(
        join(repositoryRoot, "docs", "provenance", "release-signers.json"),
        "utf8",
      ),
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    expect(validate(record)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  test("selects the active signer at the release date", () => {
    expect(
      selectAuthorizedSigner(registry, {
        fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
        releaseDate: "2026-08-28",
      }).id,
    ).toBe("maksym-shostak-github-ssh-2026");
  });

  test("rejects a signer that was not admitted before the release", () => {
    expect(() =>
      selectAuthorizedSigner(registry, {
        fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
        releaseDate: "2026-07-31",
      }),
    ).toThrow(/not authorized on 2026-07-31/u);
  });

  test("renders a deterministic SSH allowed-signers file", () => {
    expect(buildAllowedSigners(registry)).toBe(
      "MaksymShostak ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGpqSjJMHCFWXzxM8jB87C66pKkTWLNi4a7scQ/KSDo/\n",
    );
  });
});

describe("release tag acceptance", () => {
  test("accepts the annotated verified tag at the captured commit", () => {
    expect(
      assertReleaseTag({
        actualTag: "v0.1.0-alpha.0",
        expectedTag: "v0.1.0-alpha.0",
        objectType: "tag",
        targetCommit: "a".repeat(40),
        expectedCommit: "a".repeat(40),
        fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
        githubVerification: {
          verified: true,
          reason: "valid",
          verified_at: "2026-08-28T08:00:00Z",
        },
        registry,
        releaseDate: "2026-08-28",
      }).signerId,
    ).toBe("maksym-shostak-github-ssh-2026");
  });

  test("rejects a lightweight tag", () => {
    expect(() =>
      assertReleaseTag({
        actualTag: "v0.1.0-alpha.0",
        expectedTag: "v0.1.0-alpha.0",
        objectType: "commit",
        targetCommit: "a".repeat(40),
        expectedCommit: "a".repeat(40),
        fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
        githubVerification: { verified: true, reason: "valid" },
        registry,
        releaseDate: "2026-08-28",
      }),
    ).toThrow(/annotated tag/u);
  });

  test("rejects a GitHub-unverified tag", () => {
    expect(() =>
      assertReleaseTag({
        actualTag: "v0.1.0-alpha.0",
        expectedTag: "v0.1.0-alpha.0",
        objectType: "tag",
        targetCommit: "a".repeat(40),
        expectedCommit: "a".repeat(40),
        fingerprint: "SHA256:0lELaqBbgGHdSctv4GOpPmROX56wNCaii2PLZI5pXCU",
        githubVerification: { verified: false, reason: "unsigned" },
        registry,
        releaseDate: "2026-08-28",
      }),
    ).toThrow(/GitHub did not verify/u);
  });
});
