// Display untrusted text without letting provider/repository content control
// the terminal. Keep the persisted evidence untouched and preserve newlines.
import { stripVTControlCharacters } from "node:util";

export function terminalText(value) {
  return stripVTControlCharacters(String(value ?? ""))
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g,
      char => "\\x" + char.charCodeAt(0).toString(16).padStart(2, "0"));
}

export const print = (...values) => console.log(...values.map(terminalText));
export const printError = (...values) => console.error(...values.map(terminalText));
