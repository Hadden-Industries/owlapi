import { readFileSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  inspectReleaseDocumentation,
  assertDocumentationAdmission,
} from "./release-documentation.mjs";
import { RELEASE_ARCHIVE_LIMITS } from "./release-artifacts.mjs";

const readBounded = (path, limit) => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw new Error("Invalid documentation admission input type/size");
  return readFileSync(path);
};

/** Same artifact, source and producing run; a partial rerun can reuse its successful preflight. */
export const verifyPublicationDocumentation = ({
  tarball,
  manifest,
  preflight,
  identity,
}) => {
  const documentation = inspectReleaseDocumentation(tarball, manifest);
  assertDocumentationAdmission(preflight, documentation);
  if (
    !/^[a-f0-9]{40}$/u.test(identity?.commit ?? "") ||
    !/^[1-9][0-9]*$/u.test(String(identity?.runId ?? "")) ||
    !Number.isSafeInteger(identity?.runAttempt) ||
    identity.runAttempt < 1 ||
    preflight.identity?.commit !== identity.commit ||
    preflight.identity?.runId !== identity.runId ||
    !Number.isSafeInteger(preflight.identity?.runAttempt) ||
    preflight.identity.runAttempt < 1 ||
    preflight.identity.runAttempt > identity.runAttempt
  )
    throw new Error(
      "Documentation preflight belongs to another source/run/attempt",
    );
  return documentation;
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const argument = (name) => {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1])
      throw new Error(`Missing ${name}`);
    return process.argv[index + 1];
  };
  const manifest = JSON.parse(
    readBounded(new URL("../package.json", import.meta.url), 1024 * 1024),
  );
  // The trusted checkout selects the filename; no candidate-supplied filesystem path.
  if (
    manifest.name !== "@hadden-industries/owlapi" ||
    !/^[0-9A-Za-z.+-]+$/u.test(manifest.version)
  )
    throw new Error("Invalid publication coordinate");
  const documentation = verifyPublicationDocumentation({
    tarball: readBounded(
      join(
        resolve(argument("--candidate")),
        `hadden-industries-owlapi-${manifest.version}.tgz`,
      ),
      RELEASE_ARCHIVE_LIMITS.compressedBytes,
    ),
    manifest,
    preflight: JSON.parse(
      readBounded(resolve(argument("--preflight")), 4 * 1024 * 1024),
    ),
    identity: {
      commit: process.env.DOCUMENTATION_SOURCE_COMMIT ?? process.env.GITHUB_SHA,
      runId:
        process.env.DOCUMENTATION_SOURCE_RUN_ID ?? process.env.GITHUB_RUN_ID,
      runAttempt: Number(
        process.env.DOCUMENTATION_SOURCE_RUN_ATTEMPT ??
          process.env.GITHUB_RUN_ATTEMPT,
      ),
    },
  });
  process.stdout.write(
    `${JSON.stringify({ ...documentation, notes: undefined })}\n`,
  );
}
