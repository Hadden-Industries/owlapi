import assert from "node:assert/strict";
import { constants } from "node:buffer";
import {
  open,
  readFile,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  IRI,
  OWLDocumentFormats,
  OWLManager,
  StreamDocumentSource,
} from "../../index.js";
import { NodeDocumentLoader } from "../../io/node/index.js";
import { runWindowsComparisonJob } from "./comparison-job.mjs";

const chunkBytes = 65_536;
const limits = { memoryBudgetMiB: 512, nodeHeapMiB: 160 };
const ontologyIRI = "urn:large-stream";
const classIRIs = ["urn:first", "urn:last"];
const owl = "http://www.w3.org/2002/07/owl#";
const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const fixtures = {
  FUNCTIONAL: [
    `Ontology(<${ontologyIRI}> `,
    (iri) => `Declaration(Class(<${iri}>)) `,
    ")",
  ],
  OWL_XML: [
    `<Ontology xmlns="${owl}" ontologyIRI="${ontologyIRI}">`,
    (iri) => `<Declaration><Class IRI="${iri}"/></Declaration>`,
    "</Ontology>",
  ],
  RDF_XML: [
    `<rdf:RDF xmlns:rdf="${rdf}" xmlns:owl="${owl}"><owl:Ontology rdf:about="${ontologyIRI}"/>`,
    (iri) => `<owl:Class rdf:about="${iri}"/>`,
    "</rdf:RDF>",
  ],
  TURTLE: [
    `@prefix owl: <${owl}> .\n<${ontologyIRI}> a owl:Ontology .\n`,
    (iri) => `<${iri}> a owl:Class .\n`,
    "",
  ],
};

// Comments end inside their chunks so neither RDF tokenizer has to retain a
// single enormous lexical token. Functional Syntax and OWL/XML use whitespace.
function documentChunks(format, repeats) {
  const [start, declaration, end] = fixtures[format];
  const head = Buffer.from(start + declaration(classIRIs[0]));
  const tail = Buffer.from(declaration(classIRIs[1]) + end);
  const padding = Buffer.alloc(chunkBytes, " ");
  if (format === "RDF_XML") {
    padding.write("<!--");
    padding.write("-->", chunkBytes - 3);
  } else if (format === "TURTLE") {
    padding.write("#");
    padding.write("\n", chunkBytes - 1);
  }
  return {
    length: head.length + repeats * padding.length + tail.length,
    *open() {
      yield head;
      for (let index = 0; index < repeats; index++) yield padding;
      yield tail;
    },
  };
}

async function verifyLoad(manager, source, config) {
  const ontology = await manager.loadOntologyFromOntologyDocument(
    source,
    config,
  );
  const factory = manager.getOWLDataFactory();
  assert.equal(ontology.getOntologyID().ontologyIRI.value, ontologyIRI);
  assert.equal(ontology.getAxiomCount(), classIRIs.length);
  for (const iri of classIRIs)
    assert.ok(
      ontology.containsAxiom(
        factory.getOWLDeclarationAxiom(factory.getOWLClass(IRI.create(iri))),
      ),
      `Missing class declaration: ${iri}`,
    );
}

// Use the same generated OWL/XML bytes for the file-IRI control. Both the
// initial authorization and the reopened local stream must use this file.
async function verifyFile(input, config, directory) {
  const path = join(await realpath(directory), "oversized.owx");
  const file = await open(path, "wx");
  try {
    try {
      for (const chunk of input.open()) await file.writeFile(chunk);
    } finally {
      await file.close();
    }
    assert.equal((await stat(path)).size, input.length);
    const fileIRI = IRI.create(pathToFileURL(path).href);
    const operations = [];
    const documentLoader = new NodeDocumentLoader({
      authorize(iri, context) {
        assert.equal(iri.value, fileIRI.value);
        operations.push(context.operation);
        if (context.operation === "read-file")
          assert.equal(context.resolvedFilePath, path);
        return true;
      },
    });
    const manager = OWLManager.createOWLOntologyManager({ documentLoader });
    await verifyLoad(manager, fileIRI, config);
    assert.deepEqual(operations, [
      "use-document",
      "resolve-file",
      "read-file",
      "resolve-file",
      "read-file",
    ]);
  } finally {
    await unlink(path);
  }
}

export async function verifyStreamFixture(format, repeats, directory) {
  const input = documentChunks(format, repeats);
  const config = {
    format: OWLDocumentFormats[format],
    maxInputBytes: input.length,
    maxExpandedXmlBytes: input.length,
    timeoutMs: 180_000,
  };
  let readBytes = 0;
  const source = new StreamDocumentSource(
    function* () {
      for (const chunk of input.open()) {
        readBytes += chunk.length;
        yield chunk;
      }
    },
    { format: config.format },
  );
  await verifyLoad(OWLManager.createOWLOntologyManager(), source, config);
  assert.equal(readBytes, input.length);
  if (format === "OWL_XML") await verifyFile(input, config, directory);
  return readBytes;
}

if (process.argv[2] === "--protected-comparison") {
  const directory = dirname(process.argv[3]);
  const { request } = JSON.parse(await readFile(process.argv[3], "utf8"));
  assert.equal(
    Number(process.env.OWLAPI_COMPARISON_JOB_MIB),
    limits.memoryBudgetMiB,
  );
  assert.equal(
    Number(process.env.OWLAPI_COMPARISON_NODE_HEAP_MIB),
    limits.nodeHeapMiB,
  );
  const repeats = Math.ceil((constants.MAX_STRING_LENGTH + 1) / chunkBytes);
  const inputBytes = await verifyStreamFixture(
    request.format,
    repeats,
    directory,
  );
  await writeFile(
    join(directory, "result.json"),
    JSON.stringify({
      inputBytes,
      maxStringLength: constants.MAX_STRING_LENGTH,
    }),
  );
} else if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  test(
    "loads four UTF-8 ontology formats above V8's single-string limit",
    { skip: process.platform !== "win32" },
    async (t) => {
      for (const format of Object.keys(fixtures))
        await t.test(format, async (child) => {
          const { inputBytes, maxStringLength } = await runWindowsComparisonJob(
            { action: "run", format },
            limits,
            fileURLToPath(import.meta.url),
          );
          assert.equal(maxStringLength, constants.MAX_STRING_LENGTH);
          assert.ok(inputBytes > maxStringLength);
          child.diagnostic(
            `${inputBytes} ASCII bytes, ${chunkBytes}-byte padding chunks, two verified declarations`,
          );
        });
    },
  );
}
