/** Reviewed project decisions, separate from confidential native audit observations. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { canonicalJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

export const advisoryCasePath = "docs/release/dependency-advisory-cases.json";
const root = new URL("../", import.meta.url);
const hex = /^[a-f0-9]{64}$/u;
export const advisoryCaseId = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const advisory =
  /^(?:GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|CVE-\d{4}-\d{4,})$/u;
const lockedLocation =
  /^node_modules\/(?:@[^/@\s]+\/)?[^/@\s]+(?:\/node_modules\/(?:@[^/@\s]+\/)?[^/@\s]+)*$/u;
const maximum = 64 * 1024;
const maxApprovalDays = 30 * 24 * 60 * 60 * 1000;
const decisionFields = [
  "id",
  "kind",
  "role",
  "scope",
  "lockSha256",
  "owner",
  "review",
  "approvedAt",
  "expiresAt",
];
const closed = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const canonicalTime = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const qualifier = (path) =>
  typeof path === "string" &&
  lockedLocation.test(path) &&
  !/[\\:%]/u.test(path) &&
  !path.split("/").some((part) => [".", ".."].includes(part));
const sortedUnique = (values) =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.length <= 128 &&
  values.every((value, index) => !index || value > values[index - 1]);

export function validateAdvisoryCases(cases) {
  const invalid = "Invalid reviewed advisory case registry";
  assert.ok(Array.isArray(cases) && cases.length <= 256, invalid);
  assert.equal(
    new Set(cases.map((record) => record?.id)).size,
    cases.length,
    invalid,
  );
  for (const item of cases) {
    const development = item?.kind === "NON_RELEASE_REACHABLE_DEVELOPMENT";
    assert.ok(
      closed(item, [
        ...decisionFields,
        ...(development
          ? ["finding", "reachability", "boundary", "controls"]
          : []),
      ]) &&
        ["RETAIN_ORIGINAL", "NON_RELEASE_REACHABLE_DEVELOPMENT"].includes(
          item.kind,
        ) &&
        typeof item.id === "string" &&
        advisoryCaseId.test(item.id) &&
        ["producer", "transport", "candidate", "recipient"].includes(
          item.role,
        ) &&
        ["full", "production"].includes(item.scope) &&
        typeof item.lockSha256 === "string" &&
        hex.test(item.lockSha256) &&
        typeof item.owner === "string" &&
        /^[a-z0-9][a-z0-9-]{0,38}$/iu.test(item.owner) &&
        typeof item.review === "string" &&
        /^(?:GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|https:\/\/github\.com\/Hadden-Industries\/owlapi\/issues\/[1-9][0-9]*)$/u.test(
          item.review,
        ) &&
        canonicalTime(item.approvedAt) &&
        canonicalTime(item.expiresAt) &&
        Date.parse(item.approvedAt) < Date.parse(item.expiresAt) &&
        Date.parse(item.expiresAt) - Date.parse(item.approvedAt) <=
          maxApprovalDays,
      invalid,
    );
    if (!development) continue;
    const finding = item.finding;
    assert.ok(
      item.scope === "full" &&
        ["producer", "transport"].includes(item.role) &&
        item.reachability === "NOT_RELEASE_REACHABLE" &&
        [item.boundary, item.controls].every(
          (field) =>
            typeof field === "string" &&
            field.trim().length > 0 &&
            field.length <= 500,
        ) &&
        closed(finding, ["sha256", "severity", "advisories", "occurrences"]) &&
        typeof finding.sha256 === "string" &&
        hex.test(finding.sha256) &&
        ["high", "critical"].includes(finding.severity) &&
        sortedUnique(finding.advisories) &&
        finding.advisories.every(
          (id) => typeof id === "string" && advisory.test(id),
        ) &&
        Array.isArray(finding.occurrences) &&
        sortedUnique(finding.occurrences.map((node) => node?.location)) &&
        finding.occurrences.every(
          (node) =>
            closed(node, ["location", "version"]) &&
            qualifier(node.location) &&
            typeof node.version === "string" &&
            /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.+-]+)?$/u.test(
              node.version,
            ),
        ),
      invalid,
    );
  }
  return cases;
}

function unmarshal(bytes) {
  const invalid = "Unavailable reviewed advisory case registry";
  assert.ok(bytes.length <= maximum, invalid);
  const table = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  assert.ok(
    closed(table, ["schemaVersion", "cases"]) && table.schemaVersion === 1,
    invalid,
  );
  return validateAdvisoryCases(table.cases);
}

/** A diagnostic may read the checkout; an issuer reads only the protected immutable source. */
export function readAdvisoryCases(controller) {
  const local = unmarshal(readFileSync(new URL(advisoryCasePath, root)));
  if (controller === undefined) return local;
  assert.match(controller, /^[a-f0-9]{40}$/u);
  const immutable = unmarshal(
    execFileSync(
      "git",
      [
        "--no-lazy-fetch",
        "cat-file",
        "blob",
        `${controller}:${advisoryCasePath}`,
      ],
      {
        cwd: root,
        timeout: 10_000,
        windowsHide: true,
        maxBuffer: maximum,
      },
    ),
  );
  assert.ok(
    canonicalJson(immutable) === canonicalJson(local),
    "Advisory case decisions changed outside the protected revision",
  );
  return immutable;
}

