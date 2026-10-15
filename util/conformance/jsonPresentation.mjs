import { formatJsonValue } from "../../tooling/json/public-api.mjs";

/** Native fixture producers use the adopted ordinary JSON presentation.
 * This printer changes presentation only; corpus source strings and domain
 * projections remain owned by each generator and its conformance tests.
 */
export const formatConformanceJson = formatJsonValue;
