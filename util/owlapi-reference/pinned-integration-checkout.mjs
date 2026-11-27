import { execFileSync } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
  readUniversalOntologyManifest,
  universalOntologyManifestFile,
} from "./universal-ontology-manifest.mjs";

/** Admit the owner-approved foreign checkout boundary, never OwlAPI reports. */
export async function verifyPinnedIntegrationCheckout(root) {
  const checkout = join(root, ".release", "universal-ontology");
  let stat;
  try {
    stat = await lstat(checkout);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const releaseStat = await lstat(join(root, ".release"));
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    !releaseStat.isDirectory() ||
    releaseStat.isSymbolicLink()
  )
    throw new Error("Pinned integration checkout must be a real directory.");
  const repositoryRoot = await realpath(root);
  const actualCheckout = await realpath(checkout);
  const contained = relative(repositoryRoot, actualCheckout);
  if (!contained || contained.startsWith("..") || isAbsolute(contained))
    throw new Error("Pinned integration checkout must remain inside OwlAPI.");
  const git = (args) =>
    execFileSync("git", ["-C", actualCheckout, ...args], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    }).trim();
  const gitRoot = await realpath(git(["rev-parse", "--show-toplevel"]));
  if (relative(actualCheckout, gitRoot) !== "")
    throw new Error("Pinned integration checkout must have its own Git root.");
  const { revision } = readUniversalOntologyManifest(
    join(root, "util", "owlapi-reference", universalOntologyManifestFile),
  );
  if (git(["rev-parse", "--verify", "HEAD^{commit}"]) !== revision)
    throw new Error(
      "Pinned integration checkout differs from the Universal Ontology revision.",
    );
}
