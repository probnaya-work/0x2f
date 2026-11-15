// Terminal positions are display cells; editing offsets remain UTF-16.
// Keep whole graphemes when clipping, including emoji and combining marks.
import stringWidth from "string-width";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const ascii = /^[\x20-\x7e]*$/;

export function firstGrapheme(value) {
  return segmenter.segment(String(value ?? ""))[Symbol.iterator]().next().value?.segment ?? "";
}

export function displayWidth(value) {
  const text = String(value ?? "");
  return ascii.test(text) ? text.length : stringWidth(text);
}

export function takeCells(value, columns) {
  const text = String(value ?? ""), limit = Math.max(0, columns);
  if (ascii.test(text)) return text.slice(0, limit);
  let end = 0, used = 0;
  for (const {segment, index} of segmenter.segment(text)) {
    const width = displayWidth(segment);
    if (used + width > limit) break;
    used += width; end = index + segment.length;
  }
  return text.slice(0, end);
}

export function tailCells(value, columns) {
  const text = String(value ?? ""), limit = Math.max(0, columns);
  if (!limit) return "";
  if (ascii.test(text)) return text.slice(-limit);
  const parts = [...segmenter.segment(text)];
  let start = text.length, used = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const width = displayWidth(parts[i].segment);
    if (used + width > limit) break;
    used += width; start = parts[i].index;
  }
  return text.slice(start);
}

export function cellRows(value, columns) {
  let rest = String(value ?? "");
  const rows = [], limit = Math.max(1, columns);
  while (rest.length) {
    const part = takeCells(rest, limit);
    if (!part.length) {
      const first = segmenter.segment(rest)[Symbol.iterator]().next().value.segment;
      rows.push("�"); rest = rest.slice(first.length);
    } else { rows.push(part); rest = rest.slice(part.length); }
  }
  return rows.length ? rows : [""];
}
