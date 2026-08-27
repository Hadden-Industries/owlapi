import { spawnSync } from "node:child_process";
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

const main = () => {
  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
  const observation = spawnSync(npmExecutable, ["--version"], {
    encoding: "utf8",
    shell: false,
  });
  if (observation.status !== 0) {
    throw new Error(
      `Unable to observe npm: ${observation.stdout}${observation.stderr}`,
    );
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
