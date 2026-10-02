import * as implementation from "./owlDocumentFormat.js";
import * as publicModel from "./index.js";
import { OWLDocumentFormats } from "../formats/index.js";

it("lets package-owned storers inspect immutable parameters without a public method", () => {
  const format = OWLDocumentFormats.FUNCTIONAL.withParameter(
    "unknown-output-option",
    { values: [1, 2] },
  );
  expect(typeof implementation.readDocumentFormatParameters).toBe("function");
  const parameters = implementation.readDocumentFormatParameters(format);
  expect(parameters["unknown-output-option"]).toEqual({ values: [1, 2] });
  expect(Object.isFrozen(parameters)).toBe(true);
  expect(Object.isFrozen(parameters["unknown-output-option"].values)).toBe(
    true,
  );
  expect(publicModel.readDocumentFormatParameters).toBeUndefined();
  expect(
    Object.getOwnPropertyNames(implementation.OWLDocumentFormat.prototype),
  ).toEqual([
    "constructor",
    "getParameter",
    "getOntologyLoaderMetaData",
    "withOntologyLoaderMetaData",
    "withParameter",
  ]);
  expect(() =>
    implementation.readDocumentFormatParameters(
      Object.create(implementation.OWLDocumentFormat.prototype),
    ),
  ).toThrow(TypeError);
});
