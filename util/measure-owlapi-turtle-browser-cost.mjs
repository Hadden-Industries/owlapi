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
// Current N3 separates its eager writer from the lazy parsing implementation.
const containsTurtleParser = (chunk) =>
  [
    "/node_modules/n3/src/N3Parser.js",
    "/node_modules/n3/lib/N3Parser.js",
    "/node_modules/n3/browser/n3.min.js",
  ].some((fragment) => containsModule(chunk, fragment));
const turtleChunks = chunks.filter((chunk) => containsTurtleParser(chunk));
const initialFiles = transitiveImports(entryChunks);
const lazyFiles = transitiveImports(turtleChunks);
for (const initialFile of initialFiles) {
  lazyFiles.delete(initialFile);
}

const turtleInInitialGraph = [...initialFiles].some((fileName) =>
  containsTurtleParser(chunksByFile.get(fileName)),
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
  throw new Error("The retired legacy Turtle parser leaked into the bundle");
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
        entry: "index.js",
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
