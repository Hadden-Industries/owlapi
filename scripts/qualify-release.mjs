import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { verifyDownloadedCandidateBundle } from "./candidate-bundle.mjs";
import { inspectGzipTar, sha256Buffer } from "./release-artifacts.mjs";
import { classifyReleaseState } from "./release-state.mjs";
import {
  captureConsumerSources,
  assertReviewedConsumerSources,
} from "./consumer-source-snapshot.mjs";
import {
  assertNativeOwlContractReport,
  REVIEWED_CONSUMER_SOURCES,
} from "./owl-contract-evidence.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
import { NPM_REGISTRY as registry } from "./package-identity.mjs";
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
export const selectRecordedDefinitions = (record, retainedDefinitionsText) => {
  const candidates =
    retainedDefinitionsText === undefined
      ? ["producer-gates.json", "gates.json"].map((name) =>
          readFileSync(
            new URL(`../docs/release/${name}`, import.meta.url),
            "utf8",
          ),
        )
      : [retainedDefinitionsText];
  const matched = candidates.find(
    (text) =>
      sha256Buffer(Buffer.from(text)) ===
      record?.definitionDigests?.gateRegistrySha256,
  );
  if (matched === undefined)
    throw new Error(
      "The exact recorded gate definitions are unavailable; supply their retained --definitions snapshot.",
    );
  const definitions = JSON.parse(matched);
  const schemaName =
    definitions.schemaVersion === 2
      ? "producer-gates.schema.json"
      : "gates.schema.json";
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  if (definitions.schemaVersion === 2)
    ajv.addSchema(
      JSON.parse(
        readFileSync(
          new URL("../docs/release/gates.schema.json", import.meta.url),
          "utf8",
        ),
      ),
    );
  const validate = ajv.compile(
    JSON.parse(
      readFileSync(
        new URL(`../docs/release/${schemaName}`, import.meta.url),
        "utf8",
      ),
    ),
  );
  if (!validate(definitions))
    throw new Error("Recorded gate definitions violate their strict schema.");
  return definitions;
};

export const assertRecordedRequirement = (
  record,
  requirementId,
  retainedDefinitionsText,
) => {
  const gateDefinitions = selectRecordedDefinitions(
    record,
    retainedDefinitionsText,
  );
  const visiting = new Set();
  const assertRequirement = (id) => {
    if (visiting.has(id)) {
      throw new Error(`Release prerequisite cycle at ${id}.`);
    }
    visiting.add(id);
    const definition = gateDefinitions.requirements.find(
      (requirement) => requirement.requirementId === id,
    );
    if (!definition) {
      throw new Error(`Unknown release requirement ${id}.`);
    }
    const matches = (record?.requirements ?? []).filter(
      (requirement) => requirement.requirementId === id,
    );
    if (
      record?.accepted !== true ||
      matches.length !== 1 ||
      matches[0].requirementDigest !== definition.requirementDigest ||
      matches[0].finalResult !== "PASS"
    ) {
      throw new Error(`Release requirement ${id} is not PASS.`);
    }
    // A checkpoint cannot bypass its recorded prerequisite results.
    for (const predecessor of definition.prerequisiteRequirementIds) {
      assertRequirement(predecessor);
    }
    visiting.delete(id);
    return {
      requirementId: matches[0].requirementId,
      finalResult: matches[0].finalResult,
    };
  };
  return assertRequirement(requirementId);
};

export const assertPrepublicationOwlContract = ({
  candidate,
  report,
  nativeText,
  identity,
  artifact,
  pinnedSources,
}) => {
  assertNativeOwlContractReport(report, nativeText, {
    candidateSha256: candidate.tarball.sha256,
    artifact,
  });
  // Revalidate the selected immutable inputs, independently of current branch heads.
  assertReviewedConsumerSources(pinnedSources, REVIEWED_CONSUMER_SOURCES);
  if (
    report.identity.workflow !== "Release" ||
    report.identity.commit !== identity.commit ||
    report.identity.runId !== identity.runId ||
    report.identity.runAttempt > identity.runAttempt
  )
    throw new Error(
      "Prepublication requires fresh same-run installed OWL interface proof.",
    );
  return report;
};

export const readContractEvidenceFile = (path) => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024)
    throw new Error("Invalid contract evidence file type or size.");
  return readFileSync(path, "utf8");
};

