import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ESLint } from "eslint";
import {
  checkJsonDocument,
  formatJsonValue,
  jsonQualityEslint,
  jsonContract,
  runJsonQuality,
  verifyJsonQualityInstallation,
} from "../tooling/json/public-api.mjs";
import { readJsonPolicy } from "../tooling/json/public-api.mjs";
import { readRepositoryJsonPolicy } from "./json-quality-policy.mjs";

const toolingRoot = fileURLToPath(new URL("../tooling/json/", import.meta.url));
const bootstrapPath = fileURLToPath(
  new URL("./install-json-quality.mjs", import.meta.url),
);

test("empty arrays remain valid at the root and in ordinary object members", async () => {
  for (const value of [[], { items: [] }]) {
    const result = await checkJsonDocument(
      Buffer.from(await formatJsonValue(value)),
    );
    assert.equal(result.syntaxValid, true);
    assert.deepEqual(result.findings, []);
  }
});

test("owned release documents and every Java profile JSON receive full quality checks", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = "docs/compatibility/profiles/java-owlapi-5.5.1";
  const paths = [
    "internal/parsing/jsonld/provider/build-manifest.json",
    "docs/release/gates.json",
    "docs/release/producer-gates.json",
    ...(await readdir(join(root, directory), { recursive: true }))
      .filter((path) => path.endsWith(".json"))
      .map((path) => `${directory}/${path.split("\\").join("/")}`),
  ];
  const policy = await readRepositoryJsonPolicy(root);
  for (const path of paths) {
    const contract = jsonContract(path, policy);
    assert.equal(contract.exclude, false, path);
    assert.equal(contract.allowFormatWrites, true, path);
    assert.equal(contract.formatContract, "prettier-json", path);
    const result = await checkJsonDocument(
      await readFile(join(root, path)),
      contract,
    );
    assert.equal(result.presentationChecked, true, path);
    assert.deepEqual(result.findings, [], path);
    const duplicate = await checkJsonDocument(
      Buffer.from('{"a":1,"a":2}\n'),
      contract,
    );
    assert(
      duplicate.findings.some(
        ({ ruleId }) => ruleId === "json/no-duplicate-keys",
      ),
      path,
    );
  }
});

