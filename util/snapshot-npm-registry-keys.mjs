import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRegistryKeySnapshot } from "./acquire-npm-package-evidence.mjs";
import { stableJson } from "./third-party-evidence/digests.mjs";

export const snapshotRegistryKeys = async ({
  outputPath,
  fetchImpl = fetch,
  sleep,
} = {}) => {
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    throw new TypeError("Registry-key snapshot requires an output path");
  }
  const snapshot = await createRegistryKeySnapshot({ fetchImpl, sleep });
  await mkdir(dirname(outputPath), { recursive: true });
  // Exclusive creation prevents a stale or earlier-attempt key set from being
  // silently reused inside one job. GitHub artifact replacement is handled at
  // the workflow boundary, where the complete snapshot is digest-verified.
  await writeFile(outputPath, stableJson(snapshot), { flag: "wx" });
  return snapshot;
};

export const parseSnapshotArguments = (arguments_) => {
  if (!Array.isArray(arguments_) || arguments_.length !== 1) {
    throw new TypeError("Registry-key snapshot requires exactly --output");
  }
  const match = /^--output=(.+)$/u.exec(arguments_[0]);
  if (!match) {
    throw new TypeError("Registry-key snapshot requires --output=<path>");
  }
  return { outputPath: match[1] };
};

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const options = parseSnapshotArguments(process.argv.slice(2));
    const snapshot = await snapshotRegistryKeys(options);
    process.stdout.write(
      stableJson({
        status: "SNAPSHOTTED",
        keyCount: snapshot.keys.length,
        registryOrigin: snapshot.registryOrigin,
      }),
    );
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
