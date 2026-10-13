import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cruise, format } from "dependency-cruiser";
import { assertPackageIdentity } from "./package-identity.mjs";
import { findNpmCliCandidates } from "./assert-workflow-runtime.mjs";

export const REPOSITORY_ROOT = realpathSync(
  fileURLToPath(new URL("../", import.meta.url)),
);
const readPolicy = () =>
  JSON.parse(
    readFileSync(
      new URL("../.dependency-cruiser.json", import.meta.url),
      "utf8",
    ),
  );
const JS = /\.(?:js|mjs|cjs)$/u;
export const EXCLUDED_DOMAINS = [
  "docs/provenance/",
  "docs/conformance/upstream/",
  "docs/conformance/generated/",
  "util/owlapi-reference/fixtures/",
  "tooling/markdown/archives/",
];
const slash = (value) => value.replaceAll("\\", "/");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const run = (executable, argv, root) =>
  execFileSync(executable, argv, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
const git = (root, ...argv) => run("git", argv, root);

export const npmCli = () =>
  process.env.npm_execpath ??
  findNpmCliCandidates()[0] ??
  (() => {
    throw new Error("Run through npm to select the npm CLI.");
  })();

const toolIdentity = (manifestPath, binName) => {
  const manifest = readJson(manifestPath);
  const bin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin[binName];
  const executable = realpathSync(
    path.resolve(path.dirname(manifestPath), bin),
  );
  return {
    name: manifest.name,
    version: manifest.version,
    executable,
    executableSha256: digest(readFileSync(executable)),
    manifest: realpathSync(manifestPath),
    manifestSha256: digest(readFileSync(manifestPath)),
  };
};

const npmIdentity = () => {
  const cli = realpathSync(npmCli());
  const tool = toolIdentity(
    path.resolve(path.dirname(cli), "../package.json"),
    "npm",
  );
  if (tool.name !== "npm" || tool.executable !== cli) {
    throw new Error("Selected CLI is not the native npm entry point.");
  }
  return tool;
};

const jestArguments = (root, extra) => {
  const tool = toolIdentity(
    path.join(root, "node_modules/jest/package.json"),
    "jest",
  );
  return {
    tool,
    argv: [
      "--experimental-vm-modules",
      "--disable-warning=ExperimentalWarning",
      tool.executable,
      "--runInBand",
      ...extra,
    ],
  };
};

export const shippedInventory = (root = REPOSITORY_ROOT) => {
  const manifest = readJson(path.join(root, "package.json"));
  const native = JSON.parse(
    run(
      process.execPath,
      [npmCli(), "pack", "--dry-run", "--json", "--ignore-scripts"],
      root,
    ),
  );
  const packed = Array.isArray(native) ? native : Object.values(native);
  if (
    packed.length !== 1 ||
    !Array.isArray(packed[0].files) ||
    packed[0].files.length === 0
  ) {
    throw new Error("npm did not return a nonempty package inventory.");
  }
  const files = packed[0].files.map(({ path: file }) => slash(file)).sort();
  for (const file of files) {
    if (
      path.isAbsolute(file) ||
      file.split("/").includes("..") ||
      lstatSync(path.join(root, file)).isSymbolicLink()
    ) {
      throw new Error(`Unsafe package member: ${file}`);
    }
  }
  return { manifest, files, runtime: files.filter((file) => JS.test(file)) };
};

export const authoredInventory = (root = REPOSITORY_ROOT) => {
  const files = git(
    root,
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  )
    .split("\0")
    .filter(Boolean);
  return [...new Set(files)]
    .filter(
      (file) =>
        JS.test(file) &&
        !EXCLUDED_DOMAINS.some((prefix) => file.startsWith(prefix)),
    )
    .filter((file) => {
      try {
        const info = lstatSync(path.join(root, file));
        if (info.isSymbolicLink()) {
          throw new Error(`Authored symlink is not supported: ${file}`);
        }
        return info.isFile();
      } catch (error) {
        if (error.code === "ENOENT") {
          return false;
        }
        throw error;
      }
    })
    .sort();
};

export const discoverJestTests = (root = REPOSITORY_ROOT, extra = []) => {
  const { argv } = jestArguments(root, ["--listTests", "--json", ...extra]);
  const output = run(process.execPath, argv, root);
  const tests = JSON.parse(output);
  if (!Array.isArray(tests) || tests.some((file) => typeof file !== "string")) {
    throw new Error("Invalid native Jest inventory.");
  }
  return tests
    .map((file) => slash(path.relative(root, realpathSync(file))))
    .sort();
};

const literalSet = (files) =>
  files.length
    ? `^(?:${files.map((file) => file.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|")})$`
    : "(?!)";
export const runtimePolicy = ({ files, runtime }) => ({
  ...readPolicy(),
  forbidden: [
    ...readPolicy().forbidden,
    {
      name: "no-runtime-to-unshipped-source",
      severity: "error",
      from: { path: literalSet(runtime) },
      to: {
        dependencyTypes: ["local", "localmodule"],
        pathNot: literalSet(files),
      },
    },
    {
      name: "no-runtime-to-undeclared-package",
      severity: "error",
      from: { path: literalSet(runtime) },
      to: { dependencyTypes: ["npm-no-pkg"] },
    },
    {
      name: "no-runtime-to-dev-only",
      severity: "error",
      from: { path: literalSet(runtime) },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["npm", "npm-optional", "npm-peer", "npm-bundled"],
      },
    },
  ],
});

