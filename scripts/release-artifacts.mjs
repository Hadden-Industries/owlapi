import { gunzipSync } from "node:zlib";

const TAR_BLOCK_SIZE = 512;
const readNullTerminatedText = (buffer, start, length) => {
  const field = buffer.subarray(start, start + length);
  const terminator = field.indexOf(0);
  return field
    .subarray(0, terminator === -1 ? field.length : terminator)
    .toString();
};

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const REQUIRED_PACKED_PATHS = Object.freeze([
  "API.md",
  "CHANGELOG.md",
  "LICENSE",
  "LICENSES/Apache-2.0.txt",
  "NOTICE",
  "README.md",
  "apibinding/index.js",
  "docs/compatibility/capabilities.json",
  "docs/compatibility/canonical-vowl-prerequisites.md",
  "docs/compatibility/default-behavior-inventory.md",
  "docs/compatibility/behavior-profiles.md",
  "docs/compatibility/java-api-parity-decisions.json",
  "docs/compatibility/java-api-parity-decisions.schema.json",
  "docs/compatibility/rdf-parser-metadata.md",
  "docs/compatibility/rdfxml-writer-configuration.md",
  "docs/compatibility/java-api-surface.json",
  "docs/compatibility/java-api-surface.md",
  "formats/index.js",
  "index.js",
  "io/index.js",
  "io/node/index.js",
  "internal/parsing/jsonld/provider/build-manifest.json",
  "internal/parsing/jsonld/provider/jsonld.js",
  "model/index.js",
  "model/parameters/index.js",
  "model/addAxiom.js",
  "model/removeAxiom.js",
  "model/addImport.js",
  "model/removeImport.js",
  "model/removeOntologyAnnotation.js",
  "package.json",
  "profiles/index.js",
  "profiles/owl2ELProfile.js",
  "profiles/owl2QLProfile.js",
  "profiles/owl2RLProfile.js",
  "search/index.js",
  "search/entitySearcher.js",
  "manchestersyntax/renderer/index.js",
  "manchestersyntax/renderer/manchesterOWLSyntaxOWLObjectRendererImpl.js",
  "modularity/locality/index.js",
  "modularity/locality/localityClass.js",
  "modularity/locality/syntacticLocalityModuleExtractor.js",
  "util/index.js",
  "util/owlOntologyImportsClosureSetProvider.js",
  "util/owlOntologyMerger.js",
  "util/owlObjectDuplicator.js",
  "util/owlEntityRenamer.js",
  "util/owlEntityRemover.js",
  "util/simpleShortFormProvider.js",
  "util/annotationValueShortFormProvider.js",
]);
const ALLOWED_PACKED_PREFIXES = Object.freeze([
  "apibinding/",
  "formats/",
  "internal/",
  "io/",
  "model/",
  "profiles/",
  "search/",
  "manchestersyntax/renderer/",
  "modularity/locality/",
]);
const ALLOWED_PACKED_EXACT_PATHS = new Set(REQUIRED_PACKED_PATHS);

export const assertReleasePacklist = (paths) => {
  const uniquePaths = new Set(paths);
  if (uniquePaths.size !== paths.length) {
    throw new Error("Release packlist contains duplicate paths.");
  }
  for (const path of paths) {
    const allowed =
      ALLOWED_PACKED_EXACT_PATHS.has(path) ||
      ALLOWED_PACKED_PREFIXES.some((prefix) => path.startsWith(prefix));
    const forbiddenProductionShape =
      /(?:^|\/)(?:dist|build|fixtures?|__tests__)(?:\/|$)|(?:^|\/)test(?:\/|$)|\.test\.(?:js|mjs)$|\.d\.ts$|\.map$|\.min\.js$/u.test(
        path,
      );
    if (!allowed || forbiddenProductionShape) {
      throw new Error(`Release packlist contains forbidden path ${path}.`);
    }
  }
  for (const requiredPath of REQUIRED_PACKED_PATHS) {
    if (!uniquePaths.has(requiredPath)) {
      throw new Error(`Release packlist is missing ${requiredPath}.`);
    }
  }
};

/**
 * Inspect archive headers directly so release qualification does not depend on
 * a host-provided tar executable or an undeclared transitive package. npm pack
 * emits the portable ustar subset handled here; unsupported entry types fail
 * closed in the caller rather than being silently accepted.
 */
const readGzipTarEntries = (archive) => {
  const tar = gunzipSync(archive);
  const entries = [];

  for (let offset = 0; offset + TAR_BLOCK_SIZE <= tar.length;) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = readNullTerminatedText(header, 0, 100);
    const prefix = readNullTerminatedText(header, 345, 155);
    const archivePath = prefix ? `${prefix}/${name}` : name;
    const sizeText = readNullTerminatedText(header, 124, 12).trim();
    const size = Number.parseInt(sizeText || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Invalid tar entry size for ${archivePath}.`);
    }

    const type = readNullTerminatedText(header, 156, 1) || "0";
    if (type === "0") {
      if (!archivePath.startsWith("package/")) {
        throw new Error(
          `Packed file is outside the npm package root: ${archivePath}`,
        );
      }
      const path = archivePath.slice("package/".length);
      if (!path || path.split("/").includes("..")) {
        throw new Error(`Packed file has an unsafe path: ${archivePath}`);
      }
      const contentOffset = offset + TAR_BLOCK_SIZE;
      entries.push({
        path,
        size,
        content: Buffer.from(tar.subarray(contentOffset, contentOffset + size)),
      });
    } else if (type !== "5") {
      throw new Error(`Unsupported tar entry type ${type} for ${archivePath}.`);
    }

    offset +=
      TAR_BLOCK_SIZE + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  return entries;
};

export const inspectGzipTar = (archive) =>
  readGzipTarEntries(archive).map(({ path, size }) => ({ path, size }));

export const readGzipTarFile = (archive, requestedPath) => {
  const matches = readGzipTarEntries(archive).filter(
    ({ path }) => path === requestedPath,
  );
  if (matches.length === 0) {
    throw new Error(`Packed file ${requestedPath} is absent.`);
  }
  if (matches.length !== 1) {
    throw new Error(`Packed file ${requestedPath} occurs more than once.`);
  }
  return matches[0].content;
};

export const formatSha256Sums = (entries) =>
  `${[...entries]
    .sort((left, right) => compareCodeUnits(left.fileName, right.fileName))
    .map(({ fileName, sha256 }) => `${sha256}  ${fileName}`)
    .join("\n")}\n`;
