import { publicMembers } from "./public-api-members.mjs";
import { IRI, OWLStructuralObject, OWLDocumentFormat } from "../model/index.js";
import { RDFXMLDocumentFormat } from "../formats/index.js";

test.each([
  [IRI, OWLStructuralObject],
  [RDFXMLDocumentFormat, OWLDocumentFormat],
])(
  "public subclasses retain inherited OWLAPI members in the registry",
  (child, parent) => {
    for (const member of publicMembers(parent).filter((name) =>
      name.startsWith("prototype."),
    ))
      expect(publicMembers(child)).toContain(member);
    expect(publicMembers(child)).not.toContain("prototype.hasOwnProperty");
  },
);

test("reflection deduplicates overridden inherited members without executing getters", () => {
  class Base {
    static create() {}
    read() {}
    get dangerous() {
      throw Error("not invoked");
    }
  }
  class Derived extends Base {
    read() {}
    own() {}
  }
  expect(publicMembers(Derived)).toEqual([
    "prototype.dangerous",
    "prototype.own",
    "prototype.read",
    "static create",
  ]);
  expect(publicMembers(Derived, { inherited: false })).toEqual([
    "prototype.own",
    "prototype.read",
  ]);
});

test("error subclasses retain library members without promising native runtime reflection", () => {
  class LibraryError extends Error {
    explain() {}
  }
  class Derived extends LibraryError {}
  expect(publicMembers(Derived)).toEqual(["prototype.explain"]);
});
