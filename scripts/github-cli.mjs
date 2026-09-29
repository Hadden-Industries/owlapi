const identity = Object.freeze({
  version: "2.101.0",
  name: "gh_2.101.0_linux_amd64.tar.gz",
  sha256: "9bca2d1c16825f109907a23307628a2f0698fbf99662b73a5cf0b020293072b8",
  checksumsName: "gh_2.101.0_checksums.txt",
  checksumsSha256:
    "f8bbc37fc5568a6a162d1a67b1e9c1afa9139f7b5a46dcde4a57bdaa0db33b60",
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
