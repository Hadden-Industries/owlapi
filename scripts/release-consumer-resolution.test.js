import { expect, test } from "@jest/globals";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  captureConsumerResolution,
  compareConsumerResolutions,
  currentResolutionPlatform,
} from "./release-consumer-resolution.mjs";
import { readConsumerResolutionProof } from "./release-ci-package.mjs";
import { installResolutionFixture } from "./fixtures/npm-consumer-resolution.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { readZipArchiveFiles } from "./release-zip.mjs";
import { PACKAGE_NAME } from "./package-identity.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";

test("replay exact alias and scoped npm installs, preserving typed edges and independent consumer versions", async () => {
  const npmCli = process.env.OWLAPI_CONSUMER_NPM ?? process.env.npm_execpath;
  const results = [];
  for (const [dependencyName, version] of [
    [PACKAGE_NAME, "26.6.10"],
    ["owlapi", "26.6.11"],
  ]) {
    const root = mkdtempSync(join(tmpdir(), "owlapi-native-graph-test-"));
    try {
      const { tarball } = await installResolutionFixture(
        root,
        npmCli,
        dependencyName,
        version,
      );
      const opts = { npmCli, dependencyName, tarball };
      const marker = "PRIVATE_FIXTURE_MARKER";
      const privatePath = join(root, "private-audit-original");
      writeFileSync(privatePath, marker, { flag: "wx", mode: 0o600 });
      const observation = await captureConsumerResolution(root, opts);
      const members = [
        {
          path: "package.json",
          content: readFileSync(join(root, "package.json")),
        },
        {
          path: "package-lock.json",
          content: readFileSync(join(root, "package-lock.json")),
        },
      ];
      async function reopen(record, extra = []) {
        const bytes = zipArchive([
          ...members,
          { path: "resolution.json", content: JSON.stringify(record) },
          ...extra,
        ]);
        if (!extra.length)
          for (const { content } of readZipArchiveFiles(bytes))
            expect(content.includes(Buffer.from(marker))).toBe(false);
        return readConsumerResolutionProof({
          ...opts,
          platform: currentResolutionPlatform(),
          observedNpm: observation.npm,
          artifact: {
            id: 77,
            size_in_bytes: bytes.length,
            digest:
              "sha256:" + createHash("sha256").update(bytes).digest("hex"),
          },
          download: async () => bytes,
        });
      }
      // The private original is retrievable by the local test operator. Only graph
      // evidence enters this trial ZIP; a production evaluator needs its own custody.
      expect(readFileSync(privatePath, "utf8")).toBe(marker);
      const observed = await reopen(observation);
      expect(observed.graph.edges).toContainEqual({
        from: "node_modules/reader",
        name: "older",
        type: "prod",
        spec: "npm:leaf@^1.0.0",
        to: "node_modules/older",
      });
      expect(observed.graph.edges).toContainEqual({
        from: "node_modules/reader",
        name: "host",
        type: "peer",
        spec: "^1",
        to: "node_modules/host",
      });
      expect(observed.graph.edges).toContainEqual({
        from: "node_modules/reader",
        name: "foreign",
        type: "optional",
        spec: "1.0.0",
        to: null,
      });
      expect(
        observed.graph.nodes
          .filter((n) => n.name === "leaf")
          .map((n) => n.version)
          .sort(),
      ).toEqual(["1.0.0", "2.0.0"]);
      for (const name of ["wrapper", "future"])
        expect(observed.graph.edges).toContainEqual({
          from: "node_modules/reader",
          name,
          type: "optional",
          spec: "1.0.0",
          to: null,
        });
      // A root extension is excluded from the trusted measurement surface.
      writeFileSync(join(root, ".npm-extension.mjs"), "");
      await expect(captureConsumerResolution(root, opts)).rejects.toThrow(
        "Unexpected consumer npm extension",
      );
      rmSync(join(root, ".npm-extension.mjs"));
      const lockPath = join(root, "package-lock.json");
      const originalLock = readFileSync(lockPath);
      const forged = JSON.parse(originalLock);
      forged.packages["node_modules/" + dependencyName].extraneous = true;
      writeFileSync(lockPath, JSON.stringify(forged));
      await expect(captureConsumerResolution(root, opts)).rejects.toThrow(
        /candidate archive occurrence/,
      );
      delete forged.packages["node_modules/" + dependencyName].extraneous;
      forged.packages["node_modules/" + dependencyName].peerDependencies = {
        rogue: "*",
      };
      writeFileSync(lockPath, JSON.stringify(forged));
      await expect(captureConsumerResolution(root, opts)).rejects.toThrow(
        /peerDependencies/,
      );
      delete forged.packages["node_modules/" + dependencyName].peerDependencies;
      forged.packages["node_modules/rogue"] = {
        ...forged.packages["node_modules/host"],
        extraneous: true,
      };
      writeFileSync(lockPath, JSON.stringify(forged));
      await expect(captureConsumerResolution(root, opts)).rejects.toThrow(
        /extraneous/i,
      );
      writeFileSync(lockPath, originalLock);
      expect(observed.graph.edges).toContainEqual({
        from: "node_modules/reader",
        name: "alternative",
        type: "prod",
        spec: "^1",
        accept: "^2",
        to: "node_modules/alternative",
      });
      results.push(observed);
      const changed = structuredClone(observed);
      changed.graph.edges.find(
        (e) => e.name === "host" && e.type === "peer",
      ).from = "node_modules/plugin";
      await expect(reopen(changed)).rejects.toThrow(/edges/);
      await expect(
        reopen(observation, [
          { path: "audit.json", content: "PRIVATE_FIXTURE_MARKER" },
        ]),
      ).rejects.toThrow();
      const wrong = structuredClone(observation);
      wrong.tarballSha256 = "0".repeat(64);
      await expect(reopen(wrong)).rejects.toThrow();
      renameSync(join(root, "node_modules/host"), join(root, "absent-host"));
      await expect(captureConsumerResolution(root, opts)).rejects.toThrow(
        /edge/,
      );
      renameSync(join(root, "absent-host"), join(root, "node_modules/host"));
      writeFileSync(
        join(root, "node_modules", dependencyName, "unexpected.js"),
        "",
      );
      await expect(captureConsumerResolution(root, opts)).rejects.toThrow(
        /payload/,
      );
    } finally {
      expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
      rmSync(root, { recursive: true, force: true });
    }
  }
  const delta = compareConsumerResolutions(...results);
  expect(delta.edges).toEqual([]);
  expect(delta.occurrences).toHaveLength(1);
  expect(delta.occurrences[0].requestedBy.after).toMatchObject([
    { from: "node_modules/reader", name: "node-types", spec: "*" },
  ]);
  expect(delta.occurrences[0]).toMatchObject({
    before: { name: "node-types", version: "26.6.10" },
    after: { name: "node-types", version: "26.6.11" },
  });
  const contradictory = structuredClone(results[1]);
  contradictory.graph.nodes.find((n) => n.name === "host").integrity =
    results[0].graph.nodes.find((n) => n.name === "reader").integrity;
  expect(() => compareConsumerResolutions(results[0], contradictory)).toThrow(
    /Contradictory archive/,
  );
}, 60000);
