import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  checkPythonTools,
  repositoryPythonTools,
  repositoryRoot,
  runPythonTool,
  workflowPythonRequest,
} from "./repository-python-tools.mjs";

let root;

test.each(["win32", "linux"])(
  "workflow Python request is downloadable in the pinned uv catalogue on %s",
  (platform) => {
    const tools = repositoryPythonTools();
    const version = readFileSync(
      join(repositoryRoot, ".python-version"),
      "utf8",
    ).trim();
    const request = workflowPythonRequest(version, platform);
    const catalogue = spawnSync(
      tools.uv,
      [
        "python",
        "list",
        request,
        "--only-downloads",
        "--all-platforms",
        "--all-arches",
        "--all-versions",
        "--output-format",
        "json",
      ],
      {
        cwd: repositoryRoot,
        env: tools.env,
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
      },
    );
    expect(catalogue.status).toBe(0);
    expect(catalogue.error).toBeUndefined();
    expect(JSON.parse(catalogue.stdout).map(({ key }) => key)).toContain(
      request,
    );
  },
);
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "owlapi-python-"));
});
afterEach(() => {
  if (
    dirname(root) !== resolve(tmpdir()) ||
    !basename(root).startsWith("owlapi-python-")
  )
    throw new Error("Refusing cleanup outside the owned Python fixture.");
  rmSync(root, { recursive: true });
});

test("tool resolution isolates foreign environments, including Windows key casing", () => {
  const tools = repositoryPythonTools({
    root,
    inherited: {
      Path: "kept",
      vIrTuAl_EnV: "foreign",
      uv_project_environment: "foreign",
      UV_PYTHON: "foreign",
      PYTHONPATH: "foreign",
    },
  });
  expect(tools.env).toMatchObject({
    Path: "kept",
    UV_PROJECT_ENVIRONMENT: join(root, ".venv"),
    UV_PYTHON_DOWNLOADS: "never",
    UV_NO_CONFIG: "1",
  });
  expect(tools.env).not.toHaveProperty("vIrTuAl_EnV");
  expect(tools.env).not.toHaveProperty("uv_project_environment");
  expect(tools.env).not.toHaveProperty("UV_PYTHON");
  expect(tools.env).not.toHaveProperty("PYTHONPATH");
  expect(tools.python.startsWith(join(root, ".venv"))).toBe(true);
});

test("missing tools and subprocess timeouts fail without consulting PATH", () => {
  expect(() => checkPythonTools({ root })).toThrow(/Missing checkout uv/);
  expect(() => runPythonTool("ruff", ["check", "."], { root })).toThrow(
    /Missing ruff/,
  );
  expect(() => runPythonTool("other", [])).toThrow(/Unsupported/);
  expect(() =>
    runPythonTool("ruff", [], {
      spawn: () => ({
        status: null,
        signal: "SIGTERM",
        error: { code: "ETIMEDOUT" },
      }),
    }),
  ).toThrow(/ETIMEDOUT/);
});

test("the real locked environment is current and a stale manifest cannot rewrite its lock", () => {
  const tools = checkPythonTools();
  const lock = readFileSync(join(repositoryRoot, "uv.lock"), "utf8");
  writeFileSync(join(root, "uv.lock"), lock);
  const manifest = readFileSync(join(repositoryRoot, "pyproject.toml"), "utf8");
  writeFileSync(join(root, "pyproject.toml"), manifest);
  const args = [
    "lock",
    "--check",
    "--offline",
    "--python",
    tools.python,
    "--no-python-downloads",
  ];
  const invoke = () =>
    spawnSync(tools.uv, args, {
      cwd: root,
      env: tools.env,
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    });
  expect(invoke().status).toBe(0);
  writeFileSync(
    join(root, "pyproject.toml"),
    manifest.replace('version = "0.0.0"', 'version = "0.0.1"'),
  );
  expect(invoke().status).not.toBe(0);
  expect(readFileSync(join(root, "uv.lock"), "utf8")).toBe(lock);
});

test("native Ruff reports correctness, import-order, upgrade and bugbear defects", () => {
  const input =
    "from typing import List\nimport sys\nimport os\n\ndef values(items=[])->List[int]:\n    return missing\n";
  const result = runPythonTool(
    "ruff",
    [
      "check",
      "--stdin-filename",
      "quality-example.py",
      "--output-format",
      "json",
      "-",
    ],
    { input },
  );
  expect(result.status).toBe(1);
  const codes = JSON.parse(result.stdout).map(({ code }) => code);
  expect(codes).toEqual(
    expect.arrayContaining(["F821", "I001", "UP006", "B006"]),
  );
  const formatted = runPythonTool(
    "ruff",
    ["format", "--stdin-filename", "quality-example.py", "-"],
    { input },
  );
  expect(formatted.status).toBe(0);
  expect(formatted.stdout).toContain("def values(items=[]) -> List[int]:");
  expect(formatted.stdout).not.toContain("\r");
});

test("native Ruff handles an empty directory and excluded explicit files without reading stdin", () => {
  const config = join(root, "ruff.toml");
  writeFileSync(config, readFileSync(join(repositoryRoot, "ruff.toml")));
  for (const args of [["check"], ["format", "--check"]]) {
    expect(
      runPythonTool("ruff", [...args, "--config", config, root]).status,
    ).toBe(0);
  }
  const upstream = join(root, "docs/conformance/upstream");
  mkdirSync(upstream, { recursive: true });
  const file = join(upstream, "example.py");
  writeFileSync(file, "print(missing)\n");
  // Ruff resolves an explicit configuration's relative exclusions from cwd.
  // This temporary project must run from its own root, just like the real CLI.
  const tools = repositoryPythonTools();
  expect(
    spawnSync(tools.executable("ruff"), ["check", "--config", config, file], {
      cwd: root,
      env: tools.env,
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
    }).status,
  ).toBe(0);
  expect(readFileSync(file, "utf8")).toBe("print(missing)\n");
});
