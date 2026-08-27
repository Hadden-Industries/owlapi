import { fileURLToPath } from "node:url";

export const MAINTENANCE_ISSUE_TITLE =
  "Automated maintenance health check failures";

const CANONICAL_REPOSITORY = "Hadden-Industries/owlapi";
const SUPPORTED_RESULTS = new Set([
  "success",
  "failure",
  "cancelled",
  "skipped",
]);

const assertContext = (context) => {
  if (context.apiUrl !== "https://api.github.com") {
    throw new Error(
      "The maintenance reporter requires the canonical GitHub API.",
    );
  }
  if (context.serverUrl !== "https://github.com") {
    throw new Error(
      "The maintenance reporter requires the canonical GitHub server.",
    );
  }
  if (context.repository !== CANONICAL_REPOSITORY) {
    throw new Error(
      `Unexpected maintenance repository: ${context.repository ?? "<missing>"}`,
    );
  }
  if (!SUPPORTED_RESULTS.has(context.result)) {
    throw new Error(
      `Unexpected maintenance result: ${context.result ?? "<missing>"}`,
    );
  }
  if (!/^\d+$/u.test(context.runId ?? "")) {
    throw new Error("The maintenance run ID must contain only decimal digits.");
  }
  if (!/^\d+$/u.test(context.runAttempt ?? "")) {
    throw new Error(
      "The maintenance run attempt must contain only decimal digits.",
    );
  }
  if (!/^[0-9a-f]{40}$/u.test(context.commit ?? "")) {
    throw new Error(
      "The maintenance commit must be a full lowercase Git SHA-1.",
    );
  }
  if (typeof context.token !== "string" || context.token.length === 0) {
    throw new Error("The maintenance reporter requires a GitHub token.");
  }
  if (typeof context.fetchImpl !== "function") {
    throw new Error(
      "The maintenance reporter requires a Fetch implementation.",
    );
  }
};

const runMarker = ({ runId, runAttempt }) =>
  `<!-- owlapi-maintenance-run:${runId}:${runAttempt} -->`;

const findingBody = (context) => `${runMarker(context)}
The automated maintenance health job did not complete successfully.

- Result: \`${context.result}\`
- Source commit: \`${context.commit}\`
- Workflow run: ${context.serverUrl}/${context.repository}/actions/runs/${context.runId}/attempts/${context.runAttempt}

The write-only reporter deliberately records the workflow conclusion rather than
receiving source, release, package-registry, or repository-content authority.`;

const parseNextLink = (header, apiUrl) => {
  if (!header) {
    return null;
  }
  for (const segment of header.split(",")) {
    const match = segment.match(/^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/u);
    if (match?.[2] !== "next") {
      continue;
    }
    const next = new URL(match[1]);
    if (next.origin !== new URL(apiUrl).origin) {
      throw new Error(
        "GitHub returned a pagination link on an unexpected origin.",
      );
    }
    return next.href;
  }
  return null;
};

