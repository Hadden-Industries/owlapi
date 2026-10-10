/** Reviewed exact CI selections; producer obligations remain an independent authority. */
import { readFileSync } from "node:fs";

export const CI_RUNTIME = Object.freeze(
  (() => {
    const policy = JSON.parse(
      readFileSync(
        new URL("../docs/release/runtime-policy.json", import.meta.url),
        "utf8",
      ),
    );
    const producer = JSON.parse(
      readFileSync(
        new URL(
          "../docs/release/producer-release-policy.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const obligation = (id) =>
      producer.replacements.find((row) => row.requirementId === id)
        ?.obligation ?? "";
    const floors = Object.fromEntries(
      [
        ...obligation("P19-NODE-FLOORS-001").matchAll(
          />=(\d+)\.(\d+\.\d+) <\d+/gu,
        ),
      ].map(([, major, minorPatch]) => [major, `${major}.${minorPatch}`]),
    );
    const canonical =
      /Preserve Node (\d+\.\d+\.\d+) canonical production/u.exec(
        obligation("P19-NODE-FLOORS-001"),
      )?.[1];
    const npm = /bootstrap exact npm (\d+\.\d+\.\d+)/u.exec(
      obligation("P19-LOCKED-TOOLCHAIN-001"),
    )?.[1];
    if (
      policy.schemaVersion !== 1 ||
      policy.canonicalNodeMajor !== "24" ||
      Object.keys(policy.node).join(",") !== "22,24,26" ||
      Object.entries(floors).length !== 3 ||
      !Object.entries(policy.node).every(
        ([major, value]) => value === floors[major],
      ) ||
      policy.node[policy.canonicalNodeMajor] !== canonical ||
      policy.npm !== npm
    ) {
      throw new Error(
        "Exact runtime selections do not match reviewed producer obligations",
      );
    }
    return { ...policy, node: Object.freeze(policy.node) };
  })(),
);

export const CANONICAL_NODE = CI_RUNTIME.node[CI_RUNTIME.canonicalNodeMajor];

/** Expand only closed selector tokens; no generic workflow expression evaluation. */
export const projectRuntimeText = (text) =>
  text.replace(/\{\{runtime:(npm|node\.(22|24|26))\}\}/gu, (_, key, major) =>
    key === "npm" ? CI_RUNTIME.npm : CI_RUNTIME.node[major],
  );
