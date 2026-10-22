/** Reproduce self-contained action bundles from the isolated exact dependency lock. */
import { build } from "vite";
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { hashBytes } from "../tooling/artifact-transport/identity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const output = resolve(root, ".github/actions/retain-artifact/dist");
let previous = [];
try {
  previous = Object.keys(
    JSON.parse(await readFile(resolve(output, "build.json"), "utf8")).outputs,
  );
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}
const generated = new Map();
const builds = await build({
  configFile: false,
  root,
  logLevel: "error",
  ssr: { noExternal: true },
  build: {
    ssr: true,
    target: "node24",
    write: false,
    minify: false,
    license: { fileName: "third-party-licenses.txt" },
    rolldownOptions: {
      input: {
        action: resolve(root, "tooling/artifact-transport/action.mjs"),
        "sdk-worker": resolve(
          root,
          "tooling/artifact-transport/sdk-worker.mjs",
        ),
      },
      output: {
        entryFileNames: "[name].mjs",
        chunkFileNames: "[name]-[hash].mjs",
      },
    },
  },
});
for (const result of Array.isArray(builds) ? builds : [builds]) {
  for (const asset of result.output) {
    generated.set(
      asset.fileName,
      Buffer.from(asset.type === "chunk" ? asset.code : asset.source),
    );
  }
}
const bindings = {};
for (const path of [
  "docs/release/artifact-transport-policy.json",
  "tooling/artifact-transport/package-lock.json",
  "tooling/artifact-transport/package.json",
  "tooling/artifact-transport/rights-review.json",
  "tooling/artifact-transport/docs/provenance/npm-package-evidence.json",
  "tooling/artifact-transport/docs/provenance/npm-package-evidence.schema.json",
  "docs/provenance/npm-package-evidence.schema.json",
  ".github/actions/retain-artifact/action.yml",
  ".github/actions/collect-artifacts/action.yml",
  "package-lock.json",
  "scripts/release-zip-core.mjs",
  "scripts/build-artifact-action.mjs",
  "scripts/artifact-tool-evidence.mjs",
  ...(await readdir(resolve(root, "tooling/artifact-transport")))
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => `tooling/artifact-transport/${name}`),
]) {
  bindings[path] = hashBytes(await readFile(resolve(root, path)));
}
generated.set(
  "build.json",
  Buffer.from(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputs: bindings,
        outputs: Object.fromEntries(
          [...generated].map(([name, bytes]) => [name, hashBytes(bytes)]),
        ),
      },
      null,
      2,
    )}\n`,
  ),
);
await mkdir(output, { recursive: true });
for (const [name, bytes] of generated) {
  const destination = resolve(output, name);
  if (
    !destination.startsWith(`${output}/`) &&
    !destination.startsWith(`${output}\\`)
  ) {
    throw new Error("Bundle emitted an unsafe asset path");
  }
  if (check) {
    if (!(await readFile(destination)).equals(bytes)) {
      throw new Error(`Stale artifact bundle: ${name}`);
    }
  } else {
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, bytes);
  }
}
const existing = (
  await readdir(output, { recursive: true, withFileTypes: true })
)
  .filter((entry) => entry.isFile())
  .map((entry) =>
    resolve(entry.parentPath, entry.name)
      .slice(output.length + 1)
      .replaceAll("\\", "/"),
  );
for (const name of existing) {
  if (!generated.has(name)) {
    if (
      check ||
      !previous.includes(name) ||
      name.split("/").some((part) => part === ".." || part === "")
    ) {
      throw new Error("Unowned artifact bundle output");
    }
    await unlink(resolve(output, name));
  }
}
