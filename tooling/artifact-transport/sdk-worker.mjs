/** Isolate uncancellable SDK operations so one parent deadline can stop network work. */
import { DefaultArtifactClient } from "@actions/artifact";
import { policy } from "./identity.mjs";
import { inspectArtifact } from "./sdk-inspection.mjs";
import { classifyUploadError } from "./transport.mjs";

process.once("message", async ({ operation, args }) => {
  try {
    const sdk = new DefaultArtifactClient();
    let result;
    if (operation === "probe") {
      result = {
        node: process.version,
        artifactClient: typeof sdk.uploadArtifact,
      };
    } else if (operation === "upload") {
      result = await sdk.uploadArtifact(
        args.name,
        args.files,
        args.root,
        args.options,
      );
    } else if (operation === "list") {
      const inventory = await sdk.listArtifacts({ latest: false });
      if (
        !Array.isArray(inventory.artifacts) ||
        inventory.artifacts.length > policy.maximumInventory
      ) {
        throw new Error("Incomplete or excessive SDK inventory");
      }
      result = inventory.artifacts;
    } else if (operation === "inspect") {
      result = await inspectArtifact(sdk, args.artifact, args.directory);
    } else {
      throw new Error("Unsupported artifact SDK operation");
    }
    process.send({ ok: true, result }, () => process.exit(0));
  } catch (error) {
    // Never forward arbitrary SDK errors: they may embed signed blob URLs.
    const classification = classifyUploadError(error);
    process.send({ ok: false, classification }, () => process.exit(1));
  }
});
