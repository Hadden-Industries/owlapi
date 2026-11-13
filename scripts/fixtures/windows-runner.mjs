import { WINDOWS } from "../windows-runner.mjs";

// Exercise the previous or VS 2026 image even when the policy is rolled back.
export const OTHER_WINDOWS_IMAGE =
  WINDOWS.image === "win25" ? "win25-vs2026" : "win25";
