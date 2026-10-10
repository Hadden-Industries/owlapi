/** ASCII whitespace and hash comments, starting at the caller's bounded offset. */
export const skipTrivia = (text, start) => {
  let offset = start;
  while (offset < text.length) {
    const character = text[offset];
    if (
      character === " " ||
      character === "\t" ||
      character === "\n" ||
      character === "\r"
    ) {
      offset += 1;
      continue;
    }
    if (character !== "#") {
      break;
    }
    offset += 1;
    while (
      offset < text.length &&
      text[offset] !== "\n" &&
      text[offset] !== "\r"
    ) {
      offset += 1;
    }
  }
  return offset;
};
