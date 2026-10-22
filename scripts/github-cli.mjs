const identity = Object.freeze({
  version: "2.102.1",
  name: "gh_2.102.1_linux_amd64.tar.gz",
  sha256: "77b9e297e94c50336823d0f84de7ef1be60cba704601fa0d98f129f47a94987b",
  checksumsName: "gh_2.102.1_checksums.txt",
  checksumsSha256:
    "7b35c23de1547377b2c3276e2e4f02b3c44a4ce2686e3fe00a77a9c48b0daa8d",
});

export const GITHUB_CLI_IDENTITY = identity;

export const assertGitHubCliArchive = ({ name, sha256 }) => {
  if (name !== identity.name || sha256 !== identity.sha256) {
    throw new Error("The GitHub CLI archive name or digest is not reviewed.");
  }
  return {
    version: identity.version,
    url: `https://github.com/cli/cli/releases/download/v${identity.version}/${identity.name}`,
    sha256: identity.sha256,
  };
};
