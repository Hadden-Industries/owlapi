/** Settle the caller promptly when a host operation cannot itself be cancelled.
 * The operation must check the signal before any later access and dispose any
 * acquired resource. Both late fulfillment and rejection remain observed.
 */
export const awaitAbortableOperation = (operation, signal) =>
  new Promise((resolve, reject) => {
    const onAbort = () =>
      reject(
        signal.reason ??
          new DOMException("The operation was aborted", "AbortError"),
      );
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
