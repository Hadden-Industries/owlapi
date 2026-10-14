import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addEmbeddedJsonLdComponents } from "./embedded-provider-sbom.mjs";

// Keep native npm inventory generation and native CycloneDX validation; the
// repository adds only the executable material absent from the npm install graph.
const arguments_ = process.argv.slice(2);
let outputPath;
const outputIndex = arguments_.indexOf("--output-file");
if (outputIndex >= 0) {
  outputPath = arguments_[outputIndex + 1];
  if (!outputPath) throw new Error("--output-file requires a path");
  arguments_.splice(outputIndex, 2);
}
if (
  arguments_.length > 1 ||
  arguments_.some((argument) => argument.startsWith("-"))
)
  throw new Error(
    "Usage: generate-release-sbom.mjs [--output-file PATH] [PACKAGE_JSON]",
  );
// The package's public entry point documents this stable CLI path as its
// programmatic integration contract; it deliberately exports no JavaScript API.
const generatorEntry = fileURLToPath(
  import.meta.resolve("@cyclonedx/cyclonedx-npm"),
);
const cli = resolve(dirname(generatorEntry), "bin/cyclonedx-npm-cli.js");
const generated = spawnSync(
  process.execPath,
  [
    cli,
    "--spec-version",
    "1.6",
    "--output-format",
    "JSON",
    "--output-reproducible",
    "--validate",
    "--mc-type",
    "library",
    "--omit",
    "dev",
    "--",
    ...arguments_,
  ],
  { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
);
if (generated.error || generated.status !== 0)
  throw new Error(
    `CycloneDX npm inventory failed: ${generated.error?.message ?? generated.stderr}`,
  );
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const document = await addEmbeddedJsonLdComponents(
  JSON.parse(generated.stdout),
  repositoryRoot,
);
const text = `${JSON.stringify(document, null, 2)}\n`;
if (outputPath) writeFileSync(outputPath, text);
else process.stdout.write(text);
