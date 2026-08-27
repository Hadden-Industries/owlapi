import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const control = JSON.parse(
  readFileSync(
    join(repositoryRoot, "docs", "release", "publication-control.json"),
    "utf8",
  ),
);

if (!control.enabled) {
  process.stdout.write(
    `${JSON.stringify(
      {
        result: "NOT_APPLICABLE",
        reason: "PUBLICATION_BOUNDARY_DISABLED",
        coordinate: "owlapi@latest",
      },
      null,
      2,
    )}\n`,
  );
} else {
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
}
