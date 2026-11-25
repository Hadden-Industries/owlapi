import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import {
  referenceMavenDirectory,
  REFERENCE_RECIPE,
} from "./reference-inputs.mjs";

const runnerTemp = process.env.RUNNER_TEMP;
if (!runnerTemp || !isAbsolute(runnerTemp) || /[\r\n]/u.test(runnerTemp))
  throw new Error("RUNNER_TEMP must be an absolute directory for Maven setup");

const destination = referenceMavenDirectory(runnerTemp);
const distribution = basename(destination);
const archiveName = `${distribution}-bin.zip`;
const { version, zipSha512 } = REFERENCE_RECIPE.maven;
const url = `${REFERENCE_RECIPE.repository}/org/apache/maven/apache-maven/${version}/${archiveName}`;
const windows = process.platform === "win32";
const launcher = join("bin", windows ? "mvn.cmd" : "mvn");
const staging = await mkdtemp(join(runnerTemp, "owlapi-maven-"));
try {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok)
    throw new Error(`Maven download failed (HTTP ${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha512").update(bytes).digest("hex") !== zipSha512)
    throw new Error("The Maven archive differs from its pinned SHA-512");

  const archive = join(staging, archiveName);
  await writeFile(archive, bytes, { flag: "wx" });
  const extraction = windows
    ? spawnSync("tar.exe", ["-xf", archive, "-C", staging], {
        stdio: "inherit",
      })
    : spawnSync("unzip", ["-q", archive, "-d", staging], { stdio: "inherit" });
  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) throw new Error("Maven ZIP extraction failed");

  const extracted = join(staging, distribution);
  await access(
    join(extracted, launcher),
    windows ? constants.F_OK : constants.X_OK,
  );
  await mkdir(dirname(destination), { recursive: true });
  await rename(extracted, destination);
} finally {
  await rm(staging, { recursive: true, force: true });
}

const executable = join(destination, launcher);
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `executable=${executable}\n`);
process.stdout.write(`${executable}\n`);
