import sourceConfiguration from "./eslint.config.js";
import { jsonQualityEslint } from "./tooling/json/public-api.mjs";

/** Canonical Node 24/26 tooling only. The ordinary source configuration remains
 * loadable on Node 22 without importing or installing this developer graph.
 * Generated vendor source retains its native build/consumer owner in that config.
 */
export default [
  ...sourceConfiguration,
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { "json-quality": jsonQualityEslint },
    rules: { "json-quality/no-json-stringify-identity": "error" },
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
];
