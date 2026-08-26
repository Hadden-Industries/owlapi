import { Buffer } from "node:buffer";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "vite";

const input = fileURLToPath(new URL("../index.js", import.meta.url));
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
    const chunk = chunksByFile.get(fileName);
    for (const dependency of chunk?.imports || []) {
      visit(dependency);
    }
  };
  for (const root of roots) {
    visit(root.fileName);
  }
  return visited;
};

const entryChunks = chunks.filter(({ isEntry }) => isEntry);
const rdfXmlChunks = chunks.filter((chunk) =>
  containsModule(chunk, "/node_modules/rdfxml-streaming-parser/"),
);
const initialFiles = transitiveImports(entryChunks);
const lazyFiles = transitiveImports(rdfXmlChunks);
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

const rdfXmlInInitialGraph = [...initialFiles].some((fileName) =>
  containsModule(
    chunksByFile.get(fileName),
    "/node_modules/rdfxml-streaming-parser/",
  ),
);
const bundledNodeXmlFallback = chunks.some((chunk) =>
  containsModule(chunk, "/node_modules/@xmldom/xmldom/"),
);

if (rdfXmlChunks.length === 0) {
  throw new Error("The browser build contains no RDF/XML implementation chunk");
}
if (rdfXmlInInitialGraph) {
  throw new Error("The RDF/XML implementation leaked into the initial graph");
}
if (bundledNodeXmlFallback) {
  throw new Error("The Node XML fallback leaked into the browser bundle");
}

console.log(
  JSON.stringify(
    {
      checks: {
        bundledNodeXmlFallback,
        rdfXmlInInitialGraph,
        rdfXmlIsLazy: true,
      },
      measuredOn: new Date().toISOString(),
      node: process.version,
      protocol: {
        configFile: false,
        entry: "index.js",
        format: "es",
        minifier: "oxc",
        target: "es2022",
        tool: "Vite 8 programmatic build",
        write: false,
      },
      results: {
        initialGraph: size(initialFiles),
        rdfXmlLazyGraph: size(lazyFiles),
      },
      schemaVersion: 1,
    },
    null,
    2,
  ),
);
