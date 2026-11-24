const encoder = new TextEncoder();
const chunkSize = 65_536;

/** Encode text fragments as one UTF-8 document, including split surrogate pairs. */
export function* utf8Chunks(fragments) {
  let buffer = new Uint8Array(chunkSize);
  let used = 0;
  let pending = "";
  for (let text of fragments) {
    if (!text.length) continue;
    if (pending) {
      text = pending + text;
      pending = "";
    }
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      pending = text.slice(-1);
      text = text.slice(0, -1);
    }
    for (let offset = 0; offset < text.length;) {
      const { read, written } = encoder.encodeInto(
        text.slice(offset),
        buffer.subarray(used),
      );
      offset += read;
      used += written;
      if (used === chunkSize || offset < text.length) {
        yield buffer.subarray(0, used);
        buffer = new Uint8Array(chunkSize);
        used = 0;
      }
    }
  }
  if (pending && used + 3 > chunkSize) {
    yield buffer.subarray(0, used);
    buffer = new Uint8Array(chunkSize);
    used = 0;
  }
  if (pending)
    used += encoder.encodeInto(pending, buffer.subarray(used)).written;
  if (used) yield buffer.subarray(0, used);
}
