import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { isMap, isScalar, isSeq, parseDocument, visit } from "yaml";

import {
  auditReleaseReconciliationMutationBoundary,
  auditReleaseMutationBoundary,
  auditRepositoryControls,
} from "./workflow-governance.mjs";

const withInvertedBootstrapCredentialGuard = (source) =>
  source.replace(
    'if [[ -z "$NODE_AUTH_TOKEN" ]]; then',
    'if [[ -n "$NODE_AUTH_TOKEN" ]]; then',
  );

const withShallowSourceCheckout = (source, jobId) => {
  const document = parseDocument(source);
  const checkout = document
    .getIn(["jobs", jobId, "steps"])
    .items.find((step) => step.get("uses")?.startsWith("actions/checkout@"));
  checkout.setIn(["with", "fetch-depth"], 1);
  return document.toString();
};

const workflowSource = (fileName) =>
  readFileSync(`.github/workflows/${fileName}`, "utf8");

const mutateWorkflow = (fileName, mutate) => {
  const document = parseDocument(workflowSource(fileName));
  mutate(document);
  return auditRepositoryControls({
    workflowSourceOverrides: { [fileName]: document.toString() },
  }).violations;
};

describe("repository workflow governance", () => {
  test.each(["source_node_24", "webvowl"])(
    "requires unconditional native coverage in %s",
    (job) => {
      for (const mutation of ["remove", "skip", "ignore", "command"]) {
        expect(
          mutateWorkflow("ci.yml", (doc) => {
            const steps = doc.getIn(["jobs", job, "steps"]);
            const index = steps.items.findIndex(
              (step) => step.get("id") === "coverage",
            );
            expect(index).toBeGreaterThan(-1);
            if (mutation === "remove") steps.items.splice(index, 1);
            if (mutation === "skip") steps.items[index].set("if", "false");
            if (mutation === "ignore")
              steps.items[index].set("continue-on-error", true);
            if (mutation === "command")
              steps.items[index].set(
                "run",
                "node scripts/ci-check-coverage-command.mjs java nonexistent.json",
              );
          }).join("\n"),
        ).toMatch(/native coverage/u);
      }
    },
  );
  test("main qualification transport cannot broaden its artifact or hide-file surface", () => {
    for (const mutation of [
      "name",
      "path",
      "include-hidden-files",
      "overwrite",
    ]) {
      expect(
        mutateWorkflow("ci.yml", (doc) => {
          const upload = doc
            .getIn(["jobs", "required", "steps"])
            .items.find((step) => step.get("id") === "main_receipt_upload");
          upload.setIn(
            ["with", mutation],
            ["name", "path"].includes(mutation) ? "arbitrary" : true,
          );
        }).join("\n"),
      ).toMatch(/main qualification transport/u);
    }
  });
  test.each(["remove", "condition", "ignore failure"])(
    "rejects a changed observation preamble: %s",
    (mutation) => {
      expect(
        mutateWorkflow("ci.yml", (doc) => {
          const steps = doc.getIn(["jobs", "source_node_24", "steps"]);
          const index = steps.items.findIndex(
            (step) =>
              step.get("run") === "node scripts/ci-check-applicability.mjs",
          );
          expect(index).toBeGreaterThan(-1);
          if (mutation === "remove") steps.items.splice(index, 1);
          if (mutation === "condition") steps.items[index].set("if", "false");
          if (mutation === "ignore failure")
            steps.items[index].set("continue-on-error", true);
        }).join("\n"),
      ).toMatch(/applicability observation/u);
    },
  );

  test.each(["npm ci", "npm ci --ignore-scripts", "npm install", "npm i"])(
    "rejects dependency-review repository installation: %s",
    (command) => {
      expect(
        mutateWorkflow("ci.yml", (doc) => {
          doc
            .getIn(["jobs", "dependency_review", "steps"])
            .add({ name: "Install", run: command, "timeout-minutes": 15 });
        }).join("\n"),
      ).toMatch(/no-installation npm/u);
    },
  );

  test.each([
    ["ci.yml", "quality_windows"],
    ["ci.yml", "source_node_22"],
    ["release.yml", "source_node_24"],
    ["release.yml", "quality_windows"],
    ["extended-tests.yml", "extended_evidence"],
    ["maintenance.yml", "health"],
  ])("requires locked quality setup before consumers in %s/%s", (file, job) => {
    for (const mutation of ["remove", "skip", "path", "late"]) {
      const violations = mutateWorkflow(file, (doc) => {
        const steps = doc.getIn(["jobs", job, "steps"]);
        const index = steps.items.findIndex((step) =>
          (step.get("run") ?? "").startsWith("npm run tools:sync"),
        );
        expect(index).toBeGreaterThan(-1);
        if (mutation === "remove") steps.items.splice(index, 1);
        if (mutation === "skip") steps.items[index].set("if", "false");
        if (mutation === "path")
          steps.items[index].set(
            "run",
            "npm run tools:sync -- --python python",
          );
        if (mutation === "late")
          steps.items.push(...steps.items.splice(index, 1));
      });
      expect(violations.join("\n")).toMatch(/quality tooling/u);
    }
  });

  test("the Windows source gate cannot omit its regression command", () => {
    expect(
      mutateWorkflow("ci.yml", (doc) => {
        const steps = doc.getIn(["jobs", "quality_windows", "steps"]);
        steps.items = steps.items.filter(
          (step) => step.get("run") !== "npm run test:quality",
        );
      }).join("\n"),
    ).toMatch(/quality tooling/u);
  });

  test.each([
    [
      "a bypassed PR gate",
      (doc) => doc.setIn(["jobs", "source_node_24", "if"], "false"),
    ],
    [
      "receipt permissions",
      (doc) =>
        doc.setIn(["jobs", "verification", "permissions", "actions"], "write"),
    ],
    [
      "a skipped strategy",
      (doc) => doc.setIn(["jobs", "verification", "if"], "false"),
    ],
    [
      "insufficient strategy completion budget",
      (doc) => doc.setIn(["jobs", "verification", "timeout-minutes"], 1),
    ],
    [
      "a changed job identity",
      (doc) => doc.setIn(["jobs", "webvowl", "name"], "A different consumer"),
    ],
  ])("rejects %s in CI reuse policy", (_label, mutate) => {
    expect(mutateWorkflow("ci.yml", mutate).join("\n")).toMatch(
      /CI verification/u,
    );
  });

  test.each([
    ["verification", "proof"],
    ["required", "receipt_upload"],
  ])("bounds optional transport %s/%s before its job deadline", (job, id) => {
    const violations = mutateWorkflow("ci.yml", (doc) => {
      const transfer = doc
        .getIn(["jobs", job, "steps"])
        .items.find((step) => step.get("id") === id);
      transfer.delete("timeout-minutes");
    });
    expect(violations.join("\n")).toMatch(/CI verification/u);
  });

  test("checks the receipt download outcome rather than its tolerated conclusion", () => {
    const violations = mutateWorkflow("ci.yml", (doc) => {
      const verify = doc
        .getIn(["jobs", "verification", "steps"])
        .items.find((step) => step.get("id") === "verify");
      verify.setIn(
        ["env", "PROOF_DOWNLOAD_OUTCOME"],
        "${{ steps.proof.conclusion }}",
      );
    });
    expect(violations.join("\n")).toMatch(/CI verification/u);
  });

  test("forbids broad receipt selectors and skipping the aggregate evaluator", () => {
    const violations = mutateWorkflow("ci.yml", (doc) => {
      const proof = doc
        .getIn(["jobs", "verification", "steps"])
        .items.find((step) => step.get("id") === "proof");
      proof.setIn(["with", "pattern"], "ci-verification-*");
      const aggregate = doc
        .getIn(["jobs", "required", "steps"])
        .items.find((step) =>
          step.get("run")?.includes("require-job-success.mjs"),
        );
      aggregate.set("if", "false");
    });
    expect(violations.join("\n")).toMatch(/CI verification/u);
  });

  test("the checked-in controls match the closed Phase 19 workflow policy", () => {
    const report = auditRepositoryControls();

    expect(report.workflowFiles).toEqual([
      "ci.yml",
      "extended-tests.yml",
      "maintenance.yml",
      "release-reconciliation.yml",
      "release.yml",
    ]);
    expect(report.issueFormFiles).toEqual([
      "bug.yml",
      "conformance.yml",
      "documentation.yml",
      "feature.yml",
      "java-compatibility.yml",
      "other.yml",
    ]);
    expect(report.violations).toEqual([]);
  });

  test.each([
    "ci.yml",
    "release.yml",
    "release-reconciliation.yml",
    "maintenance.yml",
    "extended-tests.yml",
  ])("accepts equivalent YAML presentation in %s", (fileName) => {
    const source = workflowSource(fileName);
    const document = parseDocument(source);
    visit(document, (_key, node) => {
      if (isMap(node)) node.items.reverse();
      if (isSeq(node) && node.items.every(isScalar)) node.flow = true;
      if (
        isScalar(node) &&
        typeof node.value === "string" &&
        !node.value.includes("\n")
      ) {
        node.type = "QUOTE_SINGLE";
      }
    });
    const reformatted = document.toString({ indent: 4 });
    expect(parseDocument(reformatted).toJS()).toEqual(
      parseDocument(source).toJS(),
    );
    expect(
      auditRepositoryControls({
        workflowSourceOverrides: { [fileName]: reformatted },
      }).violations,
    ).toEqual([]);
  });

  test.each([
    ["invalid YAML", "jobs: [unterminated"],
    [
      "duplicate mapping keys",
      `${workflowSource("ci.yml")}\npermissions: {}\n`,
    ],
  ])("reports %s as a parse failure", (_name, source) => {
    expect(
      auditRepositoryControls({
        workflowSourceOverrides: { "ci.yml": source },
      }).violations,
    ).toEqual(
      expect.arrayContaining([expect.stringMatching(/ci.yml: invalid YAML/u)]),
    );
  });

  test.each([
    [
      "root authority",
      ["permissions"],
      { contents: "write" },
      /root permissions/u,
    ],
    [
      "untrusted event",
      ["on", "pull_request_target"],
      {},
      /pull_request_target/u,
    ],
    [
      "path filter",
      ["on", "push", "paths"],
      ["docs/**"],
      /without path filters/u,
    ],
    [
      "missing aggregate dependency",
      ["jobs", "required", "needs"],
      ["metadata"],
      /needs inventory/u,
    ],
    [
      "job continue-on-error",
      ["jobs", "source_node_24", "continue-on-error"],
      true,
      /continue-on-error/u,
    ],
    [
      "job container",
      ["jobs", "source_node_24", "container"],
      "node:24",
      /container/u,
    ],
    [
      "multiline script interpolation",
      ["jobs", "source_node_24", "steps", 2, "run"],
      "echo safe\necho '${{ github.event.pull_request.title }}'\n",
      /not run text/u,
    ],
    [
      "unapproved action",
      ["jobs", "source_node_24", "steps", 0, "uses"],
      "actions/checkout@main",
      /unapproved Action/u,
    ],
    [
      "persisted credentials",
      ["jobs", "source_node_24", "steps", 0, "with", "persist-credentials"],
      true,
      /disable persisted credentials/u,
    ],
  ])("rejects %s regardless of presentation", (_name, path, value, message) => {
    const violations = mutateWorkflow("ci.yml", (document) =>
      document.setIn(path, value),
    );
    expect(violations).toEqual(
      expect.arrayContaining([expect.stringMatching(message)]),
    );
  });

  test("an action step cannot borrow checkout policy from the following step", () => {
    const violations = mutateWorkflow("ci.yml", (document) => {
      const steps = document.getIn(["jobs", "source_node_24", "steps"]);
      steps.items[0].deleteIn(["with", "persist-credentials"]);
      steps.items[1].setIn(["with", "persist-credentials"], false);
      steps.items[1].delete("name");
    });
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/disable persisted credentials/u),
      ]),
    );
  });

  describe.each([
    ["workflow", ["env"]],
    ["job", ["jobs", "source_node_24", "env"]],
    ["step", ["jobs", "source_node_24", "steps", 2, "env"]],
  ])("command policy in %s environment values", (_scope, path) => {
    test.each([
      ["npx --yes unreviewed-tool", "npx "],
      ["npm exec --package unreviewed-tool", "npm exec --package"],
      ["npm test || true", "|| true"],
    ])("rejects indirect %s", (command, forbidden) => {
      const violations = mutateWorkflow("ci.yml", (document) => {
        document.setIn([...path, "INSTALL_COMMAND"], command);
        document.setIn(
          ["jobs", "source_node_24", "steps", 2, "run"],
          "$INSTALL_COMMAND",
        );
      });
      expect(violations).toContain(
        `ci.yml: forbidden workflow construct ${forbidden}`,
      );
    });
  });

  test("command policy does not inspect YAML comments", () => {
    const violations = mutateWorkflow("ci.yml", (document) => {
      document.commentBefore =
        " Do not use npx or npm exec --package or suppress failure with || true.";
    });
    expect(violations).toEqual([]);
  });

  test("native workflow validation is a non-optional required CI step", () => {
    const workflow = parseDocument(workflowSource("ci.yml")).toJS();
    const validation = workflow.jobs.source_node_24.steps.find(
      (step) => step.run === "npm run verify:workflow-syntax",
    );
    expect(workflow.jobs.required.needs).toContain("source_node_24");
    expect(validation).toBeDefined();
    expect(validation).not.toHaveProperty("if");
    expect(validation).not.toHaveProperty("continue-on-error");
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    expect(manifest.scripts["verify:workflow-syntax"]).toBe(
      "actionlint -shellcheck= -pyflakes=",
    );
  });

  test.each(["ci.yml", "release.yml"])(
    "%s binds consumer qualification to the reviewed input commits",
    (fileName) => {
      const workflow = parseDocument(workflowSource(fileName)).toJS();
      const control = JSON.parse(
        readFileSync("docs/release/webvowl-consumer.json", "utf8"),
      );
      const audit = JSON.parse(
        readFileSync("test/consumers/webvowl/development-audit.json", "utf8"),
      );
      const qualification = workflow.jobs.webvowl.steps.find(
        (step) =>
          step.name === "Qualify the retained package through isolated WebVOWL",
      );
      expect(control.webvowl.commit).toBe(audit.baselineCommit);
      expect(qualification.run).toContain(
        `--expected-webvowl-commit ${control.webvowl.commit}`,
      );
      expect(qualification.run).toContain(
        `--expected-ontology-commit ${control.ontologyCorpus.commit}`,
      );
      expect(qualification).not.toHaveProperty("if");
      expect(qualification).not.toHaveProperty("continue-on-error");
    },
  );

  test("CI uses provisional evidence without weakening final release qualification", () => {
    const qualificationCommand = (fileName) =>
      parseDocument(workflowSource(fileName))
        .toJS()
        .jobs.webvowl.steps.find(
          (step) =>
            step.name ===
            "Qualify the retained package through isolated WebVOWL",
        ).run;
    expect(qualificationCommand("ci.yml")).toContain(
      "--development-audit test/consumers/webvowl/development-audit.json",
    );
    expect(qualificationCommand("release.yml")).not.toContain(
      "--development-audit",
    );
  });

  test.each(["release.yml", "release-reconciliation.yml"])(
    "the native queue false-positive suppression cannot hide job-level queue policy in %s",
    (fileName) => {
      const violations = mutateWorkflow(fileName, (document) => {
        const jobId =
          fileName === "release.yml"
            ? "release_preflight"
            : "source_verification";
        document.setIn(["jobs", jobId, "concurrency"], {
          group: "unexpected-queue",
          queue: "invalid",
        });
      });
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /queue is allowed only at the workflow release boundary/u,
          ),
        ]),
      );
    },
  );

  test.each([
    ["release.yml", ["concurrency", "queue"], "invalid", /concurrency.*queue/u],
    [
      "release.yml",
      ["concurrency", "cancel-in-progress"],
      true,
      /concurrency.*cancel-in-progress/u,
    ],
    [
      "release.yml",
      ["jobs", "third_party_evidence_shard", "strategy", "matrix", "shard"],
      [0, 1],
      /closed platform\/shard contract/u,
    ],
    [
      "release.yml",
      ["jobs", "candidate", "needs"],
      ["metadata"],
      /candidate must wait/u,
    ],
    [
      "release-reconciliation.yml",
      ["jobs", "finalize_release", "permissions", "id-token"],
      "write",
      /finalize_release must isolate/u,
    ],
    [
      "maintenance.yml",
      ["jobs", "reporter", "permissions", "contents"],
      "read",
      /isolated reporter/u,
    ],
  ])(
    "retains the policy boundary in %s at %j",
    (fileName, path, value, message) => {
      expect(
        mutateWorkflow(fileName, (document) => document.setIn(path, value)),
      ).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
    },
  );

  test("candidate selectors cannot add cross-run authority", () => {
    expect(
      mutateWorkflow("ci.yml", (document) => {
        const jobs = document.get("jobs");
        const download = jobs.items
          .flatMap(({ value }) => value.get("steps").items)
          .find(
            (step) =>
              step.get("uses")?.startsWith("actions/download-artifact@") &&
              step.getIn(["with", "artifact-ids"]) ===
                "${{ needs.candidate.outputs.artifact_id }}",
          );
        download.setIn(["with", "run-id"], "${{ github.run_id }}");
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/broadens same-run artifact selection/u),
      ]),
    );
  });

  test.each([
    ["ci.yml", "source_node_22"],
    ["ci.yml", "source_node_24"],
    ["release.yml", "source_node_22"],
    ["release.yml", "source_node_24"],
    ["maintenance.yml", "health"],
    ["extended-tests.yml", "extended_evidence"],
  ])(
    "rejects shallow history in the required %s:%s governance job",
    (fileName, jobId) => {
      const source = readFileSync(`.github/workflows/${fileName}`, "utf8");
      const shallow = withShallowSourceCheckout(source, jobId);
      const report = auditRepositoryControls({
        workflowSourceOverrides: { [fileName]: shallow },
      });

      expect(report.violations).toContain(
        `${fileName}:${jobId} must retain complete owlapi history for governance tests`,
      );
    },
  );

  test("rejects publication authority duplicated outside the release job", () => {
    const release = readFileSync(".github/workflows/release.yml", "utf8");
    const document = parseDocument(release);
    document.setIn(
      ["jobs", "release_preflight", "permissions", "id-token"],
      "write",
    );
    document.setIn(["jobs", "release_preflight", "env"], {
      NODE_AUTH_TOKEN: "${{ secrets.NPM_BOOTSTRAP_TOKEN }}",
    });
    const broadened = document.toString();

    expect(auditReleaseMutationBoundary(broadened)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/exactly one id-token writer/u),
        expect.stringMatching(/exactly one bootstrap-token reference/u),
      ]),
    );
  });

  test("rejects a scoped publisher that can write again during a failed-job rerun", () => {
    const document = parseDocument(
      readFileSync(".github/workflows/release.yml", "utf8"),
    );
    const publish = document
      .getIn(["jobs", "npm_release", "steps"])
      .items.find((step) => step.get("run")?.includes("npm publish "));
    publish.delete("if");
    expect(auditReleaseMutationBoundary(document.toString())).toContain(
      "release.yml:npm_release must restrict the sole write to the first run attempt",
    );
  });

  test("rejects authority added to the read-only reconciliation source job", () => {
    const reconciliation = readFileSync(
      ".github/workflows/release-reconciliation.yml",
      "utf8",
    );
    const document = parseDocument(reconciliation);
    document.setIn(
      ["jobs", "source_verification", "permissions", "id-token"],
      "write",
    );
    document.setIn(["jobs", "source_verification", "env"], {
      NODE_AUTH_TOKEN: "${{ secrets.NPM_BOOTSTRAP_TOKEN }}",
    });
    const broadened = document.toString();

    expect(auditReleaseReconciliationMutationBoundary(broadened)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /source_verification contains forbidden authority/u,
        ),
        expect.stringMatching(/exactly one id-token writer/u),
        expect.stringMatching(/exactly one bootstrap-token reference/u),
      ]),
    );
  });

  test.each([
    ["release", ".github/workflows/release.yml", auditReleaseMutationBoundary],
    [
      "reconciliation",
      ".github/workflows/release-reconciliation.yml",
      auditReleaseReconciliationMutationBoundary,
    ],
  ])(
    "rejects the %s workflow when its bootstrap credential guard is inverted",
    (_name, path, audit) => {
      const source = readFileSync(path, "utf8");
      const inverted = withInvertedBootstrapCredentialGuard(source);

      expect(inverted).not.toBe(source);
      expect(audit(inverted)).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/missing bootstrap credential/iu),
        ]),
      );
    },
  );

  test("rejects a reconciliation download detached from the pinned source run", () => {
    const reconciliation = readFileSync(
      ".github/workflows/release-reconciliation.yml",
      "utf8",
    );
    const detached = reconciliation.replace(
      "run-id: ${{ steps.metadata.outputs.source_run_id }}",
      "run-id: ${{ github.run_id }}",
    );

    expect(auditReleaseReconciliationMutationBoundary(detached)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/closed source-run selector/u),
      ]),
    );
  });
});
