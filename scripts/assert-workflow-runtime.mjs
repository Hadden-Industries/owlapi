import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";

export const assertWorkflowRuntime = ({
  expectedNode,
  expectedNpm,
  observedNode,
  observedNpm,
}) => {
  if (observedNode !== `v${expectedNode}`) {
    throw new Error(
      `Node ${observedNode} does not match required v${expectedNode}.`,
    );
  }
  if (observedNpm !== expectedNpm) {
    throw new Error(
      `npm ${observedNpm} does not match required ${expectedNpm}.`,
    );
  }
  return { node: observedNode, npm: observedNpm };
};

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return process.argv[index + 1];
};

export const findNpmCliCandidates = ({
  executablePath = process.execPath,
  pathValue = process.env.PATH || "",
  platform = process.platform,
  exists = existsSync,
} = {}) => {
  const pathApi = platform === "win32" ? win32 : posix;
  const candidates = [];
  const seen = new Set();
  const add = (candidate) => {
    const normalized = pathApi.normalize(candidate);
    const key = platform === "win32" ? normalized.toLowerCase() : normalized;
    if (!seen.has(key) && exists(normalized)) {
      seen.add(key);
      candidates.push(normalized);
    }
  };
  const addPrefixLayouts = (directory) => {
    add(pathApi.join(directory, "node_modules", "npm", "bin", "npm-cli.js"));
    add(
      pathApi.resolve(
        directory,
        "..",
        "lib",
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      ),
    );
  };

  // A global npm update can place its shim and JavaScript CLI in a PATH prefix
  // separate from Node's bundled npm, notably on GitHub's Windows runners. Walk
  // only these documented, bounded layouts and preserve PATH precedence.
  for (const directory of pathValue
    .split(pathApi.delimiter)
    .filter((entry) => entry.length > 0)) {
    addPrefixLayouts(directory);
  }
  addPrefixLayouts(pathApi.dirname(executablePath));
  return candidates;
};

export const selectNpmCliForVersion = ({
  expectedNpm,
  candidates,
  observeVersion,
}) => {
  const observations = [];
  for (const npmCli of candidates) {
    try {
      const version = observeVersion(npmCli);
      observations.push(`${npmCli} (${String(version)})`);
      if (version === expectedNpm) {
        return { npmCli, version };
      }
    } catch (error) {
      observations.push(`${npmCli} (${error.message})`);
    }
  }
  throw new Error(
    `Unable to locate npm ${expectedNpm} for ${process.execPath}. Observed: ${
      observations.length > 0
        ? observations.join(", ")
        : "no npm CLI candidates"
    }`,
  );
};

const observeNpmVersion = (npmCli) => {
  // Invoke the JavaScript entry point with the selected Node executable so a
  // `.cmd` shim or command shell is never part of the runtime assertion.
  const observation = spawnSync(process.execPath, [npmCli, "--version"], {
    encoding: "utf8",
    shell: false,
  });
  if (observation.error || observation.status !== 0) {
    const details = [
      observation.error?.message,
      observation.stdout,
      observation.stderr,
    ]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join("\n");
    throw new Error(details || "npm CLI execution failed");
  }
  return observation.stdout.trim();
};

const main = () => {
  const expectedNode = valueAfter("--node");
  const expectedNpm = valueAfter("--npm");
  const selectedNpm = selectNpmCliForVersion({
    expectedNpm,
    candidates: findNpmCliCandidates(),
    observeVersion: observeNpmVersion,
  });
  const accepted = assertWorkflowRuntime({
    expectedNode,
    expectedNpm,
    observedNode: process.version,
    observedNpm: selectedNpm.version,
  });
  process.stdout.write(`${JSON.stringify(accepted, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
