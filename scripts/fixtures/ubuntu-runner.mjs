import { UBUNTU } from "../ubuntu-runner.mjs";

export const OTHER_UBUNTU =
  UBUNTU.label === "ubuntu-24.04"
    ? { label: "ubuntu-26.04", image: "ubuntu26" }
    : { label: "ubuntu-24.04", image: "ubuntu24" };
