import { execFileSync } from "node:child_process";

let localGitVariables;
/** Keep transports and user settings while isolating repository, ref and object-store selection for the explicitly chosen checkout. */
export function checkoutGitEnvironment(cwd) {
  const inherited = Object.entries(process.env);
  if (!localGitVariables) {
    const names = execFileSync("git", ["rev-parse", "--local-env-vars"], {
      cwd,
      env: Object.fromEntries(
        inherited.filter(([key]) => !/^GIT_/iu.test(key)),
      ),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      windowsHide: true,
    });
    localGitVariables = new Set([
      ...names.trim().split(/\s+/u),
      "GIT_CEILING_DIRECTORIES",
      "GIT_DISCOVERY_ACROSS_FILESYSTEM",
      "GIT_NAMESPACE",
      "GIT_QUARANTINE_PATH",
    ]);
  }
  return {
    ...Object.fromEntries(
      inherited.filter(
        ([key]) =>
          !localGitVariables.has(key.toUpperCase()) &&
          !/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/iu.test(key),
      ),
    ),
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
  };
}
