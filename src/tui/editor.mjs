// Text editing is presentation state. Offsets are UTF-16 (as in JS strings),
// but movement/deletion respects whole graphemes, including pasted emoji.
import { displayWidth, takeCells } from "./text.mjs";
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function composerTextWidth(columns) {
  return Math.max(1, Math.min(columns - 2, 102) - 6);
}

export function editText(text, position, key, width) {
  const cursor = Math.max(0, Math.min(position ?? text.length, text.length));
  const bounds = [...segmenter.segment(text)].map(s => s.index).concat(text.length);
  const prev = bounds.findLast(n => n < cursor) ?? 0;
  const next = bounds.find(n => n > cursor) ?? text.length;
  const start = cursor === 0 ? 0 : text.lastIndexOf("\n", cursor - 1) + 1;
  const found = text.indexOf("\n", cursor);
  const end = found < 0 ? text.length : found;
  const replace = (from, to, inserted = "") => {
    const value = text.slice(0, from) + inserted + text.slice(to);
    const target = from + inserted.length;
    // Deleting a newline or inserting a combining character can join two
    // clusters. Keep the caret on a boundary in the resulting text.
    const cursor = [...segmenter.segment(value)].map(s => s.index).concat(value.length).find(n => n >= target);
    return { text: value, cursor };
  };
  if (key.name === "paste") return replace(cursor, cursor, key.text);
  if (key.name === "left") return { text, cursor: prev };
  if (key.name === "right") return { text, cursor: next };
  if (key.name === "home" || (key.ctrl && key.ch === "a")) return { text, cursor: start };
  if (key.name === "end" || (key.ctrl && key.ch === "e")) return { text, cursor: end };
  if (key.name === "up" || key.name === "down") {
    if (Number.isFinite(width) && width > 0) {
      const { positions } = layoutEditor(text, width);
      const current = positions.find(p => p.offset === cursor);
      if (!current) return { text, cursor };
      const row = current.row + (key.name === "up" ? -1 : 1);
      const targets = positions.filter(p => p.row === row);
      const target = targets.findLast(p => p.cells <= current.cells) ?? targets[0];
      return { text, cursor: target?.offset ?? cursor };
    }
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
  const { rows, positions } = layoutEditor(text, width);
  const caret = positions.findLast(p => p.offset <= cursor) ?? positions[0];
  return { rows, caret: { row: caret.row, col: caret.col } };
}

function layoutEditor(text, width) {
  width = Math.max(1, width);
  const rows = [""];
  const positions = [];
  let used = 0;
  for (const part of segmenter.segment(text)) {
    const shown = part.segment === "\t" ? "    " : part.segment;
    const cells = part.segment === "\n" ? 0 : displayWidth(shown);
    if (part.segment !== "\n" && (used >= width || (used > 0 && used + cells > width))) { rows.push(""); used = 0; }
    positions.push({ offset: part.index, row: rows.length - 1, col: rows.at(-1).length, cells: used });
    if (part.segment === "\n") { rows.push(""); used = 0; }
    else { rows[rows.length - 1] += shown; used += cells; }
  }
  if (used >= width) rows.push("");
  positions.push({ offset: text.length, row: rows.length - 1, col: rows.at(-1).length, cells: used >= width ? 0 : used });
  return { rows, positions };
}
