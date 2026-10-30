const identity = Object.freeze({
  version: "2.103.3",
  name: "gh_2.103.3_linux_amd64.tar.gz",
  sha256: "4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d",
  checksumsName: "gh_2.103.3_checksums.txt",
  checksumsSha256:
    "f756e7859d90dbb5e85aae5194206c37da220bec9bac23d3d659078a8e766fdc",
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
