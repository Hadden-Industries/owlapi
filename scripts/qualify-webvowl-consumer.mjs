import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditWebVowlJavaParityConsumers,
  assertReviewedWebVowlAudit,
  assertReviewedWebVowlPackageDependency,
  createCandidateArchitectureTest,
  webVowlCutoverDigest,
} from "../test/consumers/webvowl/cutover.mjs";
import { applyReviewedWebVowlMigration } from "../test/consumers/webvowl/migration.mjs";
import { isStrictDescendantPath, sha256File } from "./release-artifacts.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error(
    "Run WebVOWL qualification through its named npm script so the accepted local npm CLI is authoritative.",
  );
}

const argument = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return process.argv[index + 1];
};

const optionalArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const candidateDirectory = resolve(argument("--candidate-dir"));
const sourceRepository = resolve(argument("--webvowl-repository"));
const outputDirectory = resolve(argument("--output"));
const expectedWebVowlCommit = optionalArgument("--expected-webvowl-commit");
const expectedOntologyCommit = optionalArgument("--expected-ontology-commit");
const developmentAuditPath = optionalArgument("--development-audit");
const reviewedMigrationPatch = optionalArgument("--reviewed-migration-patch");
if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
  throw new Error(
    `WebVOWL qualification output already exists at ${outputDirectory}; preserve or remove it explicitly before rerunning.`,
  );
}
mkdirSync(outputDirectory, { recursive: true });

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
const normalizePath = (value) => value.replaceAll("\\", "/");
const sha256Text = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const writeJson = (fileName, value) =>
  writeFileSync(join(outputDirectory, fileName), stableJson(value), "utf8");

const run = (executable, arguments_, options = {}) => {
  const result = spawnSync(executable, arguments_, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (options.logFile) {
    writeFileSync(
      join(outputDirectory, options.logFile),
      `${result.stdout ?? ""}${result.stderr ?? ""}`,
      "utf8",
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${options.label ?? executable} failed with status ${result.status}:\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
};

const runGit = (arguments_, options = {}) =>
  run("git", arguments_, {
    ...options,
    label: options.label ?? `git ${arguments_.join(" ")}`,
  });

const runNpm = (arguments_, options = {}) =>
  run(process.execPath, [npmCli, ...arguments_], {
    ...options,
    label: options.label ?? `npm ${arguments_.join(" ")}`,
  });

// `npm run` exports the producer repository's npm configuration into this
// process. A disposable consumer must instead exercise its own checked-in npm
// policy; otherwise owlapi's strict lifecycle allowlist can make WebVOWL pass or
// fail for a configuration WebVOWL does not own.
const webVowlNpmEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => {
    const normalized = name.toLowerCase();
    return (
      !normalized.startsWith("npm_config_") &&
      !normalized.startsWith("npm_package_")
    );
  }),
);

const runWebVowlNpm = (arguments_, options = {}) =>
  run(process.execPath, [npmCli, ...arguments_], {
    ...options,
    env: webVowlNpmEnvironment,
    label: options.label ?? `WebVOWL npm ${arguments_.join(" ")}`,
  });

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));
const parityDecisions = readJson(
  join(REPOSITORY_ROOT, "docs/compatibility/java-api-parity-decisions.json"),
);
const provisional = developmentAuditPath !== undefined;
const reviewedAudit = provisional
  ? readJson(resolve(developmentAuditPath))
  : parityDecisions.consumerMigrations.webvowl;
if (provisional) {
  if (
    reviewedAudit.qualification !== "PRE_INTEGRATION" ||
    !expectedWebVowlCommit ||
    !expectedOntologyCommit
  ) {
    throw new Error(
      "Development qualification requires a provisional reviewed audit and both exact repository commits.",
    );
  }
} else if (
  parityDecisions.qualification !== "RECONCILED" ||
  parityDecisions.phase21.status !== "COMPLETE" ||
  !reviewedAudit
) {
  throw new Error(
    "Accepted qualification requires completed Phase 21 release and consumer evidence; use explicit development inputs for a provisional experiment.",
  );
}

const candidateManifest = readJson(
  join(candidateDirectory, "candidate-manifest.json"),
);
const candidateTarballPath = join(
  candidateDirectory,
  candidateManifest.tarball.fileName,
);
if (!existsSync(candidateTarballPath)) {
  throw new Error(`Retained tarball is absent at ${candidateTarballPath}.`);
}
const candidateTarballSha256 = sha256File(candidateTarballPath);
if (candidateTarballSha256 !== candidateManifest.tarball.sha256) {
  throw new Error(
    "Retained tarball digest disagrees with candidate-manifest.json.",
  );
}

