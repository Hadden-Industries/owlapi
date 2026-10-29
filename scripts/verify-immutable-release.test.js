import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runGh,
  waitForReleaseAttestation,
  downloadAsset,
  IMMUTABLE_VERIFICATION_POLICY as policy,
} from "./verify-immutable-release.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { createRepositoryReader } from "./ci-verification-command.mjs";

test.each(["retry-after", "x-ratelimit-reset"])(
  "monotonic release reads interpret %s in wall-clock time",
  async (header) => {
    const epoch = Date.parse("2026-10-29T00:00:00Z");
    let elapsed = 100,
      calls = 0;
    const waits = [];
    const client = new GitHubReleaseClient({
      repository: "Hadden-Industries/owlapi",
      token: "token",
      now: () => elapsed,
      wallNow: () => epoch + elapsed,
      random: () => 0,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
        elapsed += milliseconds;
      },
      fetchImpl: async () =>
        ++calls === 1
          ? new Response(null, {
              status: 403,
              headers: {
                "x-ratelimit-remaining": "0",
                [header]:
                  header === "retry-after"
                    ? new Date(epoch + 5000).toUTCString()
                    : String((epoch + 5000) / 1000),
              },
            })
          : new Response('{"id":42}'),
    });
    await expect(client.read("/releases/42")).resolves.toEqual({ id: 42 });
    expect(waits).toEqual([4900]);
    expect(calls).toBe(2);
  },
);

test("cryptographic verification failure is terminal and never retried", async () => {
  let calls = 0;
  await expect(
    runGh("gh", ["release", "verify", "v0.1.0-rc.2"], "token", {
      spawn: () => {
        calls++;
        return {
          status: 1,
          stdout: "",
          stderr: "attestation signature invalid",
        };
      },
    }),
  ).rejects.toThrow("signature invalid");
  expect(calls).toBe(1);
}, 10000);

const tagSha = "a".repeat(40),
  sourceCommit = "b".repeat(40),
  digest = "c".repeat(64);