export const TOOLING_ROOTS = [
  "scripts/canonical-json.mjs",
  "scripts/review-facts.mjs",
  "util/third-party-evidence/digests.mjs",
];

export const toolingPolicy = () => ({
  ...readPolicy(),
  forbidden: [
    ...readPolicy().forbidden,
    {
      name: "tooling-primitives-stay-independent",
      severity: "error",
      from: { path: literalSet(TOOLING_ROOTS) },
      to: {
        path: "^(?!node:|crypto$)",
        pathNot: literalSet(TOOLING_ROOTS),
        reachable: true,
      },
    },
  ],
});

export const extractGraph = async (root, inputs, policy = readPolicy()) => {
  if (inputs.length === 0) {
    throw new Error("Refusing an empty graph input inventory.");
  }
  const result = await cruise(
    inputs,
    {
      ...policy.options,
      baseDir: root,
      outputType: "json",
      validate: true,
      ruleSet: policy,
    },
    {
      conditionNames: ["node", "import", "require", "default"],
      exportsFields: ["exports"],
      bustTheCache: true,
    },
  );
  const graph =
    typeof result.output === "string"
      ? JSON.parse(result.output)
      : result.output;
  await format(graph, { outputType: "json" }); // Public formatter validates the native result schema.
  const present = new Set(graph.modules.map(({ source }) => source));
  const missing = inputs.filter((file) => !present.has(file));
  if (missing.length) {
    throw new Error(`Native graph omitted roots: ${missing.join(", ")}`);
  }
  return graph;
};

export const checkTooling = async (root = REPOSITORY_ROOT) => {
  const policy = toolingPolicy();
  const graph = await extractGraph(root, TOOLING_ROOTS, policy);
  return {
    graph,
    policy,
    errors: graph.summary.violations.filter(
      ({ rule }) => rule.severity === "error",
    ),
  };
};

export const lexicalOffenders = (root, runtime) =>
  runtime.filter((file) =>
    /\bvowl\b/iu.test(readFileSync(path.join(root, file), "utf8")),
  );
export const checkRuntime = async (root = REPOSITORY_ROOT) => {
  if (root === REPOSITORY_ROOT) {
    assertPackageIdentity(readJson(path.join(root, "package.json")));
  }
  const inventory = shippedInventory(root);
  const policy = runtimePolicy(inventory);
  const graph = await extractGraph(root, inventory.runtime, policy);
  const lexical = lexicalOffenders(root, inventory.runtime);
  const errors = graph.summary.violations.filter(
    ({ rule }) => rule.severity === "error",
  );
  return { inventory, policy, graph, lexical, errors };
};

