import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

const bundledNpmCli = () => {
  const executableDirectory = dirname(process.execPath);
  // Official Windows Node distributions keep npm beside node.exe; official
  // POSIX distributions (including setup-node) keep it in the sibling lib tree.
  // Invoke npm's JavaScript entry point with the selected Node executable so a
  // `.cmd` shim or a command shell is never part of the runtime assertion.
  const candidates =
    process.platform === "win32"
      ? [join(executableDirectory, "node_modules", "npm", "bin", "npm-cli.js")]
      : [
          resolve(
            executableDirectory,
            "..",
            "lib",
            "node_modules",
            "npm",
            "bin",
            "npm-cli.js",
          ),
          join(executableDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
        ];
  const npmCli = candidates.find((candidate) => existsSync(candidate));
  if (!npmCli) {
    throw new Error(
      `Unable to locate npm's JavaScript CLI for ${process.execPath}.`,
    );
  }
  return npmCli;
};

const main = () => {
  const observation = spawnSync(
    process.execPath,
    [bundledNpmCli(), "--version"],
    {
      encoding: "utf8",
      shell: false,
    },
  );
  if (observation.error || observation.status !== 0) {
    const details = [
      observation.error?.message,
      observation.stdout,
      observation.stderr,
    ]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join("\n");
    throw new Error(`Unable to observe npm${details ? `: ${details}` : "."}`);
  }
  const accepted = assertWorkflowRuntime({
    expectedNode: valueAfter("--node"),
    expectedNpm: valueAfter("--npm"),
    observedNode: process.version,
    observedNpm: observation.stdout.trim(),
  });
  process.stdout.write(`${JSON.stringify(accepted, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
