import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { inspectPackageTarball } from "./archive-evidence.mjs";
import { sha256, verifySha512Sri } from "./digests.mjs";
import { jsonEquals } from "../../scripts/canonical-json.mjs";

const tooling = "tooling/markdown";
const jsonFamily = /\.(?:json|jsonld|map|jsonc|json5|jsonl|ndjson)$/iu;

/** Native lock/archive owner supplies original member buffers and a complete
 * census. The shared package owns JSON checking and exclusion accounting.
 */
export async function provideMarkdownArchiveJson({ root, parameters = {} }) {
  if (
    Object.keys(parameters).some((key) => key !== "temporaryReports") ||
    !Array.isArray(parameters.temporaryReports)
  )
    throw new Error("Invalid native Markdown report parameters");
  const snapshots = await Promise.all(
    ["package.json", "package-lock.json"].map(async (file) => ({
      path: `${tooling}/${file}`,
      bytes: await readFile(join(root, tooling, file)),
    })),
  );
  const [manifest, lock] = snapshots.map(({ bytes }) => JSON.parse(bytes));
  const selectors = {
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  };
  const lockedSelectors = {
    ...lock.packages?.[""].devDependencies,
    ...lock.packages?.[""].optionalDependencies,
  };
  if (!jsonEquals(selectors, lockedSelectors))
    throw new Error("Markdown archive selectors differ from frozen lock");
  const owned = new Set();
  const inventory = [],
    documents = [],
    reports = new Map();
  for (const report of parameters.temporaryReports) {
    if (
      Object.keys(report).sort().join(",") !==
        "memberPath,packageName,sha256,version" ||
      reports.has(report.packageName)
    )
      throw new Error("Invalid temporary original report identity");
    reports.set(report.packageName, report);
  }
  for (const [name, selector] of Object.entries(selectors)) {
    if (
      typeof selector !== "string" ||
      !/^file:archives\/[a-z0-9]+(?:[.-][a-z0-9]+)*\.tgz$/u.test(selector)
    )
      throw new Error(`Unadmitted Markdown archive selector: ${name}`);
    const path = `${tooling}/${selector.slice("file:".length)}`;
    if (owned.has(path)) throw new Error("Duplicate Markdown archive selector");
    owned.add(path);
    const locked = lock.packages[`node_modules/${name}`];
    if (
      !locked ||
      locked.resolved !== selector ||
      typeof locked.version !== "string"
    )
      throw new Error(`Missing locked Markdown archive identity: ${name}`);
    const original = await readFile(join(root, path));
    verifySha512Sri(original, locked.integrity);
    const expected = { name, version: locked.version };
    const first = await inspectPackageTarball(join(root, path), expected);
    const members = first.entries.filter(
      (entry) => entry.type === "FILE" && jsonFamily.test(entry.path),
    );
    const retained = await inspectPackageTarball(join(root, path), expected, {
      retainMembers: members.map((entry) => entry.path),
    });
    if (!jsonEquals(first.entries, retained.entries))
      throw new Error(`Markdown archive census changed: ${path}`);
    const after = await readFile(join(root, path));
    verifySha512Sri(after, locked.integrity);
    if (!original.equals(after))
      throw new Error(`Markdown archive changed during admission: ${path}`);
    const source = {
      kind: "archive-member",
      path,
      sha256: sha256(original),
      byteLength: original.length,
    };
    for (const member of retained.retainedMembers) {
      const memberPath = `${path}!/${member.path}`;
      inventory.push({
        path: memberPath,
        sha256: member.sha256,
        byteLength: member.size,
        source: { ...source, memberPath: member.path },
      });
      documents.push({ path: memberPath, bytes: member.bytes });
    }
    const report = reports.get(name);
    if (report) {
      const member = retained.retainedMembers.find(
        (member) => member.path === report.memberPath,
      );
      if (
        report.version !== locked.version ||
        !member ||
        member.sha256 !== report.sha256
      )
        throw new Error(
          `Remove the temporary original report exclusion after Markdown Quality changes: ${name}`,
        );
      reports.delete(name);
    }
  }
  if (reports.size)
    throw new Error("Missing required original Markdown report package");
  const files = await readdir(join(root, tooling, "archives"));
  if (
    files
      .filter((file) => file.endsWith(".tgz"))
      .some((file) => !owned.has(`${tooling}/archives/${file}`))
  )
    throw new Error("Unaccounted owned Markdown archive");
  for (const snapshot of snapshots)
    if (!snapshot.bytes.equals(await readFile(join(root, snapshot.path))))
      throw new Error(`Markdown JSON authority changed: ${snapshot.path}`);
  return {
    inventory,
    documents,
    authorities: snapshots.map(({ path, bytes }) => ({
      path,
      sha256: sha256(bytes),
      byteLength: bytes.length,
    })),
  };
}
