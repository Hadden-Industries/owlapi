import assert from "node:assert/strict";
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ESLint } from "eslint";
import {
  formatJsonValue,
  jsonQualityEslint,
  jsonContract,
  openJsonSourceSession,
  openJsonRepositorySession,
  verifyJsonQualityInstallation,
  validateJsonQualityEvent,
} from "../tooling/json/public-api.mjs";
import {
  validateRepositoryJsonPolicy,
  capturedRepositoryPolicy,
} from "./json-quality-policy.mjs";
import {
  checkedFixture,
  repositoryFixture,
  collectSourceEvents,
  collectRepositoryEvents,
  readPolicyFixture,
  sourceFixtureContract,
} from "./json-quality-probe-support.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const toolingRoot = fileURLToPath(new URL("../tooling/json/", import.meta.url));
const bootstrapPath = fileURLToPath(
  new URL("./install-json-quality.mjs", import.meta.url),
);
const exclusion = (paths) => ({
  paths,
  owner: "Native installer",
  reason: "Finite external installation boundary; tracked files stay checked.",
  exclude: true,
});

test("empty arrays remain valid at the root and in ordinary object members", async () => {
  const session = await openJsonSourceSession();
  try {
    for (const value of [[], { items: [] }]) {
      const events = await collectSourceEvents(
        session,
        await formatJsonValue(value),
      );
      assert.equal(events.at(-1).parserComplete, true);
      assert.equal(events.at(-1).contractSatisfied, true);
      assert.equal(
        events.filter((event) => event.type === "finding").length,
        0,
      );
    }
  } finally {
    await session.close();
  }
});

test("complete read-only checking removes admission ceilings while preserving finite runtime controls and original bytes", async (t) => {
  const root = await repositoryFixture(t);
  const path = join(root, "selected.json"),
    bytes = Buffer.from('{"n":1.00}\n');
  await writeFile(path, bytes);
  const session = await openJsonRepositorySession({
    root,
    capacityLimits: false,
  });
  try {
    assert.ok(
      Object.values(session.resources.admission).every(
        (value) => value === null,
      ),
    );
    assert.ok(
      Object.values(session.resources.runtime).every((value) =>
        /^[1-9][0-9]*$/u.test(value),
      ),
    );
    const events = await collectRepositoryEvents(session);
    assert.equal(events.at(-1).inventoryComplete, true);
    assert.equal(events.at(-1).contractSatisfied, false);
    assert.ok(
      events.some(
        (event) => event.type === "finding" && event.path === "selected.json",
      ),
    );
    assert.equal(
      events.some((event) => event.type === "written"),
      false,
    );
    assert.deepEqual(await readFile(path), bytes);
  } finally {
    await session.close();
  }
});

test("owned release documents and every Java profile JSON receive ordinary strict checks", async () => {
  const directory = "docs/compatibility/profiles/java-owlapi-5.5.1";
  const paths = [
    "internal/parsing/jsonld/provider/build-manifest.json",
    "docs/release/gates.json",
    "docs/release/producer-gates.json",
    ...(await readdir(join(repository, directory), { recursive: true }))
      .filter((path) => path.endsWith(".json"))
      .map((path) => `${directory}/${path.split("\\").join("/")}`),
  ];
  const policy = await readPolicyFixture(repository),
    session = await openJsonSourceSession();
  try {
    for (const path of paths) {
      const contract = jsonContract(path, policy);
      assert.equal(contract.exclude, false, path);
      assert.equal(contract.allowFormatWrites, true, path);
      assert.equal(contract.formatContract, "prettier-json", path);
      const events = await collectSourceEvents(
        session,
        await readFile(join(repository, path)),
        sourceFixtureContract(path, policy),
      );
      assert.equal(events.at(-1).presentationChecked, true, path);
      assert.equal(events.at(-1).contractSatisfied, true, path);
    }
    const duplicate = await collectSourceEvents(
      session,
      Buffer.from('{"a":1,"a":2}\n'),
    );
    assert.ok(
      duplicate.some((event) => event.ruleId === "json/no-duplicate-keys"),
    );
  } finally {
    await session.close();
  }
});

test("installed source identity and generated bootstrap reject changed package bytes", async () => {
  await verifyJsonQualityInstallation({ toolingRoot, bootstrapPath });
  const target = new URL(
    "../tooling/json/node_modules/@hadden-industries/json-quality/docs/consumer-guide.md",
    import.meta.url,
  );
  const original = await readFile(target);
  try {
    await writeFile(
      target,
      Buffer.concat([original, Buffer.from("\nchanged\n")]),
    );
    await assert.rejects(
      verifyJsonQualityInstallation({ toolingRoot, bootstrapPath }),
    );
  } finally {
    await writeFile(target, original);
  }
  await verifyJsonQualityInstallation({ toolingRoot, bootstrapPath });
});

