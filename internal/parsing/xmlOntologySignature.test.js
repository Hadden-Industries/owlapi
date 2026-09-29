import { Worker } from "node:worker_threads";
import { StringDocumentSource } from "../../io/index.js";
import { detectDLSyntax } from "./dl/descriptor.js";
import { detectKRSSDialect } from "./krss/detection.js";

const detectors = [
  ["DL", detectDLSyntax],
  ["KRSS1", (source) => detectKRSSDialect(source, "krss1")],
  ["KRSS2", (source) => detectKRSSDialect(source, "krss2")],
];

describe.each(detectors)("%s XML signature exclusion", (label, detect) => {
  it.each([
    '<?xml version="1.0"?>',
    "<rdf:RDF/>",
    "<Ontology/>",
    "<Namespace_1:RDF/>",
  ])(
    "preserves the foreign signature after leading comments: %s",
    (signature) => {
      expect(
        detect(
          new StringDocumentSource(
            ` \n<!-- one -->\t<!-- two --> ${signature}`,
          ),
        ),
      ).toMatchObject({
        result: "NO_MATCH",
        reasonCode: `${label}_STRONG_NEGATIVE`,
      });
    },
  );

  it.each([
    "<!-- unclosed <rdf:RDF/>",
    "<!-- one --> <!-- unclosed <?xml",
    "<!-- one --> <OntologyExtra/>",
    "<!-- one --> <rdf:RDFExtra/>",
    "<!-- one --> ordinary text",
  ])(
    "does not invent a signature in incomplete or ordinary content: %s",
    (text) => {
      expect(detect(new StringDocumentSource(text))).toMatchObject({
        result: "NO_MATCH",
        reasonCode: `${label}_SIGNATURE_ABSENT`,
      });
    },
  );
});

it("finishes repeated and truncated comment prefixes within the detection budget", async () => {
  // Run the real detectors in a worker: a backtracking regression must fail
  // with a bounded deadline rather than hanging Jest's own event loop.
  const worker = new Worker(
    `
    const { parentPort, workerData } = require("node:worker_threads");
    (async () => {
      const { detectDLSyntax } = await import(workerData.dl);
      const { detectKRSSDialect } = await import(workerData.krss);
      const measurements = [];
      for (const size of [1024, 2048, 4096, 8192, 32768]) {
        const comments = "<!--x--> ".repeat(Math.ceil(size / 9));
        for (const suffix of ["text", "<!-- unclosed", "<?xml", "<rdf:RDF/>"]) {
          const text = comments.slice(0, size - suffix.length) + suffix;
          for (const detect of [detectDLSyntax,
            source => detectKRSSDialect(source, "krss1"),
            source => detectKRSSDialect(source, "krss2")]) {
            const start = performance.now();
            detect({ getText: () => text });
            measurements.push(performance.now() - start);
          }
        }
      }
      parentPort.postMessage(measurements);
    })().catch(error => { throw error; });
  `,
    {
      eval: true,
      workerData: {
        dl: new URL("./dl/descriptor.js", import.meta.url).href,
        krss: new URL("./krss/detection.js", import.meta.url).href,
      },
    },
  );
  let deadline;
  try {
    const measurements = await new Promise((resolve, reject) => {
      deadline = setTimeout(
        () =>
          reject(
            new Error(
              "XML signature detection exceeded its 5-second harness deadline",
            ),
          ),
        5000,
      );
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (code) reject(new Error(`Detection worker exited ${code}`));
      });
    });
    expect(measurements).toHaveLength(60);
    expect(Math.max(...measurements)).toBeLessThan(1000);
  } finally {
    clearTimeout(deadline);
    await worker.terminate();
  }
}, 10000);
