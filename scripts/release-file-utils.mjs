import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const sha256Buffer = (buffer) =>
  createHash("sha256").update(buffer).digest("hex");

export const sha256File = (path) => sha256Buffer(readFileSync(path));

/**
 * Recursive cleanup is permitted only for a unique child directory of the
 * expected temporary root. `path.relative` keeps the containment check correct
 * across Windows drive-letter paths and POSIX paths without string-prefix traps.
 */
export const isStrictDescendantPath = (parentPath, candidatePath) => {
  const relativePath = relative(resolve(parentPath), resolve(candidatePath));
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
};
