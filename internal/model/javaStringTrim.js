/** Java String.trim(): remove U+0000 through U+0020 at each end. This differs
 * from ECMAScript trim() and is shared by the native literal overloads only.
 */
export const trimJavaStringWhitespace = (value) => {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start++;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end--;
  return value.slice(start, end);
};
