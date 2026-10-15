/** Isolated public JSON tooling; product and Node 22 source lanes never import it. */
import { assertIsolatedJsonQuality } from "@hadden-industries/json-quality";

assertIsolatedJsonQuality(new URL("./", import.meta.url));
export * from "@hadden-industries/json-quality";
export { default as jsonQualityEslint } from "@hadden-industries/json-quality/eslint";
