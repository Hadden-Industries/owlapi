import { readGzipTarFile } from "./release-artifacts.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";

/** Moving full metadata is an observation, never an immutable artifact oracle. */
export const classifyRegistryReadme = ({ metadata, version, readme }) => {
  if (typeof metadata?.readme !== "string" || metadata.readme.length === 0)
    return { state: "README_ABSENT" };
  const publications = Object.entries(metadata.time ?? {})
    .filter(
      ([key, value]) =>
        !["created", "modified"].includes(key) &&
        Object.hasOwn(metadata.versions ?? {}, key) &&
        Number.isFinite(Date.parse(value)),
    )
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
  const mostRecent =
    publications.length &&
    (publications.length === 1 || publications[0][1] !== publications[1][1])
      ? publications[0][0]
      : null;
  if (mostRecent && mostRecent !== version)
    return { state: "OTHER_RECENT_PUBLICATION", version: mostRecent };
  if (metadata.readme === readme)
    return { state: "MATCH", version: mostRecent };
  if (readme.startsWith(metadata.readme))
    return {
      state: "MATCHING_PREFIX",
      version: mostRecent,
      characters: metadata.readme.length,
    };
  return { state: "DIFFERENT_CONTENT", version: mostRecent };
};

export const observeRegistryDocumentation = async ({
  manifest,
  tarball,
  read = readPublicRegistry,
}) => {
  try {
    const bytes = await read(
      `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}`,
      { attempts: 1, timeoutMs: 15000, maxBytes: 16 * 1024 * 1024 },
    );
    const metadata = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (metadata.name !== manifest.name)
      return { state: "UNAVAILABLE", reason: "package identity differs" };
    return classifyRegistryReadme({
      metadata,
      version: manifest.version,
      readme: readGzipTarFile(tarball, "README.md").toString("utf8"),
    });
  } catch {
    return {
      state: "UNAVAILABLE",
      reason: "bounded metadata read did not establish a README observation",
    };
  }
};
