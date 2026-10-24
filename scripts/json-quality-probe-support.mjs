// Finite test-fixture helpers. Production adapters return the public sessions;
// these helpers retain only bounded assertion events and never project v1 DTOs.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import {
  admitJsonPolicy,
  formatJsonValue,
  jsonContract,
  openJsonRepositorySession,
  validateJsonQualityEvent,
} from "../tooling/json/public-api.mjs";

export async function readPolicyFixture(root) {
  const bytes = await readFile(join(root, ".json-quality.json"));
  assert.ok(bytes.length <= 262144, "Finite policy fixture metadata");
  return admitJsonPolicy(JSON.parse(bytes));
}

/** Source checks cannot discharge complete repository or linked-source closure. */
export function sourceFixtureContract(path, policy) {
  const { exclude, exceptions, ...contract } = jsonContract(path, policy);
  assert.equal(exclude, false, path);
  const owner = exceptions[0] ?? {
    owner: "Finite source fixture",
    reason:
      "Public source checks only; repository closure is separately exercised.",
  };
  contract.owner = owner.owner;
  contract.reason = owner.reason;
  contract.allowFormatWrites = false;
  if (contract.expected?.linkedDocuments) {
    contract.expected = { ...contract.expected };
    delete contract.expected.linkedDocuments;
  }
  return contract;
}

export async function collectSourceEvents(session, bytes, contract = {}) {
  bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return collectOpenedSourceEvents(
    session,
    {
      async *open() {
        for (let offset = 0; offset < bytes.length; offset += 65536)
          yield bytes.subarray(offset, offset + 65536);
      },
    },
    contract,
  );
}

export async function collectOpenedSourceEvents(
  session,
  source,
  contract = {},
) {
  const events = [];
  for await (const event of session.check(source, contract, {
    retainValues: false,
  })) {
    assert.equal(validateJsonQualityEvent(event), true);
    assert.ok(events.length < 20000, "Finite assertion event metadata");
    events.push(event);
  }
  assert.equal(events.at(-1).type, "terminal");
  return events;
}

export async function collectRepositoryEvents(session) {
  const events = [];
  for await (const event of session.events()) {
    assert.equal(validateJsonQualityEvent(event), true);
    assert.ok(events.length < 20000, "Finite repository fixture metadata");
    events.push(event);
  }
  assert.equal(events.at(-1).type, "execution-terminal");
  return events;
}

export async function checkedFixture(root, options = {}) {
  const session = await openJsonRepositorySession({ root, ...options });
  try {
    return await collectRepositoryEvents(session);
  } finally {
    await session.close();
  }
}

export async function repositoryFixture(t, exceptions = []) {
  const root = await mkdtemp(join(tmpdir(), "owlapi-json-session-"));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("owlapi-json-session-"));
    await rm(root, { recursive: true, force: true, maxRetries: 10 });
  });
  execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
  const policy = {
    schemaVersion: 2,
    defaults: {
      formatContract: "prettier-json",
      allowFormatWrites: true,
      normalization: "NFC",
    },
    exceptions,
  };
  await writeFile(
    join(root, ".json-quality.json"),
    await formatJsonValue(policy),
  );
  return root;
}
