import { describe, expect, test } from "@jest/globals";

import { computeCorpusRoot } from "./blob-store.mjs";
import {
  EVIDENCE_SHARD_ALGORITHM,
  artifactShardIndex,
  createEvidenceShard,
  mergeEvidenceShardDocuments,
  selectShardArtifacts,
} from "./evidence-shards.mjs";

const artifactId = (prefix) => `${prefix}${"0".repeat(56)}`;

const makeGraph = () => {
  const artifacts = [
    ["00000000", "alpha"],
    ["00000001", "beta"],
    ["00000002", "gamma"],
    ["00000003", "delta"],
  ].map(([prefix, name]) => ({
    artifactId: artifactId(prefix),
    name,
    version: "1.0.0",
    resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
    integrity: `sha512-${"A".repeat(86)}==`,
    lockfileLicenses: ["MIT"],
    occurrencePaths: [`node_modules/${name}`],
  }));
  return {
    package: { name: "owlapi", version: "0.1.0-alpha.0" },
    lockfileVersion: 3,
    lockfileSha256: "a".repeat(64),
    artifacts,
    occurrences: artifacts.map((artifact) => ({
      dependencyPath: artifact.occurrencePaths[0],
      dependencyName: artifact.name,
      artifactId: artifact.artifactId,
      development: false,
      optional: false,
      platformSelectors: { cpu: [], os: [], libc: [] },
    })),
  };
};

const policy = Object.freeze({
  registryOrigin: "https://registry.npmjs.org",
  provenance: "VERIFY_WHEN_PUBLISHED",
  scanner: {
    name: "scancode-toolkit",
    version: "32.5.0",
    pythonVersion: "3.14",
    outputFormatVersion: "4.1.0",
    normalizationVersion: 1,
    semanticOptions: ["--license"],
    executionOptions: ["--processes", "1"],
  },
});

const blobFor = (index, kind = "SCANCODE_FINDINGS") => {
  const digest = index.toString(16).padStart(64, "0");
  return {
    sha256: digest,
    bytes: index + 1,
    path: `blobs/sha256/${digest.slice(0, 2)}/${digest}`,
    kind,
  };
};

const evidenceFor = (identity, index, blob = blobFor(index + 1)) => ({
  ...identity,
  tarball: { sha256: (index + 10).toString(16).padStart(64, "0"), bytes: 10 },
  archive: { state: "VERIFIED", evidence: blob },
  registrySignature: {
    state: "VERIFIED",
    publishedAt: "2026-01-01T00:00:00.000Z",
    signatures: [
      {
        keyid: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        sig: "sig",
      },
    ],
    evidence: blob,
  },
  provenance: { state: "NOT_PUBLISHED", evidence: blob },
  scan: { state: "VERIFIED", evidence: blob },
});

const makeShards = ({ count = 4, sharedBlob = false } = {}) => {
  const graph = makeGraph();
  const shared = blobFor(9, "PACKAGE_EVIDENCE_FILE");
  return {
    graph,
    shards: Array.from({ length: count }, (_, index) => {
      const identities = selectShardArtifacts(graph.artifacts, {
        count,
        index,
      });
      const blobs = identities.map((_, artifactIndex) =>
        sharedBlob ? shared : blobFor(index * 10 + artifactIndex + 1),
      );
      return createEvidenceShard({
        graph,
        policy,
        registryKeys: [],
        artifacts: identities.map((identity, artifactIndex) =>
          evidenceFor(
            identity,
            index * 10 + artifactIndex,
            blobs[artifactIndex],
          ),
        ),
        blobs,
        shard: { count, index },
      });
    }),
  };
};