export const assertDryRunMatchesCandidate = ({ candidate, dryRun }) => {
  const expectedPaths = [...candidate.packedPaths].sort(compareCodeUnits);
  const actualPaths = (dryRun.files ?? [])
    .map(({ path }) => path)
    .sort(compareCodeUnits);
  if (
    dryRun.name !== candidate.package.name ||
    dryRun.version !== candidate.package.version ||
    dryRun.filename !== candidate.tarball.fileName
  ) {
    throw new Error("The npm dry-run coordinate disagrees with the candidate.");
  }
  if (dryRun.size !== candidate.tarball.bytes) {
    throw new Error("The npm dry-run byte count disagrees with the candidate.");
  }
  if (
    dryRun.entryCount !== expectedPaths.length ||
    JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)
  ) {
    throw new Error(
      "The npm dry-run packlist differs from the retained tarball.",
    );
  }
  return {
    coordinate: `${candidate.package.name}@${candidate.package.version}`,
    fileCount: expectedPaths.length,
    tarballSha256: candidate.tarball.sha256,
  };
};

export const assertRegistryBootstrapState = (facts) => {
  const state = classifyReleaseState(facts);
  if (state.action !== "DIRECT_BOOTSTRAP_READY") {
    throw new Error(
      `The reviewed coordinate is already public or otherwise unavailable for direct bootstrap: ${state.action}.`,
    );
  }
  return state;
};

export const normalizeNpmPublishDryRun = (parsed) => {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The npm dry run must contain exactly one package record.");
  }
  if (typeof parsed.name === "string" && typeof parsed.version === "string") {
    return parsed;
  }
  const entries = Object.entries(parsed);
  if (
    entries.length !== 1 ||
    !entries[0][1] ||
    typeof entries[0][1] !== "object" ||
    Array.isArray(entries[0][1])
  ) {
    throw new Error("The npm dry run must contain exactly one package record.");
  }
  const [key, record] = entries[0];
  if (record.name !== key) {
    throw new Error("The npm dry-run package key disagrees with its record.");
  }
  return record;
};

export const npmPublishDryRunInvocation = ({ npmCli, tarballPath }) => {
  if (!npmCli || !tarballPath) {
    throw new Error("The publication dry run requires the exact npm CLI.");
  }
  return {
    command: process.execPath,
    arguments: [
      npmCli,
      "publish",
      tarballPath,
      "--dry-run",
      "--tag",
      "next",
      "--access",
      "public",
      `--registry=${registry}`,
      "--json",
    ],
  };
};

const fetchRead = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (response.ok || response.status === 404) {
        return response;
      }
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`Registry read returned HTTP ${response.status}.`);
      }
      lastError = new Error(`Registry read returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) {
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, attempt * 1000),
      );
    }
  }
  throw lastError;
};

const readRegistryVersion = async (name, version) => {
  const coordinateUrl = new URL(
    `${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    registry,
  );
  coordinateUrl.searchParams.set("owlapi-read", String(Date.now()));
  const response = await fetchRead(coordinateUrl);
  if (response.status === 404) {
    return null;
  }
  const metadata = await response.json();
  if (metadata.name !== name || metadata.version !== version) {
    throw new Error(
      "Registry metadata returned a different package coordinate.",
    );
  }
  const tarballResponse = await fetchRead(metadata.dist?.tarball);
  if (!tarballResponse.ok) {
    throw new Error("The public registry tarball could not be read.");
  }
  const tarball = Buffer.from(await tarballResponse.arrayBuffer());
  return {
    tarballSha256: sha256Buffer(tarball),
    integrity: metadata.dist.integrity,
  };
};

const readCandidate = (candidateDirectory) => {
  const fileNames = readdirSync(candidateDirectory);
  const tarballFileName = fileNames.find((name) =>
    /^hadden-industries-owlapi-.+\.tgz$/u.test(name),
  );
  const sbomFileName = fileNames.find((name) =>
    /^hadden-industries-owlapi-.+\.cdx\.json$/u.test(name),
  );
  if (!tarballFileName || !sbomFileName) {
    throw new Error("The retained candidate is missing its tarball or SBOM.");
  }
  const tarball = readFileSync(join(candidateDirectory, tarballFileName));
  const verified = verifyDownloadedCandidateBundle({
    checksumText: readFileSync(join(candidateDirectory, "SHA256SUMS"), "utf8"),
    fileNames,
    sbomText: readFileSync(join(candidateDirectory, sbomFileName), "utf8"),
    tarball,
  });
  return {
    ...verified,
    packedPaths: inspectGzipTar(tarball).map(({ path }) => path),
    tarballPath: join(candidateDirectory, tarballFileName),
  };
};

