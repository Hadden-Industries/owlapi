import { assertGitHubCliArchive } from "./github-cli.mjs";

describe("pinned GitHub CLI", () => {
  test("accepts only the reviewed Linux x64 2.98.0 archive", () => {
    expect(
      assertGitHubCliArchive({
        name: "gh_2.98.0_linux_amd64.tar.gz",
        sha256:
          "3b8ac6b30336802fc1a858d7c084e11cdf24ac1a761ca90b68022d7d729208de",
      }),
    ).toEqual({
      version: "2.98.0",
      url: "https://github.com/cli/cli/releases/download/v2.98.0/gh_2.98.0_linux_amd64.tar.gz",
      sha256:
        "3b8ac6b30336802fc1a858d7c084e11cdf24ac1a761ca90b68022d7d729208de",
    });
  });

  test("rejects an unreviewed archive digest", () => {
    expect(() =>
      assertGitHubCliArchive({
        name: "gh_2.98.0_linux_amd64.tar.gz",
        sha256: "a".repeat(64),
      }),
    ).toThrow(/digest/u);
  });
});
