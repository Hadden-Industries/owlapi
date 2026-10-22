/** Collect verified copies with bounded downloads and newly owned output. */
import { cp, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { crc32 } from "node:zlib";
import { policy } from "./identity.mjs";
import {
  assertWorkspacePath,
  assertSameManifest,
  inspectArchive,
  materializeArchive,
} from "./payload.mjs";

export async function collectArtifacts({
  adapter,
  groups,
  workspace,
  path,
  temporary,
  exact,
  controls,
  report = () => {},
  onPhase = () => {},
  now = () => performance.now(),
}) {
  const guard = () => {
    controls.signal?.throwIfAborted();
    if (now() >= controls.deadline)
      throw new Error("Artifact collection deadline exceeded");
  };
  guard();
  const base = await realpath(workspace);
  const output = resolve(base, path);
  await assertWorkspacePath(base, output, { allowMissing: true });
  const collection = join(temporary, "collection");
  if (!exact) await mkdir(collection);
  let downloadedBytes = 0;
  let collectedBytes = 0;
  let collectedFiles = 0;
  for (const [logical, copies] of groups) {
    guard();
    report({
      artifactTransport: policy.version,
      operation: "collect",
      logical,
      physicalNames: copies.map((copy) => copy.name),
    });
    let expected;
    for (const copy of copies) {
      guard();
      if (
        !Number.isSafeInteger(copy.size) ||
        copy.size < 1 ||
        copy.size > policy.maximumArchiveBytes ||
        downloadedBytes + copy.size > policy.maximumCollectionDownloadBytes
      )
        throw new Error("Artifact collection download budget exceeded");
      downloadedBytes += copy.size;
      onPhase("verify-transport-copy");
      const recovered = await adapter.inspect(copy, controls);
      try {
        guard();
        if (expected) {
          assertSameManifest(expected, recovered.manifest);
        } else {
          expected = recovered.manifest;
          collectedFiles += expected.length;
          collectedBytes += expected.reduce((sum, file) => sum + file.bytes, 0);
          if (
            collectedFiles > policy.maximumFiles ||
            collectedBytes > policy.maximumPayloadBytes
          )
            throw new Error(
              "Complete artifact collection exceeds payload policy",
            );
          const archive = inspectArchive(
            await readFile(recovered.archivePath),
            crc32,
          );
          assertSameManifest(expected, archive.manifest);
          onPhase("materialize-verified-payload");
          await materializeArchive(
            archive.files,
            exact ? collection : join(collection, logical),
            controls,
          );
        }
      } finally {
        // Verification children have closed before their owned download is retired.
        await recovered.dispose();
      }
    }
  }
  guard();
  onPhase("publish-verified-payload");
  await assertWorkspacePath(base, output, { allowMissing: true });
  await mkdir(dirname(output), { recursive: true });
  await assertWorkspacePath(base, output, { allowMissing: true });
  await mkdir(output);
  for (const name of await readdir(collection)) {
    guard();
    await cp(join(collection, name), join(output, name), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  guard();
}
