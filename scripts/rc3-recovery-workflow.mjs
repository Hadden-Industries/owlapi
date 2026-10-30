import { isDeepStrictEqual } from "node:util";
import { RECOVERY_JOBS } from "./rc3-recovery-policy.mjs";

const guarded = "${{ inputs.rc3_recovery && !inputs.qualification_only }}";
const transport = "./.github/actions/retain-artifact";
const download =
  "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333";
const checkout = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const publish = `if [[ -z "\${ACTIONS_ID_TOKEN_REQUEST_URL:-}" || -z "\${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]]; then
  echo "::error::The protected npm-release job has no GitHub OIDC identity."
  exit 1
fi
echo "f7ef57825eb0edc9d08f32a93c891d605757a4408c4b51a53d20b3be6290b0df  hadden-industries-owlapi-0.1.0-rc.3.tgz" | sha256sum --check --strict
npm publish hadden-industries-owlapi-0.1.0-rc.3.tgz --provenance --tag next --access public --registry=https://registry.npmjs.org/
npm dist-tag add @hadden-industries/owlapi@0.1.0-rc.3 latest --registry=https://registry.npmjs.org/
echo '{"state":"PUBLICATION_ACCEPTED","availability":"PENDING","publicationReplay":false}'`;
const contracts = {
  recovery_source: {
    needs: [],
    commands: [
      "npm ci",
      "node scripts/rc3-recovery-policy.mjs outputs",
      "node scripts/recover-rc3-publication.mjs source",
    ],
  },
  recovery_accepted: {
    needs: ["recovery_source"],
    commands: [
      "npm ci",
      "node scripts/release-approvals.mjs --environment release-manual --output .release/approval-release-manual.json --rc3-recovery",
      'npm run verify:release-tag -- --tag "$RELEASE_TAG" --commit "$SOURCE_COMMIT" --output .release/tag-verification.json',
    ],
  },
  recovery_publish: {
    needs: ["recovery_source", "recovery_accepted", "recovery_draft"],
    commands: [
      "sha256sum --check --strict SHA256SUMS",
      "node approval-tools/scripts/release-approvals.mjs --environment npm-release --output .release/approval-npm-release.json --rc3-recovery",
      "node approval-tools/scripts/rc3-recovery-policy.mjs guard-publication",
      publish,
    ],
  },
  recovery_registry: {
    needs: ["recovery_source", "recovery_publish"],
    commands: [
      "npm ci",
      "npm run qualify:public-registry -- --candidate .release/download --output .release/registry-verification.json --rc3-recovery",
    ],
  },
  recovery_draft: {
    needs: ["recovery_source", "recovery_accepted"],
    commands: ["npm ci", "node scripts/recover-rc3-publication.mjs draft"],
  },
  recovery_evidence: {
    needs: [
      "recovery_source",
      "recovery_accepted",
      "recovery_draft",
      "recovery_publish",
      "recovery_registry",
    ],
    commands: ["npm ci", "node scripts/recover-rc3-publication.mjs evidence"],
  },
  recovery_finalize: {
    needs: ["recovery_source", "recovery_evidence"],
    commands: [
      "npm ci",
      'npm run finalize:github-release -- --evidence "$RELEASE_EVIDENCE_PATH" --output .release/finalization.json --source-commit "$SOURCE_COMMIT"',
    ],
  },
  recovery_immutable: {
    needs: ["recovery_source", "recovery_finalize"],
    commands: [
      "npm ci",
      "npm run prepare:github-cli -- --output .release/tools/github-cli",
      'npm run verify:release-tag -- --tag "$RELEASE_TAG" --commit "$SOURCE_COMMIT" --output .release/final-tag-verification.json',
      'npm run verify:immutable-release -- --gh .release/tools/github-cli/gh_2.103.3_linux_amd64/bin/gh --output-directory .release/immutable-assets --report .release/immutable-verification.json --source-commit "$SOURCE_COMMIT"',
    ],
  },
};
const list = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const uploadContracts = {
  recovery_source: [
    ["release-recovery-source", ".release/recovery/source-verification.json"],
  ],
  recovery_accepted: [
    [
      "release-approval-release-manual",
      ".release/approval-release-manual.json",
    ],
    ["release-tag-verification", ".release/tag-verification.json"],
  ],
  recovery_publish: [
    ["release-approval-npm-release", ".release/approval-npm-release.json"],
  ],
  recovery_registry: [
    ["release-registry-verification", ".release/registry-verification.json"],
  ],
  recovery_evidence: [
    [
      "release-recovery-evidence",
      ".release/recovery/hadden-industries-owlapi-${{ needs.recovery_source.outputs.version }}.release-evidence.json",
    ],
  ],
  recovery_finalize: [],
  recovery_draft: [],
  recovery_immutable: [
    ["release-immutable-verification", ".release/immutable-verification.json"],
  ],
};

/** Validate the closed recovery branch, then expose the unchanged ordinary
 * branch to its existing detailed validators. No recovery job is exempt from
 * its own command, dependency, permission and immutable-artifact contract.
 */