const requestJson = async (
  context,
  url,
  { method = "GET", body, retryReads = method === "GET" } = {},
) => {
  const attempts = retryReads ? 3 : 1;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await context.fetchImpl(url, {
        method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${context.token}`,
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const detail = await response.text();
        const error = new Error(
          `GitHub API ${method} ${url} returned ${response.status}: ${detail}`,
        );
        if (!retryReads || ![408, 429].includes(response.status)) {
          if (response.status < 500) {
            throw error;
          }
        }
        throw error;
      }
      return {
        body: await response.json(),
        next: parseNextLink(response.headers.get("link"), context.apiUrl),
      };
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, attempt * 250);
      });
    }
  }
  throw lastError;
};

const readAllPages = async (context, initialUrl) => {
  const results = [];
  let next = initialUrl;
  for (let page = 0; next && page < 100; page += 1) {
    const response = await requestJson(context, next);
    if (!Array.isArray(response.body)) {
      throw new Error(`GitHub returned a non-array collection for ${next}.`);
    }
    results.push(...response.body);
    next = response.next;
  }
  if (next) {
    throw new Error(
      "GitHub issue pagination exceeded the defensive page limit.",
    );
  }
  return results;
};

const openMaintenanceIssues = async (context) => {
  const url = `${context.apiUrl}/repos/${context.repository}/issues?state=open&per_page=100&sort=updated&direction=desc`;
  return (await readAllPages(context, url)).filter(
    (issue) =>
      issue.title === MAINTENANCE_ISSUE_TITLE &&
      issue.pull_request === undefined,
  );
};

const reconcileCreate = async (context, marker) => {
  const issue = (await openMaintenanceIssues(context)).find((candidate) =>
    candidate.body?.includes(marker),
  );
  return issue
    ? { action: "RECONCILED_CREATED", issueNumber: issue.number }
    : null;
};

const reconcileComment = async (context, issueNumber, marker) => {
  const url = `${context.apiUrl}/repos/${context.repository}/issues/${issueNumber}/comments?per_page=100`;
  const comments = await readAllPages(context, url);
  return comments.some((comment) => comment.body?.includes(marker))
    ? { action: "RECONCILED_COMMENTED", issueNumber }
    : null;
};

const reconcileClosure = async (context, issueNumber) => {
  const url = `${context.apiUrl}/repos/${context.repository}/issues/${issueNumber}`;
  const issue = (await requestJson(context, url)).body;
  return issue.state === "closed"
    ? { action: "RECONCILED_CLOSED", issueNumber }
    : null;
};

const mutateOnce = async ({ mutate, reconcile, description }) => {
  try {
    return await mutate();
  } catch (mutationError) {
    const reconciled = await reconcile();
    if (reconciled) {
      return reconciled;
    }
    throw new AggregateError(
      [mutationError],
      `The ${description} write had an ambiguous or failed response and read-only reconciliation found no matching state.`,
      { cause: mutationError },
    );
  }
};

export const reportMaintenanceResult = async (context) => {
  assertContext(context);
  const openIssues = await openMaintenanceIssues(context);
  const issue = openIssues[0];

  if (context.result === "success") {
    if (!issue) {
      return { action: "NO_ACTION" };
    }
    const url = `${context.apiUrl}/repos/${context.repository}/issues/${issue.number}`;
    return mutateOnce({
      description: "maintenance issue closure",
      mutate: async () => {
        await requestJson(context, url, {
          method: "PATCH",
          body: { state: "closed", state_reason: "completed" },
          retryReads: false,
        });
        return { action: "CLOSED", issueNumber: issue.number };
      },
      reconcile: () => reconcileClosure(context, issue.number),
    });
  }

  const body = findingBody(context);
  const marker = runMarker(context);
  if (!issue) {
    const url = `${context.apiUrl}/repos/${context.repository}/issues`;
    return mutateOnce({
      description: "maintenance issue creation",
      mutate: async () => {
        const created = (
          await requestJson(context, url, {
            method: "POST",
            body: { title: MAINTENANCE_ISSUE_TITLE, body },
            retryReads: false,
          })
        ).body;
        return { action: "CREATED", issueNumber: created.number };
      },
      reconcile: () => reconcileCreate(context, marker),
    });
  }

  const url = `${context.apiUrl}/repos/${context.repository}/issues/${issue.number}/comments`;
  return mutateOnce({
    description: "maintenance issue comment",
    mutate: async () => {
      await requestJson(context, url, {
        method: "POST",
        body: { body },
        retryReads: false,
      });
      return { action: "COMMENTED", issueNumber: issue.number };
    },
    reconcile: () => reconcileComment(context, issue.number, marker),
  });
};

const main = async () => {
  const result = await reportMaintenanceResult({
    apiUrl: process.env.GITHUB_API_URL,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    commit: process.env.GITHUB_SHA,
    serverUrl: process.env.GITHUB_SERVER_URL,
    token: process.env.GITHUB_TOKEN,
    result: process.env.MAINTENANCE_HEALTH_RESULT,
    fetchImpl: globalThis.fetch,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
