import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatJsonSource,
  formatJsonValue,
} from "@hadden-industries/json-quality";
import { validateReleasedOracle } from "./validate-released-oracle.mjs";

const directory = fileURLToPath(
  new URL(
    "../../docs/compatibility/profiles/java-owlapi-5.5.1/",
    import.meta.url,
  ),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Re-present existing measurements; never claim a new Java execution. */
export async function refreshReleasedOraclePresentation(backupDirectory) {
  if (!backupDirectory || !isAbsolute(backupDirectory))
    throw new Error(
      "An absolute, fresh evidence backup directory is required.",
    );
  backupDirectory = resolve(backupDirectory);
  const backupWithinProfile = relative(directory, backupDirectory);
  if (!backupWithinProfile.startsWith("..") && !isAbsolute(backupWithinProfile))
    throw new Error(
      "The original evidence backup must be outside the profile.",
    );
  const beforeVerification = validateReleasedOracle();
  const originals = new Map();
  const candidates = new Map();
  for (const rawName of (
    await readdir(directory, { recursive: true })
  ).sort()) {
    const name = rawName.split("\\").join("/");
    if (!name.endsWith(".json")) continue;
    const stat = await lstat(join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Evidence is not a regular JSON file: ${name}`);
    const bytes = await readFile(join(directory, name));
    originals.set(name, bytes);
    candidates.set(
      name,
      Buffer.from(await formatJsonSource(bytes.toString("utf8"))),
    );
  }
  const evidence = JSON.parse(originals.get("evidence-manifest.json"));
  for (const entry of evidence.evidence) {
    const bytes = candidates.get(entry.path);
    if (!bytes) continue;
    entry.sha256 = digest(bytes);
    entry.byteLength = bytes.length;
  }
  candidates.set(
    "evidence-manifest.json",
    Buffer.from(await formatJsonValue(evidence)),
  );
  const provenance = JSON.parse(originals.get("provenance.json"));
  provenance.oracle.fixtureManifestSha256 = digest(
    candidates.get("fixture-manifest.json"),
  );
  provenance.oracle.observationManifestSha256 = digest(
    candidates.get("central-observations.json"),
  );
  const lockHash = digest(
    candidates.get(provenance.mavenCentral.dependencyLock.path),
  );
  provenance.mavenCentral.dependencyLock.sha256 = lockHash;
  provenance.oracle.classpathLockSha256 = lockHash;
  candidates.set(
    "provenance.json",
    Buffer.from(await formatJsonValue(provenance)),
  );
  const afterVerification = validateReleasedOracle({
    readArtifact: (path) => {
      const name = relative(directory, path).split("\\").join("/");
      return candidates.get(name) ?? readFileSync(path);
    },
  });
  await mkdir(backupDirectory);
  for (const [name, bytes] of originals) {
    await mkdir(join(backupDirectory, name, ".."), { recursive: true });
    await writeFile(join(backupDirectory, name), bytes, { flag: "wx" });
    if (!(await readFile(join(directory, name))).equals(bytes))
      throw new Error(
        `Evidence changed during presentation preparation: ${name}`,
      );
  }
  const changed = [...candidates].filter(
    ([name, bytes]) => !bytes.equals(originals.get(name)),
  );
  let verified;
  try {
    for (const [name, bytes] of changed)
      await writeFile(join(directory, name), bytes);
    verified = validateReleasedOracle();
  } catch (error) {
    for (const [name] of changed)
      await writeFile(join(directory, name), originals.get(name));
    throw error;
  }
  return {
    kind: "presentation-rebinding",
    backupDirectory,
    beforeVerification,
    candidateVerification: afterVerification,
    verification: verified,
    measurementsReexecuted: false,
    files: changed.map(([name, bytes]) => ({
      path: name,
      originalSha256: digest(originals.get(name)),
      sha256: digest(bytes),
      byteLength: bytes.length,
    })),
  };
}
