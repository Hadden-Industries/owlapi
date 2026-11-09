import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  resolveJsonSourceContract,
  openJsonSourceSession,
} from "@hadden-industries/json-quality";
import {
  readPolicyFixture,
  sourceFixtureContract,
  collectSourceEvents,
} from "./json-quality-probe-support.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const policy = await readPolicyFixture(root);
const rule = "json-quality/nfc-strings";
const exceptions = policy.exceptions.filter(
  ({ nfcExemptStringValues }) => nfcExemptStringValues?.length,
);

test("all 15 physical owner-approved values retain exact protected NFC contracts", async () => {
  assert.equal(
    exceptions.reduce(
      (count, entry) => count + entry.nfcExemptStringValues.length,
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
      const contract = resolveJsonSourceContract(path, policy);
      assert.equal(contract.allowSourceRewrites, false);
      assert.equal(contract.normalization, "NFC");
      physicalPins += entry.nfcExemptStringValues.length;
      const events = await collectSourceEvents(
        session,
        await readFile(join(root, path)),
        sourceFixtureContract(path, policy),
      );
      assert.equal(events.at(-1).parserComplete, true, path);
      assert(!events.some(({ ruleId }) => ruleId === rule), path);
    }
    assert.equal(physicalPins, 15);
  } finally {
    await session.close();
  }
});

test("the retained Linux provenance report preserves both independent original author oracles", async () => {
  const path =
    "docs/provenance/markdown-quality-1.0.3-linux-cargo-notices.json";
  const bytes = await readFile(join(root, path));
  assert.equal(bytes.length, 4875725);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "86147599f977088a3690c5eb2954a84ea14d5f91a7b6afc6a082e6e4e2bcd88e",
  );
  // Independent literals: never derive this oracle from the mutable policy or
  // normalize the original attribution when the former archive leaves scope.
  const expected = "Fe\u0301lix Saparelli <me@passcod.name>";
  const report = JSON.parse(bytes);
  assert.equal(report.licenses[25].used_by[0].crate.authors[1], expected);
  assert.equal(report.crates[92].package.authors[1], expected);
  assert.notEqual(expected.normalize("NFC"), expected);
  const entry = exceptions.find(({ paths }) => paths.includes(path));
  assert.equal(entry.nfcExemptStringValues.length, 2);
  assert.deepEqual(
    entry.nfcExemptStringValues.map(({ pointer }) => pointer),
    ["/licenses/25/used_by/0/crate/authors/1", "/crates/92/package/authors/1"],
  );
  for (const pin of entry.nfcExemptStringValues) {
    assert.equal(
      pin.sha256,
      "f7a46979f4c152096032b17774ded243fdb9cfe324a381e8a8a4a2a8e32a2cc5",
    );
    assert.equal(pin.byteLength, "35");
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
