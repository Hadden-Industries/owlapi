import { SecurityPolicyError } from "../../io/errors.js";

/** A supplied loader is a host capability. If it exposes a revocable authorize
 * callback, every use (including cached data) must receive explicit true. The
 * loader still owns authorization of each concrete redirect/DNS/file operation.
 */
export async function assertDocumentLoaderAuthorization(
  loader,
  documentIRI,
  context,
) {
  if (loader.authorize === undefined) return;
  if (typeof loader.authorize !== "function")
    throw new TypeError("documentLoader.authorize must be a function");
  if ((await loader.authorize(documentIRI, context)) !== true) {
    throw new SecurityPolicyError("The host denied external document access", {
      documentIRI,
      purpose: context.purpose,
      resource: "externalDocumentAccess",
    });
  }
}
