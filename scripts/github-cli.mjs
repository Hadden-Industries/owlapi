const identity = Object.freeze({
  version: "2.98.0",
  name: "gh_2.98.0_linux_amd64.tar.gz",
  sha256: "3b8ac6b30336802fc1a858d7c084e11cdf24ac1a761ca90b68022d7d729208de",
  checksumsName: "gh_2.98.0_checksums.txt",
  checksumsSha256:
    "275b90ae8a642fb8bdf4f21d7673e34643a445f7993f1821ac917ff8a2cc4db9",
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
