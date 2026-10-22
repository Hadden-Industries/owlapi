/** One logical/physical identity codec serves uploads and every artifact selector. */
import { createHash } from "node:crypto";
import policy from "../../docs/release/artifact-transport-policy.json" with { type: "json" };

export { policy };
export const hashBytes = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const fact = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

/** Producer is a stable job/logical-coordinate identity; invocation separates executions. */
export function physicalName({
  logical,
  run,
  attempt,
  producer,
  invocation,
  ordinal,
}) {
  fact(
    typeof logical === "string" &&
      logical.length > 0 &&
      logical.length <= 150 &&
      !/["<>|:*?\r\n\\/]/u.test(logical) &&
      logical !== "." &&
      logical !== ".." &&
      !/[. ]$/u.test(logical) &&
      !logical.includes(policy.nameMarker),
    "Invalid logical artifact name",
  );
  fact(
    /^[1-9]\d*$/u.test(String(run)) &&
      Number.isSafeInteger(Number(attempt)) &&
      Number(attempt) >= 1 &&
      /^[a-f0-9]{16}$/u.test(producer) &&
      /^[a-f0-9]{32}$/u.test(invocation) &&
      Number.isInteger(ordinal) &&
      ordinal >= 0 &&
      ordinal < policy.maximumUploads,
    "Invalid artifact scope",
  );
  return `${logical}${policy.nameMarker}r${run}-a${attempt}-p${producer}-i${invocation}-t${ordinal}`;
}

/** Historical names are only admitted when an existing consumer explicitly opts in. */
export function parseArtifactName(name, { legacy = false } = {}) {
  fact(
    !String(name).includes("--owlart-") ||
      String(name).includes(policy.nameMarker),
    "Unsupported artifact transport identity",
  );
  const parts = String(name).split(policy.nameMarker);
  if (parts.length === 1) {
    return legacy ? { logical: name, legacy: true } : null;
  }
  const match =
    parts.length === 2 &&
    /^r([1-9]\d*)-a([1-9]\d*)-p([a-f0-9]{16})-i([a-f0-9]{32})-t(0|[1-9]\d*)$/u.exec(
      parts[1],
    );
  fact(match, "Malformed artifact transport identity");
  const value = {
    logical: parts[0],
    run: match[1],
    attempt: Number(match[2]),
    producer: match[3],
    invocation: match[4],
    ordinal: Number(match[5]),
    legacy: false,
  };
  fact(physicalName(value) === name, "Noncanonical artifact identity");
  return value;
}

/** Exact proof consumers preserve physical identity, but compare the logical claim. */
export function matchesLogicalArtifact(
  name,
  logical,
  { run, attempt, legacy = true } = {},
) {
  const parsed = parseArtifactName(name, { legacy });
  return (
    parsed?.logical === logical &&
    (parsed.legacy ||
      (parsed.run === String(run) && parsed.attempt === Number(attempt)))
  );
}

/** Existing run-scoped evidence embeds its producing workflow attempt in its key. */
export function artifactProducingAttempt(
  name,
  prefix,
  { run, attempt, legacy = true },
) {
  const parsed = parseArtifactName(name, { legacy });
  if (!parsed?.logical?.startsWith(prefix)) {
    return null;
  }
  const suffix = parsed.logical.slice(prefix.length);
  const producingAttempt = Number(suffix);
  if (
    !/^[1-9]\d*$/u.test(suffix) ||
    !Number.isSafeInteger(producingAttempt) ||
    producingAttempt > attempt ||
    (!parsed.legacy &&
      (parsed.run !== String(run) || parsed.attempt !== producingAttempt))
  ) {
    return null;
  }
  return producingAttempt;
}

/** A single wildcard is supported; every match is subsequently checked by the codec. */
export function selectArtifactGroups(
  artifacts,
  { name, pattern, run, attempt },
) {
  fact(
    Array.isArray(artifacts) && artifacts.length <= policy.maximumInventory,
    "Incomplete or excessive artifact inventory",
  );
  fact(
    Boolean(name) !== Boolean(pattern),
    "Select exactly one logical name or pattern",
  );
  fact(
    !pattern || (pattern.split("*").length === 2 && !pattern.includes("?")),
    "Only one logical wildcard is supported",
  );
  const [prefix, suffix] = pattern?.split("*") ?? [];
  const groups = new Map();
  for (const artifact of artifacts) {
    const parsed = parseArtifactName(artifact.name);
    if (
      !parsed ||
      parsed.run !== String(run) ||
      parsed.attempt > Number(attempt)
    ) {
      continue;
    }
    const wanted = name
      ? parsed.logical === name
      : parsed.logical.startsWith(prefix) && parsed.logical.endsWith(suffix);
    if (!wanted) {
      continue;
    }
    const existing = groups.get(parsed.logical) ?? [];
    // Workflow reruns intentionally replace a temporary logical coordinate. Transport
    // copies within that producing attempt must still be proven byte-equivalent.
    const newest = Math.max(
      parsed.attempt,
      ...existing.map((item) => item.identity.attempt),
    );
    groups.set(
      parsed.logical,
      [...existing, { ...artifact, identity: parsed }].filter(
        (item) => item.identity.attempt === newest,
      ),
    );
  }
  fact(
    groups.size > 0 && (!name || groups.size === 1),
    "No matching current-run artifacts",
  );
  for (const copies of groups.values()) {
    fact(
      new Set(
        copies.map(
          (item) => `${item.identity.producer}:${item.identity.invocation}`,
        ),
      ).size === 1,
      "Conflicting artifact producers or duplicate invocations",
    );
    fact(
      new Set(copies.map((item) => item.identity.ordinal)).size ===
        copies.length,
      "Duplicate transport ordinal",
    );
    copies.sort((a, b) => a.identity.ordinal - b.identity.ordinal);
  }
  return groups;
}
