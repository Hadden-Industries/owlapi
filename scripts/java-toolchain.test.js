import { describe, expect, test } from "@jest/globals";
import {
  currentJavaProperties,
  isCurrentJavaEnvironment,
} from "./java-toolchain.mjs";

const observed = [
  "    java.home = /opt/jdk",
  "    java.vendor = Eclipse Adoptium",
  "    java.version = 25.0.5",
  "    java.runtime.version = 25.0.5+8-LTS",
  "    java.vm.version = 25.0.5+8-LTS",
].join("\n");

describe("current Java execution policy", () => {
  test.each(["\n", "\r\n"])(
    "admits native properties with %j separators",
    (separator) => {
      expect(
        currentJavaProperties(observed.replaceAll("\n", separator))[
          "java.version"
        ],
      ).toBe("25.0.5");
    },
  );
  test.each([
    ["java.vendor = Eclipse Adoptium", "java.vendor = Other"],
    ["java.version = 25.0.5", "java.version = 25.0.4.1"],
    [
      "java.runtime.version = 25.0.5+8-LTS",
      "java.runtime.version = 25.0.5+9-LTS",
    ],
    ["java.vm.version = 25.0.5+8-LTS", "java.vm.version = 25.0.4.1+1-LTS"],
    ["java.home = /opt/jdk", "unrelated = /opt/jdk"],
  ])("rejects changed or absent %s", (before, after) => {
    expect(() =>
      currentJavaProperties(observed.replace(before, after)),
    ).toThrow("requires Eclipse Temurin");
  });
  test("missing native identity is not an admitted runtime", () => {
    expect(isCurrentJavaEnvironment(null)).toBe(false);
    expect(() => currentJavaProperties("openjdk version 25")).toThrow();
  });
});
