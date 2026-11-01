import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

export const documentationManifest = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
export const documentationSources = () =>
  Object.fromEntries(
    [
      "README.md",
      "CHANGELOG.md",
      "API.md",
      "docs/compatibility/java-api-surface.json",
      "docs/compatibility/java-api-surface.md",
      "docs/compatibility/behavior-profiles.md",
      "docs/compatibility/default-behavior-inventory.md",
    ].map((path) => [
      path,
      readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"),
    ]),
  );
// Input construction only; no production validator or expected-result generator.
export const documentationArchive = (
  files = documentationSources(),
  extra = [],
  manifest = documentationManifest,
) =>
  gzipSync(
    Buffer.concat(
      [
        ...Object.entries({
          "package.json": JSON.stringify(manifest),
          ...files,
        }),
        ...extra,
      ]
        .map(([path, content]) => {
          const bytes = Buffer.from(content),
            header = Buffer.alloc(512);
          header.write(`package/${path}`);
          header.write(
            `${bytes.length.toString(8).padStart(11, "0")}\0`,
            124,
            12,
          );
          header.write("0", 156);
          return Buffer.concat([
            header,
            bytes,
            Buffer.alloc((512 - (bytes.length % 512)) % 512),
          ]);
        })
        .concat([Buffer.alloc(1024)]),
    ),
  );
