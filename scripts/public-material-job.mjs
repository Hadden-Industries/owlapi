/** One canonical runner verifies each retained public resolution and scans only novel archives. */
import assert from "node:assert/strict";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { GitHubReleaseClient } from "./github-release.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import { readPublicObservationBatch } from "./release-public-proof.mjs";
import { loadPublicContext } from "./public-audit-batch.mjs";
import {
  coordinate,
  observedArchives,
  openCanonicalEvidence,
} from "../util/third-party-evidence/recipient-material-inputs.mjs";
import { verifyCiConsumerEvidence } from "./ci-consumer-evidence-verification.mjs";
import { stableJson } from "./canonical-json.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { assertConsumerNpm } from "./consumer-runtime-tools.mjs";
import { recipientMaterialCaseDirectory } from "./recipient-material-case.mjs";

const env = process.env;
const origin = {
  commit: env.GITHUB_SHA,
  run: env.GITHUB_RUN_ID,
  attempt: env.GITHUB_RUN_ATTEMPT,
};
mkdirSync(".release", { recursive: true });
const scope = realpathSync(".release");

async function prepare() {
  const client = new GitHubReleaseClient({
    repository: REPOSITORY,
    token: env.GH_TOKEN,
  });
  const npmCli = env.OWLAPI_CONSUMER_NPM;
  assertConsumerNpm(npmCli);
  const { checkpoint, operation, matrix, input, options } =
    await loadPublicContext(client, env, npmCli);
  const { selected } = await readPublicObservationBatch(
    client,
    checkpoint,
    operation,
    matrix,
    input,
    options,
  );
  const { byCoordinate } = await openCanonicalEvidence(process.cwd());
  const novel = new Set();
  const lanes = {};
  for (const [key, { artifact, source, consumers }] of Object.entries(
    selected,
  )) {
    lanes[key] = {
      artifact,
      source,
      consumers: Object.fromEntries(
        Object.entries(consumers).map(([mode, { evidence }]) => [
          mode,
          evidence,
        ]),
      ),
    };
    for (const { evidence, original } of Object.values(consumers)) {
      for (const archive of observedArchives(
        evidence.resolution,
        original.lockBytes,
      ).byId.values()) {
        const canonical = byCoordinate.get(coordinate(archive));
        if (!canonical) novel.add(archive.artifactId);
        else
          assert.equal(
            canonical.artifactId,
            archive.artifactId,
            "Public archive conflicts with canonical evidence",
          );
      }
    }
  }
  const directory = mkdtempSync(join(scope, "public-material-work-"));
  const bytes = Buffer.from(
    stableJson({ input, origin, lanes, historyObject: env.HISTORY_OBJECT }),
  );
  writeFileSync(join(directory, "originals.json"), bytes, { flag: "wx" });
  appendFileSync(
    env.GITHUB_OUTPUT,
    `root=${directory}\nsha256=${sha256Buffer(bytes)}\nnovel=${novel.size > 0}\n`,
  );
  process.stdout.write(
    `${Object.keys(lanes).length} public lanes selected for material verification; ${novel.size} novel archives.\n`,
  );
}

async function collect() {
  const directory = realpathSync(env.PUBLIC_MATERIAL_ROOT);
  assert.ok(isStrictDescendantPath(scope, directory));
  assert.match(
    directory.slice(scope.length + 1),
    /^public-material-work-[a-zA-Z0-9]+$/u,
  );
  const bytes = readFileSync(join(directory, "originals.json"));
  assert.equal(sha256Buffer(bytes), env.PUBLIC_MATERIAL_ORIGINAL_SHA256);
  const plan = JSON.parse(bytes);
  assert.deepEqual(plan.origin, origin);
  const originals = {},
    lanes = {};
  const decisionDirectory = join(directory, "decision-work");
  try {
    for (const [key, { artifact, source, consumers }] of Object.entries(
      plan.lanes,
    )) {
      const decisions = {};
      for (const [mode, evidence] of Object.entries(consumers)) {
        const locator = mkdtempSync(join(directory, "lock-"));
        writeFileSync(join(locator, "package.json"), evidence.manifest, {
          flag: "wx",
        });
        writeFileSync(join(locator, "package-lock.json"), evidence.lock, {
          flag: "wx",
        });
        const verdict = await verifyCiConsumerEvidence({
          directory: locator,
          evidence,
          role: `public-${mode}`,
          decisionDirectory,
          npmCli: env.OWLAPI_CONSUMER_NPM,
          caseDirectory: join(scope, recipientMaterialCaseDirectory),
          caseContext: {
            kind: "PUBLIC_OBSERVATION",
            historyObject: plan.historyObject,
            stage: plan.input,
            observation: { artifact, source },
            lane: key,
          },
        });
        const original = readFileSync(
          join(
            decisionDirectory,
            "decisions",
            `${verdict.decisionSha256}.json`,
          ),
          "utf8",
        );
        const { materialSha256 } = JSON.parse(original);
        const material = readFileSync(
          join(
            decisionDirectory,
            "material",
            verdict.resolutionSha256,
            "recipient-material.json",
          ),
          "utf8",
        );
        assert.equal(
          sha256Buffer(Buffer.from(original)),
          verdict.decisionSha256,
        );
        assert.equal(sha256Buffer(Buffer.from(material)), materialSha256);
        originals[verdict.decisionSha256] = original;
        originals[materialSha256] = material;
        decisions[mode] = verdict.decisionSha256;
      }
      lanes[key] = { artifact, source, decisions };
    }
    mkdirSync(".release/public-material", { recursive: true });
    writeFileSync(
      ".release/public-material/material.json",
      stableJson({
        schemaVersion: 2,
        input: plan.input,
        origin,
        lanes,
        originals,
      }),
      { flag: "wx" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

try {
  const command = process.argv[2];
  if (command === "prepare") await prepare();
  else if (command === "collect") await collect();
  else throw new Error("Select a public material operation");
} catch {
  process.stderr.write("Public material verification did not complete.\n");
  process.exitCode = 1;
}
