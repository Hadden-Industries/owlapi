/** JavaScript Unicode whitespace and hash comments for RDF format detection. */
export const skipTrivia = (text) => {
  let offset = 0;
  while (offset < text.length) {
    if (/\s/u.test(text[offset])) {
      offset += 1;
      continue;
    }
    if (text[offset] !== "#") {
      break;
    }
    while (offset < text.length && !["\n", "\r"].includes(text[offset])) {
      offset += 1;
    }
  }
  return offset;
};
