import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  jsonContract,
  openJsonSourceSession,
} from "@hadden-industries/json-quality";
import { provideMarkdownArchiveJson } from "../util/third-party-evidence/markdown-json-documents.mjs";
import {
  readPolicyFixture,
  sourceFixtureContract,
  collectSourceEvents,
  collectOpenedSourceEvents,
} from "./json-quality-probe-support.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const policy = await readPolicyFixture(root);
const rule = "json-quality/normalized-strings";
const exceptions = policy.exceptions.filter(
  ({ preserveNfcValues }) => preserveNfcValues?.length,
);

test("all 13 physical owner-approved values retain exact protected NFC contracts", async () => {
  assert.equal(
    exceptions.reduce(
      (count, entry) => count + entry.preserveNfcValues.length,
      0,
    ),
    15,
  );
  let physicalPins = 0;
  const session = await openJsonSourceSession();
  try {
    for (const entry of exceptions.filter(
      ({ paths }) => !paths[0].includes("!/"),
    )) {
      assert.equal(entry.paths.length, 1);
      const path = entry.paths[0];
      const contract = jsonContract(path, policy);
      assert.equal(contract.allowFormatWrites, false);
      assert.equal(contract.normalization, "NFC");
      physicalPins += entry.preserveNfcValues.length;
      const events = await collectSourceEvents(
        session,
        await readFile(join(root, path)),
        sourceFixtureContract(path, policy),
      );
      assert.equal(events.at(-1).parserComplete, true, path);
      assert(!events.some(({ ruleId }) => ruleId === rule), path);
    }
    assert.equal(physicalPins, 13);
  } finally {
    await session.close();
  }
});

test("the repaired Linux report retains its two exact original author values under complete native admission", async () => {
  const native = exceptions.filter(({ paths }) => paths[0].includes("!/"));
  assert.equal(native.length, 1);
  const [entry] = native;
  assert.equal(entry.preserveNfcValues.length, 2);
  const path = entry.paths[0],
    supplied = await provideMarkdownArchiveJson({ root });
  let pin;
  for await (const candidate of supplied.inventory)
    if (candidate.path === path) {
      assert.equal(pin, undefined);
      pin = candidate;
    }
  assert.ok(pin, "The native inventory must contain the preserved report");
  const contract = sourceFixtureContract(path, policy);
  assert.equal(contract.normalization, "NFC");
  assert.equal(contract.allowFormatWrites, false);
  const session = await openJsonSourceSession();
  let checked = 0;
  try {
    for await (const document of supplied.documents) {
      if (document.path !== path) {
        for await (const bytes of document.chunks)
          assert.ok(bytes.length <= 65536);
        continue;
      }
      checked++;
      const hash = createHash("sha256");
      let length = 0n;
      const events = await collectOpenedSourceEvents(
        session,
        {
          async *open() {
            for await (const bytes of document.chunks) {
              hash.update(bytes);
              length += BigInt(bytes.length);
              yield bytes;
            }
          },
        },
        contract,
      );
      assert.equal(hash.digest("hex"), pin.sha256);
      assert.equal(String(length), pin.byteLength);
      assert.equal(events.at(-1).parserComplete, true);
      assert(!events.some(({ ruleId }) => ruleId === rule), path);
    }
    assert.equal(checked, 1);
  } finally {
    await session.close();
  }
});

const path = "docs/conformance/generated/w3c-jsonld.json";
const original = JSON.parse(await readFile(join(root, path)));
const mutations = [
  [
    "changed value",
    (value) => {
      value.tests[318].expected += "changed";
    },
  ],
  [
    "missing value",
    (value) => {
      delete value.tests[318].expected;
    },
  ],
  [
    "non-string value",
    (value) => {
      value.tests[318].expected = 1;
    },
  ],
  [
    "moved value",
    (value) => {
      value.tests[318].moved = value.tests[318].expected;
      delete value.tests[318].expected;
    },
  ],
  [
    "unselected decomposed value",
    (value) => {
      value.extra = "A\u030a";
    },
  ],
  [
    "decomposed key",
    (value) => {
      value["A\u030a"] = "ordinary";
    },
  ],
];
for (const [name, mutate] of mutations)
  test(`NFC preservation rejects ${name}`, async () => {
    const value = structuredClone(original);
    mutate(value);
    const session = await openJsonSourceSession();
    try {
      const events = await collectSourceEvents(
        session,
        Buffer.from(JSON.stringify(value)),
        sourceFixtureContract(path, policy),
      );
      assert.equal(events.at(-1).parserComplete, true);
      assert(events.some(({ ruleId }) => ruleId === rule));
    } finally {
      await session.close();
    }
  });
