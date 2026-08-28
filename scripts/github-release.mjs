const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

export const assertDraftRelease = (release, { tag }) => {
  // GitHub documents target_commitish as unused once the tag exists, so the
  // independently verified signed tag—not this display field—binds the commit.
  if (release?.draft !== true || release.tag_name !== tag) {
    throw new Error(
      "The observed GitHub release is not the exact draft at the accepted tag.",
    );
  }
  return { id: release.id, url: release.html_url };
};

export const assertPublishedRelease = (
  release,
  { tag, requireImmutable = false },
) => {
  if (
    release?.draft !== false ||
    release.prerelease !== true ||
    release.tag_name !== tag ||
    !release.published_at ||
    (requireImmutable && release.immutable !== true)
  ) {
    throw new Error(
      "The observed GitHub release is not the exact published immutable prerelease.",
    );
  }
  return {
    id: release.id,
    immutable: release.immutable === true,
    publishedAt: release.published_at,
    url: release.html_url,
  };
};

export const assertReleaseAssetSubset = ({ assets, expected }) => {
  const expectedByName = new Map(expected.map((asset) => [asset.name, asset]));
  if (expectedByName.size !== expected.length) {
    throw new Error("The expected GitHub asset inventory contains duplicates.");
  }
  const observedNames = new Set();
  for (const asset of assets) {
    const required = expectedByName.get(asset.name);
    if (
      !required ||
      observedNames.has(asset.name) ||
      asset.size !== required.bytes ||
      asset.digest !== `sha256:${required.sha256}`
    ) {
      throw new Error(
        "The draft contains an unexpected or conflicting GitHub release asset.",
      );
    }
    observedNames.add(asset.name);
  }
  return assets;
};

export const assertReleaseAssets = ({ assets, expected }) => {
  assertReleaseAssetSubset({ assets, expected });
  const observed = [...assets]
    .map(({ name, size, digest }) => ({ name, bytes: size, digest }))
    .sort((left, right) => compareCodeUnits(left.name, right.name));
  const required = [...expected]
    .map(({ name, bytes, sha256 }) => ({
      name,
      bytes,
      digest: `sha256:${sha256}`,
    }))
    .sort((left, right) => compareCodeUnits(left.name, right.name));
  if (JSON.stringify(observed) !== JSON.stringify(required)) {
    throw new Error(
      "The GitHub release asset inventory or digest is not exact.",
    );
  }
  return observed;
};

export const classifyWriteReconciliation = ({ writeResult, observed }) => {
  if (writeResult !== "AMBIGUOUS") {
    throw new Error("Only an ambiguous write may enter reconciliation.");
  }
  return observed?.matchesExactIntent
    ? "ACCEPT_RECONCILED_WRITE"
    : "FAIL_CLOSED";
};

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export class GitHubReleaseClient {
  constructor({ repository, token }) {
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? "") ||
      !token
    ) {
      throw new Error(
        "GitHub release operations require a repository and token.",
      );
    }
    this.repository = repository;
    this.token = token;
    this.apiRoot = `https://api.github.com/repos/${repository}`;
    this.uploadRoot = `https://uploads.github.com/repos/${repository}`;
  }

  headers(extra = {}) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2026-03-10",
      ...extra,
    };
  }

  async read(path, { accept404 = false } = {}) {
    if (!path.startsWith("/")) {
      throw new Error("GitHub reads must use a repository-relative API path.");
    }
    const url = `${this.apiRoot}${path}`;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: this.headers({ "Cache-Control": "no-cache" }),
        });
        if (accept404 && response.status === 404) {
          return null;
        }
        if (response.ok) {
          return response.json();
        }
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`GitHub read returned HTTP ${response.status}.`);
        }
        lastError = new Error(`GitHub read returned HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < 3) {
        await sleep(attempt * 1000);
      }
    }
    throw lastError;
  }

  /**
   * External writes are attempted exactly once. Transport failures and retryable
   * HTTP results are deliberately reported as ambiguous so the caller can only
   * reconcile through a read; this method never retries a mutation.
   */
  async write(path, { method, body, headers = {}, upload = false }) {
    if (!path.startsWith("/")) {
      throw new Error("GitHub writes must use a repository-relative API path.");
    }
    const url = `${upload ? this.uploadRoot : this.apiRoot}${path}`;
    try {
      const response = await fetch(url, {
        method,
        headers: this.headers(headers),
        body,
      });
      if (response.ok) {
        return {
          state: "CONFIRMED",
          value: response.status === 204 ? null : await response.json(),
        };
      }
      if (response.status >= 500 || [408, 425, 429].includes(response.status)) {
        return { state: "AMBIGUOUS", status: response.status };
      }
      throw new Error(`GitHub write returned HTTP ${response.status}.`);
    } catch (error) {
      if (/GitHub write returned HTTP/u.test(error.message)) {
        throw error;
      }
      return { state: "AMBIGUOUS", error: error.message };
    }
  }

  getReleaseByTag(tag) {
    return this.read(`/releases/tags/${encodeURIComponent(tag)}`, {
      accept404: true,
    });
  }

  listAssets(releaseId) {
    return this.read(`/releases/${releaseId}/assets?per_page=100`);
  }
}