const sourceStatus = runGit(["status", "--porcelain=v1"], {
  cwd: sourceRepository,
  label: "WebVOWL source cleanliness check",
});
if (sourceStatus !== "" && !provisional) {
  throw new Error(
    `The maintained WebVOWL source checkout is not clean:\n${sourceStatus}`,
  );
}
const sourceCommit = runGit(["rev-parse", "HEAD"], {
  cwd: sourceRepository,
}).trim();
const sourceBranch = runGit(["branch", "--show-current"], {
  cwd: sourceRepository,
}).trim();
if (expectedWebVowlCommit && sourceCommit !== expectedWebVowlCommit) {
  throw new Error(
    `Expected WebVOWL commit ${expectedWebVowlCommit}, found ${sourceCommit}.`,
  );
}
if (!expectedWebVowlCommit && sourceBranch !== "main") {
  throw new Error(
    `Expected the maintained WebVOWL main branch, found ${sourceBranch}.`,
  );
}
const ontologyRepository = resolve(
  sourceRepository,
  "..",
  "universal-ontology",
);
if (!existsSync(join(ontologyRepository, "dist"))) {
  throw new Error(
    `The WebVOWL corpus sibling is absent at ${ontologyRepository}; the baseline and candidate must use the same explicit corpus.`,
  );
}
const ontologyCommit = runGit(["rev-parse", "HEAD"], {
  cwd: ontologyRepository,
  label: "universal-ontology corpus commit",
}).trim();
if (expectedOntologyCommit && ontologyCommit !== expectedOntologyCommit) {
  throw new Error(
    `Expected universal-ontology commit ${expectedOntologyCommit}, found ${ontologyCommit}.`,
  );
}
const ontologyStatus = runGit(["status", "--porcelain=v1"], {
  cwd: ontologyRepository,
  label: "universal-ontology corpus cleanliness check",
});

const temporaryRoot = mkdtempSync(join(tmpdir(), "owlapi-webvowl-consumer-"));
const resolvedTemporaryRoot = resolve(temporaryRoot);
if (!isStrictDescendantPath(resolve(tmpdir()), resolvedTemporaryRoot)) {
  throw new Error(
    `Refusing unexpected WebVOWL qualification path ${temporaryRoot}.`,
  );
}
const checkout = join(temporaryRoot, "webvowl");
const baselineCache = join(temporaryRoot, "baseline-npm-cache");
const candidateMutationCache = join(
  temporaryRoot,
  "candidate-mutation-npm-cache",
);
const candidateCleanCache = join(temporaryRoot, "candidate-clean-npm-cache");
const repositoryMirror = join(temporaryRoot, "webvowl.git");

const trackedFiles = (directory) =>
  runGit(["ls-files", "-z"], { cwd: directory })
    .split("\0")
    .filter(Boolean)
    .map(normalizePath)
    .sort(compareCodeUnits);

const trackedFileMap = (directory) =>
  new Map(
    trackedFiles(directory).map((filePath) => {
      const absolute = join(directory, filePath);
      const bytes = readFileSync(absolute);
      let source;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (source.includes("\0")) source = bytes;
      } catch {
        source = bytes;
      }
      return [filePath, source];
    }),
  );

const assertNoAncestorNodeModules = (directory) => {
  const ancestors = [];
  for (let current = dirname(directory); ; current = dirname(current)) {
    const candidate = join(current, "node_modules");
    if (existsSync(candidate)) {
      ancestors.push(candidate);
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
  }
  if (ancestors.length > 0) {
    throw new Error(
      `The isolated WebVOWL checkout has ancestor node_modules trees: ${ancestors.join(", ")}`,
    );
  }
  return ancestors;
};

const directoryFileManifest = (directory, relativeTo = directory) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolute = join(entry.parentPath, entry.name);
      return {
        path: normalizePath(relative(relativeTo, absolute)),
        bytes: lstatSync(absolute).size,
        sha256: sha256File(absolute),
      };
    })
    .sort((left, right) => compareCodeUnits(left.path, right.path));

