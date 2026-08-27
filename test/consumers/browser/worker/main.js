// Vite recognizes the lexical constructor when bundling the worker closure.
// eslint-disable-next-line no-undef -- Keep the documented Vite transform form.
const worker = new Worker(new URL("./ontology-worker.js", import.meta.url), {
  type: "module",
});

worker.addEventListener("message", ({ data }) => {
  if (data?.ok) {
    globalThis.__OWLAPI_RESULT = data.result;
    globalThis.document.body.dataset.state = "passed";
  } else {
    globalThis.__OWLAPI_ERROR = data?.error;
    globalThis.document.body.dataset.state = "failed";
  }
  worker.terminate();
});

worker.addEventListener("error", (event) => {
  globalThis.__OWLAPI_ERROR = {
    message: event.message,
    name: "WorkerError",
  };
  globalThis.document.body.dataset.state = "failed";
  worker.terminate();
});
