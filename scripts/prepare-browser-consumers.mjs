import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { prepareBrowserConsumers } from "./browser-consumer-preparation.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const reviewedMapPath = join(
  repositoryRoot,
  "test",
  "consumers",
  "browser",
  "import-map",
  "reference-import-map.json",
);

const { values } = parseArgs({
  options: {
    candidate: { type: "string" },
    output: { type: "string" },
    "write-reviewed-map": { type: "boolean" },
    "approved-provider-pin-changes": { type: "string" },
  },
});
if (!values.candidate || !values.output) {
  throw new Error(
    "Browser-consumer preparation requires --candidate and --output",
  );
}
const outputDirectory = resolve(values.output);
await prepareBrowserConsumers({
  candidateDirectory: resolve(values.candidate),
  outputDirectory,
  reviewedMapPath,
  writeReviewedMap: values["write-reviewed-map"],
  approvedProviderPinChangesPath: values["approved-provider-pin-changes"],
  npmCli: process.env.npm_execpath,
});
process.stdout.write(`${outputDirectory}\n`);
