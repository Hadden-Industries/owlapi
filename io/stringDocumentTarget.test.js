import * as io from "./index.js";
import * as aggregate from "../index.js";
import * as targetModule from "./stringDocumentTarget.js";

describe("StringDocumentTarget public contract", () => {
  it("exposes one Java-shaped target identity with only toString", () => {
    expect(typeof io.StringDocumentTarget).toBe("function");
    const target = new io.StringDocumentTarget();
    expect(aggregate.StringDocumentTarget).toBe(io.StringDocumentTarget);
    expect(target.toString()).toBe("");
    expect(
      Object.getOwnPropertyNames(io.StringDocumentTarget.prototype),
    ).toEqual(["constructor", "toString"]);
    expect(Object.keys(target)).toEqual([]);
    expect(Object.isFrozen(target)).toBe(true);
    for (const name of ["getText", "getWriter", "write", "append"]) {
      expect(name in target).toBe(false);
    }
    expect(() => io.StringDocumentTarget()).toThrow(TypeError);
    // Java has no constructor accepting initial text. An extra JavaScript
    // argument must not become an undocumented initial-content overload.
    expect(new io.StringDocumentTarget("not initial text").toString()).toBe("");
    expect(() => {
      target.text = "not stored text";
    }).toThrow(TypeError);
    expect(target.toString()).toBe("");
  });

  it("replaces complete text privately without normalization or cross-target leakage", () => {
    expect(typeof targetModule.replaceStringDocumentTargetText).toBe(
      "function",
    );
    const first = new io.StringDocumentTarget();
    const second = new io.StringDocumentTarget();
    for (const text of [
      "ASCII",
      'Ontology(\r\n "astral 🦉 and e\u0301"\r)',
      "",
    ]) {
      targetModule.replaceStringDocumentTargetText(first, text);
      expect(first.toString()).toBe(text);
      expect(second.toString()).toBe("");
    }
    expect(io.replaceStringDocumentTargetText).toBeUndefined();
    expect(aggregate.replaceStringDocumentTargetText).toBeUndefined();
  });

  it("rejects forged targets and non-string replacement without altering prior text", () => {
    expect(typeof targetModule.replaceStringDocumentTargetText).toBe(
      "function",
    );
    const target = new io.StringDocumentTarget();
    const prior = "previous document 🦉\r\n";
    targetModule.replaceStringDocumentTargetText(target, prior);
    for (const text of [undefined, null, 1, {}, [], new String("boxed")]) {
      expect(() =>
        targetModule.replaceStringDocumentTargetText(target, text),
      ).toThrow(TypeError);
      expect(target.toString()).toBe(prior);
    }
    for (const forged of [
      undefined,
      null,
      {},
      Object.create(io.StringDocumentTarget.prototype),
      new Proxy(target, {}),
    ]) {
      expect(() =>
        targetModule.replaceStringDocumentTargetText(forged, "replacement"),
      ).toThrow(TypeError);
      expect(() =>
        io.StringDocumentTarget.prototype.toString.call(forged),
      ).toThrow(TypeError);
      expect(target.toString()).toBe(prior);
    }
  });
});