describe("deterministic npm evidence sharding", () => {
  test("assigns the unsigned first artifact-id word modulo the shard count", () => {
    expect(artifactShardIndex(artifactId("00000000"), 32)).toBe(0);
    expect(artifactShardIndex(artifactId("0000001f"), 32)).toBe(31);
    expect(artifactShardIndex(artifactId("00000020"), 32)).toBe(0);
    expect(artifactShardIndex(artifactId("ffffffff"), 32)).toBe(31);
  });

  test("rejects malformed identifiers and invalid shard coordinates", () => {
    expect(() => artifactShardIndex("not-a-digest", 32)).toThrow(
      /artifact id/iu,
    );
    expect(() => artifactShardIndex(artifactId("00000000"), 0)).toThrow(
      /shard count/iu,
    );
    expect(() =>
      selectShardArtifacts(makeGraph().artifacts, { count: 4, index: 4 }),
    ).toThrow(/shard index/iu);
  });

  test("records exact lock, policy, membership, occurrence, and blob-root bindings", () => {
    const { graph } = makeShards();
    const selected = selectShardArtifacts(graph.artifacts, {
      count: 4,
      index: 2,
    });
    const blob = blobFor(2);
    const shard = createEvidenceShard({
      graph,
      policy,
      registryKeys: [],
      artifacts: selected.map((identity, index) =>
        evidenceFor(identity, index, blob),
      ),
      blobs: [blob],
      shard: { count: 4, index: 2 },
    });

    expect(shard).toMatchObject({
      schemaVersion: 1,
      shard: {
        algorithm: EVIDENCE_SHARD_ALGORITHM,
        count: 4,
        index: 2,
        artifactIds: selected.map(({ artifactId: id }) => id),
      },
      lockfile: { version: 3, sha256: graph.lockfileSha256 },
      policy,
      summary: { artifactCount: selected.length },
      corpusRoot: computeCorpusRoot([blob]),
    });
    expect(shard.occurrences.map(({ artifactId: id }) => id)).toEqual(
      selected.map(({ artifactId: id }) => id),
    );
  });
});

describe("npm evidence shard aggregation", () => {
  test("reconstructs one closed artifact set and deduplicates shared CAS blobs", () => {
    const { graph, shards } = makeShards({ sharedBlob: true });
    const merged = mergeEvidenceShardDocuments({ graph, shards });

    expect(merged.artifacts.map(({ artifactId: id }) => id)).toEqual(
      graph.artifacts.map(({ artifactId: id }) => id),
    );
    expect(merged.blobs).toHaveLength(1);
    expect(merged.policy).toEqual(policy);
  });

  test("fails on a missing or duplicate shard index", () => {
    const { graph, shards } = makeShards();
    expect(() =>
      mergeEvidenceShardDocuments({ graph, shards: shards.slice(1) }),
    ).toThrow(/missing shard/iu);
    expect(() =>
      mergeEvidenceShardDocuments({ graph, shards: [...shards, shards[0]] }),
    ).toThrow(/duplicate shard/iu);
  });

  test("fails on a misassigned or duplicate artifact", () => {
    const { graph, shards } = makeShards();
    const tampered = structuredClone(shards);
    tampered[0].artifacts.push(tampered[1].artifacts[0]);
    tampered[0].shard.artifactIds.push(tampered[1].artifacts[0].artifactId);

    expect(() =>
      mergeEvidenceShardDocuments({ graph, shards: tampered }),
    ).toThrow(/membership|misassigned artifact|duplicate artifact/iu);
  });

  test("fails on lock, policy, membership, or corpus-root disagreement", () => {
    for (const mutate of [
      (shard) => {
        shard.lockfile.sha256 = "b".repeat(64);
      },
      (shard) => {
        shard.policy.scanner.version = "32.4.1";
      },
      (shard) => {
        shard.shard.artifactIds = [];
      },
      (shard) => {
        shard.corpusRoot = "f".repeat(64);
      },
    ]) {
      const { graph, shards } = makeShards();
      mutate(shards[0]);
      expect(() => mergeEvidenceShardDocuments({ graph, shards })).toThrow();
    }
  });
});
