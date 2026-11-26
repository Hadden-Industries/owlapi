/** Lazily prepare the admitted scanner only when acquisition reaches a new archive. */
import { join } from "node:path";
import { prepareScancode } from "../util/prepare-scancode.mjs";
const scanNative = async (input) =>
  (
    await import("../util/acquire-npm-package-evidence.mjs")
  ).collectNativeScancodeReport(input);

export function createCiRecipientScanner({
  root,
  environment = process.env,
  platform = process.platform,
  architecture = process.arch,
  prepare = prepareScancode,
  scan = scanNative,
}) {
  let prepared;
  return async (input) => {
    if (!["linux", "win32"].includes(platform) || architecture !== "x64") {
      throw Object.assign(
        new Error(
          "This runner requires an authenticated native scanner measurement for the exact archive",
        ),
        { code: "RECIPIENT_ARCHIVE_SCANNER_REQUIRED" },
      );
    }
    const command = environment.SCANCODE_COMMAND;
    if (command) return scan({ ...input, scancode: command });
    const python = environment.SCANCODE_PYTHON;
    if (!python) return scan(input);
    prepared ??= prepare({
      platform: platform === "win32" ? "windows" : "linux",
      outputRoot: join(root, "scanner"),
      python,
    });
    const { command: scanner } = await prepared;
    return scan({ ...input, scancode: scanner });
  };
}
