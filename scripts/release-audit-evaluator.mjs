/** Authenticate native audit inputs, preserve the original privately, and verify signed public decisions. */
import { randomUUID } from "node:crypto";
import { canonicalJson } from "./canonical-json.mjs";
import { isReleaseAuditClear } from "./release-audit-policy.mjs";
import {
  isAuditEvidenceId,
  observeLockedReleaseAudit,
} from "./release-audit-evaluator-private.mjs";
import {
  advisoryCaseId,
  applicableAdvisoryCases,
  approvedDevelopmentCases,
  readAdvisoryCases,
  validateAdvisoryCases,
} from "./release-audit-cases.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import {
  NPM_REGISTRY,
  PACKAGE_NAME,
  REPOSITORY_ID,
} from "./release-identity.mjs";
import { indexRegistryOccurrences } from "../util/third-party-evidence/lock-graph.mjs";
import {
  assertAuditEvaluatorIdentity,
  assertAuditIssuerContext,
  signAuditStatement,
  verifyAuditStatement,
} from "./release-audit-evaluator-sigstore.mjs";

const maxAge = 24 * 60 * 60 * 1000;
const maxSubjects = 256;
const maxStatement = 256 * 1024;
const maxSignature = 128 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const encode = (value) => Buffer.from(canonicalJson(value) + "\n");
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const closed = (value, keys) =>
  record(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const hex = (value, size) =>
  typeof value === "string" &&
  value.length === size &&
  /^[a-f0-9]+$/u.test(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const bounded = (buffer, size) =>
  Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= size;
const version = (value) =>
  typeof value === "string" && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/u.test(value);

function assertValid(condition, message) {
  if (!condition) throw new Error(message);
}

function parseObject(bytes, failure) {
  let parsed;
  try {
    parsed = JSON.parse(utf8.decode(bytes));
  } catch {
    throw new Error(failure);
  }
  assertValid(record(parsed), failure);
  return parsed;
}

function assertSubject(subject) {
  assertValid(
    closed(subject, [
      "manifestSha256",
      "lockSha256",
      "tarballSha256",
      "graphSha256",
      "role",
      "scope",
      "platform",
    ]) &&
      [
        subject.manifestSha256,
        subject.lockSha256,
        subject.tarballSha256,
        subject.graphSha256,
      ].every((digest) => hex(digest, 64)) &&
      ["producer", "transport", "candidate", "recipient"].includes(
        subject.role,
      ) &&
      ["full", "production"].includes(subject.scope),
    "Invalid release audit subject",
  );
  const { platform } = subject;
  const fields = ["os", "cpu", "node", "npm"];
  if (platform?.libc !== undefined) fields.push("libc");
  assertValid(
    closed(platform, fields) &&
      ["linux", "win32", "darwin"].includes(platform.os) &&
      ["x64", "arm64"].includes(platform.cpu) &&
      version(platform.node) &&
      version(platform.npm) &&
      (platform.libc === undefined ||
        (platform.os === "linux" && ["glibc", "musl"].includes(platform.libc))),
    "Invalid audit subject platform",
  );
}

function assertSource(source) {
  assertValid(
    closed(source, [
      "repositoryId",
      "commit",
      "runId",
      "attempt",
      "jobId",
      "artifactSha256",
    ]) &&
      source.repositoryId === REPOSITORY_ID &&
      hex(source.commit, 40) &&
      [source.runId, source.attempt, source.jobId].every(positive) &&
      hex(source.artifactSha256, 64),
    "Invalid original audit subject binding",
  );
}

function assertTrust(trust) {
  assertValid(
    closed(trust, ["policySha256", "evaluator"]) && hex(trust.policySha256, 64),
    "Approved audit policy is required",
  );
  assertAuditEvaluatorIdentity(trust.evaluator);
}

/** The owning admission reader authenticates the tarball and replays the recorded graph before it supplies this input. */
export function buildReleaseAuditSubject({
  manifestBytes,
  lockBytes,
  tarballSha256,
  graphSha256,
  role,
  scope,
  platform,
}) {
  const invalid = "Invalid original audit inputs";
  assertValid(
    bounded(manifestBytes, 1024 * 1024) && bounded(lockBytes, 16 * 1024 * 1024),
    invalid,
  );
  const manifest = parseObject(manifestBytes, invalid);
  const lock = parseObject(lockBytes, invalid);
  const root = lock.packages?.[""];
  assertValid(
    lock.lockfileVersion === 3 &&
      record(lock.packages) &&
      record(root) &&
      typeof manifest.name === "string" &&
      (typeof manifest.version === "string" ||
        (role === "recipient" && manifest.version === undefined)) &&
      !manifest.workspaces &&
      !root.workspaces,
    invalid,
  );
  for (const field of [
    "name",
    "version",
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "peerDependenciesMeta",
  ])
    assertValid(
      canonicalJson(manifest[field] ?? null) ===
        canonicalJson(root[field] ?? null),
      "Audit manifest and lock disagree",
    );
  const registryPackages = { ...lock.packages };
  if (role === "candidate") {
    const dependencies = Object.entries(manifest.dependencies ?? {});
    const [binding, spec] = dependencies[0] ?? [];
    const location = "node_modules/" + binding;
    const member = lock.packages[location];
    assertValid(
      dependencies.length === 1 &&
        ["owlapi", PACKAGE_NAME].includes(binding) &&
        spec === "file:candidate.tgz" &&
        record(member) &&
        (member.name ?? binding) === PACKAGE_NAME &&
        member.resolved === spec &&
        !member.link &&
        !member.inBundle &&
        !member.extraneous,
      "Invalid local candidate audit subject",
    );
    delete registryPackages[location];
  }
  try {
    indexRegistryOccurrences(registryPackages);
  } catch {
    throw new Error("Release audit requires an admitted npm package lock");
  }
  const subject = {
    manifestSha256: sha256Buffer(manifestBytes),
    lockSha256: sha256Buffer(lockBytes),
    tarballSha256,
    graphSha256,
    role,
    scope,
    platform: { ...platform },
  };
  assertSubject(subject);
  return subject;
}

function timestamp(value) {
  assertValid(Number.isSafeInteger(value), "Invalid audit observation time");
  return new Date(value).toISOString();
}

function readAuditReport(observation) {
  if (
    !observation.complete ||
    observation.signal ||
    observation.status === null
  )
    return null;
  let report;
  try {
    report = JSON.parse(utf8.decode(observation.stdout));
  } catch {
    return null;
  }
  if (!record(report)) return null;
  const severities = ["info", "low", "moderate", "high", "critical"];
  const counts = report.metadata?.vulnerabilities;
  if (
    report.auditReportVersion !== 2 ||
    Object.hasOwn(report, "error") ||
    !record(report.vulnerabilities) ||
    !closed(counts, [...severities, "total"])
  )
    return null;
  const observed = Object.fromEntries(
    severities.map((severity) => [severity, 0]),
  );
  const vulnerabilities = Object.values(report.vulnerabilities);
  for (const entry of vulnerabilities) {
    if (!severities.includes(entry?.severity)) return null;
    observed[entry.severity]++;
  }
  return counts.total === vulnerabilities.length &&
    severities.every((severity) => counts[severity] === observed[severity])
    ? report
    : null;
}

const unavailable = "Trusted audit observation is unavailable";

function auditDisposition(audit, report, active) {
  const { subject, observation, lockBytes } = audit;
  if (!report) return null;
  const clear = isReleaseAuditClear(report.metadata.vulnerabilities);
  if (observation.status === 0 && clear) return [];
  if (subject.scope !== "full" || observation.status !== 1 || clear)
    return null;
  return approvedDevelopmentCases(report, lockBytes, active);
}

async function observeAudit(
  input,
  { observe = observeLockedReleaseAudit, npmCli, npm, now, expectedSubject },
) {
  const subject = buildReleaseAuditSubject(input);
  if (expectedSubject)
    assertValid(
      canonicalJson(subject) === canonicalJson(expectedSubject),
      "Audit inputs differ from the admitted subject",
    );
  const manifestBytes = Buffer.from(input.manifestBytes);
  const lockBytes = Buffer.from(input.lockBytes);
  const observedAt = timestamp(now());
  let observation;
  try {
    observation = await observe(
      {
        manifestBytes: Buffer.from(manifestBytes),
        lockBytes: Buffer.from(lockBytes),
        scope: subject.scope,
      },
      { npmCli, npm },
    );
  } catch {
    throw new Error(unavailable);
  }
  const streamBytes = 4 * 1024 * 1024;
  assertValid(
    Buffer.isBuffer(observation?.stdout) &&
      observation.stdout.length <= streamBytes &&
      Buffer.isBuffer(observation.stderr) &&
      observation.stderr.length <= streamBytes &&
      (observation.status === null ||
        (Number.isInteger(observation.status) && observation.status >= 0)) &&
      (observation.signal === null ||
        (typeof observation.signal === "string" &&
          /^SIG[A-Z0-9]+$/u.test(observation.signal))) &&
      typeof observation.complete === "boolean" &&
      version(observation.runtime?.node) &&
      version(observation.runtime?.npm),
    unavailable,
  );
  return { subject, manifestBytes, lockBytes, observedAt, observation };
}

async function transientAudit(input, { npmCli, npm, now = Date.now } = {}) {
  const audit = await observeAudit(input, {
    npmCli,
    npm,
    now,
  });
  const { subject, observedAt, observation } = audit;
  const report = readAuditReport(observation);
  assertValid(report, unavailable);
  const active =
    subject.scope === "full"
      ? applicableAdvisoryCases(
          readAdvisoryCases(),
          subject,
          Date.parse(observedAt),
        )
      : [];
  return {
    schemaVersion: 1,
    subject,
    observedAt,
    eligible: auditDisposition(audit, report, active) !== null,
  };
}

/** Local CI policy outcome for the supplied production graph. Release admission requires a separate signed receipt. */
export async function preflightReleaseAudit(input, options) {
  assertValid(
    input?.scope === "production",
    "Transient audit preflight requires production scope",
  );
  return transientAudit(input, options);
}

/** Full producer and release-tooling diagnostics apply the high/critical threshold to development dependencies too. */
export async function preflightFullReleaseAudit(input, options) {
  assertValid(
    input?.scope === "full" && ["producer", "transport"].includes(input.role),
    "Transient full audit requires a producer or transport subject",
  );
  return transientAudit(input, options);
}

function assertPrivateStore(store) {
  assertValid(
    typeof store?.retain === "function" && typeof store?.read === "function",
    "Private audit evidence storage is unavailable",
  );
}

async function authenticateOriginal(source, authenticate) {
  assertValid(
    typeof authenticate === "function",
    "Audit inputs need an authenticated original",
  );
  try {
    const input = await authenticate({ ...source });
    assertSource(input.source);
    assertValid(
      canonicalJson(input.source) === canonicalJson(source),
      "Mismatched original source",
    );
    return input;
  } catch {
    throw new Error("Audit input authentication failed");
  }
}

async function retainAuditOriginal(
  { subject, manifestBytes, lockBytes, observedAt, observation },
  { source, policySha256, now, store, caseIds = [] },
) {
  const evidenceId = randomUUID();
  const original = encode({
    schemaVersion: 1,
    source,
    subject,
    policySha256,
    ...(caseIds.length ? { caseIds } : {}),
    observedAt,
    completedAt: timestamp(now()),
    runtime: { node: observation.runtime.node, npm: observation.runtime.npm },
    auditConfiguration: {
      registry: NPM_REGISTRY,
      scope: subject.scope,
      packageLockOnly: true,
      ignoreScripts: true,
    },
    status: observation.status,
    attempts: observation.attempts ?? 1,
    signal: observation.signal,
    complete: observation.complete,
    manifest: manifestBytes.toString("base64"),
    lock: lockBytes.toString("base64"),
    stdout: observation.stdout.toString("base64"),
    stderr: observation.stderr.toString("base64"),
  });
  try {
    await store.retain(evidenceId, Buffer.from(original));
    const retained = await store.read(evidenceId);
    assertValid(
      Buffer.isBuffer(retained) && retained.equals(original),
      "Changed private original",
    );
  } catch {
    throw new Error("Private audit evidence could not be verified");
  }
  return evidenceId;
}

/** Keep native originals only for a case selected by the trusted caller. */
export async function captureReleaseAudit(
  reference,
  { authenticate, store, policySha256, observe, npmCli, npm, now = Date.now },
) {
  assertSource(reference);
  assertValid(hex(policySha256, 64), "Approved audit policy is required");
  assertPrivateStore(store);
  const source = { ...reference };
  const input = await authenticateOriginal(source, authenticate);
  const audit = await observeAudit(input, { observe, npmCli, npm, now });
  const { subject, observedAt, observation } = audit;
  const evidenceId = await retainAuditOriginal(audit, {
    source,
    policySha256,
    now,
    store,
  });
  return {
    source,
    subject,
    observedAt,
    evidenceId,
    eligible:
      subject.scope === "production" &&
      observation.status === 0 &&
      isReleaseAuditClear(
        readAuditReport(observation)?.metadata.vulnerabilities,
      ),
  };
}

function auditEntries(entries) {
  assertValid(
    Array.isArray(entries) &&
      entries.length > 0 &&
      entries.length <= maxSubjects,
    "Invalid audit subjects",
  );
  const keyed = new Map();
  for (const entry of entries) {
    assertValid(
      closed(entry, ["subject", "source"]),
      "Invalid audit subject selection",
    );
    assertSubject(entry.subject);
    assertSource(entry.source);
    const key = canonicalJson(entry);
    assertValid(!keyed.has(key), "Repeated audit subject selection");
    keyed.set(key, JSON.parse(key));
  }
  const ordered = [...keyed.keys()].sort().map((key) => keyed.get(key));
  assertValid(
    ordered.every(
      ({ subject }) =>
        subject.tarballSha256 === ordered[0].subject.tarballSha256,
    ),
    "Audit subjects must bind one tarball",
  );
  const production = ordered.filter(
    ({ subject }) => subject.scope === "production",
  );
  assertValid(
    production.length > 0,
    "Audit subjects require a production observation",
  );
  for (const { subject, source } of ordered) {
    if (subject.scope !== "full") continue;
    const shared = ({ scope: _scope, graphSha256: _graph, ...rest }) =>
      canonicalJson(rest);
    assertValid(
      ["producer", "transport"].includes(subject.role) &&
        production.some(
          (entry) =>
            canonicalJson(entry.source) === canonicalJson(source) &&
            shared(entry.subject) === shared(subject),
        ),
      "Full audit requires the corresponding production subject",
    );
  }
  return ordered;
}

/** An operator starts this protected job with references already admitted by the release controller. */
export async function evaluateReleaseAudit(
  entries,
  {
    authenticate,
    trust,
    npmCli,
    npmCliForVersion,
    advisoryCases = [],
    now = Date.now,
    retainOriginals = false,
    store,
  },
) {
  assertTrust(trust);
  assertAuditIssuerContext(trust.evaluator);
  validateAdvisoryCases(advisoryCases);
  assertValid(
    typeof authenticate === "function" &&
      typeof retainOriginals === "boolean" &&
      (npmCliForVersion === undefined ||
        typeof npmCliForVersion === "function"),
    "Audit inputs need an authenticated original",
  );
  if (retainOriginals) assertPrivateStore(store);
  const subjects = [];
  for (const entry of auditEntries(entries)) {
    const { source, subject } = entry;
    const input = await authenticateOriginal(source, () => authenticate(entry));
    const npm = subject.platform.npm;
    const active = applicableAdvisoryCases(advisoryCases, subject, now());
    const retained = active.filter((item) => item.kind === "RETAIN_ORIGINAL");
    if (retained.length) assertPrivateStore(store);
    const audit = await observeAudit(input, {
      npmCli: npmCliForVersion ? npmCliForVersion(npm) : npmCli,
      npm,
      now,
      expectedSubject: subject,
    });
    const applied = auditDisposition(
      audit,
      readAuditReport(audit.observation),
      active,
    );
    const cases = [...retained, ...(applied ?? [])];
    const caseIds = cases.map(({ id }) => id).sort();
    let caseEvidence;
    if (retainOriginals || cases.length) {
      assertPrivateStore(store);
      const id = await retainAuditOriginal(audit, {
        source,
        policySha256: trust.policySha256,
        now,
        store,
        caseIds,
      });
      if (cases.length)
        caseEvidence = {
          id,
          caseIds,
          expiresAt: timestamp(
            Math.min(...cases.map((item) => Date.parse(item.expiresAt))),
          ),
        };
    }
    assertValid(applied !== null, "Release audit did not satisfy policy");
    subjects.push({
      ...entry,
      observedAt: audit.observedAt,
      ...(caseEvidence ? { caseEvidence } : {}),
    });
  }
  const decidedAt = timestamp(now());
  for (const entry of subjects)
    assertSubjectFreshness(entry, decidedAt, Date.parse(decidedAt));
  const statement = encode({
    schemaVersion: 2,
    subjects,
    evaluator: trust.evaluator,
    policySha256: trust.policySha256,
    decidedAt,
    decision: "ACCEPTED",
  });
  const signing = { npmCli, evaluator: trust.evaluator };
  const signature = await signAuditStatement(statement, signing);
  assertValid(bounded(signature, maxSignature), "Invalid audit signature");
  await verifyAuditStatement(signature, statement, signing);
  return { statement, signature };
}

function assertFresh(observedAt, decidedAt, now) {
  const canonicalTime = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    timestamp(Date.parse(value)) === value;
  assertValid(
    canonicalTime(observedAt) &&
      canonicalTime(decidedAt) &&
      Number.isSafeInteger(now),
    "Invalid audit observation time",
  );
  const observed = Date.parse(observedAt),
    decided = Date.parse(decidedAt);
  assertValid(
    observed <= decided && decided <= now && now - observed <= maxAge,
    "Release audit observation is stale or inconsistent",
  );
}

function assertSubjectFreshness(entry, decidedAt, now) {
  assertFresh(entry.observedAt, decidedAt, now);
  assertPrivateCaseCurrent(entry, now);
}

function assertPrivateCaseCurrent(entry, now) {
  if (!Object.hasOwn(entry, "caseEvidence")) return;
  const value = entry.caseEvidence;
  assertValid(
    closed(value, ["id", "caseIds", "expiresAt"]) &&
      isAuditEvidenceId(value.id) &&
      Array.isArray(value.caseIds) &&
      value.caseIds.length > 0 &&
      value.caseIds.length <= 256 &&
      value.caseIds.every(
        (id, index) =>
          typeof id === "string" &&
          advisoryCaseId.test(id) &&
          (!index || id > value.caseIds[index - 1]),
      ) &&
      Number.isFinite(Date.parse(value.expiresAt)) &&
      timestamp(Date.parse(value.expiresAt)) === value.expiresAt &&
      now < Date.parse(value.expiresAt),
    "Private advisory case evidence is invalid or expired",
  );
}

/** Recheck both observation age and a selected private case's expiry at a writer boundary. */
export function assertAdvisoryDecisionCurrent(decision, now = Date.now()) {
  for (const entry of decision.subjects)
    assertSubjectFreshness(entry, decision.decidedAt, now);
}

/** A verified decision may be handed to an isolated test runner until this instant. */
export function advisoryDecisionExpiry(decision) {
  return Math.min(
    ...decision.subjects.flatMap((entry) => [
      Date.parse(entry.observedAt) + maxAge,
      ...(entry.caseEvidence ? [Date.parse(entry.caseEvidence.expiresAt)] : []),
    ]),
  );
}

/** A past stage decision keeps its original audit clock; its case approval must remain active for a future writer. */
export function assertAdvisoryCasesCurrent(decision, now = Date.now()) {
  for (const entry of decision.subjects) assertPrivateCaseCurrent(entry, now);
}

/** This cold check needs the signed public receipt and approved identity, never private originals or a new audit. */
export async function verifyReleaseAuditReceipt(
  { statement, signature },
  { trust, entries, npmCli, now = Date.now() },
) {
  assertTrust(trust);
  const expected = auditEntries(entries);
  const invalid = "Invalid public audit receipt";
  assertValid(
    bounded(statement, maxStatement) && bounded(signature, maxSignature),
    invalid,
  );
  const result = parseObject(statement, invalid);
  assertValid(
    closed(result, [
      "schemaVersion",
      "subjects",
      "evaluator",
      "policySha256",
      "decidedAt",
      "decision",
    ]) &&
      result.schemaVersion === 2 &&
      result.decision === "ACCEPTED" &&
      Array.isArray(result.subjects) &&
      result.subjects.length === expected.length,
    invalid,
  );
  assertTrust({
    evaluator: result.evaluator,
    policySha256: result.policySha256,
  });
  const supplied = result.subjects.map((entry) => {
    assertValid(
      closed(entry, [
        "subject",
        "source",
        "observedAt",
        ...(entry?.caseEvidence ? ["caseEvidence"] : []),
      ]),
      invalid,
    );
    assertSubjectFreshness(entry, result.decidedAt, now);
    return { subject: entry.subject, source: entry.source };
  });
  assertValid(
    canonicalJson(supplied) === canonicalJson(expected) &&
      canonicalJson(result.evaluator) === canonicalJson(trust.evaluator) &&
      result.policySha256 === trust.policySha256 &&
      encode(result).equals(statement),
    "Public audit receipt does not bind the approved subject and authority",
  );
  await verifyAuditStatement(signature, statement, {
    npmCli,
    evaluator: trust.evaluator,
  });
  return result;
}
