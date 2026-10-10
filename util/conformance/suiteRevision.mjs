import { readFileSync } from "node:fs";
const suites = JSON.parse(
  readFileSync(
    new URL("../../docs/conformance/suites.json", import.meta.url),
    "utf8",
  ),
).suites;

/** Select exactly one inventory scope; never infer a revision from repository identity alone. */
export function suiteRevision(suiteId, format) {
  const matches = suites
    .filter((suite) => suite.id === suiteId)
    .flatMap((suite) =>
      (suite.revisionScopes ?? [])
        .filter((scope) => scope.formats.includes(format))
        .map((scope) => scope.revision),
    );
  if (matches.length !== 1 || !/^[a-f0-9]{40}$/u.test(matches[0]))
    throw new Error(
      `Missing or ambiguous suite revision: ${suiteId}/${format}`,
    );
  return matches[0];
}