const runDryRun = (tarballPath) => {
  if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
    throw new Error(
      "The publication dry run must not receive npm credentials.",
    );
  }
  const invocation = npmPublishDryRunInvocation({
    npmCli: process.env.npm_execpath,
    tarballPath,
  });
  const result = spawnSync(invocation.command, invocation.arguments, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`npm publish --dry-run failed: ${result.stderr}`);
  }
  // npm 12 wraps the single result under its package name, whereas earlier
  // clients returned the record directly. Normalize only those two closed
  // single-package forms before applying the unchanged artifact comparisons.
  return normalizeNpmPublishDryRun(JSON.parse(result.stdout));
};

const gitTagExists = (tag) => {
  const result = spawnSync(
    "git",
    ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`Unable to inspect canonical tag ${tag}.`);
  }
  return result.status === 0;
};

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const main = async () => {
  const requirementId = argumentValue("--requirement");
  if (requirementId) {
    const manifest = JSON.parse(
      readFileSync(join(repositoryRoot, "package.json"), "utf8"),
    );
    const resultsPath = resolve(
      argumentValue("--results") ??
        join(
          repositoryRoot,
          "docs",
          "provenance",
          "releases",
          manifest.version,
          "gates.json",
        ),
    );
    const schema = JSON.parse(
      readFileSync(
        join(repositoryRoot, "docs", "release", "gate-results.schema.json"),
        "utf8",
      ),
    );
    const record = JSON.parse(readFileSync(resultsPath, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(record)) {
      throw new Error(
        `Release gate results violate their strict schema: ${ajv.errorsText(validate.errors)}`,
      );
    }
    process.stdout.write(
      `${JSON.stringify(assertRecordedRequirement(record, requirementId, argumentValue("--definitions") ? readContractEvidenceFile(resolve(argumentValue("--definitions"))) : undefined), null, 2)}\n`,
    );
    return;
  }
  const candidatePath = argumentValue("--candidate");
  const outputPath = argumentValue("--output");
  if (!candidatePath || !outputPath) {
    throw new Error("Release qualification requires --candidate and --output.");
  }
  const candidateDirectory = resolve(candidatePath);
  if (!existsSync(candidateDirectory)) {
    throw new Error(`Candidate directory is absent: ${candidateDirectory}`);
  }
  const candidate = readCandidate(candidateDirectory);
  const contractDirectory = argumentValue("--owl-contract");
  if (!contractDirectory)
    throw new Error("Prepublication requires --owl-contract native evidence.");
  const producerContract = assertPrepublicationOwlContract({
    candidate,
    report: JSON.parse(
      readContractEvidenceFile(join(contractDirectory, "qualification.json")),
    ),
    nativeText: readContractEvidenceFile(
      join(contractDirectory, "native.ndjson"),
    ),
    identity: {
      commit: process.env.GITHUB_SHA,
      runId: Number(process.env.GITHUB_RUN_ID),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    },
    artifact: {
      id: Number(process.env.CANDIDATE_ARTIFACT_ID),
      digest: `sha256:${process.env.CANDIDATE_ARTIFACT_DIGEST}`,
    },
    pinnedSources: await captureConsumerSources(),
  });
  const dryRun = runDryRun(candidate.tarballPath);
  const dryRunResult = assertDryRunMatchesCandidate({ candidate, dryRun });
  const canonicalTag = `v${candidate.package.version}`;
  const registryVersion = await readRegistryVersion(
    candidate.package.name,
    candidate.package.version,
  );
  const state = assertRegistryBootstrapState({
    canonicalTagExists: gitTagExists(canonicalTag),
    registryVersion,
    retainedSha256: candidate.tarball.sha256,
  });
  const report = {
    schemaVersion: 2,
    result: "PASS",
    checkedAt: new Date().toISOString(),
    registry,
    channel: "next",
    canonicalTag,
    registryState: state.action,
    producerContract,
    candidate: {
      coordinate: dryRunResult.coordinate,
      fileName: candidate.tarball.fileName,
      bytes: candidate.tarball.bytes,
      sha256: candidate.tarball.sha256,
      fileCount: dryRunResult.fileCount,
    },
    dryRun: {
      command:
        "npm publish <retained-tarball> --dry-run --tag next --access public --registry=https://registry.npmjs.org/ --json",
      entryCount: dryRun.entryCount,
      integrity: dryRun.integrity,
      shasum: dryRun.shasum,
    },
  };
  writeFileSync(
    resolve(outputPath),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