// Current exports are explicit, unconditional specifiers. Node owns their
// resolution; a future conditional/pattern contract needs separate qualification.
export const publicExportRoots = (root, inventory) => {
  const { name, exports } = inventory.manifest;
  if (!exports || typeof exports !== "object" || Array.isArray(exports)) {
    throw new Error(
      "Public export reporting requires explicit subpath exports.",
    );
  }
  const resolve = createRequire(path.join(root, "package.json")).resolve;
  const roots = Object.entries(exports).map(([key, target]) => {
    if (
      (key !== "." && !key.startsWith("./")) ||
      key.includes("*") ||
      typeof target !== "string"
    ) {
      throw new Error(
        "Conditional or pattern exports need qualification before reporting.",
      );
    }
    const specifier = key === "." ? name : `${name}/${key.slice(2)}`;
    const source = slash(path.relative(root, realpathSync(resolve(specifier))));
    if (!inventory.runtime.includes(source)) {
      throw new Error(
        `Public export is outside shipped JavaScript: ${specifier}`,
      );
    }
    return { specifier, source };
  });
  if (!roots.length) throw new Error("No public export roots.");
  return roots;
};

export const runtimeReportPolicy = (inventory, roots) => ({
  ...runtimePolicy(inventory),
  options: { ...runtimePolicy(inventory).options, metrics: true },
  forbidden: [
    ...runtimePolicy(inventory).forbidden,
    {
      name: "advisory-unreachable-from-public-exports",
      severity: "info",
      from: { path: literalSet(roots.map(({ source }) => source)) },
      to: {
        path: literalSet(inventory.runtime),
        pathNot: literalSet(roots.map(({ source }) => source)),
        reachable: false,
      },
    },
    {
      name: "advisory-runtime-folder-cycles",
      severity: "info",
      scope: "folder",
      from: {},
      to: { circular: true },
    },
  ],
});

export const focusedReports = async (graph, source) => {
  if (!graph.modules.some((module) => module.source === source)) {
    throw new Error(
      `Focus module is absent from the complete graph: ${source}`,
    );
  }
  const path = literalSet([source]);
  return {
    "focus.json": (await format(graph, { outputType: "json", focus: { path } }))
      .output,
    "dependents.json": (
      await format(graph, { outputType: "json", reaches: { path } })
    ).output,
    "focus.mmd": (
      await format(graph, { outputType: "mermaid", focus: { path } })
    ).output,
    "dependents.mmd": (
      await format(graph, { outputType: "mermaid", reaches: { path } })
    ).output,
  };
};

// Resolve the existing parent before exclusive allocation: aliases cannot redirect into the checkout.
export const reserveOutput = (target, root = REPOSITORY_ROOT) => {
  if (!path.isAbsolute(target)) {
    throw new Error(
      "Output must be an absolute path to a new external directory.",
    );
  }
  const resolved = path.join(
    realpathSync(path.dirname(target)),
    path.basename(target),
  );
  const relative = path.relative(realpathSync(root), resolved);
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  ) {
    throw new Error("Output must be outside the repository.");
  }
  mkdirSync(resolved); // No recursive creation and no overwrite of an existing target.
  return realpathSync(resolved);
};

// Bind controls as inputs, including absent files and ignored parent controls.
// The lock supplies installed manifest locations; no dependency resolver is duplicated.
const identityFiles = (root, inputs, inventory) => {
  const files = new Set([
    ...inputs,
    ...inventory.files,
    "package.json",
    "package-lock.json",
    ".dependency-cruiser.json",
  ]);
  for (const file of git(
    root,
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  )
    .split("\0")
    .filter(Boolean)) {
    if (
      !EXCLUDED_DOMAINS.some((prefix) => file.startsWith(prefix)) &&
      /(?:\.json|\.npmignore|\.gitignore|\.npmrc)$/u.test(file)
    ) {
      files.add(file);
    }
  }
  for (const file of [...files]) {
    let directory = path.posix.dirname(slash(file));
    while (true) {
      for (const control of [
        "package.json",
        ".npmignore",
        ".gitignore",
        ".npmrc",
      ]) {
        files.add(directory === "." ? control : `${directory}/${control}`);
      }
      if (directory === ".") {
        break;
      }
      directory = path.posix.dirname(directory);
    }
  }
  const lockPath = path.join(root, "package-lock.json");
  if (existsSync(lockPath)) {
    for (const location of Object.keys(readJson(lockPath).packages ?? {})) {
      if (
        location.startsWith("node_modules/") &&
        !location.split("/").includes("..")
      ) {
        files.add(`${location}/package.json`);
      }
    }
  }
  return Object.fromEntries(
    [...files].sort().map((file) => {
      const absolute = path.join(root, file);
      if (!existsSync(absolute)) {
        return [file, null];
      }
      if (
        !lstatSync(absolute).isFile() ||
        lstatSync(absolute).isSymbolicLink()
      ) {
        throw new Error(`Unsafe identity input: ${file}`);
      }
      return [file, digest(readFileSync(absolute))];
    }),
  );
};

