import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { format, resolveConfig } from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const provider = resolve(root, "node_modules/jsonld");
const destination = resolve(root, "internal/parsing/jsonld/provider");
const checksExistingBuild = process.argv.includes("--check");
const packageMetadata = JSON.parse(
  await readFile(resolve(provider, "package.json"), "utf8"),
);
if (packageMetadata.version !== "9.0.0")
  throw new Error(
    "Requalify the JSON-LD source change before updating its upstream version",
  );
const patches = new Map([
  [
    "ContextResolver.js",
    [
      [
        "constructor({sharedCache}) {",
        "constructor({sharedCache, maxContextUrls = MAX_CONTEXT_URLS + 1}) {\n    if(!Number.isSafeInteger(maxContextUrls) || maxContextUrls < 0) {\n      throw new TypeError('maxContextUrls must be a nonnegative safe integer');\n    }\n    this.maxContextUrls = maxContextUrls;",
      ],
      [
        "if(cycles.size > MAX_CONTEXT_URLS) {",
        "if(cycles.size >= this.maxContextUrls) {",
      ],
      ["max: MAX_CONTEXT_URLS", "max: this.maxContextUrls"],
    ],
  ],
  [
    "jsonld.js",
    [
      [
        "{sharedCache: _resolvedContextCache})",
        "{sharedCache: _resolvedContextCache, maxContextUrls: options?.maxContextUrls})",
      ],
    ],
  ],
]);
const sourceChanges = [];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
/** Compare before publication in check mode; generated code and notices retain
 * their exact bytes rather than passing through the repository source formatter.
 */
