import {
  assertDraftRelease,
  assertPublishedRelease,
  assertReleaseAssetSubset,
  assertReleaseAssets,
  classifyWriteReconciliation,
  GitHubReleaseClient,
} from "./github-release.mjs";

test("finds an authenticated draft when the published-by-tag endpoint returns 404", async () => {
  const client = new GitHubReleaseClient({
    repository: "Hadden-Industries/owlapi",
    token: "fixture-token",
  });
  const reads = [];
  const draft = { id: 42, draft: true, tag_name: "v0.1.0-rc.2" };
  client.read = async (path) => {
    reads.push(path);
    return path.startsWith("/releases/tags/") ? null : [draft];
  };
  expect(await client.getReleaseByTag("v0.1.0-rc.2")).toBe(draft);
  expect(reads).toEqual([
    "/releases/tags/v0.1.0-rc.2",
    "/releases?per_page=100&page=1",
  ]);
});

test("rejects ambiguous drafts instead of choosing the first matching tag", async () => {
  const client = new GitHubReleaseClient({
    repository: "Hadden-Industries/owlapi",
    token: "fixture-token",
  });
  client.read = async (path) =>
    path.startsWith("/releases/tags/")
      ? null
      : [
          { id: 42, draft: true, tag_name: "v0.1.0-rc.2" },
          { id: 43, draft: true, tag_name: "v0.1.0-rc.2" },
        ];
  await expect(client.getReleaseByTag("v0.1.0-rc.2")).rejects.toThrow(
    "Multiple releases",
  );
});

describe("GitHub release state", () => {
  test("accepts only a draft attached to the independently verified tag", () => {
    expect(
      assertDraftRelease(
        {
          id: 42,
          draft: true,
          tag_name: "v0.1.0-rc.2",
          target_commitish: "a".repeat(40),
          html_url:
            "https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.2",
        },
        { tag: "v0.1.0-rc.2", commit: "a".repeat(40) },
      ),
    ).toEqual({
      id: 42,
      url: "https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.2",
    });
  });

  test("treats target_commitish as non-authoritative after the tag exists", () => {
    expect(
      assertDraftRelease(
        {
          id: 42,
          draft: true,
          tag_name: "v0.1.0-rc.2",
          target_commitish: "main",
          html_url:
            "https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.2",
        },
        { tag: "v0.1.0-rc.2", commit: "a".repeat(40) },
      ).id,
    ).toBe(42);
  });

  test("rejects a published release where a draft is required", () => {
    expect(() =>
      assertDraftRelease(
        {
          id: 42,
          draft: false,
          tag_name: "v0.1.0-rc.2",
          target_commitish: "a".repeat(40),
        },
        { tag: "v0.1.0-rc.2", commit: "a".repeat(40) },
      ),
    ).toThrow(/draft/u);
  });

  test("accepts the published immutable prerelease at the exact tag", () => {
    expect(
      assertPublishedRelease(
        {
          id: 42,
          draft: false,
          prerelease: true,
          immutable: true,
          tag_name: "v0.1.0-rc.2",
          target_commitish: "a".repeat(40),
          published_at: "2026-08-28T12:30:00Z",
          html_url:
            "https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.2",
        },
        {
          tag: "v0.1.0-rc.2",
          commit: "a".repeat(40),
          requireImmutable: true,
        },
      ),
    ).toEqual({
      id: 42,
      immutable: true,
      publishedAt: "2026-08-28T12:30:00Z",
      url: "https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.2",
    });
  });

  test("accepts the exact closed asset inventory and GitHub digests", () => {
    expect(
      assertReleaseAssets({
        assets: [
          { name: "SHA256SUMS", size: 190, digest: `sha256:${"a".repeat(64)}` },
          {
            name: "hadden-industries-owlapi-0.1.0-rc.2.cdx.json",
            size: 700,
            digest: `sha256:${"b".repeat(64)}`,
          },
          {
            name: "hadden-industries-owlapi-0.1.0-rc.2.tgz",
            size: 900,
            digest: `sha256:${"c".repeat(64)}`,
          },
        ],
        expected: [
          { name: "SHA256SUMS", bytes: 190, sha256: "a".repeat(64) },
          {
            name: "hadden-industries-owlapi-0.1.0-rc.2.cdx.json",
            bytes: 700,
            sha256: "b".repeat(64),
          },
          {
            name: "hadden-industries-owlapi-0.1.0-rc.2.tgz",
            bytes: 900,
            sha256: "c".repeat(64),
          },
        ],
      }),
    ).toHaveLength(3);
  });

  test("rejects an unexpected pre-existing draft asset before another write", () => {
    expect(() =>
      assertReleaseAssetSubset({
        assets: [
          {
            name: "unexpected.zip",
            size: 10,
            digest: `sha256:${"a".repeat(64)}`,
          },
        ],
        expected: [{ name: "SHA256SUMS", bytes: 190, sha256: "b".repeat(64) }],
      }),
    ).toThrow(/unexpected or conflicting/u);
  });

  test("requires read-only reconciliation after an ambiguous write", () => {
    expect(
      classifyWriteReconciliation({ writeResult: "AMBIGUOUS", observed: null }),
    ).toBe("FAIL_CLOSED");
    expect(
      classifyWriteReconciliation({
        writeResult: "AMBIGUOUS",
        observed: { matchesExactIntent: true },
      }),
    ).toBe("ACCEPT_RECONCILED_WRITE");
  });
});