test("native verification finishing after the shared deadline cannot pass", async () => {
  let elapsed = 0;
  await expect(
    runGh("gh", ["release", "verify", "v0.1.0-rc.2"], "token", {
      now: () => elapsed,
      deadline: 50,
      spawn: () => {
        elapsed = 50;
        return { status: 0, stdout: '{"result":"pass"}' };
      },
    }),
  ).rejects.toThrow("budget exhausted");
});
const bundle = {
  attestations: [
    {
      repository_id: 1347610640,
      bundle: { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" },
    },
  ],
};
test("indexing deadline bounds the shared reader's server backoff", async () => {
  let elapsed = 0,
    waits = 0;
  const read = createRepositoryReader({
    repository: "Hadden-Industries/owlapi",
    token: "token",
    now: () => elapsed,
    budgetMs: 540_000,
    random: () => 0,
    sleep: async (ms) => {
      elapsed += ms;
      waits++;
    },
    fetchImpl: async () =>
      new Response(null, { status: 503, headers: { "retry-after": "240" } }),
  });
  await expect(
    waitForReleaseAttestation(
      {
        read,
        tag: "v0.1.0-rc.3",
        tagSha,
        sourceCommit,
        releaseId: 42,
        expectedAssets: [],
      },
      { now: () => elapsed, deadline: 180_000 },
    ),
  ).rejects.toThrow();
  expect(waits).toBe(0);
  expect(elapsed).toBe(0);
});
function observationFixture({
  pending = 0,
  mutate = () => {},
  control = bundle,
  targetValue = bundle,
} = {}) {
  let elapsed = 0,
    targetReads = 0,
    sleeps = 0;
  const paths = [];
  const request = {
    tag: "v0.1.0-rc.3",
    tagSha,
    sourceCommit,
    releaseId: 42,
    expectedAssets: [{ name: "package.tgz", bytes: 3, sha256: digest }],
  };
  request.read = async (path) => {
    paths.push(path);
    let value;
    if (path.startsWith("/git/ref/"))
      value = { object: { type: "tag", sha: tagSha } };
    else if (path.startsWith("/git/tags/"))
      value = {
        sha: tagSha,
        tag: request.tag,
        object: { type: "commit", sha: sourceCommit },
        verification: { verified: true, reason: "valid" },
      };
    else if (path.startsWith("/releases/"))
      value = {
        id: 42,
        tag_name: request.tag,
        draft: false,
        prerelease: true,
        immutable: true,
        published_at: "2026-10-29T00:00:00Z",
        assets: [{ name: "package.tgz", size: 3, digest: `sha256:${digest}` }],
      };
    else if (path.includes(policy.controlTagSha)) value = control;
    else if (path.startsWith("/attestations/")) {
      targetReads++;
      if (targetReads <= pending) {
        if (targetReads === 1)
          throw Object.assign(new Error("not indexed"), { httpStatus: 404 });
        value = { attestations: [] };
      } else value = targetValue;
    } else throw Error("Unexpected fixture path");
    value = structuredClone(value);
    mutate({ value, path, targetReads, sleeps });
    return value;
  };
  return {
    request,
    paths,
    options: {
      now: () => elapsed,
      sleep: async (ms) => {
        elapsed += ms;
        sleeps++;
      },
    },
    get sleeps() {
      return sleeps;
    },
  };
}

test("bounded 404 and empty indexing observations preserve original release identity", async () => {
  const f = observationFixture({ pending: 2 });
  const result = await waitForReleaseAttestation(f.request, f.options);
  expect(result.observations).toBe(3);
  expect(f.sleeps).toBe(2);
  expect(f.paths.filter((p) => p.includes(policy.controlTagSha))).toHaveLength(
    2,
  );
  expect(f.paths.filter((p) => p.startsWith("/git/ref/"))).toHaveLength(4);
});

test.each([
  [
    "tag retargeting",
    ({ value, path, sleeps }) => {
      if (sleeps && path.startsWith("/git/ref/"))
        value.object.sha = "d".repeat(40);
    },
  ],
  [
    "source change",
    ({ value, path }) => {
      if (path.startsWith("/git/tags/")) value.object.sha = "d".repeat(40);
    },
  ],
  [
    "invalid tag signature",
    ({ value, path }) => {
      if (path.startsWith("/git/tags/")) value.verification.verified = false;
    },
  ],
  [
    "changed release ID",
    ({ value, path }) => {
      if (path.startsWith("/releases/")) value.id = 43;
    },
  ],
  [
    "draft state",
    ({ value, path }) => {
      if (path.startsWith("/releases/")) value.draft = true;
    },
  ],
  [
    "channel state",
    ({ value, path }) => {
      if (path.startsWith("/releases/")) value.prerelease = false;
    },
  ],
  [
    "digest conflict",
    ({ value, path }) => {
      if (path.startsWith("/releases/"))
        value.assets[0].digest = `sha256:${"d".repeat(64)}`;
    },
  ],
  [
    "duplicate asset",
    ({ value, path }) => {
      if (path.startsWith("/releases/")) value.assets.push(value.assets[0]);
    },
  ],
  [
    "missing immutable state",
    ({ value, path }) => {
      if (path.startsWith("/releases/")) delete value.immutable;
    },
  ],
  [
    "immutable state reverted",
    ({ value, path, sleeps }) => {
      if (sleeps && path.startsWith("/releases/")) value.immutable = false;
    },
  ],
])("indexing fails closed for %s", async (_label, mutate) => {
  const f = observationFixture({ pending: 1, mutate });
  await expect(
    waitForReleaseAttestation(f.request, f.options),
  ).rejects.toThrow();
  expect(f.sleeps).toBeLessThanOrEqual(1);
});

test.each([
  {},
  { attestations: {} },
  { attestations: [{ repository_id: 99, bundle: {} }] },
  { attestations: [{ repository_id: 1347610640, bundle: [] }] },
  {
    attestations: [
      { repository_id: 1347610640, bundle_url: "http://example.com/proof" },
    ],
  },
  { attestations: [{ repository_id: 1347610640 }] },
])(
  "malformed attestation inventory is not a pending state: %p",
  async (targetValue) => {
    const f = observationFixture({ targetValue });
    await expect(
      waitForReleaseAttestation(f.request, f.options),
    ).rejects.toThrow();
    expect(f.sleeps).toBe(0);
  },
);

test("absent positive control prevents waiting, even when contents are readable", async () => {
  const f = observationFixture({ pending: 1, control: { attestations: [] } });
  await expect(waitForReleaseAttestation(f.request, f.options)).rejects.toThrow(
    "access control",
  );
  expect(f.sleeps).toBe(0);
});

test("indexing obeys one finite deadline", async () => {
  const f = observationFixture({ pending: 100 });
  await expect(
    waitForReleaseAttestation(f.request, { ...f.options, deadline: 30001 }),
  ).rejects.toThrow("budget");
  expect(f.sleeps).toBe(2);
});

test.each([401, 403])(
  "release client stops immediately on HTTP %s",
  async (status) => {
    let calls = 0;
    const client = new GitHubReleaseClient({
      repository: "Hadden-Industries/owlapi",
      token: "secret",
      fetchImpl: async () => {
        calls++;
        return new Response("{}", { status });
      },
    });
    await expect(
      client.read("/releases/tags/v0.1.0-rc.2"),
    ).rejects.toMatchObject({ httpStatus: status });
    expect(calls).toBe(1);
  },
);

test("release client does not retry malformed JSON", async () => {
  let calls = 0;
  const client = new GitHubReleaseClient({
    repository: "Hadden-Industries/owlapi",
    token: "secret",
    fetchImpl: async () => {
      calls++;
      return new Response("{");
    },
  });
  await expect(client.read("/releases/tags/v0.1.0-rc.2")).rejects.toThrow();
  expect(calls).toBe(1);
});

test.each([
  "/immutable-releases",
  "/deployments/42",
  "/deployments/42/statuses",
  "/releases?per_page=100&page=1",
])("bounded release reader retains existing recovery path %s", async (path) => {
  const client = new GitHubReleaseClient({
    repository: "Hadden-Industries/owlapi",
    token: "secret",
    fetchImpl: async () => new Response('{"present":true}'),
  });
  await expect(client.read(path)).resolves.toEqual({ present: true });
});

test.each([
  { budgetMs: Infinity },
  { budgetMs: 600001 },
  { requestLimit: 0 },
  { requestLimit: 257 },
  { deadline: NaN },
])("bounded release reader rejects invalid limits %p", async (options) => {
  const client = new GitHubReleaseClient({
    repository: "Hadden-Industries/owlapi",
    token: "secret",
    ...options,
    fetchImpl: () => {
      throw Error("network must not run");
    },
  });
  await expect(client.read("/releases/tags/v0.1.0-rc.2")).rejects.toThrow(
    "budget",
  );
});

test.each([
  ["oversized", "abcd"],
  ["truncated", "ab"],
])("asset download rejects %s bytes before writing", async (_label, body) => {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-asset-limit-"));
  try {
    await expect(
      downloadAsset({
        repository: "Hadden-Industries/owlapi",
        token: "secret",
        asset: { id: 1, name: "package.tgz", size: 3 },
        directory,
        fetchImpl: async () => new Response(body),
      }),
    ).rejects.toThrow();
    expect(existsSync(join(directory, "package.tgz"))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("asset redirect authenticates only the API and writes exact bounded bytes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-asset-limit-"));
  const requests = [];
  try {
    const path = await downloadAsset({
      repository: "Hadden-Industries/owlapi",
      token: "secret",
      asset: { id: 1, name: "package.tgz", size: 3 },
      directory,
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options });
        return requests.length === 1
          ? new Response(null, {
              status: 302,
              headers: {
                location:
                  "https://release-assets.githubusercontent.com/asset?signature=fixture",
              },
            })
          : new Response("abc");
      },
    });
    expect(readFileSync(path, "utf8")).toBe("abc");
    expect(requests[0].options.headers.Authorization).toBe("Bearer secret");
    expect(requests[1].options.headers).toBeUndefined();
    expect(requests[1].options.redirect).toBe("error");
    expect(requests[1].options.signal).toBe(requests[0].options.signal);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an unapproved asset redirect is terminal", async () => {
  let calls = 0;
  await expect(
    downloadAsset({
      repository: "Hadden-Industries/owlapi",
      token: "secret",
      asset: { id: 1, name: "package.tgz", size: 3 },
      directory: tmpdir(),
      fetchImpl: async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/asset" },
        });
      },
    }),
  ).rejects.toThrow("storage origin");
  expect(calls).toBe(1);
});