test("native locked payload and generated bootstrap admit installed tooling and reject changed bytes", async () => {
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

test("the real public document path rejects escaped duplicate keys and unsafe exponent integers", async () => {
  const duplicate = await checkJsonDocument(
    Buffer.from('{"a":1,"\\u0061":2}\n'),
  );
  assert.equal(duplicate.syntaxValid, true);
  assert(
    duplicate.findings.some(
      ({ ruleId }) => ruleId === "json/no-duplicate-keys",
    ),
  );
  const unsafe = await checkJsonDocument(
    Buffer.from('{"n":9007199254740992e0}\n'),
  );
  assert(
    unsafe.findings.some(
      ({ ruleId }) => ruleId === "json-quality/interoperability",
    ),
  );
  const valid = await checkJsonDocument(
    Buffer.from('{\n  "input": "{invalid}",\n  "n": 9007199254740991\n}\n'),
  );
  assert.deepEqual(valid.findings, []);
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
  assert(
    result.messages.some(
      ({ ruleId }) => ruleId === "json-quality/no-json-stringify-identity",
    ),
  );
});

test("ignored and hidden peers remain checked and a bad peer blocks the whole repair batch", async () => {
  const root = await mkdtemp(join(tmpdir(), "owlapi-json-coverage-"));
  const policy = {
    schemaVersion: 1,
    defaults: {
      formatContract: "prettier-json",
      allowFormatWrites: true,
      normalization: "NFC",
    },
    exceptions: [],
  };
  try {
    execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
    await writeFile(
      join(root, ".json-quality.json"),
      JSON.stringify(policy, null, 2) + "\n",
    );
    await writeFile(join(root, ".gitignore"), "generated/\n");
    await mkdir(join(root, "generated"));
    await mkdir(join(root, ".hidden"));
    await writeFile(join(root, "source.json"), '{"source":1}\n');
    await writeFile(join(root, "generated", "bad.json"), '{"ignored":}\n');
    await writeFile(join(root, ".hidden", "bad.json"), '{"hidden":}\n');
    const lint = await runJsonQuality("lint", { root });
    assert.equal(lint.status, "failed");
    for (const path of ["generated/bad.json", ".hidden/bad.json"])
      assert(lint.findings.some((finding) => finding.path === path));
    const before = await readFile(join(root, "source.json"));
    const repair = await runJsonQuality("format", { root });
    assert.notEqual(repair.status, "passed");
    assert.deepEqual(repair.writes.changed, []);
    assert.deepEqual(await readFile(join(root, "source.json")), before);

    policy.exceptions = [
      {
        paths: ["generated/**"],
        owner: "Probe",
        reason: "Unapproved omitted peer",
        exclude: true,
      },
    ];
    await writeFile(
      join(root, ".json-quality.json"),
      JSON.stringify(policy, null, 2) + "\n",
    );
    await assert.rejects(readRepositoryJsonPolicy(root), /new owner decision/u);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("only the seven owner-approved exclusion paths remain configured", async () => {
  const policy = await readJsonPolicy(
    fileURLToPath(new URL("../", import.meta.url)),
  );
  assert.deepEqual(
    policy.exceptions
      .filter((entry) => entry.exclude)
      .flatMap((entry) => entry.paths)
      .sort(),
    [
      "**/node_modules/**",
      ".development-tools/python/**",
      ".development-tools/uv-cache/**",
      ".venv/**",
      ".release/universal-ontology/**",
      "tooling/markdown/archives/hadden-industries-markdown-quality-linux-x64-1.0.3.tgz!/package/cargo-notices.json",
      "tooling/markdown/archives/hadden-industries-markdown-quality-win32-x64-1.0.3.tgz!/package/cargo-notices.json",
    ].sort(),
  );
});

test("the Python installation exclusion prunes its junction while preserving sibling and tracked JSON checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "owlapi-json-python-boundary-"));
  const pythonRoot = join(root, ".development-tools", "python");
  const runtime = join(pythonRoot, "runtime");
  const policy = {
    schemaVersion: 1,
    defaults: {
      formatContract: "prettier-json",
      allowFormatWrites: true,
      normalization: "NFC",
    },
    exceptions: [
      {
        paths: [".development-tools/python/**"],
        owner: "repository Python toolchain installer",
        reason: "Owner-approved temporary installed-tree boundary",
        exclude: true,
      },
    ],
  };
  try {
    execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
    await writeFile(join(root, ".gitignore"), ".development-tools/\n");
    await writeFile(
      join(root, ".json-quality.json"),
      JSON.stringify(policy, null, 2) + "\n",
    );
    await mkdir(runtime, { recursive: true });
    await writeFile(join(runtime, "untracked.json"), '{"installed":}\n');
    await symlink(
      runtime,
      join(pythonRoot, "current"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await readJsonPolicy(root);
    const excluded = await runJsonQuality("lint", { root });
    assert.equal(excluded.status, "passed");
    assert.equal(excluded.complete, true);

    const sibling = join(root, ".development-tools", "python-neighbor");
    await mkdir(sibling);
    await writeFile(join(sibling, "bad.json"), '{"neighbor":}\n');
    await writeFile(join(pythonRoot, "tracked.json"), '{"tracked":}\n');
    execFileSync(
      "git",
      ["-C", root, "add", "--force", ".development-tools/python/tracked.json"],
      { windowsHide: true },
    );
    const checked = await runJsonQuality("lint", { root });
    assert.equal(checked.status, "failed");
    for (const path of [
      ".development-tools/python-neighbor/bad.json",
      ".development-tools/python/tracked.json",
    ]) {
      assert(checked.findings.some((finding) => finding.path === path));
    }
    assert(
      !checked.findings.some((finding) =>
        finding.path.endsWith("untracked.json"),
      ),
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

test("the root npm boundary prunes ignored installs but checks tracked JSON and sibling tooling", async () => {
  const root = await mkdtemp(join(tmpdir(), "owlapi-json-root-npm-"));
  const installation = join(root, "node_modules");
  const policy = {
    schemaVersion: 1,
    defaults: {
      formatContract: "prettier-json",
      allowFormatWrites: true,
      normalization: "NFC",
    },
    exceptions: [
      {
        paths: ["node_modules/**"],
        owner: "native npm installer",
        reason: "Owner-approved root installation boundary",
        exclude: true,
      },
    ],
  };
  try {
    execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
    await writeFile(join(root, ".gitignore"), "node_modules/\n");
    await writeFile(
      join(root, ".json-quality.json"),
      JSON.stringify(policy, null, 2) + "\n",
    );
    await mkdir(installation);
    await writeFile(join(installation, "bad.json"), '{"installed":}\n');
    await readJsonPolicy(root);
    const excluded = await runJsonQuality("lint", { root });
    assert.equal(excluded.status, "passed");
    assert.equal(excluded.complete, true);
    await writeFile(join(installation, "tracked.json"), '{"tracked":}\n');
    execFileSync(
      "git",
      ["-C", root, "add", "--force", "node_modules/tracked.json"],
      { windowsHide: true },
    );
    await mkdir(join(root, "tooling", "node_modules"), { recursive: true });
    await writeFile(
      join(root, "tooling", "node_modules", "bad.json"),
      '{"sibling":}\n',
    );
    const checked = await runJsonQuality("lint", { root });
    assert.equal(checked.status, "failed");
    assert(
      checked.findings.some((f) => f.path === "node_modules/tracked.json"),
    );
    assert(
      checked.findings.some((f) => f.path === "tooling/node_modules/bad.json"),
    );
    assert(!checked.findings.some((f) => f.path === "node_modules/bad.json"));
  } finally {
    await rm(root, { recursive: true });
  }
});

test("the all-npm boundary includes isolated installations and still rescues tracked JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "owlapi-json-all-npm-"));
  const policy = {
    schemaVersion: 1,
    defaults: {
      formatContract: "prettier-json",
      allowFormatWrites: true,
      normalization: "NFC",
    },
    exceptions: [
      {
        paths: ["**/node_modules/**"],
        owner: "native npm installers",
        reason: "Owner-approved exclusion of every npm installation tree",
        exclude: true,
      },
    ],
  };
  try {
    execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
    await writeFile(join(root, ".gitignore"), "node_modules/\n");
    await writeFile(
      join(root, ".json-quality.json"),
      JSON.stringify(policy, null, 2) + "\n",
    );
    for (const path of [
      "node_modules",
      "tooling/json/node_modules",
      "tooling/markdown/node_modules",
    ]) {
      await mkdir(join(root, path), { recursive: true });
      await writeFile(join(root, path, "bad.json"), '{"installed":}\n');
    }
    await readJsonPolicy(root);
    const excluded = await runJsonQuality("lint", { root });
    assert.equal(excluded.status, "passed");
    assert.equal(excluded.complete, true);
    await writeFile(
      join(root, "tooling/json/node_modules/tracked.json"),
      '{"tracked":}\n',
    );
    execFileSync(
      "git",
      ["-C", root, "add", "--force", "tooling/json/node_modules/tracked.json"],
      { windowsHide: true },
    );
    await mkdir(join(root, "tooling", "neighbor"));
    await writeFile(
      join(root, "tooling", "neighbor", "bad.json"),
      '{"neighbor":}\n',
    );
    const checked = await runJsonQuality("lint", { root });
    assert.equal(checked.status, "failed");
    assert(
      checked.findings.some(
        (f) => f.path === "tooling/json/node_modules/tracked.json",
      ),
    );
    assert(
      checked.findings.some((f) => f.path === "tooling/neighbor/bad.json"),
    );
    assert(!checked.findings.some((f) => f.path === "node_modules/bad.json"));
    assert(
      !checked.findings.some(
        (f) => f.path === "tooling/markdown/node_modules/bad.json",
      ),
    );
  } finally {
    await rm(root, { recursive: true });
  }
});
