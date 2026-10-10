import { buildBrowserBundle, codeSize } from "./browserBundleCost.mjs";

const measurements = [
  {
    id: "rdfjs-data-model",
    source: 'export { default } from "@rdfjs/data-model";',
  },
  {
    id: "rdfjs-dataset",
    source: 'export { default } from "@rdfjs/dataset";',
  },
  {
    id: "rdfjs-foundation-combined",
    source: [
      'export { default as dataFactory } from "@rdfjs/data-model";',
      'export { default as datasetFactory } from "@rdfjs/dataset";',
    ].join("\n"),
  },
];

const results = [];
for (const measurement of measurements) {
  const virtualId = `\0owlapi-js:${measurement.id}`;
  const output = await buildBrowserBundle(measurement.id, [
    {
      load(id) {
        return id === virtualId ? measurement.source : undefined;
      },
      name: `owlapi-js-${measurement.id}`,
      resolveId(id) {
        return id === measurement.id ? virtualId : undefined;
      },
    },
  ]);
  const chunks = output.output.filter(({ type }) => type === "chunk");
  const code = chunks.map(({ code: chunkCode }) => chunkCode).join("\n");
  results.push({
    ...codeSize(code),
    id: measurement.id,
    outputChunkCount: chunks.length,
  });
}

console.log(
  JSON.stringify(
    {
      measuredOn: new Date().toISOString(),
      node: process.version,
      protocol: {
        configFile: false,
        format: "es",
        minifier: "oxc",
        target: "es2022",
        tool: "Vite 8 programmatic build",
        write: false,
      },
      results,
      schemaVersion: 1,
    },
    null,
    2,
  ),
);
