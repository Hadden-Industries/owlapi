/** Verify raw public-SDK downloads before any archive can reach materialization. */
import { stat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { crc32 } from "node:zlib";
import { policy, hashBytes } from "./identity.mjs";
import { inspectArchive } from "./payload.mjs";

/** The client seam is the SDK's public downloadArtifact operation. */
export async function inspectArtifact(client, artifact, directory) {
  if (
    !Number.isSafeInteger(artifact.id) ||
    artifact.id < 1 ||
    !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest) ||
    !Number.isSafeInteger(artifact.size) ||
    artifact.size < 1 ||
    artifact.size > policy.maximumArchiveBytes
  )
    throw new Error("Invalid artifact server metadata");
  // The worker owns this directory. Its parent separately enforces the deadline.
  let checking = false;
  const watcher = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      let total = 0;
      for (const file of await readdir(directory)) {
        const info = await stat(resolve(directory, file));
        if (!info.isFile()) process.exit(1);
        total += info.size;
      }
      if (total > policy.maximumArchiveBytes) process.exit(1);
    } catch {
      process.exit(1);
    }
    checking = false;
  }, 50);
  try {
    const download = await client.downloadArtifact(artifact.id, {
      path: directory,
      expectedHash: artifact.digest,
      skipDecompress: true,
    });
    if (download.digestMismatch)
      throw new Error("Artifact server digest mismatch");
    const names = await readdir(directory);
    if (names.length !== 1)
      throw new Error("Raw download inventory is not one archive");
    const archivePath = resolve(directory, names[0]);
    const info = await stat(archivePath);
    if (
      !info.isFile() ||
      info.size > policy.maximumArchiveBytes ||
      info.size !== artifact.size
    ) {
      throw new Error("Artifact archive size mismatch");
    }
    const bytes = await readFile(archivePath);
    if (`sha256:${hashBytes(bytes)}` !== artifact.digest)
      throw new Error("Artifact server digest mismatch");
    return { manifest: inspectArchive(bytes, crc32).manifest, archivePath };
  } finally {
    clearInterval(watcher);
  }
}
