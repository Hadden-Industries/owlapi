import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
export const maintenanceTarget = (control) => {
  if (!control.enabled) {
    return {
      action: "NOT_APPLICABLE",
      reason: "PUBLICATION_BOUNDARY_DISABLED",
      coordinate: "owlapi@latest",
    };
  }
  if (control.channel !== "latest") {
    return {
      action: "NOT_APPLICABLE",
      reason: "NO_PRODUCTION_RELEASE",
      coordinate: "owlapi@latest",
    };
  }
  return { action: "QUERY", coordinate: "owlapi@latest" };
};

const main = () => {
  const control = JSON.parse(
    readFileSync(
      join(repositoryRoot, "docs", "release", "publication-control.json"),
      "utf8",
    ),
  );
  const target = maintenanceTarget(control);
  if (target.action === "NOT_APPLICABLE") {
    process.stdout.write(
      `${JSON.stringify({ result: "NOT_APPLICABLE", reason: target.reason, coordinate: target.coordinate }, null, 2)}\n`,
    );
    return;
  }
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("Run maintenance health through its named npm script.");
  }
  const result = spawnSync(
    process.execPath,
    [npmCli, "view", "owlapi@latest", "version", "--json"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `The active public production coordinate could not be resolved: ${result.stdout}${result.stderr}`,
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        result: "PASS",
        coordinate: "owlapi@latest",
        resolvedVersion: JSON.parse(result.stdout),
      },
      null,
      2,
    )}\n`,
  );
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