try {
  // WebVOWL deliberately resolves its real corpus as a workspace sibling. The
  // temporary link preserves that production-test convention while keeping the
  // package-manager checkout outside every ancestor node_modules tree.
  symlinkSync(
    ontologyRepository,
    join(temporaryRoot, "universal-ontology"),
    process.platform === "win32" ? "junction" : "dir",
  );
  // A normal clone does not carry the source checkout's remote-tracking refs.
  // Those refs retain the original pre-reconstruction commits proved by
  // WebVOWL's governance suite, so mirror the complete local ref namespace and
  // attach a disposable worktree at the pinned source commit.
  runGit(
    [
      "clone",
      "--mirror",
      "--no-local",
      "--no-hardlinks",
      sourceRepository,
      repositoryMirror,
    ],
    {
      label: "isolated WebVOWL mirror clone",
      logFile: "clone.log",
    },
  );
  runGit(
    [
      `--git-dir=${repositoryMirror}`,
      "worktree",
      "add",
      "--detach",
      checkout,
      reviewedAudit.baselineCommit,
    ],
    {
      label: "WebVOWL source-commit worktree",
    },
  );
  const clonedCommit = runGit(["rev-parse", "HEAD"], {
    cwd: checkout,
  }).trim();
  if (clonedCommit !== reviewedAudit.baselineCommit) {
    throw new Error(
      `WebVOWL clone resolved ${clonedCommit}, expected ${reviewedAudit.baselineCommit}.`,
    );
  }
  const verifiedMigration = applyReviewedWebVowlMigration({
    reviewedAudit,
    sourceCommit,
    patchPath: reviewedMigrationPatch
      ? resolve(reviewedMigrationPatch)
      : undefined,
    runGit: (args) => runGit(args, { cwd: checkout }),
  });
  if (verifiedMigration) {
    copyFileSync(
      resolve(reviewedMigrationPatch),
      join(outputDirectory, "reviewed-consumer-migration.patch"),
    );
  }

  const ancestorNodeModules = assertNoAncestorNodeModules(checkout);
  const ontologyCorpusFiles = directoryFileManifest(
    join(ontologyRepository, "dist"),
    ontologyRepository,
  );
  const ontologyCorpusContent = {
    root: "dist",
    fileCount: ontologyCorpusFiles.length,
    files: ontologyCorpusFiles,
  };
  const ontologyCorpusContentSha256 = sha256Text(
    stableJson(ontologyCorpusContent),
  );
  const ontologyCorpusManifest = {
    schemaVersion: 1,
    repository: normalizePath(ontologyRepository),
    commit: ontologyCommit,
    worktreeStatus: ontologyStatus.split(/\r?\n/u).filter(Boolean),
    contentSha256: ontologyCorpusContentSha256,
    ...ontologyCorpusContent,
  };
  writeJson("ontology-corpus-manifest.json", ontologyCorpusManifest);
  writeJson("source.json", {
    repository: normalizePath(sourceRepository),
    branch: sourceBranch,
    commit: sourceCommit,
    auditedBaselineCommit: reviewedAudit.baselineCommit,
    verifiedMigration,
    qualification: provisional ? "PRE_INTEGRATION" : "RECONCILED",
    ignoredMaintainedWorktreeChanges: sourceStatus
      .split(/\r?\n/u)
      .filter(Boolean),
    isolatedCheckoutOutsideRepository: !isStrictDescendantPath(
      sourceRepository,
      checkout,
    ),
    ancestorNodeModules,
    ontologyCorpus: {
      repository: normalizePath(ontologyRepository),
      commit: ontologyCommit,
      worktreeStatusRecorded: true,
      contentSha256: ontologyCorpusContentSha256,
      workspaceSiblingLink: "universal-ontology",
    },
  });

  const beforeFiles = trackedFileMap(checkout);
  const baselineManifest = readJson(join(checkout, "package.json"));
  const retainedGitEquivalence = readJson(
    join(REPOSITORY_ROOT, "docs/release/pre-registry-git-equivalence.json"),
  );
  assertReviewedWebVowlPackageDependency({
    manifest: baselineManifest,
    reviewedPackageSpecifier: reviewedAudit.packageSpecifier,
    retainedGitPackageSpecifier:
      retainedGitEquivalence.source.git.packageSpecifier,
  });
  const consumerAudit = auditWebVowlJavaParityConsumers(beforeFiles, {
    baselineCommit: reviewedAudit.baselineCommit,
    sourceReaderAllowlist: reviewedAudit.sourceReaderAllowlist,
    negativeMentionAllowlist: reviewedAudit.negativeMentionAllowlist ?? [],
    migration: verifiedMigration,
  });
  writeJson("consumer-audit.json", consumerAudit);
  assertReviewedWebVowlAudit(consumerAudit, reviewedAudit);

  runWebVowlNpm(["ci", "--cache", baselineCache], {
    cwd: checkout,
    label: "WebVOWL baseline npm ci",
    logFile: "baseline-npm-ci.log",
  });
  runWebVowlNpm(["test", "--", "--runInBand"], {
    cwd: checkout,
    label: "WebVOWL baseline Jest",
    logFile: "baseline-test.log",
  });
  runWebVowlNpm(["run", "build:dev"], {
    cwd: checkout,
    label: "WebVOWL baseline development build",
    logFile: "baseline-build-development.log",
  });
  runWebVowlNpm(["run", "build"], {
    cwd: checkout,
    label: "WebVOWL baseline production build",
    logFile: "baseline-build-production.log",
  });

  runWebVowlNpm(
    [
      "install",
      "--save-exact",
      candidateTarballPath,
      "--cache",
      candidateMutationCache,
    ],
    {
      cwd: checkout,
      label: "retained owlapi tarball exact install",
      logFile: "candidate-install.log",
    },
  );
  const mutatedManifest = readJson(join(checkout, "package.json"));
  const installedSpecifier = mutatedManifest.dependencies?.owlapi;
  if (
    typeof installedSpecifier !== "string" ||
    !installedSpecifier.startsWith("file:")
  ) {
    throw new Error(
      `Disposable WebVOWL did not record an exact retained-tarball specifier: ${installedSpecifier}`,
    );
  }
  const expectedManifest = structuredClone(baselineManifest);
  expectedManifest.dependencies.owlapi = installedSpecifier;
  if (stableJson(mutatedManifest) !== stableJson(expectedManifest)) {
    throw new Error(
      "Candidate injection changed the WebVOWL manifest beyond its owlapi dependency.",
    );
  }
  const qualificationSourceRoot = join(checkout, "src", "owlapiQualification");
  mkdirSync(qualificationSourceRoot);
  copyFileSync(
    join(REPOSITORY_ROOT, "test/import-closure/public-contract.js"),
    join(qualificationSourceRoot, "public-contract.js"),
  );
  const closureDocuments = Object.fromEntries(
    ["root", "left", "right", "leaf"].map((name) => [
      name,
      readFileSync(
        join(
          REPOSITORY_ROOT,
          "test/import-closure/fixtures/closure",
          name + ".ofn",
        ),
        "utf8",
      ),
    ]),
  );
  const closureDocumentsModule =
    "export default " + JSON.stringify(closureDocuments) + ";\n";
  writeFileSync(
    join(qualificationSourceRoot, "documents.js"),
    closureDocumentsModule,
    "utf8",
  );
  writeFileSync(
    join(qualificationSourceRoot, "audit.json"),
    stableJson(consumerAudit),
    "utf8",
  );
  const auditBinding = {
    baselineCommit: consumerAudit.baselineCommit,
    scanSha256: consumerAudit.scanSha256,
    disposition: consumerAudit.disposition,
  };

  writeFileSync(
    join(checkout, "src", "owlapiConsumerBoundary.architecture.test.js"),
    createCandidateArchitectureTest({
      packageSpecifier: installedSpecifier,
      packageVersion: candidateManifest.package.version,
      tarballSha256: candidateTarballSha256,
      publicExports: readJson(join(REPOSITORY_ROOT, "package.json")).exports,
      audit: auditBinding,
    }),
    "utf8",
  );

  runWebVowlNpm(
    [
      "exec",
      "--",
      "prettier",
      "--write",
      "src/owlapiConsumerBoundary.architecture.test.js",
      "src/owlapiQualification",
    ],
    {
      cwd: checkout,
      label: "format reviewed WebVOWL cutover",
      logFile: "candidate-format-cutover.log",
    },
  );
  const architectureTestPath =
    "src/owlapiConsumerBoundary.architecture.test.js";
  runGit(
    ["add", "--intent-to-add", architectureTestPath, "src/owlapiQualification"],
    {
      cwd: checkout,
      label: "include generated boundary test in source-change inventory",
    },
  );
  const expectedSourceChanges = [
    "src/owlapiQualification/public-contract.js",
    "src/owlapiQualification/documents.js",
    "src/owlapiQualification/audit.json",
    architectureTestPath,
  ].sort(compareCodeUnits);
  const actualSourceChanges = runGit(["diff", "--name-only", "--", "src"], {
    cwd: checkout,
    label: "formatted WebVOWL cutover path inventory",
  })
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(normalizePath)
    .filter((filePath) => !filePath.startsWith("src/owlapi-js/"))
    .sort(compareCodeUnits);
  if (stableJson(actualSourceChanges) !== stableJson(expectedSourceChanges)) {
    throw new Error(
      `WebVOWL formatting changed paths outside the reviewed cutover: expected=${JSON.stringify(expectedSourceChanges)} actual=${JSON.stringify(actualSourceChanges)}.`,
    );
  }
  const formattedCutoverFiles = expectedSourceChanges.map((filePath) => [
    filePath,
    readFileSync(join(checkout, filePath), "utf8"),
  ]);
  writeJson("source-cutover.json", {
    changedFiles: expectedSourceChanges,
    formatter:
      "WebVOWL's locked Prettier, scoped to injected qualification files",
    contentDigest: webVowlCutoverDigest(formattedCutoverFiles),
  });
  runWebVowlNpm(
    ["exec", "--", "eslint", architectureTestPath, "src/owlapiQualification"],
    {
      cwd: checkout,
      label: "WebVOWL native lint of injected qualification sources",
      logFile: "candidate-source-lint.log",
    },
  );

  const checkoutNodeModules = join(checkout, "node_modules");
  if (!isStrictDescendantPath(checkout, checkoutNodeModules)) {
    throw new Error("Refusing unexpected WebVOWL node_modules cleanup target.");
  }
  rmSync(checkoutNodeModules, { recursive: true, force: true });
  assertNoAncestorNodeModules(checkout);
  runWebVowlNpm(["ci", "--cache", candidateCleanCache], {
    cwd: checkout,
    label: "isolated WebVOWL candidate npm ci",
    logFile: "candidate-npm-ci.log",
  });

  const npmTree = JSON.parse(
    runWebVowlNpm(["ls", "--all", "--json"], {
      cwd: checkout,
      label: "isolated WebVOWL npm graph",
    }),
  );
  writeJson("candidate-npm-ls.json", npmTree);
  const installedPackageManifest = readJson(
    join(checkout, "node_modules", "owlapi", "package.json"),
  );
  if (
    installedPackageManifest.name !== "owlapi" ||
    installedPackageManifest.version !== candidateManifest.package.version
  ) {
    throw new Error(
      "The installed WebVOWL candidate has the wrong package identity.",
    );
  }
  writeJson("installed-owlapi-package.json", installedPackageManifest);
  copyFileSync(
    join(checkout, "package.json"),
    join(outputDirectory, "webvowl-package.json"),
  );
  copyFileSync(
    join(checkout, "package-lock.json"),
    join(outputDirectory, "webvowl-package-lock.json"),
  );

  runWebVowlNpm(["test", "--", "--runInBand"], {
    cwd: checkout,
    label: "isolated WebVOWL candidate Jest",
    logFile: "candidate-test.log",
  });
  runWebVowlNpm(
    [
      "test",
      "--",
      "src/owl2vowl/test/productionCorpus.test.js",
      "src/owl2vowl/test/vowlBuilder.webvowl.test.js",
      "--runInBand",
    ],
    {
      cwd: checkout,
      label: "WebVOWL representative ontology corpus",
      logFile: "candidate-representative-corpus.log",
    },
  );
  runWebVowlNpm(["run", "build:dev"], {
    cwd: checkout,
    label: "isolated WebVOWL candidate development build",
    logFile: "candidate-build-development.log",
  });
  runWebVowlNpm(["run", "build"], {
    cwd: checkout,
    label: "isolated WebVOWL candidate production build",
    logFile: "candidate-build-production.log",
  });
  const browserFixtureRoot = join(checkout, ".owlapi-lifecycle-browser");
  mkdirSync(browserFixtureRoot);
  const browserFixtureFiles = new Map([
    [
      "index.html",
      `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>WebVOWL owlapi candidate</title></head>
  <body><output id="result" data-state="pending">pending</output><script type="module" src="./main.js"></script></body>
</html>
`,
    ],
    [
      "main.js",
      `import owl2vowl from "../src/owl2vowl/js/index.js";
import { exerciseImportClosureStorage } from "../src/owlapiQualification/public-contract.js";
import documents from "../src/owlapiQualification/documents.js";

const output = globalThis.document.querySelector("#result");
try {
  const result = await owl2vowl(\`<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#">
  <owl:Ontology rdf:about="https://example.test/webvowl-consumer"/>
  <owl:Class rdf:about="https://example.test/webvowl-consumer#CandidateClass">
    <rdfs:label xml:lang="en">Candidate class</rdfs:label>
  </owl:Class>
</rdf:RDF>\`, { fileName: "candidate.rdf" });
  const { summary: importClosure } = await exerciseImportClosureStorage(documents);
  output.textContent = JSON.stringify({ vowl: result, importClosure });
  output.dataset.state = "pass";
} catch (error) {
  output.textContent = error?.stack ?? String(error);
  output.dataset.state = "fail";
  throw error;
}
`,
    ],
    [
      "vite.config.mjs",
      `import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

// This fixture uses WebVOWL's independently locked Vite and its native
// CommonJS support, without borrowing the producer bundler configuration.
export default defineConfig({
  root,
  build: {
    emptyOutDir: true,
    outDir: resolve(root, "dist"),
  },
});
`,
    ],
  ]);
  for (const [fileName, source] of browserFixtureFiles) {
    writeFileSync(join(browserFixtureRoot, fileName), source, "utf8");
  }
  writeJson("browser-fixture.json", {
    files: [...browserFixtureFiles].map(([fileName, source]) => ({
      fileName,
      sha256: sha256Text(source),
    })),
    webVowlViteVersion: readJson(
      join(checkout, "node_modules", "vite", "package.json"),
    ).version,
  });
  runWebVowlNpm(
    [
      "exec",
      "--",
      "vite",
      "build",
      "--config",
      join(browserFixtureRoot, "vite.config.mjs"),
    ],
    {
      cwd: checkout,
      label: "WebVOWL Vite browser-consumer build",
      logFile: "candidate-browser-build.log",
    },
  );
  runNpm(
    [
      "run",
      "test:webvowl-browser",
      "--",
      "--deploy-root",
      join(browserFixtureRoot, "dist"),
      "--output",
      join(outputDirectory, "candidate-browser.json"),
    ],
    {
      cwd: REPOSITORY_ROOT,
      label: "WebVOWL production-bundle browser ingestion",
      logFile: "candidate-browser.log",
    },
  );

  const reviewPatch = runGit(
    [
      "diff",
      "--no-ext-diff",
      "HEAD",
      "--",
      "package.json",
      "package-lock.json",
      "src/owl2vowl",
      "src/owlapiQualification",
      "src/owlapiConsumerBoundary.architecture.test.js",
      ...(verifiedMigration?.changedPaths ?? []),
    ],
    { cwd: checkout, label: "reviewed WebVOWL candidate patch" },
  );
  writeFileSync(
    join(outputDirectory, "webvowl-cutover.patch"),
    reviewPatch,
    "utf8",
  );
  const checkoutStatus = runGit(["status", "--short"], { cwd: checkout });
  writeFileSync(
    join(outputDirectory, "webvowl-status.txt"),
    checkoutStatus,
    "utf8",
  );

  writeJson("qualification.json", {
    schemaVersion: 1,
    result: "PASS",
    source: {
      repository: normalizePath(sourceRepository),
      branch: sourceBranch,
      commit: sourceCommit,
      ontologyCorpusCommit: ontologyCommit,
      ontologyCorpusContentSha256,
    },
    candidate: {
      package: candidateManifest.package,
      tarballFileName: basename(candidateTarballPath),
      tarballSha256: candidateTarballSha256,
      sourceState: candidateManifest.sourceState,
    },
    qualification: provisional ? "PRE_INTEGRATION" : "RECONCILED",
    consumerAudit: auditBinding,
    verifiedMigration,
    dependencyHandoff: {
      onlyOwlapiCoordinateChanged: true,
      applicationDependenciesPreserved: true,
    },
    cleanInstall: {
      ancestorNodeModules: [],
      npmLs: "PASS",
      installedPackageIdentity: "PASS",
    },
    gates: {
      baselineNpmCi: "PASS",
      baselineJest: "PASS",
      baselineDevelopmentBuild: "PASS",
      baselineProductionBuild: "PASS",
      consumerBoundary: "PASS",
      candidateJest: "PASS",
      installedImportClosure: "PASS",
      phase21TargetErrorSemantics: "PASS",
      representativeCorpus: "PASS",
      candidateDevelopmentBuild: "PASS",
      candidateProductionBuild: "PASS",
      candidateWebVowlViteConsumerBuild: "PASS",
      candidateChromiumIntegration: "PASS",
    },
    maintainedWebVowlCheckoutModified: false,
  });

  process.stdout.write(`${outputDirectory}\n`);
} finally {
  // The only recursive cleanup target is the unique directory returned by
  // mkdtemp and validated above; all durable evidence lives under --output.
  rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
}
