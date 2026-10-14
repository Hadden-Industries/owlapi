import * as owl from "../index.js";
import { exerciseRC2PublicContract } from "../test/import-closure/rc2-public-contract.js";

test("the installed Node/browser exercise reaches both behavior contracts", async () => {
  const result = await exerciseRC2PublicContract(owl);
  expect(result.behaviorProfiles).toEqual({
    "java-owlapi-5.5.1": {
      targetPublication: "append",
      partialBatch: true,
      jsonAxioms: 1,
    },
    "normative-v1": {
      targetPublication: "replace",
      partialBatch: false,
      jsonAxioms: 1,
    },
  });
});
