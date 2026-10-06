/** Capture committed consumer interfaces without installing or executing consumer code. */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const CONSUMER_SOURCE_SCOPES = Object.freeze([
  {
    repository: "Hadden-Industries/universal-ontology",
    directories: ["scripts/ontology"],
    files: [
      "package.json",
      "scripts/materializeImportClosure.js",
      "scripts/qualifyImportClosure.js",
      "scripts/build/fullOntologyAssets.js",
    ],
  },
  {
    repository: "Hadden-Industries/webvowl",
    directories: ["packages/vowl/src/owl"],
    files: [
      "package.json",
      "packages/vowl/package.json",
      "src/app/js/controller/canonicalVowlSourceAcquisition.js",
      "src/app/js/controller/importResolver.js",
      "src/app/js/ui/canonicalInputSelection.js",
      "src/app/js/webmcp/webMcpToolContracts.js",
    ],
  },
]);
export const sourceFingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sha = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
const closed = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());

/** Native JSON transport: fixed public repositories, optional read token, no redirects or archive extraction. */
export const createConsumerSourceReader = ({
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
  deadline = Date.now() + 60000,
} = {}) => {
  let requests = 0;
  let bytes = 0;
  return async (repository, path) => {
    if (
      !CONSUMER_SOURCE_SCOPES.some(
        (scope) => scope.repository === repository,
      ) ||
      !/^(?:|\/git\/(?:ref\/heads\/[A-Za-z0-9_./%-]+|commits\/[a-f0-9]{40}|trees\/[a-f0-9]{40}))$/u.test(
        path,
      ) ||
      path.includes("..")
    )
      throw new Error("Unexpected consumer source lookup.");
    const remaining = deadline - Date.now();
    if (++requests > 32 || remaining <= 0)
      throw new Error("Consumer source lookup budget exhausted.");
    // The fixed GitHub API origin accepts the workflow's read token for public sources;
    // no consumer code or caller-selected URL can receive it.
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}${path}`,
      {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(10000, remaining)),
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!response.ok)
      throw new Error(
        `Consumer source lookup returned HTTP ${response.status}.`,
      );
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      bytes += chunk.length;
      if (length > 4 * 1024 * 1024 || bytes > 16 * 1024 * 1024)
        throw new Error("Consumer source response exceeds bounds.");
      chunks.push(chunk);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  };
};

/** Freeze default-branch HEAD once; all subsequent tree reads bind that committed snapshot. */
export const captureConsumerSources = async ({
  read = createConsumerSourceReader(),
} = {}) => {
  const snapshots = [];
  for (const scope of CONSUMER_SOURCE_SCOPES) {
    const metadata = await read(scope.repository, "");
    if (
      metadata.full_name !== scope.repository ||
      metadata.private !== false ||
      typeof metadata.default_branch !== "string" ||
      !/^[A-Za-z0-9_./-]+$/u.test(metadata.default_branch)
    )
      throw new Error("Invalid consumer default-branch metadata.");
    const ref = await read(
      scope.repository,
      `/git/ref/heads/${encodeURIComponent(metadata.default_branch)}`,
    );
    if (
      ref.ref !== `refs/heads/${metadata.default_branch}` ||
      ref.object?.type !== "commit" ||
      !sha(ref.object.sha)
    )
      throw new Error("Invalid consumer branch identity.");
    const commit = await read(
      scope.repository,
      `/git/commits/${ref.object.sha}`,
    );
    if (commit.sha !== ref.object.sha || !sha(commit.tree?.sha))
      throw new Error("Invalid consumer commit tree.");
    const trees = new Map();
    const tree = async (identity) => {
      if (!trees.has(identity)) {
        const result = await read(scope.repository, `/git/trees/${identity}`);
        if (
          result.sha !== identity ||
          result.truncated !== false ||
          !Array.isArray(result.tree) ||
          result.tree.length > 10000
        )
          throw new Error("Consumer source tree is incomplete.");
        const names = new Set();
        for (const entry of result.tree) {
          if (
            typeof entry.path !== "string" ||
            entry.path.includes("/") ||
            [".", ".."].includes(entry.path) ||
            names.has(entry.path) ||
            !sha(entry.sha)
          )
            throw new Error("Invalid consumer source tree entry.");
          names.add(entry.path);
        }
        trees.set(identity, result.tree);
      }
      return trees.get(identity);
    };
    const entryAt = async (path) => {
      let identity = commit.tree.sha;
      const parts = path.split("/");
      for (const [index, part] of parts.entries()) {
        const entry = (await tree(identity)).find((item) => item.path === part);
        if (
          !entry ||
          (index < parts.length - 1 &&
            (entry.type !== "tree" || entry.mode !== "040000"))
        )
          throw new Error(`Consumer source path is absent: ${path}`);
        if (index === parts.length - 1) return entry;
        identity = entry.sha;
      }
    };
    const sources = [];
    const addBlob = (path, entry) => {
      if (entry.type !== "blob" || entry.mode !== "100644")
        throw new Error(`Consumer source is not an ordinary file: ${path}`);
      sources.push({ path, blob: entry.sha });
    };
    for (const path of scope.files) addBlob(path, await entryAt(path));
    for (const directory of scope.directories) {
      const entry = await entryAt(directory);
      if (entry.type !== "tree" || entry.mode !== "040000")
        throw new Error("Consumer source directory is invalid.");
      for (const file of await tree(entry.sha)) {
        // New subdirectories need review too: they can introduce a previously uninventoried adapter.
        if (file.type === "tree")
          throw new Error(
            "CONTRACT_INVENTORY_CHANGED: new consumer interface directory.",
          );
        if (/\.(?:[cm]?js|tsx?)$/u.test(file.path))
          addBlob(`${directory}/${file.path}`, file);
      }
    }
    sources.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    snapshots.push({
      repository: scope.repository,
      defaultBranch: metadata.default_branch,
      commit: commit.sha,
      tree: commit.tree.sha,
      sources,
      sourceSha256: sourceFingerprint(sources),
    });
  }
  return { schemaVersion: 1, snapshots };
};

/** Reviewed blob identities conservatively reject changed code; no consumer oracle is synthesized. */
export const assertReviewedConsumerSources = (captured, reviewed) => {
  if (
    ![captured, reviewed].every(
      (record) =>
        closed(record, ["schemaVersion", "snapshots"]) &&
        record.schemaVersion === 1 &&
        Array.isArray(record.snapshots) &&
        record.snapshots.length === CONSUMER_SOURCE_SCOPES.length,
    )
  )
    throw new Error("Invalid consumer source snapshot schema.");
  for (const [index, scope] of CONSUMER_SOURCE_SCOPES.entries()) {
    const snapshot = captured.snapshots[index];
    const baseline = reviewed.snapshots[index];
    if (
      ![snapshot, baseline].every(
        (row) =>
          closed(row, [
            "repository",
            "defaultBranch",
            "commit",
            "tree",
            "sources",
            "sourceSha256",
          ]) &&
          row.repository === scope.repository &&
          /^[A-Za-z0-9_./-]+$/u.test(row.defaultBranch) &&
          !row.defaultBranch.includes("..") &&
          sha(row.commit) &&
          sha(row.tree) &&
          Array.isArray(row.sources) &&
          row.sources.length > 0 &&
          row.sources.length <= 400 &&
          row.sources.every(
            (source) =>
              closed(source, ["path", "blob"]) &&
              typeof source.path === "string" &&
              !source.path.includes("..") &&
              sha(source.blob),
          ) &&
          row.sourceSha256 === sourceFingerprint(row.sources),
      )
    )
      throw new Error("Invalid committed consumer source binding.");
    if (!isDeepStrictEqual(snapshot.sources, baseline.sources))
      throw new Error(
        "CONTRACT_INVENTORY_CHANGED: reviewed consumer interface sources changed.",
      );
  }
  return captured;
};
