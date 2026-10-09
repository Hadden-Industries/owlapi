import {
  CONSUMER_SOURCE_SCOPES,
  captureConsumerSources,
  createConsumerSourceReader,
  assertReviewedConsumerSources,
  sourceFingerprint,
} from "./consumer-source-snapshot.mjs";
import { REVIEWED_CONSUMER_SOURCES } from "./owl-contract-evidence.mjs";
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Synthetic native API trees exercise acquisition; reviewed blobs are unchanged. */
const fixture = () => {
  const records = new Map();
  let nextTree = 10;
  for (const [index, scope] of CONSUMER_SOURCE_SCOPES.entries()) {
    const baseline = REVIEWED_CONSUMER_SOURCES.snapshots[index];
    const commit = baseline.commit;
    const root = {
      sha: baseline.tree,
      truncated: false,
      tree: [],
    };
    records.set(`${scope.repository}:`, {
      full_name: scope.repository,
      private: false,
      default_branch: "main",
    });
    records.set(`${scope.repository}:/git/ref/heads/main`, {
      ref: "refs/heads/main",
      object: { type: "commit", sha: "f".repeat(40) },
    });
    records.set(`${scope.repository}:/git/commits/${commit}`, {
      sha: commit,
      tree: { sha: root.sha },
    });
    records.set(`${scope.repository}:/git/commits/${"f".repeat(40)}`, {
      sha: "f".repeat(40),
      tree: { sha: root.sha },
    });
    records.set(`${scope.repository}:/git/trees/${root.sha}`, root);
    for (const source of baseline.sources) {
      let parent = root;
      const parts = source.path.split("/");
      for (const part of parts.slice(0, -1)) {
        let entry = parent.tree.find((row) => row.path === part);
        if (!entry) {
          const child = {
            sha: (++nextTree).toString(16).padStart(40, "0"),
            truncated: false,
            tree: [],
          };
          entry = { path: part, type: "tree", mode: "040000", sha: child.sha };
          parent.tree.push(entry);
          records.set(`${scope.repository}:/git/trees/${child.sha}`, child);
        }
        parent = records.get(`${scope.repository}:/git/trees/${entry.sha}`);
      }
      parent.tree.push({
        path: parts.at(-1),
        type: "blob",
        mode: "100644",
        sha: source.blob,
      });
    }
  }
  const requests = [];
  return {
    records,
    requests,
    read: async (repository, path) => {
      requests.push(`${repository}:${path}`);
      const value = records.get(`${repository}:${path}`);
      if (!value) throw new Error("Unregistered API read");
      return clone(value);
    },
  };
};
test("captures the configured commits even when consumer heads have advanced", async () => {
  const input = fixture();
  const actual = await captureConsumerSources(input);
  expect(assertReviewedConsumerSources(actual, REVIEWED_CONSUMER_SOURCES)).toBe(
    actual,
  );
  for (const snapshot of REVIEWED_CONSUMER_SOURCES.snapshots)
    expect(
      input.requests.filter(
        (path) =>
          path === `${snapshot.repository}:/git/commits/${snapshot.commit}`,
      ),
    ).toHaveLength(1);
  expect(input.requests.some((path) => path.includes("/git/ref/"))).toBe(false);
  expect(input.requests.length).toBeLessThanOrEqual(32);
  expect(actual).toEqual(REVIEWED_CONSUMER_SOURCES);
});

