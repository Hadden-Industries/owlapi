import { expect, test } from "@jest/globals";
import { stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import {
  packPublicMaterial,
  unpackPublicMaterial,
} from "./public-material-packet.mjs";
import { publicMaterialFailureCode } from "./public-material-job.mjs";

const hash = (value) => sha256Buffer(Buffer.from(value));

function fixture() {
  const artifact = { artifactId: "a".repeat(64), canonical: "x".repeat(20000) };
  const location = {
    location: "node_modules/fixture",
    status: "PASSED",
    rationale: "approved",
  };
  const lanes = {},
    originals = {};
  for (let index = 0; index < 16; index++) {
    const material = stableJson({
      subject: { exactLane: index },
      artifacts: [artifact],
      decisions: [location],
    });
    const materialSha256 = hash(material);
    originals[materialSha256] = material;
    const decision = stableJson({ materialSha256, result: "PASS" });
    const decisionSha256 = hash(decision);
    originals[decisionSha256] = decision;
    lanes[index] = {
      decisions: { alias: decisionSha256, scoped: decisionSha256 },
    };
  }
  return { input: {}, origin: {}, lanes, originals };
}

test("deduplicates material archive and per-location rows while recovering every exact digest", () => {
  const original = fixture();
  const packed = packPublicMaterial(original);
  expect(packed.schemaVersion).toBe(3);
  expect(Object.keys(packed.artifacts)).toHaveLength(1);
  expect(Object.keys(packed.dispositions)).toHaveLength(1);
  expect(Object.keys(packed.materials)).toHaveLength(16);
  expect(Buffer.byteLength(stableJson(packed))).toBeLessThan(
    Buffer.byteLength(stableJson(original)) / 5,
  );
  expect(unpackPublicMaterial(packed)).toEqual({
    schemaVersion: 2,
    ...original,
  });
  const bad = JSON.parse(stableJson(packed));
  Object.values(bad.artifacts)[0].canonical = "changed";
  expect(() => unpackPublicMaterial(bad)).toThrow(
    "Public material row digest changed",
  );
  const extra = JSON.parse(stableJson(packed));
  extra.dispositions["e".repeat(64)] = {};
  expect(() => unpackPublicMaterial(extra)).toThrow(
    "Unrequested rows in the public material proof",
  );
  const oversized = JSON.parse(stableJson(packed));
  const recipe = Object.values(oversized.materials)[0];
  recipe.artifacts = Array(1000).fill(recipe.artifacts[0]);
  expect(() => unpackPublicMaterial(oversized)).toThrow(
    "Public material expansion exceeds its bound",
  );
});

test("projects safe public stage codes without reproducing vendor text", () => {
  const privateMessage =
    "native registry, scanner or advisory detail stays private";
  expect(publicMaterialFailureCode(new Error(privateMessage))).toBe(
    "PUBLIC_MATERIAL_UNAVAILABLE",
  );
  expect(publicMaterialFailureCode(new SyntaxError(privateMessage))).toBe(
    "PUBLIC_MATERIAL_REJECTED",
  );
  expect(
    publicMaterialFailureCode(
      Object.assign(new Error(privateMessage), {
        code: "RECIPIENT_MATERIAL_RIGHTS_PENDING",
      }),
    ),
  ).toBe("PUBLIC_MATERIAL_RIGHTS_PENDING");
});
