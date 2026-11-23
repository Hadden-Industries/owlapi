import { fileURLToPath } from "node:url";

export const writerModes = Object.freeze([
  "defaults",
  "no-banners",
  "two-spaces",
  "no-indent",
  "labels",
  "save-ids",
  "force-string",
]);

export const writerFixturePath = fileURLToPath(
  new URL("./fixtures/storage/rdfxml-refinements.ofn", import.meta.url),
);