export const inputIdentity = (root, inputs, inventory) => ({
  head: git(root, "rev-parse", "HEAD").trim(),
  tree: git(root, "rev-parse", "HEAD^{tree}").trim(),
  parents: git(root, "show", "-s", "--format=%P", "HEAD")
    .trim()
    .split(" ")
    .filter(Boolean),
  status: git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all"),
  packageFiles: inventory.files,
  files: identityFiles(root, inputs, inventory),
  tools: {
    npm: npmIdentity(),
    jest: jestArguments(REPOSITORY_ROOT, []).tool,
    dependencyCruiser: {
      manifestSha256: digest(
        readFileSync(
          new URL(
            "../../package.json",
            import.meta.resolve("dependency-cruiser"),
          ),
        ),
      ),
      entrySha256: digest(
        readFileSync(fileURLToPath(import.meta.resolve("dependency-cruiser"))),
      ),
    },
    producerSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
    policySha256: digest(
      readFileSync(new URL("../.dependency-cruiser.json", import.meta.url)),
    ),
  },
});

export const writeBundle = async (
  target,
  root = REPOSITORY_ROOT,
  focus = null,
) => {
  const output = reserveOutput(target, root);
  writeFileSync(
    path.join(output, "incomplete.json"),
    json({
      producer: "@hadden-industries/owlapi/dependency-analysis",
      complete: false,
    }),
    { flag: "wx" },
  );
  const inputs = authoredInventory(root);
  const inventory = shippedInventory(root);
  assertPackageIdentity(inventory.manifest);
  const before = inputIdentity(root, inputs, inventory);
  const discovery = jestArguments(root, ["--listTests", "--json"]);
  const configuration = jestArguments(root, ["--showConfig"]);
  const effectiveJestConfiguration = JSON.parse(
    run(process.execPath, configuration.argv, root),
  );
  const tests = discoverJestTests(root);
  const roots = publicExportRoots(root, inventory);
  const reportPolicy = runtimeReportPolicy(inventory, roots);
  const runtime = await extractGraph(root, inventory.runtime, reportPolicy);
  const graph = await extractGraph(root, inputs);
  for (const { source } of [...graph.modules, ...runtime.modules]) {
    if (
      JS.test(source) &&
      !path.isAbsolute(source) &&
      !source.startsWith("../") &&
      !source.includes("node_modules/") &&
      existsSync(path.join(root, source)) &&
      !before.files[source]
    ) {
      throw new Error(
        `Native graph consumed an input outside the captured domain: ${source}`,
      );
    }
  }
  const role = (file) =>
    inventory.runtime.includes(file)
      ? "shipped-runtime"
      : tests.includes(file)
        ? "jest-test"
        : file.endsWith(".probes.mjs") ||
            file === "test/package-boundary.test.mjs"
          ? "native-node-test"
          : file.startsWith("test/consumers/")
            ? "browser-or-installed-consumer"
            : "tooling";
  const members = {
    "dependencies.json": json(graph),
    "runtime-dependencies.json": json(runtime),
    "modules.mmd": (await format(graph, { outputType: "mermaid" })).output,
    "folders.mmd": (await format(graph, { outputType: "mermaid", collapse: 1 }))
      .output,
    "runtime-metrics.txt": (await format(runtime, { outputType: "metrics" }))
      .output,
    ...(focus === null ? {} : await focusedReports(graph, focus)),
    "inventory.json": json({
      authored: inputs.map((file) => ({ file, role: role(file) })),
      packageFiles: inventory.files,
      runtime: inventory.runtime,
      jest: tests,
      excludedDomains: EXCLUDED_DOMAINS,
      staticLimitations: [
        "computed imports",
        "runtime resource reads",
        "generated programs",
        "workers",
        "subprocess inputs",
      ],
      policy: runtimePolicy(inventory),
      runtimeReportPolicy: reportPolicy,
      publicExports: roots,
    }),
  };
  for (const [file, content] of Object.entries(members)) {
    writeFileSync(path.join(output, file), content, { flag: "wx" });
  }
  const after = inputIdentity(
    root,
    authoredInventory(root),
    shippedInventory(root),
  );
  if (json(before) !== json(after)) {
    const changedFiles = [
      ...new Set([...Object.keys(before.files), ...Object.keys(after.files)]),
    ].filter((file) => before.files[file] !== after.files[file]);
    throw new Error(
      `Inputs changed during graph generation; bundle remains incomplete. ${json(
        {
          changedFiles,
          changedIdentityFields: Object.keys(before).filter(
            (key) => key !== "files" && json(before[key]) !== json(after[key]),
          ),
        },
      )}`,
    );
  }
  const manifest = {
    producer: "@hadden-industries/owlapi/dependency-analysis",
    reportKind: "dependency-graph-bundle",
    schemaVersion: 2,
    complete: true,
    repository: realpathSync(root),
    identity: before,
    node: process.version,
    invocations: {
      npm: {
        executable: process.execPath,
        argv: [
          before.tools.npm.executable,
          "pack",
          "--dry-run",
          "--json",
          "--ignore-scripts",
        ],
        cwd: root,
      },
      jestDiscovery: {
        executable: process.execPath,
        argv: discovery.argv,
        cwd: root,
      },
      jestConfiguration: {
        executable: process.execPath,
        argv: configuration.argv,
        cwd: root,
      },
      environment: Object.fromEntries(
        ["NODE_OPTIONS", "NODE_PATH", "NODE_ENV"].map((key) => [
          key,
          process.env[key] ?? null,
        ]),
      ),
    },
    effectiveJestConfiguration,
    dependencyCruiser: readJson(
      new URL("../../package.json", import.meta.resolve("dependency-cruiser")),
    ).version,
    resolver: {
      conditions: ["node", "import", "require", "default"],
      environment: "Node source; not browser or installed candidate",
    },
    reports: {
      focus,
      publicExports: roots,
      scope:
        "Advisory native reachability and metrics; resource use and execution impact are not proven.",
    },
    counts: {
      authored: inputs.length,
      runtime: inventory.runtime.length,
      jest: tests.length,
      cycles: graph.summary.violations.filter(
        ({ rule }) => rule.name === "circular-dependencies",
      ).length,
      unresolved: graph.modules
        .flatMap(({ dependencies }) => dependencies)
        .filter(({ couldNotResolve }) => couldNotResolve).length,
    },
    members: Object.fromEntries(
      Object.entries(members).map(([file, content]) => [file, digest(content)]),
    ),
    assurance: "Static graph observation only; not tests or a HISEW receipt.",
  };
  writeFileSync(path.join(output, "manifest.json"), json(manifest), {
    flag: "wx",
  });
  return manifest;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const args = process.argv.slice(2);
    if (
      args.length === 1 &&
      ["--check-runtime", "--check-architecture"].includes(args[0])
    ) {
      const result = await checkRuntime();
      const tooling =
        args[0] === "--check-architecture" ? await checkTooling() : null;
      process.stdout.write(
        json({
          runtime: result.inventory.runtime.length,
          errors: result.errors,
          lexical: result.lexical,
          toolingErrors: tooling?.errors ?? [],
          warnings: result.graph.summary.violations.filter(
            ({ rule }) => rule.severity === "warn",
          ),
        }),
      );
      if (
        result.errors.length ||
        result.lexical.length ||
        tooling?.errors.length
      ) {
        process.exitCode = 1;
      }
    } else if (
      (args.length === 2 || (args.length === 4 && args[2] === "--focus")) &&
      args[0] === "--output"
    ) {
      const manifest = await writeBundle(
        args[1],
        REPOSITORY_ROOT,
        args[3] ?? null,
      );
      process.stdout.write(
        json({
          output: args[1],
          complete: manifest.complete,
          counts: manifest.counts,
          members: manifest.members,
        }),
      );
    } else {
      throw new Error(
        "Usage: npm run graph:dependencies -- --output <new-absolute-external-directory> [--focus <literal-module>] | npm run verify:architecture",
      );
    }
  } catch (error) {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  }
}