test.each(["commit", "tree", "defaultBranch"])(
  "rejects evidence for a different pinned %s even with identical interface blobs",
  (field) => {
    const actual = clone(REVIEWED_CONSUMER_SOURCES);
    actual.snapshots[0][field] =
      field === "defaultBranch" ? "other" : "f".repeat(40);
    expect(() =>
      assertReviewedConsumerSources(actual, REVIEWED_CONSUMER_SOURCES),
    ).toThrow(/pin/iu);
  },
);
test.each([
  "truncated",
  "missing",
  "symlink",
  "new directory",
  "wrong commit",
  "wrong tree",
  "wrong blob",
  "unavailable pin",
])("rejects incomplete or substituted pinned source: %s", async (fault) => {
  const input = fixture();
  const trees = [...input.records.values()].filter((row) =>
    Array.isArray(row.tree),
  );
  if (fault === "truncated") trees[0].truncated = true;
  if (fault === "missing") trees[0].tree = [];
  if (fault === "symlink")
    trees[0].tree.find((entry) => entry.path === "package.json").mode =
      "120000";
  if (fault === "new directory")
    trees
      .find((tree) =>
        tree.tree.some((entry) => entry.path === "atomicOntologyWriter.js"),
      )
      .tree.push({
        path: "new-adapter",
        type: "tree",
        mode: "040000",
        sha: "a".repeat(40),
      });
  if (fault === "wrong commit")
    [...input.records.values()].find((row) => row.tree?.sha).sha = "f".repeat(
      40,
    );
  if (fault === "wrong tree") {
    [...input.records.values()].find((row) => row.tree?.sha).tree.sha =
      "f".repeat(40);
    input.records.set(
      `${CONSUMER_SOURCE_SCOPES[0].repository}:/git/trees/${"f".repeat(40)}`,
      {
        ...clone(trees[0]),
        sha: "f".repeat(40),
      },
    );
  }
  if (fault === "wrong blob")
    trees[0].tree.find((entry) => entry.path === "package.json").sha =
      "f".repeat(40);
  if (fault === "unavailable pin") {
    const pinned = REVIEWED_CONSUMER_SOURCES.snapshots[0];
    input.records.delete(`${pinned.repository}:/git/commits/${pinned.commit}`);
  }
  await expect(captureConsumerSources(input)).rejects.toThrow(
    ["wrong commit", "wrong tree"].includes(fault) ? /pin/iu : undefined,
  );
  expect(input.requests.some((path) => path.includes("/git/ref/"))).toBe(false);
});
test.each(["changed", "new", "missing", "extra"])(
  "requires inventory review for source %s",
  (fault) => {
    const actual = clone(REVIEWED_CONSUMER_SOURCES);
    if (fault === "changed")
      actual.snapshots[0].sources[0].blob = "f".repeat(40);
    if (fault === "new")
      actual.snapshots[0].sources.push({
        path: "scripts/ontology/new.js",
        blob: "f".repeat(40),
      });
    if (fault === "missing") actual.snapshots[0].sources.pop();
    if (fault === "extra") actual.snapshots[0].unreviewed = "PASS";
    actual.snapshots[0].sourceSha256 = sourceFingerprint(
      actual.snapshots[0].sources,
    );
    expect(() =>
      assertReviewedConsumerSources(actual, REVIEWED_CONSUMER_SOURCES),
    ).toThrow();
  },
);
test("transport never sends its read credential to caller-selected URLs or redirects", async () => {
  const calls = [];
  const read = createConsumerSourceReader({
    token: "test-only-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response("{}", { status: 200 });
    },
  });
  await expect(read("outside/repository", "")).rejects.toThrow(/Unexpected/);
  await expect(
    read(CONSUMER_SOURCE_SCOPES[0].repository, "/actions/artifacts/1"),
  ).rejects.toThrow(/Unexpected/);
  await expect(
    read(CONSUMER_SOURCE_SCOPES[0].repository, "/git/ref/heads/main"),
  ).rejects.toThrow(/Unexpected/);
  expect(calls).toHaveLength(0);
  await read(CONSUMER_SOURCE_SCOPES[0].repository, "");
  expect(calls[0].url).toBe(
    "https://api.github.com/repos/Hadden-Industries/universal-ontology",
  );
  expect(calls[0].options.redirect).toBe("error");
});
test("transport rejects exhausted requests, oversized and malformed responses", async () => {
  const repository = CONSUMER_SOURCE_SCOPES[0].repository;
  const read = createConsumerSourceReader({
    token: "",
    fetchImpl: async () => new Response("{}"),
  });
  for (let index = 0; index < 32; index++) await read(repository, "");
  await expect(read(repository, "")).rejects.toThrow(/budget/);
  await expect(
    createConsumerSourceReader({ token: "", deadline: 0 })(repository, ""),
  ).rejects.toThrow(/budget/);
  await expect(
    createConsumerSourceReader({
      token: "",
      fetchImpl: async () => new Response("x".repeat(4 * 1024 * 1024 + 1)),
    })(repository, ""),
  ).rejects.toThrow(/bounds/);
  await expect(
    createConsumerSourceReader({
      token: "",
      fetchImpl: async () => new Response(new Uint8Array([255])),
    })(repository, ""),
  ).rejects.toThrow();
});
