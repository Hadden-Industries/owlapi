import { fileURLToPath } from "node:url";
import { runJsonQualityCli } from "../tooling/json/public-api.mjs";
import { readRepositoryJsonPolicy } from "./json-quality-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

// Physical inventory/checking is the shared engine's responsibility. Native
// evidence/archive qualification must be composed before complete gate activation.
process.exitCode = await runJsonQualityCli(process.argv.slice(2), async () => {
  await readRepositoryJsonPolicy(root);
  return { root };
});
