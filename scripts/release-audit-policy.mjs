const blockingSeverities = ["high", "critical"];

export const RELEASE_AUDIT_ARGS = Object.freeze([
  "audit",
  `--audit-level=${blockingSeverities[0]}`,
]);

export const isReleaseAuditClear = (counts) =>
  blockingSeverities.every((severity) => counts?.[severity] === 0);

export const assertReleaseAudit = ({ status, report, stderr }, subject) => {
  const counts = report?.metadata?.vulnerabilities;
  if (status !== 0 || !isReleaseAuditClear(counts)) {
    const summary = blockingSeverities
      .map((severity) => `${severity}=${counts?.[severity] ?? "missing"}`)
      .join(" ");
    const detail = stderr?.trim();
    throw new Error(
      `Release audit failed for ${subject} (npm exit ${status}, ${summary}).${detail ? `\n${detail}` : ""}`,
    );
  }
  return counts;
};
