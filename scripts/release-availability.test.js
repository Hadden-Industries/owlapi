import { jest } from "@jest/globals";
import { createHash } from "node:crypto";
import {
  availabilityPolicy,
  AvailabilityIncompleteError,
  waitForReleaseAvailability,
} from "./release-availability.mjs";
import { RegistryReadError } from "./public-registry-read.mjs";

const tarball = Buffer.from("exact approved tarball");
const retainedSha256 = createHash("sha256").update(tarball).digest("hex");
const version = "0.1.0-rc.2";
const metadata = {
  name: "@hadden-industries/owlapi",
  version,
  dist: {
    tarball: `https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-${version}.tgz`,
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
  },
};
const encode = (value) => Buffer.from(JSON.stringify(value));
const harness = (respond) => {
  let clock = 0;
  const observations = [];
  const read = jest.fn(async (url, options) =>
    respond(String(url), options, clock),
  );
  const sleep = jest.fn(async (ms) => {
    clock += ms;
  });
  return {
    read,
    sleep,
    observations,
    now: () => clock,
    advance: (ms) => {
      clock += ms;
    },
    run: (policy = availabilityPolicy) =>
      waitForReleaseAvailability({
        retainedSha256,
        read,
        sleep,
        now: () => clock,
        observe: (item) => observations.push(item),
        policy,
      }),
  };
};
const available = (url) =>
  url.includes("dist-tags")
    ? encode({ next: version, latest: version })
    : url.endsWith(".tgz")
      ? tarball
      : encode(metadata);

test("returns immediately when exact metadata, bytes and channels are visible", async () => {
  const h = harness(available);
  expect(await h.run()).toMatchObject({ tarball, metadata });
  expect(h.sleep).not.toHaveBeenCalled();
  expect(h.observations).toEqual([
    {
      state: "REGISTRY_AVAILABLE",
      stage: "channels",
      attempt: 1,
      elapsedMs: 0,
    },
  ]);
  expect(
    h.read.mock.calls.every(
      ([, options]) => options.attempts === 1 && options.timeoutMs === 60000,
    ),
  ).toBe(true);
});

test("rejects metadata pointing at another version before accepting its 404 as pending", async () => {
  const h = harness(() =>
    encode({
      ...metadata,
      dist: {
        ...metadata.dist,
        tarball: metadata.dist.tarball.replace(version, "0.1.0-rc.1"),
      },
    }),
  );
  await expect(h.run()).rejects.toThrow("different version");
  expect(h.read).toHaveBeenCalledTimes(1);
  expect(h.sleep).not.toHaveBeenCalled();
});

test("waits through a thirteen-minute exact-release 404 delay and completes early", async () => {
  const h = harness((url, _options, time) => {
    if (time < 13 * 60000)
      throw new RegistryReadError("not visible", { status: 404 });
    return available(url);
  });
  await h.run();
  expect(h.now()).toBe(13 * 60000);
  expect(
    h.observations.filter(({ state }) => state === "AVAILABILITY_PENDING"),
  ).toHaveLength(13);
  expect(h.read).toHaveBeenCalledTimes(16);
});

test("bounds endless absence to one thirty-minute budget and reports read-only recovery", async () => {
  const h = harness(() => {
    throw new RegistryReadError("not visible", { status: 404 });
  });
  await expect(h.run()).rejects.toThrow(
    /reads only.*Do not repeat publication/u,
  );
  expect(h.now()).toBe(1800000);
  expect(h.read).toHaveBeenCalledTimes(30);
  expect(h.observations.at(-1)).toMatchObject({
    state: "AVAILABILITY_PENDING",
    stage: "metadata",
  });
});

test.each([401, 403, 400])(
  "fails HTTP %i without an availability wait",
  async (status) => {
    const h = harness(() => {
      throw new RegistryReadError("authorization or request failure", {
        status,
      });
    });
    await expect(h.run()).rejects.toThrow("authorization or request failure");
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(h.sleep).not.toHaveBeenCalled();
  },
);

test("waits for absent and explicitly accepted prior channels only", async () => {
  const h = harness((url, _options, clock) =>
    url.includes("dist-tags") && clock === 0
      ? encode({ next: "0.1.0-rc.1" })
      : available(url),
  );
  await h.run();
  expect(h.now()).toBe(60000);
  expect(h.observations[0]).toMatchObject({
    stage: "channels",
    reason: "CHANNELS_PENDING",
  });
});

test.each([
  [
    "metadata identity",
    (url) =>
      url.endsWith(".tgz")
        ? tarball
        : encode({ ...metadata, name: "attacker" }),
  ],
  ["malformed JSON", () => Buffer.from("{broken")],
  [
    "wrong bytes before pending channels",
    (url) =>
      url.endsWith(".tgz")
        ? Buffer.from("wrong")
        : url.includes("dist-tags")
          ? encode({})
          : encode(metadata),
  ],
  [
    "wrong integrity",
    () =>
      encode({
        ...metadata,
        dist: { ...metadata.dist, integrity: "sha512-d3Jvbmc=" },
      }),
  ],
  [
    "channel conflict",
    (url) =>
      url.includes("dist-tags")
        ? encode({ next: version, latest: "99.0.0" })
        : available(url),
  ],
  [
    "malformed channels",
    (url) => (url.includes("dist-tags") ? encode([]) : available(url)),
  ],
])("fails %s immediately", async (_label, respond) => {
  const h = harness(respond);
  await expect(h.run()).rejects.toThrow();
  expect(h.sleep).not.toHaveBeenCalled();
});

test("retries transient reads without extending the monotonic request deadline", async () => {
  let remaining = 65000;
  const h = harness((_url, options) => {
    expect(options.timeoutMs).toBeLessThanOrEqual(remaining);
    h.advance(options.timeoutMs);
    remaining -= options.timeoutMs;
    throw new RegistryReadError("timeout");
  });
  await expect(
    h.run({ ...availabilityPolicy, deadlineMs: 65000 }),
  ).rejects.toBeInstanceOf(AvailabilityIncompleteError);
  expect(h.now()).toBe(65000);
});

test("honors bounded Retry-After for transient responses", async () => {
  const h = harness((url, _options, time) => {
    if (!time)
      throw new RegistryReadError("busy", { status: 429, retryAfterMs: 60000 });
    return available(url);
  });
  await h.run({ ...availabilityPolicy, intervalMs: 1000 });
  expect(h.sleep).toHaveBeenCalledWith(60000);
});

test("does not admit another coordinate or an unbounded policy", async () => {
  for (const policy of [
    { ...availabilityPolicy, coordinate: "other@1" },
    { ...availabilityPolicy, deadlineMs: Infinity },
    { ...availabilityPolicy, publicationReplay: true },
  ]) {
    const h = harness(available);
    await expect(h.run(policy)).rejects.toThrow("policy");
    expect(h.read).not.toHaveBeenCalled();
  }
});
