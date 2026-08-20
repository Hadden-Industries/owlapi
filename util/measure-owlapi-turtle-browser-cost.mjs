import { Buffer } from "node:buffer";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "vite";

const input = fileURLToPath(
  new URL("../src/owlapi-js/manager/index.js", import.meta.url),
);
const output = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    minify: "oxc",
    rollupOptions: { input },
    target: "es2022",
    write: false,
  },
});

const chunks = output.output.filter(({ type }) => type === "chunk");
const chunksByFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
const normalizedModuleIds = (chunk) =>
  Object.keys(chunk.modules).map((id) => id.replaceAll("\\", "/"));
const containsModule = (chunk, fragment) =>
  normalizedModuleIds(chunk).some((id) => id.includes(fragment));

const transitiveImports = (roots) => {
  const visited = new Set();
  const visit = (fileName) => {
    if (visited.has(fileName)) {
      return;
    }
    visited.add(fileName);
    for (const dependency of chunksByFile.get(fileName)?.imports || []) {
      visit(dependency);
    }
  };
  for (const root of roots) {
    visit(root.fileName);
  }
  return visited;
};

const entryChunks = chunks.filter(({ isEntry }) => isEntry);
const turtleChunks = chunks.filter((chunk) =>
  containsModule(chunk, "/node_modules/n3/browser/n3.min.js"),
);
const initialFiles = transitiveImports(entryChunks);
const lazyFiles = transitiveImports(turtleChunks);
for (const initialFile of initialFiles) {
  lazyFiles.delete(initialFile);
}

const selectedCode = (files) =>
  [...files]
    .sort()
    .map((fileName) => chunksByFile.get(fileName)?.code || "")
    .join("\n");
const size = (files) => {
  const code = selectedCode(files);
  return {
    chunkCount: files.size,
    gzipBytes: gzipSync(code).byteLength,
    minifiedBytes: Buffer.byteLength(code),
  };
};

const turtleInInitialGraph = [...initialFiles].some((fileName) =>
  containsModule(
    chunksByFile.get(fileName),
    "/node_modules/n3/browser/n3.min.js",
  ),
);
const bundledLegacyTurtle = chunks.some((chunk) =>
  containsModule(chunk, "/src/owl2vowl/js/turtleParser.js"),
);

if (turtleChunks.length === 0) {
  throw new Error("The browser build contains no Turtle implementation chunk");
}
if (turtleInInitialGraph) {
  throw new Error("The Turtle implementation leaked into the initial graph");
}
if (bundledLegacyTurtle) {
  throw new Error("The retained legacy Turtle parser leaked into the bundle");
}

console.log(
  JSON.stringify(
    {
      checks: {
        bundledLegacyTurtle,
        turtleInInitialGraph,
        turtleIsLazy: true,
      },
      measuredOn: new Date().toISOString(),
      node: process.version,
      protocol: {
        configFile: false,
        entry: "src/owlapi-js/manager/index.js",
        format: "es",
        minifier: "oxc",
        target: "es2022",
        tool: "Vite 8 programmatic build",
        write: false,
      },
      results: {
        initialGraph: size(initialFiles),
        turtleLazyGraph: size(lazyFiles),
      },
      schemaVersion: 1,
    },
    null,
    2,
  ),
);
