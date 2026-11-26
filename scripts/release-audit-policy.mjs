const blockingSeverities = ["high", "critical"];

export const RELEASE_AUDIT_ARGS = Object.freeze([
  "audit",
  `--audit-level=${blockingSeverities[0]}`,
]);

export const isReleaseAuditClear = (counts) =>
  blockingSeverities.every((severity) => counts?.[severity] === 0);

/** Expose only the project gate outcome in logs. */
export const assertReleaseAudit = ({ status, report }, subject) => {
  const counts = report?.metadata?.vulnerabilities;
  if (status !== 0 || !isReleaseAuditClear(counts))
    throw new Error("Release audit failed for " + subject);
  return counts;
};
