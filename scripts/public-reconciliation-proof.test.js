import { expect, jest, test } from "@jest/globals";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureResolutionEvidence } from "./release-consumer-evidence.mjs";
import { installResolutionFixture } from "./fixtures/npm-consumer-resolution.mjs";
import {
  PUBLIC_CONSUMERS,
  packPublicObservation,
  publicIdentity,
  readPublicObservation,
} from "./public-recipient-observation.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import {
  readPublicObservationBatch,
  publicLaneKey,
} from "./public-reconciliation-proof.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";

test("replays native public alias and scoped locks and rejects changed originals", async () => {
  const npmCli = process.env.OWLAPI_CONSUMER_NPM ?? process.env.npm_execpath;
  const temp = realpathSync(tmpdir());
  const directory = mkdtempSync(
    join(temp, "owlapi-public-reconciliation-test-"),
  );
  expect(isStrictDescendantPath(temp, directory)).toBe(true);
  try {
    const registryTarball = `https://registry.npmjs.org/${PACKAGE_NAME}/-/owlapi-${PACKAGE_VERSION}.tgz`;
    const consumers = {};
    let tarball, input, lane;
    for (const [mode, name] of Object.entries(PUBLIC_CONSUMERS)) {
      const work = join(directory, mode);
      mkdirSync(work);
      const fixture = await installResolutionFixture(
        work,
        npmCli,
        name,
        "26.6.11",
      );
      if (tarball) expect(fixture.tarball.equals(tarball)).toBe(true);
      tarball = fixture.tarball;
      const lock = JSON.parse(
        readFileSync(join(work, "package-lock.json"), "utf8"),
      );
      const manifest = {
        name: "owlapi-registry-consumer",
        private: true,
        type: "module",
        dependencies: {
          [name]:
            mode === "alias"
              ? `npm:${PACKAGE_NAME}@${PACKAGE_VERSION}`
              : PACKAGE_VERSION,
        },
      };
      lock.name = manifest.name;
      delete lock.version;
      lock.packages[""] = {
        name: manifest.name,
        dependencies: manifest.dependencies,
      };
      const item = lock.packages[`node_modules/${name}`];
      item.resolved = registryTarball;
      writeFileSync(join(work, "package.json"), JSON.stringify(manifest));
      writeFileSync(join(work, "package-lock.json"), JSON.stringify(lock));
      const capture = await captureResolutionEvidence(work, {
        tarball,
        dependencyName: name,
        npmCli,
        registryTarball,
      });
      // The native loader uses the installed graph from the available local npm
      // while the proof reader explicitly applies the retained consumer version.
      capture.resolution.npm = CI_RUNTIME.consumerNpm;
      input = {
        package: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
        integrity: item.integrity,
        tarballSha256: sha256Buffer(tarball),
      };
      const { os, cpu: arch, node } = capture.resolution.platform;
      lane = { os, arch, node, runner: "fixture" };
      consumers[mode] = {
        identity: publicIdentity(mode, input, registryTarball),
        evidence: capture,
      };
    }
    const origin = { commit: "a".repeat(40), run: "71", attempt: "2" };
    const packet = packPublicObservation({ lane, input, origin, consumers });
    const options = { lane, input, origin, tarball, npmCli, registryTarball };
    const observed = await readPublicObservation(packet, options);
    expect(observed.alias.subject.lockSha256).not.toBe(
      observed.scoped.subject.lockSha256,
    );
    expect(observed.alias.subject.tarballSha256).toBe(
      observed.scoped.subject.tarballSha256,
    );
    const changed = JSON.parse(canonicalJson(packet));
    changed.originals[changed.index.alias.lock] += "\n";
    await expect(readPublicObservation(changed, options)).rejects.toThrow(
      "Public native input bytes changed",
    );
    const swapped = JSON.parse(canonicalJson(packet));
    swapped.index.alias.identity = swapped.index.scoped.identity;
    await expect(readPublicObservation(swapped, options)).rejects.toThrow();
    await expect(
      readPublicObservation(packet, {
        ...options,
        origin: { ...origin, attempt: "3" },
      }),
    ).rejects.toThrow();

    const stage = {
      ...input,
      schemaVersion: 2,
      stageId: "stage-fixture",
      stageRun: "62",
      stageAttempt: "1",
      stageController: "b".repeat(40),
    };
    const native = packPublicObservation({
      lane,
      input: stage,
      origin,
      consumers,
    });
    const stagedReport = {
      schemaVersion: 2,
      result: "PASS",
      coordinate: `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
      publication: { stageId: stage.stageId },
      integrity: stage.integrity,
      tarballSha256: stage.tarballSha256,
      tarballUrl: registryTarball,
      provenance: {
        workflow: ".github/workflows/stage-release.yml",
        runId: stage.stageRun,
        runAttempt: 1,
        sourceCommit: stage.stageController,
      },
    };
    const selected = [
      {
        logical: `release-registry-${origin.run}-${origin.attempt}`,
        name: "registry",
        runner: UBUNTU.label,
        step: "Retain original operation evidence",
        members: { "public.json": stagedReport, "recipient-input.json": stage },
      },
      {
        logical: `public-observation-${publicLaneKey(lane)}-${origin.attempt}`,
        name: `Public observation (${lane.runner}, ${lane.node})`,
        runner: lane.runner,
        step: "Retain original public observation",
        members: { "observation.json": native },
      },
    ];
    const { client, fetch } = publicRunFixture(origin, selected);
    const mocked = jest.spyOn(globalThis, "fetch").mockImplementation(fetch);
    try {
      const operation = {
        publicRun: origin.run,
        publicAttempt: origin.attempt,
        publicController: origin.commit,
      };
      const proof = await readPublicObservationBatch(
        client,
        null,
        operation,
        { include: [lane] },
        stage,
        { tarball, npmCli },
      );
      expect(proof.selected[publicLaneKey(lane)].source.jobId).toBe(102);
      await expect(
        readPublicObservationBatch(
          client,
          null,
          operation,
          { include: [lane] },
          stage,
          {
            tarball,
            npmCli,
            complete: true,
          },
        ),
      ).rejects.toThrow("no admissible execution state");
    } finally {
      mocked.mockRestore();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function publicRunFixture(origin, selected) {
  const repo = { id: REPOSITORY_ID, full_name: REPOSITORY };
  const run = {
    id: Number(origin.run),
    run_attempt: Number(origin.attempt),
    head_sha: origin.commit,
    head_branch: "main",
    repository: repo,
    head_repository: repo,
    status: "in_progress",
    conclusion: null,
    event: "workflow_dispatch",
    path: ".github/workflows/release-registry.yml",
  };
  const started_at = "2026-11-26T12:00:00Z",
    completed_at = "2026-11-26T12:02:00Z";
  const jobs = [],
    artifacts = [],
    content = new Map();
  for (const [index, item] of selected.entries()) {
    const id = index + 1;
    const zip = zipArchive(
      Object.entries(item.members).map(([path, value]) => ({
        path,
        content: stableJson(value),
      })),
    );
    content.set(id, zip);
    artifacts.push({
      id,
      name: physicalName({
        logical: item.logical,
        run: origin.run,
        attempt: origin.attempt,
        producer: "a".repeat(16),
        invocation: "d".repeat(32),
        ordinal: 0,
      }),
      digest: "sha256:" + sha256Buffer(zip),
      size_in_bytes: zip.length,
      created_at: "2026-11-26T12:01:30Z",
      expired: false,
      workflow_run: {
        id: run.id,
        head_sha: run.head_sha,
        repository_id: REPOSITORY_ID,
        head_repository_id: REPOSITORY_ID,
      },
    });
    jobs.push({
      id: 100 + id,
      name: item.name,
      labels: [item.runner],
      run_id: run.id,
      head_sha: run.head_sha,
      run_attempt: run.run_attempt,
      status: "completed",
      conclusion: "success",
      runner_id: id,
      started_at,
      completed_at,
      steps: [
        {
          name: item.step,
          status: "completed",
          conclusion: "success",
          started_at,
          completed_at,
        },
      ],
    });
  }
  return {
    client: {
      apiRoot: `https://api.github.com/repos/${REPOSITORY}`,
      headers: () => ({}),
      async read(path) {
        if (path === `/actions/runs/${run.id}`) return run;
        if (path.includes("/jobs?")) return { jobs, total_count: jobs.length };
        if (path.includes("/artifacts?"))
          return { artifacts, total_count: artifacts.length };
        const artifact = artifacts.find(
          (item) => path === `/actions/artifacts/${item.id}`,
        );
        if (artifact) return artifact;
        throw new Error("Unexpected fixture read " + path);
      },
    },
    async fetch(address) {
      const url = new URL(address);
      if (url.hostname === "api.github.com") {
        const id = url.pathname.split("/").at(-2);
        return new Response(null, {
          status: 302,
          headers: {
            location: `https://fixture.blob.core.windows.net/actions-results/${id}`,
          },
        });
      }
      const id = Number(url.pathname.split("/").at(-1));
      return new Response(content.get(id));
    },
  };
}