test("the public source path rejects escaped duplicate keys and unsafe exponent integers without parsing embedded payload strings", async () => {
  const session = await openJsonSourceSession();
  try {
    const duplicate = await collectSourceEvents(
      session,
      Buffer.from('{"a":1,"\\u0061":2}\n'),
    );
    assert.equal(duplicate.at(-1).parserComplete, true);
    assert.ok(
      duplicate.some((event) => event.ruleId === "json/no-duplicate-keys"),
    );
    const unsafe = await collectSourceEvents(
      session,
      Buffer.from('{"n":9007199254740992e0}\n'),
    );
    assert.ok(
      unsafe.some((event) => event.ruleId === "json-quality/interoperability"),
    );
    const valid = await collectSourceEvents(
      session,
      Buffer.from('{\n  "input": "{invalid}",\n  "n": 9007199254740991\n}\n'),
    );
    assert.equal(valid.at(-1).contractSatisfied, true);
  } finally {
    await session.close();
  }
});

test("the isolated public identity plugin diagnoses semantic serialization equality", async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.mjs"],
        plugins: { "json-quality": jsonQualityEslint },
        rules: { "json-quality/no-json-stringify-identity": "error" },
        linterOptions: { reportUnusedDisableDirectives: "error" },
      },
    ],
  });
  const [result] = await eslint.lintText(
    "const equal = JSON.stringify(a) === JSON.stringify(b);\n",
    { filePath: "identity.mjs" },
  );
  assert.ok(
    result.messages.some(
      (message) => message.ruleId === "json-quality/no-json-stringify-identity",
    ),
  );
});

test("ignored and hidden bad peers block an eligible guarded batch and unapproved exclusions remain rejected", async (t) => {
  const root = await repositoryFixture(t);
  await writeFile(join(root, ".gitignore"), "generated/\n");
  await mkdir(join(root, "generated"));
  await mkdir(join(root, ".hidden"));
  const original = Buffer.from('{"source":1}\n');
  await writeFile(join(root, "source.json"), original);
  execFileSync("git", ["-C", root, "add", "source.json"], {
    windowsHide: true,
  });
  for (const path of ["generated/bad.json", ".hidden/bad.json"])
    await writeFile(join(root, path), '{"bad":}\n');
  const session = await openJsonRepositorySession({ root, retainValues: true });
  try {
    const events = await collectRepositoryEvents(session);
    for (const path of ["generated/bad.json", ".hidden/bad.json"])
      assert.ok(
        events.some((event) => event.type === "finding" && event.path === path),
      );
    let terminal;
    for await (const event of session.rewrite("format", {
      files: ["source.json"],
    })) {
      assert.equal(validateJsonQualityEvent(event), true);
      terminal = event;
    }
    assert.equal(terminal.type, "write-failure");
    assert.equal(terminal.written, "0");
    assert.equal(terminal.preflightComplete, false);
    assert.deepEqual(await readFile(join(root, "source.json")), original);
  } finally {
    await session.close();
  }
  const policy = await readPolicyFixture(root);
  policy.exceptions = [exclusion(["generated/**"])];
  await assert.rejects(
    validateRepositoryJsonPolicy(policy, root),
    /new owner decision/u,
  );
});

test("only eight approved physical boundaries remain; repaired cargo reports cannot be excluded", async () => {
  const policy = await readPolicyFixture(repository);
  await validateRepositoryJsonPolicy(policy, repository);
  assert.deepEqual(
    policy.exceptions
      .filter((entry) => entry.exclude)
      .flatMap((entry) => entry.paths)
      .sort(),
    [
      "node_modules/**",
      "tooling/json/node_modules/**",
      "tooling/markdown/node_modules/**",
      "tooling/artifact-transport/node_modules/**",
      ".development-tools/python/**",
      ".development-tools/uv-cache/**",
      ".venv/**",
      ".release/universal-ontology/**",
    ].sort(),
  );
  const report = JSON.parse(
    await readFile(join(repository, "tooling/markdown/release-manifest.json")),
  );
  for (const archive of report.archives) {
    const path = `tooling/markdown/archives/${archive.filename.slice(0, -4)}-${report.source.head}.tgz!/package/cargo-notices.json`;
    assert.equal(jsonContract(path, policy).exclude, false, path);
  }
  const altered = structuredClone(policy);
  altered.exceptions.push(
    exclusion([
      "tooling/markdown/archives/old.tgz!/package/cargo-notices.json",
    ]),
  );
  await assert.rejects(
    validateRepositoryJsonPolicy(altered, repository),
    /new owner decision/u,
  );
});

