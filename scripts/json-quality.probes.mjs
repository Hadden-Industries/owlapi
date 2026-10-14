import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
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
  jsonQualityEslint,
  runJsonQuality,
  verifyJsonQualityInstallation,
} from "../tooling/json/public-api.mjs";
import { readRepositoryJsonPolicy } from "./json-quality-policy.mjs";

const toolingRoot = fileURLToPath(new URL("../tooling/json/", import.meta.url));
const bootstrapPath = fileURLToPath(
  new URL("./install-json-quality.mjs", import.meta.url),
);

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
        owner: "probe",
        reason: "Attempt to omit an ignored peer",
        exclude: true,
      },
    ];
    await writeFile(
      join(root, ".json-quality.json"),
      JSON.stringify(policy, null, 2) + "\n",
    );
    await assert.rejects(readRepositoryJsonPolicy(root), /coverage exclusions/);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("the temporary Markdown report boundary excludes only pinned bytes and expires on package changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "owlapi-json-markdown-exception-"));
  const path =
    "tooling/markdown/node_modules/@hadden-industries/markdown-quality-win32-x64/cargo-notices.json";
  const packageRoot = join(root, path, "..");
  const policy = {
    schemaVersion: 1,
    defaults: {
      formatContract: "prettier-json",
      allowFormatWrites: true,
      normalization: "NFC",
    },
    exceptions: [
      {
        paths: [path],
        owner: "Markdown Quality native package producer",
        reason: "Owner-approved temporary report exception",
        exclude: true,
      },
    ],
  };
  try {
    execFileSync("git", ["init", "--quiet", root], { windowsHide: true });
    await writeFile(
      join(root, ".json-quality.json"),
      JSON.stringify(policy, null, 2) + "\n",
    );
    // The opposite platform need not be installed.
    await readRepositoryJsonPolicy(root);
    await mkdir(packageRoot, { recursive: true });
    const report = await readFile(new URL(`../${path}`, import.meta.url));
    await writeFile(join(root, path), report);
    await assert.rejects(readRepositoryJsonPolicy(root), /ENOENT/);
    const metadata = {
      name: "@hadden-industries/markdown-quality-win32-x64",
      version: "1.0.3",
    };
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify(metadata, null, 2) + "\n",
    );
    await readRepositoryJsonPolicy(root);
    await writeFile(join(packageRoot, "peer.json"), '{"peer":}\n');
    const lint = await runJsonQuality("lint", { root });
    assert.equal(lint.status, "failed");
    assert(
      lint.findings.some((finding) => finding.path.endsWith("/peer.json")),
    );
    assert(!lint.findings.some((finding) => finding.path === path));
    const repair = await runJsonQuality("format", { root });
    assert.notEqual(repair.status, "passed");
    assert.deepEqual(await readFile(join(root, path)), report);

    metadata.version = "1.0.4";
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify(metadata),
    );
    await assert.rejects(
      readRepositoryJsonPolicy(root),
      /Remove the temporary/,
    );
    metadata.version = "1.0.3";
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify(metadata),
    );
    await writeFile(
      join(root, path),
      Buffer.concat([report, Buffer.from("\n")]),
    );
    await assert.rejects(
      readRepositoryJsonPolicy(root),
      /Remove the temporary/,
    );
  } finally {
    await rm(root, { recursive: true });
  }
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
    await readRepositoryJsonPolicy(root);
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
