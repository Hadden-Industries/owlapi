import { posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import { isMap, isSeq, LineCounter, parseDocument } from "yaml";

// Use a virtual filesystem so the same source yields the same paths on every host.
const CHECKOUT = "/checkout";
const ARTIFACTS = "/artifacts";
const ARGUMENTS = "/argv";
const localModule = (source, specifier) =>
  posix.normalize(posix.join(posix.dirname(source), specifier));

const filesystemAccess = new Map([
  ...["readFile", "readFileSync", "createReadStream"].map((name) => [
    name,
    ["reads-file"],
  ]),
  ...[
    "writeFile",
    "writeFileSync",
    "appendFile",
    "appendFileSync",
    "createWriteStream",
  ].map((name) => [name, ["writes-file"]]),
  ...["copyFile", "copyFileSync", "link", "linkSync"].map((name) => [
    name,
    ["reads-file", "writes-file"],
  ]),
]);

const memberName = (node) =>
  node.computed ? node.property.value : node.property.name;
const propertyValue = (object, name) =>
  object?.type === "ObjectExpression"
    ? object.properties.find(
        (property) =>
          property.type === "Property" &&
          (property.key.value === name ||
            (!property.computed && property.key.name === name)),
      )?.value
    : undefined;

function parseAccesses(source, text, linter) {
  if (text === null) throw new Error(`Missing graph source: ${source}`);
  const moduleURL = new URL(
    source.split("/").map(encodeURIComponent).join("/"),
    "file:///checkout/",
  );
  const messages = linter.verify(
    text,
    [
      {
        languageOptions: {
          sourceType: source.endsWith(".cjs") ? "commonjs" : "module",
        },
      },
    ],
    { filename: source },
  );
  const code = linter.getSourceCode();
  if (!code || messages.some(({ fatal }) => fatal)) {
    return {
      accesses: [],
      launches: [],
      diagnostics: [
        { file: source, reason: "JavaScript parse failed", messages },
      ],
    };
  }

  const bindings = new Map();
  for (const scope of code.scopeManager.scopes) {
    for (const { identifier, resolved } of scope.references) {
      if (resolved) bindings.set(identifier, resolved);
    }
  }

  const definition = (identifier) => {
    const definitions = bindings.get(identifier)?.defs;
    return definitions?.length === 1 ? definitions[0] : undefined;
  };
  const global = (node, name) =>
    node?.type === "Identifier" && node.name === name && !definition(node);
  const metaURL = (node) =>
    node.type === "MemberExpression" &&
    memberName(node) === "url" &&
    node.object.type === "MetaProperty" &&
    node.object.meta.name === "import" &&
    node.object.property.name === "meta";
  const processArgv = (node) =>
    node?.type === "MemberExpression" &&
    memberName(node) === "argv" &&
    global(node.object, "process");

  // Only the meaning of an imported function, never its local name, identifies an operation.
  function imported(node) {
    if (node?.type === "MemberExpression") {
      const owner = imported(node.object);
      if (owner?.name === "*") {
        return { module: owner.module, name: memberName(node) };
      }
      if (owner?.module === "fs" && owner.name === "promises") {
        return { module: "fs/promises", name: memberName(node) };
      }
    }
    if (node?.type !== "Identifier") return undefined;
    const entry = definition(node);
    if (entry?.type === "ImportBinding") {
      const specifier = entry.parent.source.value;
      return {
        module: specifier.startsWith(".")
          ? localModule(source, specifier)
          : specifier.replace(/^node:/u, ""),
        name:
          entry.node.type === "ImportSpecifier"
            ? (entry.node.imported.name ?? entry.node.imported.value)
            : "*",
      };
    }
    const initializer = entry?.node.init;
    if (
      entry?.parent?.kind === "const" &&
      initializer?.type === "CallExpression" &&
      global(initializer.callee, "require") &&
      typeof initializer.arguments[0]?.value === "string"
    ) {
      const specifier = initializer.arguments[0].value;
      const destructured = entry.node.id.properties?.find(
        (property) => property.value === entry.name,
      );
      return {
        module: specifier.startsWith(".")
          ? localModule(source, specifier)
          : specifier.replace(/^node:/u, ""),
        name: destructured
          ? (destructured.key.name ?? destructured.key.value)
          : "*",
      };
    }
  }

  const asPath = (value) => {
    if (value instanceof URL && value.protocol === "file:") {
      try {
        return fileURLToPath(value, { windows: false });
      } catch {
        return undefined;
      }
    }
    return typeof value === "string" ? value : undefined;
  };
  const artifactBase = (node) => {
    if (node?.type === "Identifier") {
      const binding = bindings.get(node)?.identifiers[0];
      if (binding) {
        return `${ARTIFACTS}/${source}#${binding.name}@${binding.loc.start.line}:${binding.loc.start.column + 1}`;
      }
    }
    if (
      node?.type === "MemberExpression" &&
      typeof memberName(node) === "string"
    ) {
      const base = artifactBase(node.object);
      const member = memberName(node);
      if (base && /^[\w$]+$/u.test(member)) return `${base}.${member}`;
    }
  };
  const joinPath = (paths, base) => {
    const [first, ...tail] = paths.map(asPath);
    if (
      !tail.every((item) => typeof item === "string" && !win32.isAbsolute(item))
    ) {
      return undefined;
    }
    const directory = first ?? artifactBase(base);
    return directory && posix.join(directory, ...tail);
  };

  function evaluate(node, locals = new Map(), seen = new Set()) {
    if (!node || seen.has(node) || seen.size >= 48) return undefined;
    seen.add(node);
    const get = (child) => evaluate(child, locals, seen);
    try {
      switch (node.type) {
        case "Literal":
          return node.value;
        case "Identifier": {
          const entry = definition(node);
          if (locals.has(entry?.name)) return locals.get(entry.name);
          if (global(node, "__dirname") && source.endsWith(".cjs")) {
            return posix.dirname(decodeURIComponent(moduleURL.pathname));
          }
          if (entry?.parent?.kind !== "const") return undefined;
          const { id, init } = entry.node;
          if (id.type === "Identifier") return get(init);
          const slice = init?.callee;
          if (
            id.type === "ArrayPattern" &&
            slice?.type === "MemberExpression" &&
            memberName(slice) === "slice" &&
            processArgv(slice.object)
          ) {
            const start = get(init.arguments[0]);
            if (Number.isSafeInteger(start) && start >= 0) {
              return `${ARGUMENTS}/${start + id.elements.indexOf(entry.name)}`;
            }
          }
          return undefined;
        }
        case "TemplateLiteral": {
          const values = node.expressions.map(get);
          if (
            !values.every((value) =>
              ["string", "number"].includes(typeof value),
            )
          ) {
            return undefined;
          }
          return node.quasis
            .map(({ value }, index) => value.cooked + (values[index] ?? ""))
            .join("");
        }
        case "BinaryExpression": {
          const left = get(node.left);
          const right = get(node.right);
          if (
            node.operator === "+" &&
            typeof left === "string" &&
            typeof right === "string"
          ) {
            return left + right;
          }
          return undefined;
        }
        case "ArrayExpression": {
          const items = [];
          for (const element of node.elements) {
            if (element?.type !== "SpreadElement") {
              items.push(get(element));
              continue;
            }
            const spread = get(element.argument);
            if (!Array.isArray(spread)) return undefined;
            items.push(...spread);
          }
          return items;
        }
        case "MemberExpression":
          if (metaURL(node)) return moduleURL;
          if (
            processArgv(node.object) &&
            Number.isSafeInteger(memberName(node))
          ) {
            return `${ARGUMENTS}/${memberName(node)}`;
          }
          return undefined;
        case "NewExpression": {
          if (!global(node.callee, "URL")) return undefined;
          const [name, base] = node.arguments.map(get);
          if (
            typeof name === "string" &&
            base instanceof URL &&
            URL.canParse(name, base)
          ) {
            return new URL(name, base);
          }
          return undefined;
        }
        case "CallExpression": {
          const identifier = imported(node.callee);
          if (
            identifier?.module === "url" &&
            identifier.name === "fileURLToPath"
          ) {
            return asPath(get(node.arguments[0]));
          }
          if (identifier?.module === "path") {
            const args = node.arguments.map(get);
            const first = asPath(args[0]);
            switch (identifier.name) {
              case "join":
                return joinPath(args, node.arguments[0]);
              case "resolve":
                return args.every((argument) => typeof argument === "string")
                  ? posix.resolve(CHECKOUT, ...args)
                  : undefined;
              case "dirname":
                return first === undefined ? undefined : posix.dirname(first);
              case "basename":
                return first === undefined
                  ? undefined
                  : posix.basename(first, args[1]);
            }
          }
          if (
            node.callee.type === "MemberExpression" &&
            memberName(node.callee) === "map"
          ) {
            const input = get(node.callee.object);
            return Array.isArray(input)
              ? input.map((value) =>
                  evaluateArrow(node.arguments[0], [value], locals, seen),
                )
              : undefined;
          }
          return evaluateArrow(
            node.callee,
            node.arguments.map(get),
            locals,
            seen,
          );
        }
        default:
          return undefined;
      }
    } finally {
      seen.delete(node);
    }
  }

  function evaluateArrow(node, values, locals, seen) {
    const entry = node?.type === "Identifier" ? definition(node) : undefined;
    const arrow = entry?.parent?.kind === "const" ? entry.node.init : node;
    if (
      arrow?.type !== "ArrowFunctionExpression" ||
      arrow.body.type === "BlockStatement" ||
      !arrow.params.every((parameter) => parameter.type === "Identifier")
    ) {
      return undefined;
    }
    const parameters = new Map(locals);
    arrow.params.forEach((parameter, index) =>
      parameters.set(parameter, values[index]),
    );
    return evaluate(arrow.body, parameters, seen);
  }

  const accesses = [];
  const launches = [];
  const diagnostics = [];
  const record = (kind, value, node) => {
    const path = asPath(value);
    const evidence = { file: source, line: node.loc.start.line };
    if (path !== undefined) accesses.push({ kind, path, evidence });
    else if (typeof value !== "number") {
      diagnostics.push({
        ...evidence,
        kind,
        reason: "path depends on runtime values",
      });
    }
  };
  const operation = (node) => {
    const { module, name } = imported(node.callee) ?? {};
    if (module === "fs" || module === "fs/promises") {
      filesystemAccess
        .get(name)
        ?.forEach((kind, index) =>
          record(kind, evaluate(node.arguments[index]), node),
        );
    }
    // Shared I/O interfaces own their argument contracts. File names still come from callers.
    if (module === "util/owlapi-reference/comparison-evidence.mjs") {
      if (
        name === "publishComparisonFile" ||
        name === "publishComparisonJson"
      ) {
        const paths = node.arguments
          .slice(0, 2)
          .map((argument) => evaluate(argument));
        if (paths.length === 2)
          record("writes-file", joinPath(paths, node.arguments[0]), node);
      } else if (
        name === "readCompletedComparisonFile" ||
        name === "readNativeComparisonResult"
      ) {
        record(
          "reads-file",
          evaluate(propertyValue(node.arguments[0], "resultPath")),
          node,
        );
      }
    }
    if (
      module === "scripts/reference-import-map.mjs" &&
      (name === "readJson" || name === "writeJson")
    ) {
      record(
        name === "readJson" ? "reads-file" : "writes-file",
        evaluate(node.arguments[0]),
        node,
      );
    }
    if (
      module === "scripts/browser-consumer-preparation.mjs" &&
      name === "prepareBrowserConsumers"
    ) {
      // Preparation always reads this path. Refresh mode atomically replaces it.
      const reviewedMap = evaluate(
        propertyValue(node.arguments[0], "reviewedMapPath"),
      );
      record("reads-file", reviewedMap, node);
      record("writes-file", reviewedMap, node);
    }
    if (
      module === "util/owlapi-reference/run-import-closure-contract.mjs" &&
      name === "compileOntologyReferenceOracles"
    ) {
      const [configuration] = node.arguments;
      record(
        "compiles-file",
        evaluate(propertyValue(configuration, "launcherSource")),
        node,
      );
      const sources = evaluate(propertyValue(configuration, "oracleSources"));
      if (Array.isArray(sources)) {
        for (const file of sources) record("compiles-file", file, node);
      } else {
        record("compiles-file", undefined, node);
      }
    }
    if (
      (module === "child_process" &&
        /^execFile(?:Sync)?$|^spawn(?:Sync)?$/u.test(name)) ||
      (module === "util/owlapi-reference/comparison-oracle.mjs" &&
        name === "executeComparisonProcess")
    ) {
      const command = node.arguments[0];
      if (nodeProcess(command)) {
        const args = evaluate(node.arguments[1]);
        if (Array.isArray(args) && typeof args[0] === "string") {
          launches.push({
            script: args[0],
            args: args.slice(1),
            evidence: { file: source, line: node.loc.start.line },
          });
        } else {
          diagnostics.push({
            file: source,
            line: node.loc.start.line,
            kind: "launches-worker",
            reason: "command arguments depend on runtime values",
          });
        }
      }
    }
  };
  function nodeProcess(node, seen = new Set()) {
    if (node?.type === "MemberExpression" && global(node.object, "process")) {
      return memberName(node) === "execPath";
    }
    const entry = node?.type === "Identifier" ? definition(node) : undefined;
    if (entry?.parent?.kind !== "const" || seen.has(entry)) return false;
    seen.add(entry);
    return nodeProcess(entry.node.init, seen);
  }

  function visit(node) {
    if (node.type === "CallExpression") operation(node);
    for (const key of code.visitorKeys[node.type] ?? []) {
      const children = node[key];
      if (Array.isArray(children))
        children.forEach((child) => {
          if (child) visit(child);
        });
      else if (children) visit(children);
    }
  }
  visit(code.ast);
  return { accesses, launches, diagnostics };
}

function targetPath(value) {
  if (
    value === undefined ||
    (win32.isAbsolute(value) && !posix.isAbsolute(value)) ||
    /^[a-z][\w+.-]*:/iu.test(value) ||
    value.includes("\\")
  )
    return undefined;
  const resolved = posix.resolve(CHECKOUT, value);
  if (resolved.startsWith(CHECKOUT + "/"))
    return resolved.slice(CHECKOUT.length + 1);
  if (resolved.startsWith(ARTIFACTS + "/")) {
    const name = resolved.slice(ARTIFACTS.length + 1);
    // A directory anchor alone is not a file reference.
    if (name.includes("#") && name.slice(name.indexOf("#")).includes("/")) {
      return "artifact:" + name;
    }
  }
  return undefined;
}

function workflowAccesses(source, text) {
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter });
  const accesses = [];
  const launches = [];
  const diagnostics = document.errors.map((error) => ({
    file: source,
    reason: "workflow YAML parse failed",
    message: error.message,
  }));
  const jobs = document.get("jobs", true);
  if (diagnostics.length || !isMap(jobs))
    return { accesses, launches, diagnostics };
  for (const { key, value: job } of jobs.items) {
    if (!isMap(job) || typeof key?.value !== "string") continue;
    const steps = job.get("steps", true);
    if (!isSeq(steps)) continue;
    const defaultDirectory =
      job.getIn(["defaults", "run", "working-directory"]) ??
      document.getIn(["defaults", "run", "working-directory"]);
    const commands = [];
    for (const step of steps.items) {
      if (
        !isMap(step) ||
        (step.get("working-directory") ?? defaultDirectory ?? ".") !== "."
      )
        continue;
      const run = step.get("run", true);
      if (typeof run?.value !== "string") continue;
      const line = lineCounter.linePos(run.range[0]).line;
      // The observed subset is literal, one-line commands in checkout-root steps.
      run.value.split("\n").forEach((command, index) => {
        const trimmed = command.trim();
        if (/^[\w./:= -]+$/u.test(trimmed)) {
          const block =
            run.type === "BLOCK_LITERAL" || run.type === "BLOCK_FOLDED";
          commands.push({
            tokens: trimmed.split(/ +/u),
            evidence: { file: source, line: line + index + Number(block) },
          });
        }
      });
    }
    const outputs = new Map();
    for (const { tokens, evidence } of commands) {
      if (tokens[0] === "npm" && tokens[1] === "test") {
        const option = tokens.findIndex(
          (token) =>
            token === "--outputFile" || token.startsWith("--outputFile="),
        );
        if (option <= tokens.indexOf("--") || !tokens.includes("--")) continue;
        const name = tokens[option].split("=")[1] ?? tokens[option + 1];
        const path = targetPath(name);
        if (path && !path.startsWith("artifact:")) {
          const artifact = `${ARTIFACTS}/${source}#${key.value}/${path}`;
          outputs.set(path, artifact);
          accesses.push({ kind: "writes-file", path: artifact, evidence });
        }
      } else if (tokens[0] === "node" && /\.(?:js|mjs|cjs)$/u.test(tokens[1])) {
        const args = tokens
          .slice(2)
          .map((argument) => outputs.get(targetPath(argument)) ?? argument);
        launches.push({ script: tokens[1], args, evidence, workflow: true });
      }
    }
  }
  return { accesses, launches, diagnostics };
}