test("Python installation junctions remain pruned while siblings and tracked JSON stay checked", async (t) => {
  const root = await repositoryFixture(t, [
    exclusion([".development-tools/python/**"]),
  ]);
  const installed = join(root, ".development-tools/python"),
    runtime = join(installed, "runtime");
  await mkdir(runtime, { recursive: true });
  await writeFile(join(runtime, "untracked.json"), '{"bad":}\n');
  await symlink(
    runtime,
    join(installed, "current"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.equal((await checkedFixture(root)).at(-1).contractSatisfied, true);
  await mkdir(join(root, ".development-tools/python-neighbor"));
  await writeFile(
    join(root, ".development-tools/python-neighbor/bad.json"),
    '{"bad":}\n',
  );
  await writeFile(join(installed, "tracked.json"), '{"bad":}\n');
  execFileSync(
    "git",
    ["-C", root, "add", "--force", ".development-tools/python/tracked.json"],
    { windowsHide: true },
  );
  const events = await checkedFixture(root);
  for (const path of [
    ".development-tools/python-neighbor/bad.json",
    ".development-tools/python/tracked.json",
  ])
    assert.ok(
      events.some((event) => event.type === "finding" && event.path === path),
    );
  assert.equal(
    events.some((event) => event.path?.endsWith("untracked.json")),
    false,
  );
});

test("a root installation boundary leaves sibling tooling and tracked source visible", async (t) => {
  const root = await repositoryFixture(t, [exclusion(["node_modules/**"])]);
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules/bad.json"), '{"bad":}\n');
  assert.equal((await checkedFixture(root)).at(-1).contractSatisfied, true);
  await writeFile(join(root, "node_modules/tracked.json"), '{"bad":}\n');
  execFileSync(
    "git",
    ["-C", root, "add", "--force", "node_modules/tracked.json"],
    { windowsHide: true },
  );
  await mkdir(join(root, "tooling/node_modules"), { recursive: true });
  await writeFile(join(root, "tooling/node_modules/bad.json"), '{"bad":}\n');
  const events = await checkedFixture(root);
  for (const path of [
    "node_modules/tracked.json",
    "tooling/node_modules/bad.json",
  ])
    assert.ok(
      events.some((event) => event.type === "finding" && event.path === path),
    );
  assert.equal(
    events.some((event) => event.path === "node_modules/bad.json"),
    false,
  );
});

test("declared isolated installation boundaries rescue tracked JSON and do not hide archived dependency members", async (t) => {
  const paths = [
    "node_modules/**",
    "tooling/json/node_modules/**",
    "tooling/markdown/node_modules/**",
    "tooling/artifact-transport/node_modules/**",
  ];
  const root = await repositoryFixture(t, [exclusion(paths)]);
  for (const path of paths.map((path) => path.slice(0, -3))) {
    await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, path, "bad.json"), '{"bad":}\n');
  }
  assert.equal((await checkedFixture(root)).at(-1).contractSatisfied, true);
  await writeFile(
    join(root, "tooling/json/node_modules/tracked.json"),
    '{"bad":}\n',
  );
  execFileSync(
    "git",
    ["-C", root, "add", "--force", "tooling/json/node_modules/tracked.json"],
    { windowsHide: true },
  );
  await mkdir(join(root, "tooling/neighbor"));
  await writeFile(join(root, "tooling/neighbor/bad.json"), '{"bad":}\n');
  const events = await checkedFixture(root);
  for (const path of [
    "tooling/json/node_modules/tracked.json",
    "tooling/neighbor/bad.json",
  ])
    assert.ok(
      events.some((event) => event.type === "finding" && event.path === path),
    );
  assert.equal(
    events.some((event) => event.path === "node_modules/bad.json"),
    false,
  );
  const policy = await readPolicyFixture(root);
  assert.equal(
    jsonContract(
      "archives/core.tgz!/package/node_modules/a/package.json",
      policy,
    ).exclude,
    false,
  );
});

test("captured policy approval rejects a changed exclusion before any guarded write", async (t) => {
  const root = await repositoryFixture(t, [exclusion(["generated/**"])]);
  await writeFile(join(root, "ordinary.json"), '{"ordinary":1}\n');
  const session = await openJsonRepositorySession({
    root,
    logicalProviders: [
      {
        definition: {
          id: "policy-approval",
          minimumDocuments: 0,
          containerPaths: [".json-quality.json"],
        },
        inventory: (access) => capturedRepositoryPolicy(access, { root }),
      },
    ],
  });
  try {
    await assert.rejects(
      collectRepositoryEvents(session),
      /new owner decision/u,
    );
  } finally {
    await session.close();
  }
  assert.equal(
    (await readFile(join(root, "ordinary.json"))).toString(),
    '{"ordinary":1}\n',
  );
});
