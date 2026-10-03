import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import {
  materializeReferenceBundle,
  verifyReferenceBundle,
} from "./reference-bundle.mjs";

const digest = (data) => createHash("sha256").update(data).digest("hex");
let scratch;
let bundle;
let manifest;
let expected;
const save = () => {
  const bytes = JSON.stringify(manifest);
  writeFileSync(join(bundle, "manifest.json"), bytes);
  expected.manifestSha256 = digest(bytes);
  expected.inventorySha256 = digest(JSON.stringify(manifest.inventory));
};
const verify = () =>
  verifyReferenceBundle({ bundleDirectory: bundle, expected });
const materialize = (destination = join(scratch, "restored")) =>
  materializeReferenceBundle({
    bundleDirectory: bundle,
    destination,
    expected,
  });

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "owlapi-reference-bundle-test-"));
  bundle = join(scratch, "bundle");
  mkdirSync(bundle);
  mkdirSync(join(bundle, "runtime"));
  mkdirSync(join(bundle, "notices"));
  // Deliberately synthetic integrity fixtures, not Java oracle or native graph evidence.
  const files = [
    ["runtime/000.jar", Buffer.from("first synthetic runtime")],
    ["runtime/001.jar", Buffer.from("second synthetic runtime")],
    [
      "notices/experiment.txt",
      Buffer.from("Local integrity fixture; distribution not cleared."),
    ],
  ];
  for (const [file, bytes] of files) writeFileSync(join(bundle, file), bytes);
  manifest = {
    schemaVersion: 1,
    purpose: "LOCAL_RELOCATION_EXPERIMENT",
    redistribution: "NOT_CLEARED",
    source: {
      commit: "d7e997a53b470e32700de89cc610d9daf01ea769",
      tree: "a".repeat(40),
    },
    inputRecordSha256: "b".repeat(64),
    inventory: files.map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: digest(bytes),
    })),
    classpath: ["runtime/000.jar", "runtime/001.jar"],
  };
  expected = {
    sourceCommit: manifest.source.commit,
    sourceTree: manifest.source.tree,
    inputRecordSha256: manifest.inputRecordSha256,
  };
  save();
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

test("relocates admitted bytes and notices in exact original classpath order", () => {
  expect(verify().jarCount).toBe(2);
  const result = materialize();
  expect(result.jarCount).toBe(2);
  expect(readFileSync(result.classpath, "utf8").split(delimiter)).toEqual([
    join(scratch, "restored/runtime/000.jar"),
    join(scratch, "restored/runtime/001.jar"),
  ]);
  for (const row of manifest.inventory)
    expect(digest(readFileSync(join(scratch, "restored", row.path)))).toBe(
      row.sha256,
    );
  expect(readFileSync(join(scratch, "restored/manifest.json"))).toEqual(
    readFileSync(join(bundle, "manifest.json")),
  );
});

test.each([
  "manifestSha256",
  "inventorySha256",
  "inputRecordSha256",
  "sourceCommit",
  "sourceTree",
])("requires the independent %s rather than trusting the payload", (field) => {
  expected[field] = "0".repeat(field.startsWith("source") ? 40 : 64);
  expect(materialize).toThrow(/mismatch/u);
  expect(existsSync(join(scratch, "restored"))).toBe(false);
});

test("requires exact complete expectation fields", () => {
  expected.claimedTrusted = true;
  expect(verify).toThrow(/expectation fields/u);
  delete expected.claimedTrusted;
  delete expected.inventorySha256;
  expect(verify).toThrow(/expectation fields/u);
});

test.each([
  [
    "future schema",
    (m) => {
      m.schemaVersion = 2;
    },
  ],
  [
    "claimed public clearance",
    (m) => {
      m.redistribution = "CLEARED";
    },
  ],
  [
    "claimed hosted purpose",
    (m) => {
      m.purpose = "HOSTED_REFERENCE";
    },
  ],
  [
    "unknown field",
    (m) => {
      m.producer = { runId: 1 };
    },
  ],
  [
    "absolute path",
    (m) => {
      m.inventory[0].path = "/runtime/000.jar";
    },
  ],
  [
    "traversal",
    (m) => {
      m.inventory[0].path = "runtime/../000.jar";
    },
  ],
  [
    "Windows drive",
    (m) => {
      m.inventory[0].path = "C:/runtime/000.jar";
    },
  ],
  [
    "backslash",
    (m) => {
      m.inventory[0].path = "runtime\\000.jar";
    },
  ],
  [
    "case alias",
    (m) => {
      m.inventory[0].path = "Runtime/000.jar";
    },
  ],
  [
    "alternate stream",
    (m) => {
      m.inventory[0].path = "runtime/000.jar:payload";
    },
  ],
  [
    "oversized file",
    (m) => {
      m.inventory[0].bytes = 67108865;
    },
  ],
  [
    "duplicate classpath",
    (m) => {
      m.classpath[1] = m.classpath[0];
    },
  ],
])("rejects schema violation: %s", (_label, mutate) => {
  mutate(manifest);
  save();
  expect(materialize).toThrow(/schema/u);
  expect(existsSync(join(scratch, "restored"))).toBe(false);
});

