import assert from "node:assert/strict";
import test from "node:test";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  capturedJsonLdInventory,
  jsonLdContainerPaths,
} from "../util/conformance/jsonldJsonDocuments.mjs";
import {
  openJsonRepositorySession,
  formatJsonSource,
  validateJsonQualityEvent,
} from "../tooling/json/public-api.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const [corpusPath, manifestPath, identitiesPath] = jsonLdContainerPaths;
const baselinePolicy = JSON.parse(
  readFileSync(join(root, ".json-quality.json")),
);

function decimalPins(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (
      ["byteLength", "line", "column", "endLine", "endColumn"].includes(key) &&
      typeof item === "number"
    )
      value[key] = String(item);
    else decimalPins(item);
  }
}

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-captured-jsonld-"));
  try {
    execFileSync("git", ["init", "--quiet", directory], { windowsHide: true });
    for (const path of jsonLdContainerPaths) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), readFileSync(join(root, path)));
    }
    // Independent original source pins/negative expectations are retained. Only
    // their wire types and the v1 default error severity move to cohort 2.
    const exceptions = structuredClone(
      baselinePolicy.exceptions.filter((rule) =>
        rule.paths.some(
          (path) =>
            jsonLdContainerPaths.includes(path) ||
            path.startsWith("logical/w3c-jsonld/"),
        ),
      ),
    );
    decimalPins(exceptions);
    for (const rule of exceptions)
      for (const finding of rule.expected?.diagnostics ?? [])
        finding.severity ??= "error";
    const policy = {
      schemaVersion: 3,
      defaults: baselinePolicy.defaults,
      exceptions,
      preserveSourcePresentation: [
        {
          paths: ["logical/w3c-jsonld/**"],
          owner: "Pinned original W3C source owner",
          reason:
            "Original provenance and decoded-byte identities are reconciled through the complete native inventory.",
        },
      ],
    };
    writeFileSync(
      join(directory, ".json-quality.json"),
      await formatJsonSource(JSON.stringify(policy)),
    );
    return directory;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

async function inventory(directory) {
  const entries = [],
    session = await openJsonRepositorySession({
      root: directory,
      logicalProviders: [
        {
          definition: {
            id: "w3c-jsonld",
            minimumDocuments: 961,
            containerPaths: jsonLdContainerPaths,
          },
          async *inventory(access) {
            for await (const entry of capturedJsonLdInventory(access)) {
              entries.push(entry);
              yield entry;
            }
          },
        },
      ],
    });
  let terminal,
    sources = 0;
  try {
    for await (const event of session.events()) {
      assert.equal(validateJsonQualityEvent(event), true);
      if (
        event.type === "source" &&
        event.path.startsWith("logical/w3c-jsonld/")
      )
        sources++;
      if (event.type === "execution-terminal") terminal = event;
    }
    return { entries, terminal, sources };
  } finally {
    await session.close();
  }
}

test(
  "the captured native owner supplies all 961 original source views with exact pointers and complete closure",
  { timeout: 30_000 },
  async () => {
    const directory = await fixture();
    try {
      const { entries, terminal, sources } = await inventory(directory);
      assert.equal(sources, 961);
      assert.equal(entries.length, 961);
      assert.equal(new Set(entries.map((entry) => entry.path)).size, 961);
      assert.equal(terminal.inventoryComplete, true);
      assert.equal(terminal.linkedExpectationsComplete, true);
      assert.equal(terminal.sourceObservationsComplete, true);
      assert.equal(terminal.diagnosticsComplete, true);
      assert.equal(terminal.contractSatisfied, true);
      assert.equal(terminal.domainComplete, false);
      const corpus = JSON.parse(readFileSync(join(root, corpusPath)));
      for (const entry of entries) {
        let value = corpus;
        for (const token of entry.pointer.slice(1).split("/"))
          value = value[token.replaceAll("~1", "/").replaceAll("~0", "~")];
        const bytes = Buffer.from(value);
        assert.equal(entry.byteLength, String(bytes.length));
        assert.equal(
          entry.sha256,
          createHash("sha256").update(bytes).digest("hex"),
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

for (const mutation of [
  "omitted resource",
  "extra resource",
  "aliased replacement resource",
  "changed source",
  "reordered fixtures",
  "converted manifest",
  "changed inventory",
])
  test(
    `captured provenance rejects ${mutation} without a complete shared result`,
    { timeout: 30_000 },
    async () => {
      const directory = await fixture();
      try {
        if (mutation === "converted manifest") {
          writeFileSync(
            join(directory, manifestPath),
            readFileSync(join(root, manifestPath), "utf8").replaceAll(
              "\n",
              "\r\n",
            ),
          );
        } else if (mutation === "changed inventory") {
          writeFileSync(
            join(directory, identitiesPath),
            readFileSync(join(root, identitiesPath), "utf8") + "\n",
          );
        } else {
          const corpus = JSON.parse(readFileSync(join(directory, corpusPath)));
          if (mutation === "omitted resource")
            delete corpus.resources[Object.keys(corpus.resources)[0]];
          if (mutation === "extra resource")
            corpus.resources[
              "https://w3c.github.io/json-ld-api/tests/unpinned.jsonld"
            ] = "{}";
          if (mutation === "changed source") corpus.tests[0].source += " ";
          if (mutation === "aliased replacement resource") {
            const base = "https://w3c.github.io/json-ld-api/tests/";
            const count = Object.keys(corpus.resources).length;
            delete corpus.resources[base + "toRdf/c031/c031-context.jsonld"];
            corpus.resources[base + "toRdf/%30001-in.jsonld"] =
              corpus.resources[base + "toRdf/0001-in.jsonld"];
            assert.equal(Object.keys(corpus.resources).length, count);
          }
          if (mutation === "reordered fixtures")
            [corpus.tests[0], corpus.tests[1]] = [
              corpus.tests[1],
              corpus.tests[0],
            ];
          writeFileSync(join(directory, corpusPath), JSON.stringify(corpus));
        }
        await assert.rejects(
          inventory(directory),
          /original|provenance|pinned|identity|census/iu,
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
