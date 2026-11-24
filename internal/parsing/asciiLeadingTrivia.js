/** ASCII whitespace and hash comments, starting at the caller's bounded offset. */
export const skipTrivia = (text, start, state) => {
  const codeAt =
    typeof text === "string" ? (i) => text.charCodeAt(i) : (i) => text[i];
  let offset = start;
  while (offset < text.length) {
    if (state?.inComment) {
      while (
        offset < text.length &&
        codeAt(offset) !== 10 &&
        codeAt(offset) !== 13
      )
        offset++;
      state.inComment = offset === text.length;
      if (state.inComment) break;
    }
    const character = codeAt(offset);
    if (
      character === 32 ||
      character === 9 ||
      character === 10 ||
      character === 13
    ) {
      offset += 1;
      continue;
    }
    if (character !== 35) {
      break;
    }
    offset += 1;
    while (
      offset < text.length &&
      codeAt(offset) !== 10 &&
      codeAt(offset) !== 13
    ) {
      offset += 1;
    }
    if (state) state.inComment = offset === text.length;
  }
  return offset;
};
