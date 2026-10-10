import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";
import {
  readPublicRegistry,
  RegistryReadError,
} from "./public-registry-read.mjs";

export const availabilityPolicy = JSON.parse(
  readFileSync(
    new URL("../docs/release/availability-policy.json", import.meta.url),
    "utf8",
  ),
);

export class AvailabilityIncompleteError extends Error {
  constructor(stage) {
    super(
      `Availability incomplete at ${stage}; preserve this report and recover through reads only. Do not repeat publication or channel writes. Inspect npm publication status or contact npm support.`,
    );
    this.code = "AVAILABILITY_INCOMPLETE";
  }
}

/** Only read the submitted coordinate; available bytes are validated before waiting for channels. */
export const waitForReleaseAvailability = async ({
  retainedSha256,
  read = readPublicRegistry,
  now = () => performance.now(),
  sleep = delay,
  observe = () => {},
  policy = availabilityPolicy,
}) => {
  const coordinate = `${PACKAGE_NAME}@${PACKAGE_VERSION}`;
  if (
    policy.schemaVersion !== 1 ||
    policy.coordinate !== coordinate ||
    !/^[0-9a-f]{64}$/u.test(retainedSha256 ?? "") ||
    typeof policy.previousVersion !== "string" ||
    policy.previousVersion === PACKAGE_VERSION ||
    ![policy.deadlineMs, policy.intervalMs, policy.requestTimeoutMs].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ) ||
    policy.deadlineMs > 1800000 ||
    policy.intervalMs > 60000 ||
    policy.intervalMs < 1000 ||
    policy.requestTimeoutMs > 60000 ||
    policy.publicationReplay !== false
  ) {
    throw new Error(
      "Release availability policy does not bind the exact submitted coordinate and bounded read budget.",
    );
  }
  const started = now();
  const deadline = started + policy.deadlineMs;
  let stage = "metadata",
    attempt = 0;
  const remaining = () => deadline - now();
  const get = async (url) => {
    if (remaining() <= 0) throw new AvailabilityIncompleteError(stage);
    const bytes = await read(url, {
      attempts: 1,
      timeoutMs: Math.min(policy.requestTimeoutMs, remaining()),
    });
    if (remaining() <= 0) throw new AvailabilityIncompleteError(stage);
    return bytes;
  };
  const json = async (path) => {
    const url = new URL(path, "https://registry.npmjs.org/");
    url.searchParams.set("owlapi-read", `${Date.now()}-${attempt}`);
    return JSON.parse((await get(url)).toString("utf8"));
  };
  while (remaining() > 0) {
    attempt += 1;
    let reason,
      retryAfterMs = 0;
    try {
      stage = "metadata";
      const metadata = await json(
        `${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(PACKAGE_VERSION)}`,
      );
      if (
        metadata?.name !== PACKAGE_NAME ||
        metadata.version !== PACKAGE_VERSION ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(metadata.dist?.integrity ?? "")
      )
        throw new Error(
          "Available registry metadata has incorrect identity or integrity.",
        );
      const tarballUrl = assertRegistryTarballUrl(metadata.dist?.tarball);
      if (
        new URL(tarballUrl).pathname !==
        `/${PACKAGE_NAME}/-/owlapi-${PACKAGE_VERSION}.tgz`
      )
        throw new Error(
          "Available registry tarball identifies a different version.",
        );
      stage = "tarball";
      const tarball = await get(tarballUrl);
      if (
        createHash("sha256").update(tarball).digest("hex") !== retainedSha256 ||
        `sha512-${createHash("sha512").update(tarball).digest("base64")}` !==
          metadata.dist.integrity
      )
        throw new Error(
          "Available registry bytes differ from the approved candidate or integrity.",
        );
      stage = "channels";
      const distTags = await json(
        `-/package/${encodeURIComponent(PACKAGE_NAME)}/dist-tags`,
      );
      if (!distTags || typeof distTags !== "object" || Array.isArray(distTags))
        throw new Error("Registry channel metadata is malformed.");
      for (const channel of ["next", "latest"]) {
        if (
          distTags[channel] !== undefined &&
          distTags[channel] !== PACKAGE_VERSION &&
          distTags[channel] !== policy.previousVersion
        )
          throw new Error(
            `Registry ${channel} channel conflicts with the submitted release and accepted predecessor.`,
          );
      }
      if (
        distTags.next === PACKAGE_VERSION &&
        distTags.latest === PACKAGE_VERSION
      ) {
        observe({
          state: "REGISTRY_AVAILABLE",
          stage,
          attempt,
          elapsedMs: Math.ceil(now() - started),
        });
        return { metadata, distTags, tarball };
      }
      reason = "CHANNELS_PENDING";
    } catch (error) {
      if (error instanceof AvailabilityIncompleteError) throw error;
      if (
        !(error instanceof RegistryReadError) ||
        (!error.transient && error.status !== 404)
      )
        throw error;
      reason =
        error.status === 404 ? "EXACT_RELEASE_NOT_VISIBLE" : "TRANSIENT_READ";
      retryAfterMs = error.retryAfterMs;
    }
    observe({
      state: "AVAILABILITY_PENDING",
      stage,
      reason,
      attempt,
      elapsedMs: Math.ceil(now() - started),
    });
    if (remaining() <= 0) break;
    await sleep(
      Math.min(remaining(), Math.max(policy.intervalMs, retryAfterMs)),
    );
  }
  throw new AvailabilityIncompleteError(stage);
};
