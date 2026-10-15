import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkJsonDocument,
  jsonContract,
} from "../tooling/json/public-api.mjs";
import { readJsonPolicy } from "../tooling/json/public-api.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const policy = await readJsonPolicy(root);
const rule = "json-quality/normalized-strings";

test("all 13 owner-approved values retain exact protected NFC contracts", async () => {
  const exceptions = policy.exceptions.filter(
    ({ preserveNfcValues }) => preserveNfcValues?.length,
  );
  assert.equal(
    exceptions.reduce(
      (count, entry) => count + entry.preserveNfcValues.length,
      0,
    ),
    13,
  );
  for (const entry of exceptions) {
    assert.equal(entry.paths.length, 1);
    const path = entry.paths[0];
    const contract = jsonContract(path, policy);
    assert.equal(contract.allowFormatWrites, false);
    assert.equal(contract.normalization, "NFC");
    const result = await checkJsonDocument(
      await readFile(join(root, path)),
      contract,
    );
    assert.equal(result.syntaxValid, true);
    assert(!result.findings.some(({ ruleId }) => ruleId === rule), path);
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
    const result = await checkJsonDocument(
      Buffer.from(JSON.stringify(value)),
      jsonContract(path, policy),
    );
    assert(result.findings.some(({ ruleId }) => ruleId === rule));
  });
