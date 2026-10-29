import { assertGitHubCliArchive } from "./github-cli.mjs";

describe("pinned GitHub CLI", () => {
  test("accepts only the reviewed Linux x64 2.103.3 archive", () => {
    expect(
      assertGitHubCliArchive({
        name: "gh_2.103.3_linux_amd64.tar.gz",
        sha256:
          "4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d",
      }),
    ).toEqual({
      version: "2.103.3",
      url: "https://github.com/cli/cli/releases/download/v2.103.3/gh_2.103.3_linux_amd64.tar.gz",
      sha256:
        "4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d",
    });
  });

  test("rejects an unreviewed archive digest", () => {
    expect(() =>
      assertGitHubCliArchive({
        name: "gh_2.103.3_linux_amd64.tar.gz",
        sha256: "a".repeat(64),
      }),
    ).toThrow(/digest/u);
  });
});
