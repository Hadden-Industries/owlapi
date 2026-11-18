/** Trusted coordinates for release readers that run before npm setup. */
export const REPOSITORY = "Hadden-Industries/owlapi";
export const REPOSITORY_ID = 1347610640;
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
export const REPOSITORY_GIT_URL = `${REPOSITORY_URL}.git`;
export const REPOSITORY_NPM_URL = `git+${REPOSITORY_GIT_URL}`;

export const PACKAGE_NAME = "@hadden-industries/owlapi";
export const PACKAGE_FILE_STEM = PACKAGE_NAME.slice(1).replace("/", "-");
export const NPM_REGISTRY = "https://registry.npmjs.org/";

export const packagePurl = (version) =>
  `pkg:npm/${PACKAGE_NAME.replace("@", "%40")}@${version}`;

// The pinned CycloneDX generator retains the repository qualifier.
export const packageSbomPurl = (version) =>
  `${packagePurl(version)}?vcs_url=${encodeURIComponent(REPOSITORY_NPM_URL)}`;

export const githubWorkflowIdentityPattern = (workflowPath, ref) => {
  const uri = `${REPOSITORY_URL}/${workflowPath}@${ref}`;
  return `^${uri.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`;
};
