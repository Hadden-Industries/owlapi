import { approvedDevelopmentCases } from "./release-audit-cases.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { canonicalJson } from "./canonical-json.mjs";

test("resolves native indirect development advisories to exact reviewed occurrences", () => {
  const id = "GHSA-2222-3333-4444";
  const vulnerabilities = {
    parent: {
      name: "parent",
      severity: "high",
      nodes: ["node_modules/parent"],
      via: ["child"],
    },
    child: {
      name: "child",
      severity: "high",
      nodes: ["node_modules/child"],
      via: [{ url: "https://github.com/advisories/" + id }],
    },
  };
  const lock = Buffer.from(
    JSON.stringify({
      packages: Object.fromEntries(
        Object.values(vulnerabilities).map((row) => [
          row.nodes[0],
          { version: "1.0.0", dev: true },
        ]),
      ),
    }),
  );
  const active = Object.values(vulnerabilities).map((row) => ({
    id: row.name,
    kind: "NON_RELEASE_REACHABLE_DEVELOPMENT",
    finding: {
      sha256: sha256Buffer(Buffer.from(canonicalJson(row))),
      severity: "high",
      advisories: [id],
      occurrences: [{ location: row.nodes[0], version: "1.0.0" }],
    },
  }));
  expect(approvedDevelopmentCases({ vulnerabilities }, lock, active)).toEqual(
    active,
  );
  expect(
    approvedDevelopmentCases({ vulnerabilities }, lock, active.slice(1)),
  ).toBeNull();
  vulnerabilities.child.via = ["parent"];
  expect(
    approvedDevelopmentCases({ vulnerabilities }, lock, active),
  ).toBeNull();
  vulnerabilities.child.via = ["unreported"];
  expect(
    approvedDevelopmentCases({ vulnerabilities }, lock, active),
  ).toBeNull();
});
