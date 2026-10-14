import { readFileSync, existsSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const ledger = read("docs/compatibility/java-api-parity-decisions.json");
const schema = read("docs/compatibility/java-api-parity-decisions.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

test("the current behavior ledger binds the released oracle and paired contracts separately from historical receipts", () => {
  expect(ledger.currentBehaviorContracts).toBeDefined();
  expect(validate(ledger)).toBe(true);
  const current = ledger.currentBehaviorContracts;
  expect(current.javaAuthority.commitObjectId).toBe(
    "f760b3a4c107c6d5f90f856e5680c39b18af646f",
  );
  const provenance = read(current.javaAuthority.provenancePath);
  expect(current.javaAuthority.commitObjectId).toBe(
    provenance.upstream.commit.commitObjectId,
  );
  expect(current.omittedBehaviorProfileId).toBe("normative-v1");
  expect(ledger.javaAuthority.revision).toBe(
    "d7e997a53b470e32700de89cc610d9daf01ea769",
  );
  expect(
    new Set(current.decisions.map(({ decisionId }) => decisionId)).size,
  ).toBe(current.decisions.length);
  for (const decision of current.decisions) {
    expect(decision.javaExpectation.behaviorProfileId).toBe(
      "java-owlapi-5.5.1",
    );
    expect(decision.normativeExpectation.behaviorProfileId).toBe(
      "normative-v1",
    );
    for (const path of [
      ...decision.authorityReferences,
      ...decision.rationaleReferences,
      ...decision.testCaseReferences,
      decision.acceptanceReference,
    ])
      expect(existsSync(new URL(path.split("#", 1)[0], root))).toBe(true);
  }
});

test("current contract schema rejects retargeted authority, ambiguous profiles, unclassified behavior and missing paired evidence", () => {
  expect(ledger.currentBehaviorContracts).toBeDefined();
  for (const alter of [
    (current) => {
      current.javaAuthority.commitObjectId =
        "d7e997a53b470e32700de89cc610d9daf01ea769";
    },
    (current) => {
      current.omittedBehaviorProfileId = "java-owlapi-5.5.1";
    },
    (current) => {
      current.decisions[0].javaExpectation.behaviorProfileId = "java-latest";
    },
    (current) => {
      current.decisions[0].behaviorRelationship = "intentional-difference";
    },
    (current) => {
      delete current.decisions[0].normativeExpectation;
    },
    (current) => {
      current.decisions[0].testCaseReferences = [];
    },
    (current) => {
      current.decisions[0].qualityScenarioIds = ["QA-999"];
    },
  ]) {
    const invalid = structuredClone(ledger);
    alter(invalid.currentBehaviorContracts);
    expect(validate(invalid)).toBe(false);
  }
});