test.each([
  [
    "reordered classpath",
    (m) => {
      m.classpath.reverse();
    },
  ],
  [
    "missing runtime",
    (m) => {
      m.classpath.pop();
    },
  ],
  [
    "duplicate inventory",
    (m) => {
      m.inventory.push(m.inventory[0]);
    },
  ],
  [
    "missing notices",
    (m) => {
      m.inventory.pop();
    },
  ],
  [
    "nonordinal runtime",
    (m) => {
      m.inventory[1].path = m.classpath[1] = "runtime/099.jar";
    },
  ],
])("rejects closed-inventory violation: %s", (_label, mutate) => {
  mutate(manifest);
  save();
  expect(materialize).toThrow(/inventory/u);
  expect(existsSync(join(scratch, "restored"))).toBe(false);
});

test("rejects missing, extra and nested files before any materialization", () => {
  rmSync(join(bundle, "runtime/001.jar"));
  expect(materialize).toThrow(/inventory/u);
  writeFileSync(join(bundle, "runtime/001.jar"), "second synthetic runtime");
  writeFileSync(join(bundle, "runtime/999.jar"), "extra");
  expect(materialize).toThrow(/inventory/u);
  rmSync(join(bundle, "runtime/999.jar"));
  mkdirSync(join(bundle, "runtime/nested"));
  expect(materialize).toThrow(/nonregular/u);
  expect(existsSync(join(scratch, "restored"))).toBe(false);
});

test("rejects unrelated root content including cached comparison verdicts", () => {
  writeFileSync(join(bundle, "oracle-verdict.json"), '{"passed":true}');
  expect(materialize).toThrow(/bundle entries/u);
});

test("rejects same-length corruption, truncation and false advertised sizes", () => {
  const file = join(bundle, "runtime/000.jar");
  writeFileSync(file, "x".repeat(manifest.inventory[0].bytes));
  expect(materialize).toThrow(/digest/u);
  writeFileSync(file, "x");
  expect(materialize).toThrow(/size/u);
  manifest.inventory[0].bytes = 1;
  save();
  writeFileSync(file, "first synthetic runtime");
  expect(materialize).toThrow(/oversized/u);
  expect(existsSync(join(scratch, "restored"))).toBe(false);
});

test("rejects aggregate payload and manifest size bounds before reading JARs", () => {
  manifest.inventory.forEach((row) => {
    row.bytes = 67108864;
  });
  save();
  expect(materialize).toThrow(/payload size limit/u);
  const bytes = Buffer.alloc(256 * 1024 + 1, 32);
  writeFileSync(join(bundle, "manifest.json"), bytes);
  expected.manifestSha256 = digest(bytes);
  expect(materialize).toThrow(/oversized/u);
});

test("rejects invalid UTF-8 even with a matching byte digest", () => {
  const bytes = Buffer.from([0xff, 0xfe]);
  writeFileSync(join(bundle, "manifest.json"), bytes);
  expected.manifestSha256 = digest(bytes);
  expect(materialize).toThrow();
});

test("rejects hard-linked payloads", () => {
  linkSync(join(bundle, "runtime/000.jar"), join(scratch, "linked.jar"));
  expect(materialize).toThrow(/linked/u);
});

test("rejects a directory junction or symlink, including the bundle root", () => {
  const linked = join(scratch, "alias");
  symlinkSync(bundle, linked, "junction");
  expect(() =>
    verifyReferenceBundle({ bundleDirectory: linked, expected }),
  ).toThrow(/linked/u);
  mkdirSync(join(scratch, "outside"));
  rmSync(join(bundle, "notices"), { recursive: true });
  symlinkSync(join(scratch, "outside"), join(bundle, "notices"), "junction");
  expect(materialize).toThrow(/linked|unexpected/u);
});

test("refuses destination collisions and preserves the caller's existing content", () => {
  mkdirSync(join(scratch, "restored"));
  writeFileSync(join(scratch, "restored/owner.txt"), "preserve");
  expect(materialize).toThrow();
  expect(readFileSync(join(scratch, "restored/owner.txt"), "utf8")).toBe(
    "preserve",
  );
});

test("rejects a linked destination parent and an input-overlapping destination", () => {
  symlinkSync(scratch, join(scratch, "alias"), "junction");
  expect(() => materialize(join(scratch, "alias/restored"))).toThrow(/linked/u);
  expect(() => materialize(join(bundle, "restored"))).toThrow(/overlaps/u);
});

test("rejects native Windows short-name aliases when the host supplies one", () => {
  // An actual host alias, not a fabricated resolver, qualifies this Windows boundary.
  if (process.platform !== "win32" || !existsSync("C:/PROGRA~1")) return;
  expect(() =>
    verifyReferenceBundle({ bundleDirectory: "C:/PROGRA~1", expected }),
  ).toThrow(/aliased path/u);
  expect(() =>
    materialize("C:/PROGRA~1/owlapi-bundle-test-must-not-be-created"),
  ).toThrow(/aliased path/u);
  expect(existsSync("C:/PROGRA~1/owlapi-bundle-test-must-not-be-created")).toBe(
    false,
  );
});
