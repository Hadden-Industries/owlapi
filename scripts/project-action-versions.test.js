import { readFileSync } from "node:fs";
import { parseDocument, visit } from "yaml";
import {
  ACTION_PINS,
  ACTION_VERSIONS,
  actionReference,
  checkActionProjections,
  projectActionVersions,
  validateActionCatalog,
} from "./project-action-versions.mjs";

const checkout = ACTION_VERSIONS["actions/checkout"];
const stale = "0".repeat(40);

describe("GitHub Action version catalog", () => {
  test("every workflow and composite action matches the catalog", () => {
    expect(checkActionProjections()).toEqual([]);
  });

  test("derives approved references and tag comments from one entry", () => {
    expect(actionReference("actions/checkout")).toBe(
      `actions/checkout@${checkout.revision}`,
    );
    expect(ACTION_PINS[actionReference("actions/checkout")]).toBe(checkout.tag);
    expect(() => actionReference("actions/unknown")).toThrow(
      /not in docs\/release\/action-versions\.json/u,
    );
  });

  test("rewrites drifted references and their tag comments", () => {
    const source = [
      "steps:",
      `  - uses: actions/checkout@${stale} # v0.0.1`,
      "    with:",
      "      persist-credentials: false",
      "  - uses: ./.github/actions/setup-producer",
      "",
    ].join("\n");
    const result = projectActionVersions(source, {
      file: "fixture.yml",
      write: true,
    });
    expect(result.violations).toEqual([
      expect.stringMatching(/fixture\.yml: actions\/checkout drifts/u),
    ]);
    expect(result.source).toBe(
      source.replace(
        `actions/checkout@${stale} # v0.0.1`,
        `actions/checkout@${checkout.revision} # ${checkout.tag}`,
      ),
    );
    expect(
      projectActionVersions(result.source, { file: "fixture.yml" }).violations,
    ).toEqual([]);
  });

  test("checks equivalent YAML presentation semantically", () => {
    const source = `steps:\n  - uses: 'actions/checkout@${checkout.revision}'   #   ${checkout.tag}\n`;
    expect(
      projectActionVersions(source, { file: "fixture.yml" }).violations,
    ).toEqual([]);
  });

  test("rejects unregistered actions and references it cannot rewrite", () => {
    expect(
      projectActionVersions("steps:\n  - uses: example/action@v1\n", {
        file: "fixture.yml",
      }).violations,
    ).toEqual([
      "fixture.yml: example/action is not in docs/release/action-versions.json",
    ]);
    expect(
      projectActionVersions(
        `steps: [{ uses: actions/checkout@${stale}, with: {} }]\n`,
        { file: "fixture.yml", write: true },
      ).violations,
    ).toEqual(
      expect.arrayContaining([
        "fixture.yml: cannot rewrite actions/checkout in place",
      ]),
    );
  });

  test("reports a catalog entry that no workflow consumes", () => {
    const withoutSetupJava = (fileName) => {
      const document = parseDocument(
        readFileSync(`.github/workflows/${fileName}`, "utf8"),
      );
      visit(document, {
        Pair(_key, pair) {
          if (
            pair.key?.value === "uses" &&
            /setup-java@/u.test(pair.value?.value)
          )
            pair.value.value = "./.github/actions/setup-producer";
        },
      });
      return document.toString();
    };
    expect(
      checkActionProjections({
        workflowSourceOverrides: {
          "ci.yml": withoutSetupJava("ci.yml"),
          "release.yml": withoutSetupJava("release.yml"),
        },
      }),
    ).toEqual([
      "docs/release/action-versions.json: actions/setup-java has no workflow or action consumer",
    ]);
  });

  test.each([
    ["unsorted entries", { "b/b": checkout, "a/a": checkout }],
    ["abbreviated revision", { "a/a": { ...checkout, revision: "3d3c42e5" } }],
    ["missing tag", { "a/a": { revision: checkout.revision } }],
    ["extra fields", { "a/a": { ...checkout, note: "x" } }],
  ])("rejects a catalog with %s", (_name, actions) => {
    expect(() => validateActionCatalog({ schemaVersion: 1, actions })).toThrow(
      /docs\/release\/action-versions\.json/u,
    );
  });
});
