import { expect, test } from "@jest/globals";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshReleaseAudits } from "./release-assurance.mjs";
import { assertReleaseAudit } from "./release-audit-policy.mjs";
import { canonicalJson } from "./canonical-json.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";

test("native npm resolves the exact retained lock, including a hoisted production dependency", () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-assurance-fixture-"));
  try {
    const transport = join(root, "tooling", "artifact-transport");
    mkdirSync(transport, { recursive: true });
    for (const directory of [root, transport]) {
      writeFileSync(join(directory, "package.json"), "{}");
      writeFileSync(join(directory, "package-lock.json"), "{}");
    }
    const local = {
      name: "release-consumer",
      version: "1.0.0",
      dependencies: { owlapi: "file:qualified.tgz" },
    };
    const lock = {
      ...local,
      lockfileVersion: 3,
      packages: {
        "": local,
        "node_modules/owlapi": {
          name: PACKAGE_NAME,
          version: PACKAGE_VERSION,
          resolved: "file:qualified.tgz",
          dependencies: { example: "1.2.3" },
        },
        "node_modules/example": {
          version: "1.2.3",
          resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
        },
      },
    };
    const bytes = Buffer.from(canonicalJson(lock));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const roots = [];
    const audit = (directory) => {
      roots.push(directory);
      if (directory !== root && directory !== transport)
        expect(readFileSync(join(directory, "package-lock.json"))).toEqual(
          bytes,
        );
      return {
        status: 0,
        report: {
          metadata: { vulnerabilities: { moderate: 1, high: 0, critical: 0 } },
        },
      };
    };
    const identities = [`${PACKAGE_NAME}@${PACKAGE_VERSION}`, "example@1.2.3"];
    expect(
      refreshReleaseAudits(bytes, identities, { repositoryRoot: root, audit })
        .recipient.lockSha256,
    ).toEqual(digest);
    expect(roots).toHaveLength(3);
    const wrong = structuredClone(lock);
    wrong.packages["node_modules/example"].version = "1.2.4";
    expect(() =>
      refreshReleaseAudits(Buffer.from(JSON.stringify(wrong)), identities, {
        repositoryRoot: root,
        audit,
      }),
    ).toThrow(/retained recipient lock/u);
    expect(roots).toHaveLength(3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test.each([
  [0, { high: 1, critical: 0 }],
  [0, { high: 0, critical: 1 }],
  [0, { high: 0 }],
  [1, { high: 0, critical: 0 }],
])(
  "the release audit rejects exit %s with counts %j",
  (status, vulnerabilities) => {
    expect(() =>
      assertReleaseAudit(
        { status, report: { metadata: { vulnerabilities } } },
        "test graph",
      ),
    ).toThrow(/Release audit failed for test graph/u);
  },
);
