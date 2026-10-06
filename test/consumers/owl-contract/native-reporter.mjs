/** Preserve Node's actual assertion events; stdout from package fixtures is never proof. */
export default async function* report(source) {
  for await (const event of source) {
    if (["test:pass", "test:fail"].includes(event.type)) {
      yield `${JSON.stringify({ name: event.data.name, status: event.type === "test:pass" ? "passed" : "failed", skipped: Boolean(event.data.skip), todo: Boolean(event.data.todo), ...(event.type === "test:fail" ? { error: String(event.data.details?.error?.cause?.stack ?? event.data.details?.error?.stack ?? event.data.details?.error) } : {}) })}\n`;
    }
  }
}