/**
 * Observe statically traceable file operations in authored source. An argument
 * handed to a worker has the caller's path identity. Discovery executes no source.
 */
export function observeFileDependencies(sources, readSource, knownFiles) {
  const linter = new Linter();
  const parsed = new Map(
    sources.map((source) => [
      source,
      parseAccesses(source, readSource(source), linter),
    ]),
  );
  const workflows = [...knownFiles].filter((file) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(file),
  );
  for (const file of workflows) {
    const text = readSource(file);
    if (text !== null) parsed.set(file, workflowAccesses(file, text));
  }
  const relationships = [];
  const diagnostics = [...parsed.values()].flatMap(
    (entry) => entry.diagnostics,
  );
  const claimedArguments = new Set();
  const addAccess = (access, value, invocation) => {
    const { kind, evidence } = access;
    const target = targetPath(value);
    if (!target) {
      diagnostics.push({
        ...evidence,
        kind,
        reason:
          "path is outside the observed domain or depends on runtime values",
      });
      return;
    }
    const written = kind === "writes-file";
    relationships.push({
      from: written ? target : evidence.file,
      to: written ? evidence.file : target,
      kind: written ? "generated-by" : kind,
      evidence: invocation ? [evidence, invocation] : [evidence],
    });
  };
  for (const [source, { accesses, launches }] of parsed) {
    for (const access of accesses) {
      if (!access.path.startsWith(ARGUMENTS + "/"))
        addAccess(access, access.path);
    }
    for (const launch of launches) {
      const worker = targetPath(launch.script);
      if (!parsed.has(worker)) continue;
      relationships.push({
        from: source,
        to: worker,
        kind: "launches-worker",
        evidence: [launch.evidence],
      });
      const observedArguments = new Set();
      for (const access of parsed.get(worker).accesses) {
        if (!access.path.startsWith(ARGUMENTS + "/")) continue;
        const index = Number(access.path.slice(ARGUMENTS.length + 1)) - 2;
        if (!Number.isSafeInteger(index) || index < 0) continue;
        claimedArguments.add(access);
        observedArguments.add(index);
        addAccess(
          access,
          typeof launch.args[index] === "string"
            ? launch.args[index]
            : undefined,
          launch.evidence,
        );
      }
      if (launch.workflow) {
        launch.args.forEach((path, index) => {
          if (
            !observedArguments.has(index) &&
            path.startsWith(ARTIFACTS + "/")
          ) {
            relationships.push({
              from: worker,
              to: targetPath(path),
              kind: "receives-file",
              evidence: [launch.evidence],
            });
          }
        });
      }
    }
  }
  for (const { accesses } of parsed.values()) {
    for (const access of accesses) {
      if (
        access.path.startsWith(ARGUMENTS + "/") &&
        !claimedArguments.has(access)
      ) {
        diagnostics.push({
          ...access.evidence,
          kind: access.kind,
          reason: "worker argument has no resolved launch",
        });
      }
    }
  }
  const generated = new Set(
    relationships
      .filter(({ kind }) => kind === "generated-by")
      .map(({ from }) => from),
  );
  const inputs = new Set(workflows);
  return {
    relationships: relationships.filter(({ kind, to, evidence }) => {
      if (
        kind === "generated-by" ||
        kind === "launches-worker" ||
        to.startsWith("artifact:")
      )
        return true;
      if (knownFiles.has(to)) {
        inputs.add(to);
        return true;
      }
      if (generated.has(to)) return true;
      diagnostics.push({
        ...evidence[0],
        kind,
        path: to,
        reason:
          "path is outside the Git inventory and has no observed producer",
      });
      return false;
    }),
    inputs: [...inputs].sort(),
    diagnostics,
  };
}
