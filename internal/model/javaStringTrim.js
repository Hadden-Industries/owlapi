/** Java String.trim(): remove U+0000 through U+0020 at each end. This differs
 * from ECMAScript trim() and is shared by the native literal overloads only.
 */
export const trimJavaStringWhitespace = (value) =>
  // eslint-disable-next-line no-control-regex -- Java trim includes every control through U+0020.
  value.replace(/^[\x00-\x20]+|[\x00-\x20]+$/gu, "");