export function applicableAdvisoryCases(cases, subject, now) {
  return cases.filter(
    (item) =>
      item.lockSha256 === subject.lockSha256 &&
      item.role === subject.role &&
      item.scope === subject.scope &&
      Date.parse(item.approvedAt) <= now &&
      now < Date.parse(item.expiresAt),
  );
}

// Native npm names another vulnerability for an indirectly affected parent.
function advisoryIds(name, records, visiting, resolved) {
  if (resolved.has(name)) return resolved.get(name);
  if (visiting.has(name) || !Object.hasOwn(records, name)) return null;
  const record = records[name];
  if (!Array.isArray(record?.via) || !record.via.length) return null;
  visiting.add(name);
  const ids = new Set();
  for (const detail of record.via) {
    if (typeof detail === "string") {
      const inherited = advisoryIds(detail, records, visiting, resolved);
      if (!inherited) return null;
      for (const id of inherited) ids.add(id);
      continue;
    }
    if (!detail || typeof detail !== "object" || typeof detail.url !== "string")
      return null;
    const match =
      /^(?:https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)|https:\/\/nvd\.nist\.gov\/vuln\/detail\/(CVE-\d+-\d+))$/u.exec(
        detail.url,
      );
    if (!match) return null;
    ids.add(match[1] ?? match[2]);
  }
  visiting.delete(name);
  const result = [...ids].sort();
  resolved.set(name, result);
  return result;
}

/** Exact reviewed dev-only occurrences may pass the full diagnostic. Production stays unconditional. */
export function approvedDevelopmentCases(report, lockBytes, active) {
  const lock = JSON.parse(lockBytes);
  const approved = new Map(),
    resolved = new Map();
  for (const [name, record] of Object.entries(report.vulnerabilities)) {
    if (!["high", "critical"].includes(record.severity)) continue;
    const ids = advisoryIds(name, report.vulnerabilities, new Set(), resolved);
    if (!ids || !Array.isArray(record.nodes)) return null;
    const locations = [...record.nodes];
    if (!locations.every(qualifier) || !sortedUnique(locations.sort()))
      return null;
    const occurrences = [];
    for (const location of locations) {
      const pkg = lock.packages?.[location];
      if (
        pkg?.dev !== true ||
        pkg.devOptional ||
        pkg.link ||
        typeof pkg.version !== "string"
      )
        return null;
      occurrences.push({ location, version: pkg.version });
    }
    const finding = {
      sha256: sha256Buffer(Buffer.from(canonicalJson(record))),
      severity: record.severity,
      advisories: ids,
      occurrences,
    };
    const eligible = active.filter(
      (item) =>
        item.kind === "NON_RELEASE_REACHABLE_DEVELOPMENT" &&
        canonicalJson(item.finding) === canonicalJson(finding),
    );
    if (eligible.length !== 1) return null;
    approved.set(eligible[0].id, eligible[0]);
  }
  return [...approved.values()];
}
