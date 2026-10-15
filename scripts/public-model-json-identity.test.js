import * as owl from "@hadden-industries/owlapi";
import { exercisePublicModelFields } from "../test/consumers/owl-contract/public-model-probes.js";

const observableProjection = (value) => JSON.parse(JSON.stringify(value));

const withSubclassProjection = (transform) => {
  const factory = owl.OWLManager.createOWLOntologyManager().getOWLDataFactory();
  const wrapped = new Proxy(
    {},
    {
      get(_target, name) {
        if (name === "getOWLSubClassOfAxiom") {
          return (...arguments_) => {
            const value = factory.getOWLSubClassOfAxiom(...arguments_);
            return {
              ...value,
              subClass: transform(observableProjection(value.subClass)),
            };
          };
        }
        const value = factory[name];
        return typeof value === "function" ? value.bind(factory) : value;
      },
    },
  );
  return {
    ...owl,
    OWLManager: {
      createOWLOntologyManager: () => ({ getOWLDataFactory: () => wrapped }),
    },
  };
};

test("public field evidence accepts reordered observable object members", () => {
  const projected = withSubclassProjection((value) =>
    Object.fromEntries(Object.entries(value).reverse()),
  );
  expect(exercisePublicModelFields(projected)).toBeGreaterThan(0);
});

test("public field evidence rejects changed observable values", () => {
  const projected = withSubclassProjection((value) => ({
    ...value,
    unexpected: true,
  }));
  expect(() => exercisePublicModelFields(projected)).toThrow(
    "Public model field differs: OWLSubClassOfAxiom.subClass",
  );
});
