/** Bounded, fault-injectable recovery at the public artifact SDK boundary. */
import { policy, physicalName, parseArtifactName } from "./identity.mjs";
import { assertSameManifest } from "./payload.mjs";

const codes = new Set([
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EHOSTUNREACH",
]);
const fact = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

/** The pinned 6.3.1 RPC wrapper drops causes. Accept only its exact network wrapper,
 * never exhausted HTTP retries, quota failures, arbitrary reset text or unknown errors. */
export function classifyUploadError(error) {
  if (error?.name === "NetworkError" && codes.has(error.code)) {
    return { eligible: true, phase: "network", code: error.code };
  }
  const match =
    /^Failed to (CreateArtifact|FinalizeArtifact): Unable to make request: (ECONNRESET|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH)\nIf you are using self-hosted runners, please make sure your runner has access to all GitHub endpoints: https:\/\/docs.github.com\/en\/actions\/hosting-your-own-runners\/managing-self-hosted-runners\/about-self-hosted-runners#communication-between-self-hosted-runners-and-github$/u.exec(
      error?.message ?? "",
    );
  return match
    ? { eligible: true, phase: match[1], code: match[2] }
    : { eligible: false, phase: "unknown" };
}

/** All operations share one deadline and cancellation guard, including visibility waits. */
async function retainWithRecovery({
  adapter,
  snapshot,
  scope,
  options,
  signal,
  now = () => performance.now(),
  deadline = now() + policy.deadlineMilliseconds,
  sleep,
  random = Math.random,
  report = () => {},
}) {
  const guard = () => {
    signal?.throwIfAborted();
    fact(now() < deadline, "Artifact recovery deadline exceeded");
  };
  const wait = async (milliseconds) => {
    guard();
    await sleep(milliseconds, signal);
    guard();
  };
  const names = new Set();
  for (let ordinal = 0; ordinal < policy.maximumUploads; ordinal += 1) {
    guard();
    const name = physicalName({ ...scope, ordinal });
    names.add(name);
    report({ ordinal, name, disposition: "uploading" });
    try {
      const result = await adapter.upload(name, snapshot, options, {
        deadline,
        signal,
      });
      guard();
      fact(
        Number.isSafeInteger(result.id) &&
          result.id > 0 &&
          /^[a-f0-9]{64}$/u.test(result.digest),
        "Upload returned no valid finalized identity",
      );
      report({ ordinal, disposition: "uploaded" });
      return { ...result, name };
    } catch (error) {
      guard();
      const classification = classifyUploadError(error);
      report({
        ordinal,
        ...classification,
        disposition: classification.eligible ? "reconciling" : "stopped",
      });
      if (!classification.eligible) {
        throw error;
      }
      for (let probe = 0; probe < policy.visibilityProbes; probe += 1) {
        guard();
        const inventory = await adapter.list({ deadline, signal });
        guard();
        fact(
          Array.isArray(inventory) &&
            inventory.length <= policy.maximumInventory,
          "Incomplete artifact reconciliation",
        );
        const copies = inventory.filter((artifact) => names.has(artifact.name));
        if (copies.length > 0) {
          fact(
            new Set(copies.map((item) => item.name)).size === copies.length,
            "Duplicate finalized artifact identity",
          );
          copies.sort(
            (a, b) =>
              parseArtifactName(a.name).ordinal -
              parseArtifactName(b.name).ordinal,
          );
          for (const copy of copies) {
            const recovered = await adapter.inspect(copy, { deadline, signal });
            try {
              guard();
              assertSameManifest(snapshot.manifest, recovered.manifest);
            } finally {
              await recovered.dispose?.();
            }
          }
          const selected = copies[0];
          report({
            ordinal: parseArtifactName(selected.name).ordinal,
            name: selected.name,
            disposition: "reconciled",
            artifactId: selected.id,
          });
          return {
            id: selected.id,
            digest: selected.digest.replace(/^sha256:/u, ""),
            name: selected.name,
          };
        }
        if (probe + 1 < policy.visibilityProbes) {
          await wait(policy.visibilityWaitMilliseconds);
        }
      }
      fact(
        ordinal + 1 < policy.maximumUploads,
        "Artifact recovery exhausted without finalized evidence",
      );
      const [minimum, maximum] = policy.recoveryWaitMilliseconds[ordinal];
      const milliseconds = Math.floor(minimum + random() * (maximum - minimum));
      report({ ordinal, disposition: "backoff", milliseconds });
      await wait(milliseconds);
    }
  }
  throw new Error("Artifact recovery exhausted");
}

/** Retain safe identity and budget diagnostics even when cancellation aborts a guard. */
export async function retainArtifact(options) {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const deadline = options.deadline ?? started + policy.deadlineMilliseconds;
  let identity = {};
  const report = (event) => {
    if (event.name) identity = { name: event.name, ordinal: event.ordinal };
    options.report?.({
      ...identity,
      ...event,
      elapsedMilliseconds: Math.max(0, Math.floor(now() - started)),
      remainingMilliseconds: Math.max(0, Math.floor(deadline - now())),
    });
  };
  try {
    return await retainWithRecovery({ ...options, now, deadline, report });
  } catch (error) {
    report({
      disposition: options.signal?.aborted
        ? "cancelled"
        : now() >= deadline
          ? "deadline-exceeded"
          : "failed",
    });
    throw error;
  }
}
