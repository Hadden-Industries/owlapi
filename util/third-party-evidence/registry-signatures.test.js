import { generateKeyPairSync, sign } from "node:crypto";
import {
  npmRegistryKeyId,
  registrySignaturePayload,
  verifyRegistrySignature,
} from "./registry-signatures.mjs";

const INTEGRITY =
  "sha512-/X/Fvp13e9O5/oZJEC3tNeTJU6FFkdrsM2Pz8EfXCpuP5BB9sxNyQxxYsAfCXDWuCTd6femcc7ChDDZqaFWu8A==";

const signedFixture = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const keyid = npmRegistryKeyId(publicDer);
  const identity = {
    name: "alpha",
    version: "1.0.0",
    integrity: INTEGRITY,
    publishedAt: "2024-01-01T00:00:00.000Z",
  };
  return {
    identity,
    key: {
      keyid,
      keytype: "ecdsa-sha2-nistp256",
      scheme: "ecdsa-sha2-nistp256",
      key: publicDer.toString("base64"),
      expires: "2025-01-29T00:00:00.000Z",
    },
    signature: {
      keyid,
      sig: sign(
        "sha256",
        Buffer.from(
          registrySignaturePayload(
            identity.name,
            identity.version,
            identity.integrity,
          ),
        ),
        privateKey,
      ).toString("base64"),
    },
  };
};

describe("registrySignaturePayload", () => {
  it("uses npm's exact package-version-integrity payload", () => {
    expect(registrySignaturePayload("alpha", "1.0.0", INTEGRITY)).toBe(
      `alpha@1.0.0:${INTEGRITY}`,
    );
  });
});

describe("npmRegistryKeyId", () => {
  it("reproduces npm's published P-256 SSH-wire fingerprint", () => {
    const publicDer = Buffer.from(
      "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1Olb3zMAFFxXKHiIkQO5cJ3Yhl5i6UPp+IhuteBJbuHcA5UogKo0EWtlWwW6KSaKoTNEYL7JlCQiVnkhBktUgg==",
      "base64",
    );

    expect(npmRegistryKeyId(publicDer)).toBe(
      "SHA256:jl3bwswu80PjjokCgh0o2w5c2U4LhQAE57gj9cz1kzA",
    );
  });
});

describe("verifyRegistrySignature", () => {
  it("replays a valid npm P-256 registry signature", () => {
    expect(verifyRegistrySignature(signedFixture())).toBe(true);
  });

  it.each([
    [
      "package name",
      ({ identity }) => ({ identity: { ...identity, name: "bravo" } }),
    ],
    [
      "package version",
      ({ identity }) => ({ identity: { ...identity, version: "1.0.1" } }),
    ],
    [
      "integrity",
      ({ identity }) => ({
        identity: { ...identity, integrity: `sha512-${"A".repeat(86)}==` },
      }),
    ],
    [
      "publication time",
      ({ identity }) => ({
        identity: { ...identity, publishedAt: "not-a-date" },
      }),
    ],
    [
      "expired key",
      ({ identity }) => ({
        identity: { ...identity, publishedAt: "2025-01-29T00:00:00.000Z" },
      }),
    ],
    [
      "signature",
      ({ signature }) => ({
        signature: { ...signature, sig: Buffer.alloc(72).toString("base64") },
      }),
    ],
    [
      "signature key identifier",
      ({ signature }) => ({
        signature: {
          ...signature,
          keyid: `SHA256:${Buffer.alloc(32).toString("base64").replace(/=+$/u, "")}`,
        },
      }),
    ],
    [
      "public key identifier",
      ({ key }) => ({
        key: {
          ...key,
          keyid: `SHA256:${Buffer.alloc(32).toString("base64").replace(/=+$/u, "")}`,
        },
      }),
    ],
    [
      "signing scheme",
      ({ key }) => ({ key: { ...key, scheme: "unsupported" } }),
    ],
  ])("rejects a changed %s", (_label, mutate) => {
    const fixture = signedFixture();
    const changed = { ...fixture, ...mutate(fixture) };

    expect(() => verifyRegistrySignature(changed)).toThrow(
      /registry signature/iu,
    );
  });
});
