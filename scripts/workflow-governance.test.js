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
  test.each(["ci.yml", "release.yml"])(
    "rejects substituted Node 26 floor in %s",
    (fileName) => {
      expect(
        mutateWorkflow(fileName, (document) => {
          const setup = document
            .getIn(["jobs", "portability_ubuntu_node_26", "steps"])
            .items.find((step) =>
              step.get("uses")?.startsWith("actions/setup-node@"),
            );
          setup.setIn(["with", "node-version"], "24.21.0");
        }).join("\n"),
      ).toMatch(/Node 26 floor/u);
    },
  );
  test.each(["skip", "ignore", "late"])(
    "rejects ineffective isolated Markdown acquisition: %s",
    (mutation) => {
      expect(
        mutateWorkflow("ci.yml", (document) => {
          const steps = document.getIn(["jobs", "source_node_24", "steps"]);
          const index = steps.items.findIndex(
            (step) => step.get("run") === "npm run install:markdown",
          );
          const install = steps.items[index];
          if (mutation === "skip") install.set("if", "false");
          if (mutation === "ignore") install.set("continue-on-error", true);
          if (mutation === "late") {
            steps.items.splice(index, 1);
            steps.items.push(install);
          }
        }).join("\n"),
      ).toMatch(/isolated Markdown acquisition|Markdown setup before/u);
    },
  );
  test.each(["source_node_22", "source_node_26"])(
    "retains the %s source and Python floor",
    (jobId) => {
      expect(
        mutateWorkflow("ci.yml", (document) => {
          const steps = document.getIn(["jobs", jobId, "steps"]);
          const lint = steps.items.find(
            (step) => step.get("run") === "npm run lint:source-python",
          );
          lint.set("run", "npm run lint");
        }).join("\n"),
      ).toMatch(/lint:source-python/u);
    },
  );
  test.each([
    "bypass",
    "token",
    "ignored admission",
    "arbitrary transport",
    "unconditional tools",
    "fatal optional tools",
  ])("rejects a compromised merge seed decision: %s", (mutation) => {
    expect(
      mutateWorkflow("ci.yml", (doc) => {
        const job = doc.getIn(["jobs", "verification"]);
        const steps = job.get("steps").items;
        const step = (id) => steps.find((item) => item.get("id") === id);
        if (mutation === "bypass")
          job.setIn(["outputs", "reuse"], "${{ steps.verify.outputs.reuse }}");
        if (mutation === "token")
          step("seed_strategy").setIn(
            ["env", "GH_TOKEN"],
            "${{ github.token }}",
          );
        if (mutation === "ignored admission")
          step("seed_admit").set("continue-on-error", true);
        if (mutation === "arbitrary transport")
          step("seed_download").setIn(["with", "artifact-ids"], "500");
        if (mutation === "unconditional tools") step("seed_tools").delete("if");
        if (mutation === "fatal optional tools")
          step("seed_tools").delete("continue-on-error");
      }).join("\n"),
    ).toMatch(/CI verification|seed decision|seed transport|seed verifier/u);
  });
  test.each(["PR", "overwrite", "path", "reorder"])(
    "rejects a broadened reference publication: %s",
    (mutation) => {
      expect(
        mutateWorkflow("ci.yml", (doc) => {
          const steps = doc.getIn(["jobs", "source_node_24", "steps"]);
          const index = steps.items.findIndex(
            (step) => step.get("id") === "reference_upload",
          );
          const upload = steps.items[index];
          if (mutation === "PR") upload.set("if", "true");
          if (mutation === "overwrite")
            upload.setIn(["with", "overwrite"], true);
          if (mutation === "path") upload.setIn(["with", "path"], ".release");
          if (mutation === "reorder") {
            steps.items.splice(index, 1);
            steps.items.unshift(upload);
          }
        }).join("\n"),
      ).toMatch(/main-only reference transport|publication must follow/u);
    },
  );
  test.each(["credential", "ignore", "reorder", "unbounded"])(
    "rejects a compromised native cost screen: %s",
    (mutation) => {
      expect(
        mutateWorkflow("ci.yml", (doc) => {
          const steps = doc.getIn(["jobs", "source_node_24", "steps"]);
          const index = steps.items.findIndex(
            (step) =>
              step.get("run") ===
              "node util/owlapi-reference/reference-cost-observation.mjs",
          );
          const screen = steps.items[index];
          if (mutation === "credential")
            screen.setIn(["env", "GH_TOKEN"], "${{ github.token }}");
          if (mutation === "ignore") screen.set("continue-on-error", true);
          if (mutation === "unbounded") screen.delete("timeout-minutes");
          if (mutation === "reorder") {
            steps.items.splice(index, 1);
            steps.items.push(screen);
          }
        }).join("\n"),
      ).toMatch(/isolated cost screen/u);
    },
  );
  test.each(["source_node_24", "owl_contract"])(
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
      (doc) =>
        doc.setIn(["jobs", "owl_contract", "name"], "A different consumer"),
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
      "markdown-quality.yml",
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

  test("CI and release invoke identical producer-owned contract assertions", () => {
    const jobs = ["ci.yml", "release.yml"].map(
      (file) => parseDocument(workflowSource(file)).toJS().jobs.owl_contract,
    );
    const commands = jobs.map((job) =>
      job.steps.find((step) => step.run?.includes("npm run test:owl-contract")),
    );
    expect(commands[0].run).toBe(commands[1].run);
    for (const job of jobs) {
      expect(
        job.steps.filter((step) => step.uses?.startsWith("actions/checkout")),
      ).toHaveLength(1);
      expect(JSON.stringify(job)).not.toMatch(
        /consumer-workspace|test:webvowl|npm run build|browser-project/,
      );
    }
  });
  test.each(["ci.yml", "release.yml"])(
    "%s rejects downstream application execution in the producer contract",
    (file) => {
      expect(
        mutateWorkflow(file, (doc) =>
          doc.setIn(
            ["jobs", "owl_contract", "steps", 0, "run"],
            "npm run test:webvowl-consumer",
          ),
        ),
      ).toEqual(expect.arrayContaining([expect.stringMatching(/downstream/)]));
    },
  );
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

describe("trusted Markdown dispatch", () => {
  test.each([
    "floating producer",
    "wrong producer revision",
    "write token",
    "candidate trust",
    "inherited secrets",
    "candidate execution",
    "skipped qualification",
    "profile override",
    "privileged trigger",
    "optional trusted input",
    "extra input",
  ])("rejects %s", (mutation) => {
    const violations = mutateWorkflow("markdown-quality.yml", (document) => {
      const job = document.getIn(["jobs", "markdown"]);
      if (mutation === "floating producer")
        job.set("uses", job.get("uses").replace(/@[a-f0-9]{40}$/u, "@main"));
      if (mutation === "wrong producer revision")
        job.set(
          "uses",
          job.get("uses").replace(/@[a-f0-9]{40}$/u, "@" + "0".repeat(40)),
        );
      if (mutation === "write token")
        job.setIn(["permissions", "contents"], "write");
      if (mutation === "candidate trust")
        job.setIn(["with", "trusted-sha"], "${{ inputs.candidate_sha }}");
      if (mutation === "inherited secrets") job.set("secrets", "inherit");
      if (mutation === "candidate execution")
        job.set("steps", [{ run: "node candidate/evil.js" }]);
      if (mutation === "skipped qualification") job.set("if", "false");
      if (mutation === "profile override")
        job.setIn(["with", "profile"], "candidate/evil.json");
      if (mutation === "privileged trigger")
        document.setIn(["on", "pull_request_target"], {});
      if (mutation === "optional trusted input")
        document.setIn(
          ["on", "workflow_dispatch", "inputs", "trusted_sha", "required"],
          false,
        );
      if (mutation === "extra input")
        job.setIn(["with", "memoryBytes"], 9999999999);
    });
    expect(violations.join("\n")).toMatch(/trusted data checker/u);
  });
});
