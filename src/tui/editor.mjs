// Text editing is presentation state. Offsets are UTF-16 (as in JS strings),
// but movement/deletion respects whole graphemes, including pasted emoji.
import { displayWidth, takeCells } from "./text.mjs";
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function editText(text, position, key) {
  const cursor = Math.max(0, Math.min(position ?? text.length, text.length));
  const bounds = [...segmenter.segment(text)].map(s => s.index).concat(text.length);
  const prev = bounds.findLast(n => n < cursor) ?? 0;
  const next = bounds.find(n => n > cursor) ?? text.length;
  const start = cursor === 0 ? 0 : text.lastIndexOf("\n", cursor - 1) + 1;
  const found = text.indexOf("\n", cursor);
  const end = found < 0 ? text.length : found;
  const replace = (from, to, inserted = "") => ({ text: text.slice(0, from) + inserted + text.slice(to), cursor: from + inserted.length });
  if (key.name === "paste") return replace(cursor, cursor, key.text);
  if (key.name === "left") return { text, cursor: prev };
  if (key.name === "right") return { text, cursor: next };
  if (key.name === "home" || (key.ctrl && key.ch === "a")) return { text, cursor: start };
  if (key.name === "end" || (key.ctrl && key.ch === "e")) return { text, cursor: end };
  if (key.name === "up" || key.name === "down") {
    const column = displayWidth(text.slice(start, cursor));
    const previousStart = start <= 1 ? 0 : text.lastIndexOf("\n", start - 2) + 1;
    const followingEnd = text.indexOf("\n", end + 1);
    const target = key.name === "up" ? (start === 0 ? cursor : previousStart + takeCells(text.slice(previousStart, start - 1), column).length)
      : (end === text.length ? cursor : end + 1 + takeCells(text.slice(end + 1, followingEnd < 0 ? text.length : followingEnd), column).length);
    return { text, cursor: bounds.findLast(n => n <= target) ?? 0 };
  }
  if (key.name === "backspace") return replace(prev, cursor);
  if (key.name === "delete") return replace(cursor, next);
  if (key.name === "char" && !key.ctrl && !key.alt) return replace(cursor, cursor, key.ch);
  return null;
}

// Preserve indentation and blank lines while finding the caret's visual row.
export function editorRows(text, position, width) {
  const cursor = Math.max(0, Math.min(position ?? text.length, text.length));
  const rows = [""];
  let used = 0;
  let caret = { row: 0, col: 0 };
  for (const part of segmenter.segment(text)) {
    const shown = part.segment === "\t" ? "    " : part.segment;
    const cells = part.segment === "\n" ? 0 : displayWidth(shown);
    if (used >= width || (used > 0 && used + cells > width)) { rows.push(""); used = 0; }
    if (part.index === cursor) caret = { row: rows.length - 1, col: rows.at(-1).length };
    if (part.segment === "\n") { rows.push(""); used = 0; }
    else { rows[rows.length - 1] += shown; used += cells; }
  }
  if (used >= width) rows.push("");
  if (cursor === text.length) caret = { row: rows.length - 1, col: rows.at(-1).length };
  return { rows, caret };
}
