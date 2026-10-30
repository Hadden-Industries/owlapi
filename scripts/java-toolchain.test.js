import { describe, expect, test } from "@jest/globals";
import {
  currentJavaProperties,
  isCurrentJavaEnvironment,
  javaToolchainSelection,
  JAVA_TOOLCHAIN,
} from "./java-toolchain.mjs";

const observed = [
  "    java.home = /opt/jdk",
  `    java.vendor = ${JAVA_TOOLCHAIN.vendor}`,
  `    java.version = ${JAVA_TOOLCHAIN.version}`,
  `    java.runtime.version = ${JAVA_TOOLCHAIN.runtime}`,
  `    java.vm.version = ${JAVA_TOOLCHAIN.runtime}`,
].join("\n");

describe("current Java execution policy", () => {
  test("one synthetic selection derives independent native and platform spellings", () => {
    expect(javaToolchainSelection("29.0.2+11.0.LTS\n")).toEqual({
      vendor: "Eclipse Adoptium",
      distribution: "temurin",
      version: "29.0.2",
      runtime: "29.0.2+11-LTS",
      setupJavaVersion: "29.0.2+11.0.LTS",
      windowsPackage: "EclipseAdoptium.Temurin.29.JDK",
      windowsVersion: "29.0.2.11",
    });
  });
  test.each([
    "25",
    "25.0.5",
    "25.0.5+8",
    "25.0.5+8-ea",
    ">=25.0.5",
    "25.0.5+8.0.LTS\n26.0.1+9.0.LTS",
  ])("rejects incomplete or ambiguous Java selection %s", (selection) => {
    expect(() => javaToolchainSelection(selection)).toThrow("exact Temurin");
  });
  test.each(["\n", "\r\n"])(
    "admits native properties with %j separators",
    (separator) => {
      expect(
        currentJavaProperties(observed.replaceAll("\n", separator))[
          "java.version"
        ],
      ).toBe(JAVA_TOOLCHAIN.version);
    },
  );
  test.each([
    ["java.vendor = Eclipse Adoptium", "java.vendor = Other"],
    [`java.version = ${JAVA_TOOLCHAIN.version}`, "java.version = 0.0.0"],
    [
      `java.runtime.version = ${JAVA_TOOLCHAIN.runtime}`,
      `java.runtime.version = ${JAVA_TOOLCHAIN.version}+9999-LTS`,
    ],
    [
      `java.vm.version = ${JAVA_TOOLCHAIN.runtime}`,
      "java.vm.version = 0.0.0+1-LTS",
    ],
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