export function ordinaryReleaseWorkflow(workflow, violations) {
  // YAML control values are JSON data. Keep them in the caller's realm so the
  // existing strict comparisons also work inside Jest's VM module context.
  const result = JSON.parse(JSON.stringify(workflow));
  const check = (condition, message) => {
    if (!condition) violations.push(`release.yml: rc.3 recovery ${message}`);
  };
  const input = result.on?.workflow_dispatch?.inputs?.rc3_recovery;
  check(
    isDeepStrictEqual(input, {
      description:
        "Resume the fixed, qualified rc.3 artifact after its pre-publication failure",
      type: "boolean",
      required: true,
      default: false,
    }),
    "dispatch input differs",
  );
  if (result.on?.workflow_dispatch?.inputs)
    delete result.on.workflow_dispatch.inputs.rc3_recovery;
  const publicationIds = [
    "publication_preflight",
    "tag_accepted",
    "draft_release",
    "npm_release",
    "registry_verification",
    "release_evidence",
    "finalize_release",
  ];
  for (const [id, job] of Object.entries(result.jobs ?? {})) {
    if (Object.hasOwn(RECOVERY_JOBS, id)) continue;
    const expression = [
      "third_party_evidence",
      "consumer_runtimes",
      "required",
    ].includes(id)
      ? "!cancelled()"
      : publicationIds.includes(id)
        ? "!inputs.qualification_only"
        : null;
    check(
      job.if ===
        (expression
          ? `\${{ !inputs.rc3_recovery && (${expression}) }}`
          : "${{ !inputs.rc3_recovery }}"),
      `${id} is not mutually exclusive with ordinary qualification`,
    );
    if (expression) job.if = `\${{ ${expression} }}`;
    else delete job.if;
  }
  for (const [id, contract] of Object.entries(contracts)) {
    const j = result.jobs?.[id];
    check(Boolean(j), `${id} is missing`);
    if (!j) continue;
    check(
      j.name === RECOVERY_JOBS[id] && j.if === guarded,
      `${id} identity or guard differs`,
    );
    check(
      isDeepStrictEqual(list(j.needs), contract.needs),
      `${id} prerequisites differ`,
    );
    const permissions =
      id === "recovery_publish"
        ? { actions: "read", contents: "read", "id-token": "write" }
        : id === "recovery_draft"
          ? { actions: "read", contents: "write" }
          : id === "recovery_finalize"
            ? { contents: "write" }
            : id === "recovery_immutable"
              ? { contents: "read" }
              : { actions: "read", contents: "read" };
    check(
      isDeepStrictEqual(j.permissions, permissions),
      `${id} permissions differ`,
    );
    check(
      j["runs-on"] === "ubuntu-24.04" &&
        Number.isInteger(j["timeout-minutes"]) &&
        j["timeout-minutes"] <= 90 &&
        j["timeout-minutes"] > 0 &&
        isDeepStrictEqual(j.defaults, { run: { shell: "bash" } }),
      `${id} runner or deadline differs`,
    );
    const environment =
      id === "recovery_accepted"
        ? { name: "release-manual", deployment: false }
        : id === "recovery_publish"
          ? { name: "npm-release" }
          : undefined;
    check(
      isDeepStrictEqual(j.environment, environment),
      `${id} protected environment differs`,
    );
    check(
      !j.env &&
        !j.container &&
        !j.strategy &&
        !j["continue-on-error"] &&
        !j.concurrency,
      `${id} adds unsupported controls`,
    );
    check(
      isDeepStrictEqual(
        j.steps.filter((s) => s.run).map((s) => s.run.trim()),
        contract.commands,
      ),
      `${id} executable command sequence differs`,
    );
    const expectedOutputs =
      id === "recovery_source"
        ? Object.fromEntries(
            [
              "source_commit",
              "source_run_id",
              "candidate_artifact_id",
              "tag",
              "version",
            ].map((key) => [key, `\${{ steps.identity.outputs.${key} }}`]),
          )
        : [
              "recovery_accepted",
              "recovery_registry",
              "recovery_evidence",
            ].includes(id)
          ? { artifact_id: "${{ steps.upload.outputs.artifact-id }}" }
          : undefined;
    check(
      isDeepStrictEqual(j.outputs, expectedOutputs),
      `${id} output identity differs`,
    );
    check(
      j.steps.filter((s) => s.uses === checkout).length === 1 &&
        j.steps[0].uses === checkout,
      `${id} must start with exactly one checkout`,
    );
    check(
      j.steps.filter((s) => s.uses?.endsWith("setup-producer")).length === 1 &&
        j.steps[1].uses ===
          (id === "recovery_publish"
            ? "./approval-tools/.github/actions/setup-producer"
            : "./.github/actions/setup-producer"),
      `${id} runtime order differs`,
    );
    const uploads = j.steps.filter((s) => s.uses?.endsWith("retain-artifact"));
    check(
      isDeepStrictEqual(
        uploads.map((s) => s.with),
        uploadContracts[id].map(([prefix, path]) => ({
          name: `${prefix}-\${{ github.run_id }}-\${{ github.run_attempt }}`,
          path,
          "retention-days": 90,
        })),
      ),
      `${id} retained native inventory differs`,
    );
    check(
      j.steps.filter((s) => s.uses === download).length ===
        ([
          "recovery_publish",
          "recovery_registry",
          "recovery_evidence",
          "recovery_finalize",
        ].includes(id)
          ? 1
          : 0),
      `${id} artifact download count differs`,
    );
    for (const step of j.steps) {
      check(
        !step.shell &&
          (!step["working-directory"] ||
            (id === "recovery_publish" &&
              step["working-directory"] === ".release/download" &&
              (step.run === "sha256sum --check --strict SHA256SUMS" ||
                step.run?.trim() === publish))),
        `${id} changes the execution location or shell`,
      );
      check(
        !step["continue-on-error"] &&
          (!step.run ||
            (Number.isInteger(step["timeout-minutes"]) &&
              step["timeout-minutes"] > 0 &&
              step["timeout-minutes"] <= 50)),
        `${id} step loses fail-closed execution or deadline`,
      );
      if (step.if)
        check(
          (["recovery_publish", "recovery_accepted"].includes(id) &&
            step.if === "${{ github.run_attempt == 1 }}") ||
            (id === "recovery_registry" &&
              step.id === "upload" &&
              step.if === "${{ always() }}"),
          `${id} adds a conditional step`,
        );
      if (step.uses)
        check(
          [
            checkout,
            download,
            transport,
            "./.github/actions/setup-producer",
            "./approval-tools/.github/actions/setup-producer",
            "./approval-tools/.github/actions/retain-artifact",
          ].includes(step.uses),
          `${id} invokes an unapproved action`,
        );
      if (step.uses === checkout)
        check(
          isDeepStrictEqual(step.with, {
            ref: "${{ github.sha }}",
            "persist-credentials": false,
            "fetch-depth": [
              "recovery_source",
              "recovery_accepted",
              "recovery_immutable",
            ].includes(id)
              ? 0
              : 1,
            ...([
              "recovery_source",
              "recovery_accepted",
              "recovery_immutable",
            ].includes(id)
              ? { "fetch-tags": true }
              : {}),
            ...(id === "recovery_publish" ? { path: "approval-tools" } : {}),
          }),
          `${id} checkout differs`,
        );
      if (step.uses?.endsWith("setup-producer"))
        check(
          isDeepStrictEqual(step.with, {
            "npm-timeout-minutes": "10",
            "verify-runtime": "false",
          }),
          `${id} runtime bootstrap differs`,
        );
      if (step.uses === download) {
        const original = ["recovery_publish", "recovery_registry"].includes(id);
        const expected = original
          ? {
              "artifact-ids":
                "${{ needs.recovery_source.outputs.candidate_artifact_id }}",
              path: ".release/download",
              "merge-multiple": false,
              "skip-decompress": false,
              "digest-mismatch": "error",
              "github-token": "${{ github.token }}",
              repository: "Hadden-Industries/owlapi",
              "run-id": "${{ needs.recovery_source.outputs.source_run_id }}",
            }
          : {
              "artifact-ids":
                id === "recovery_evidence"
                  ? "${{ needs.recovery_registry.outputs.artifact_id }}"
                  : "${{ needs.recovery_evidence.outputs.artifact_id }}",
              path:
                id === "recovery_evidence"
                  ? ".release/recovery"
                  : ".release/evidence",
              "merge-multiple": false,
              "skip-decompress": false,
              "digest-mismatch": "error",
            };
        check(
          isDeepStrictEqual(step.with, expected),
          `${id} artifact selector differs`,
        );
      }
      for (const [key, value] of Object.entries(step.env ?? {})) {
        const expected = {
          GITHUB_TOKEN: "${{ github.token }}",
          RELEASE_TAG: "${{ needs.recovery_source.outputs.tag }}",
          SOURCE_COMMIT: "${{ needs.recovery_source.outputs.source_commit }}",
          RELEASE_EVIDENCE_PATH:
            ".release/evidence/hadden-industries-owlapi-${{ needs.recovery_source.outputs.version }}.release-evidence.json",
        }[key];
        check(
          value === expected && expected !== undefined,
          `${id} introduces an unapproved environment value`,
        );
      }
    }
    if (id === "recovery_publish") {
      const writes = j.steps.filter((s) => s.run?.includes("npm publish "));
      check(
        writes.length === 1 &&
          writes[0].if === "${{ github.run_attempt == 1 }}" &&
          writes[0]["working-directory"] === ".release/download" &&
          !writes[0].env,
        "publisher write escapes its first-attempt credential boundary",
      );
      check(
        uploads.length === 1 &&
          j.steps.indexOf(uploads[0]) < j.steps.indexOf(writes[0]),
        "publisher must retain approval before writing",
      );
    }
    delete result.jobs[id];
  }
  return result;
}
