import {
  buildBrowserBundle,
  analyzeBrowserChunks,
} from "./browserBundleCost.mjs";

import process from "node:process";
import { fileURLToPath } from "node:url";

const input = fileURLToPath(new URL("../index.js", import.meta.url));
const output = await buildBrowserBundle(input);
const { chunks, chunksByFile, containsModule, transitiveImports, size } =
  analyzeBrowserChunks(output);

const entryChunks = chunks.filter(({ isEntry }) => isEntry);
const rdfXmlChunks = chunks.filter((chunk) =>
  containsModule(chunk, "/node_modules/rdfxml-streaming-parser/"),
);
const initialFiles = transitiveImports(entryChunks);
const lazyFiles = transitiveImports(rdfXmlChunks);
for (const initialFile of initialFiles) {
  lazyFiles.delete(initialFile);
}

const rdfXmlInInitialGraph = [...initialFiles].some((fileName) =>
  containsModule(
    chunksByFile.get(fileName),
    "/node_modules/rdfxml-streaming-parser/",
  ),
);
// XML writers legitimately bundle this shared DOM implementation.
const bundledXmlSupport = chunks.some((chunk) =>
  containsModule(chunk, "/node_modules/@xmldom/xmldom/"),
);

if (rdfXmlChunks.length === 0) {
  throw new Error("The browser build contains no RDF/XML implementation chunk");
}
if (rdfXmlInInitialGraph) {
  throw new Error("The RDF/XML implementation leaked into the initial graph");
}

console.log(
  JSON.stringify(
    {
      checks: {
        bundledXmlSupport,
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
