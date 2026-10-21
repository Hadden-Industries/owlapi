import { assertGitHubCliArchive } from "./github-cli.mjs";

describe("pinned GitHub CLI", () => {
  test("accepts only the reviewed Linux x64 2.102.1 archive", () => {
    expect(
      assertGitHubCliArchive({
        name: "gh_2.102.1_linux_amd64.tar.gz",
        sha256:
          "77b9e297e94c50336823d0f84de7ef1be60cba704601fa0d98f129f47a94987b",
      }),
    ).toEqual({
      version: "2.102.1",
      url: "https://github.com/cli/cli/releases/download/v2.102.1/gh_2.102.1_linux_amd64.tar.gz",
      sha256:
        "77b9e297e94c50336823d0f84de7ef1be60cba704601fa0d98f129f47a94987b",
    });
  });

  test("rejects an unreviewed archive digest", () => {
    expect(() =>
      assertGitHubCliArchive({
        name: "gh_2.102.1_linux_amd64.tar.gz",
        sha256: "a".repeat(64),
      }),
    ).toThrow(/digest/u);
  });
});