async function publishOrCheck(relativePath, bytes) {
  const target = resolve(destination, relativePath);
  if (checksExistingBuild) {
    if (!Buffer.from(await readFile(target)).equals(Buffer.from(bytes)))
      throw new Error(`Provider build drift: ${relativePath}`);
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

/** Resolve the actual package owning a bundled input, including nested npm
 * installations; top-level package names alone would miss version duplicates.
 */
async function owningPackage(file) {
  let directory = dirname(file);
  while (directory !== root && directory !== dirname(directory)) {
    const metadataPath = resolve(directory, "package.json");
    try {
      await access(metadataPath);
    } catch {
      directory = dirname(directory);
      continue;
    }
    const metadataBytes = await readFile(metadataPath);
    const metadata = JSON.parse(metadataBytes);
    if (metadata.name && metadata.version)
      return { directory, metadata, metadataBytes };
    directory = dirname(directory);
  }
  throw new Error(`No package identity for bundled input: ${file}`);
}
const result = await build({
  root,
  configFile: false,
  logLevel: "warn",
  build: {
    lib: {
      entry: resolve(provider, "lib/jsonld.js"),
      formats: ["es"],
      fileName: "jsonld",
    },
    target: "es2022",
    minify: false,
    write: false,
    reportCompressedSize: false,
    rolldownOptions: { output: { exports: "default" } },
  },
  plugins: [
    {
      name: "qualified-jsonld-source-options",
      enforce: "pre",
      async transform(original, path) {
        if (!/jsonld[\\/]lib[\\/](?:ContextResolver|jsonld)\.js$/u.test(path))
          return;
        let contents = original;
        const file = path.split(/[\\/]/u).at(-1);
        for (const [before, after] of patches.get(file)) {
          const count = contents.split(before).length - 1;
          const expectedCount = file === "jsonld.js" ? 9 : 1;
          if (count !== expectedCount)
            throw new Error(
              `Upstream source drift in ${file}: expected ${expectedCount}, found ${count}`,
            );
          contents = contents.replaceAll(before, after);
        }
        sourceChanges.push({
          path: `lib/${file}`,
          originalSha256: sha256(original),
          patchedSha256: sha256(contents),
          replacements: patches.get(file),
        });
        return { code: contents, map: null };
      },
    },
  ],
});
const chunks = (Array.isArray(result) ? result : [result])
  .flatMap((entry) => entry.output)
  .filter((entry) => entry.type === "chunk");
if (chunks.length !== 1 || sourceChanges.length !== 2)
  throw new Error(
    "The qualified provider must contain one bundle and exactly two changed upstream sources",
  );
const bytes = Buffer.from(chunks[0].code);
await publishOrCheck("jsonld.js", bytes);
await publishOrCheck(
  "LICENSE.txt",
  await readFile(resolve(provider, "LICENSE")),
);
const inputs = [];
const packages = new Map();
for (const path of Object.keys(chunks[0].modules).sort()) {
  if (!path.startsWith(resolve(root, "node_modules").replaceAll("\\", "/")))
    continue;
  const input = await readFile(resolve(root, path));
  inputs.push({
    path: relative(root, resolve(root, path)).replaceAll("\\", "/"),
    sha256: sha256(input),
    byteLength: input.length,
  });
  const owner = await owningPackage(resolve(root, path));
  packages.set(owner.directory, { ...owner, role: "bundled-source" });
}
// Rolldown emits a small CommonJS loader runtime into the bundle. Retain its
// license as well as those of every package whose source was bundled.
const bundler = await owningPackage(
  resolve(root, "node_modules/rolldown/package.json"),
);
packages.set(bundler.directory, { ...bundler, role: "bundler-runtime" });
const bundledPackages = [];
for (const { directory, metadata, metadataBytes, role } of [
  ...packages.values(),
].sort((left, right) => left.directory.localeCompare(right.directory))) {
  const noticeNames = (await readdir(directory))
    .filter((name) => /^(?:licen[sc]e|copying|notice)(?:[.-].*)?$/iu.test(name))
    .sort();
  if (!noticeNames.length)
    throw new Error(`No license text found for ${metadata.name}`);
  const notices = [];
  for (const name of noticeNames) {
    const notice = await readFile(resolve(directory, name));
    const path = `licenses/${metadata.name.replaceAll("/", "-")}-${metadata.version}-${name}`;
    await publishOrCheck(path, notice);
    notices.push({ path, sha256: sha256(notice), byteLength: notice.length });
  }
  bundledPackages.push({
    name: metadata.name,
    version: metadata.version,
    license: metadata.license,
    role,
    packageJsonPath: relative(
      root,
      resolve(directory, "package.json"),
    ).replaceAll("\\", "/"),
    packageJsonSha256: sha256(metadataBytes),
    notices,
  });
}
const builderPath = "scripts/build-jsonld-provider.mjs";
const viteMetadata = JSON.parse(
  await readFile(resolve(root, "node_modules/vite/package.json"), "utf8"),
);
const prettierMetadata = JSON.parse(
  await readFile(resolve(root, "node_modules/prettier/package.json"), "utf8"),
);
const manifest = {
  schemaVersion: 1,
  upstream: {
    name: "jsonld",
    version: packageMetadata.version,
    license: packageMetadata.license,
  },
  builder: {
    path: builderPath,
    sha256: sha256(await readFile(resolve(root, builderPath))),
    viteVersion: viteMetadata.version,
    rolldownVersion: bundler.metadata.version,
    prettierVersion: prettierMetadata.version,
    packageLockSha256: sha256(
      await readFile(resolve(root, "package-lock.json")),
    ),
  },
  output: {
    path: "jsonld.js",
    sha256: sha256(bytes),
    byteLength: bytes.length,
  },
  sourceChanges: sourceChanges.sort((left, right) =>
    left.path.localeCompare(right.path),
  ),
  inputs,
  bundledPackages,
};
await publishOrCheck(
  "build-manifest.json",
  await format(JSON.stringify(manifest), {
    ...(await resolveConfig(resolve(destination, "build-manifest.json"))),
    parser: "json",
  }),
);
if (inputs.length === 0)
  throw new Error("No provider build inputs were captured");
process.stdout.write(
  `${checksExistingBuild ? "Verified" : "Built"} JSON-LD provider candidate: ${bytes.length} bytes; ${inputs.length} pinned build inputs; ${bundledPackages.length} licensed packages\n`,
);
