// Raw stdin bytes -> key names. Pure, so the whole input path is testable
// without a terminal.
//
// The session's streaming decoder separates bracketed paste from keys.
// A paste may span arbitrary tty chunks; its newlines are text, never Enter.
// decodeKeys below handles ordinary key sequences after that framing.
//
// A decoded key is { name, ch?, alt?, ctrl? }:
//
//   name  "char" | "enter" | "escape" | "backspace" | "tab" | "shift-tab"
//         | "up" | "down" | "left" | "right" | "ctrl-c" | "unknown" | "paste"
//   ch    the character, for name === "char"
//   text  the entire insertion, for name === "paste"

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

function paste(text) {
  return { name: "paste", text: text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "") };
}

function markerSuffix(text, marker) {
  for (let n = Math.min(text.length, marker.length - 1); n > 0; n--) {
    if (text.endsWith(marker.slice(0, n))) return n;
  }
  return 0;
}

export function createKeyDecoder() {
  let pending = "";
  let insertion = null;
  const plain = text => {
    if (text.length > 1 && /[\r\n]/.test(text) && !text.startsWith("\x1b")) return [paste(text)];
    // A tty read may contain several complete navigation sequences. Decode
    // each one, rather than dropping every key after the first Escape.
    const units = text.match(/\x1b(?:\[[0-?]*[ -/]*[@-~]|O.|.)|[^\x1b]+|\x1b/gs) ?? [];
    return units.flatMap(decodeKeys);
  };
  return {
    push(chunk) {
      const keys = [];
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      // A subsequent plain key is not an Alt chord from the previous read.
      // Keep only actual CSI/SS3 prefixes buffered across tty events.
      if (insertion === null && pending === "\x1b" && text && !["[", "O"].includes(text[0])) {
        keys.push({ name: "escape" });
        pending = "";
      }
      pending += text;
      while (pending) {
        const marker = insertion === null ? PASTE_START : PASTE_END;
        const end = pending.indexOf(marker);
        if (end >= 0) {
          const text = pending.slice(0, end);
          pending = pending.slice(end + marker.length);
          if (insertion === null) {
            keys.push(...plain(text));
            insertion = "";
          } else {
            keys.push(paste(insertion + text));
            insertion = null;
          }
        } else {
          const keep = markerSuffix(pending, marker);
          const text = pending.slice(0, pending.length - keep);
          pending = pending.slice(pending.length - keep);
          if (insertion === null) keys.push(...plain(text));
          else insertion += text;
          break;
        }
      }
      return keys;
    },
    // A lone Escape could also be the first byte of a paste marker. The
    // session calls this after a short key-sequence timeout; unfinished
    // paste contents must never be flushed as shortcuts.
    flush() {
      if (insertion !== null) return [];
      const keys = decodeKeys(pending);
      pending = "";
      return keys;
    }
  };
}

const SEQUENCES = {
  "[A": "up",
  "[B": "down",
  "[C": "right",
  "[D": "left",
  "[Z": "shift-tab",
  "[H": "home",
  "[F": "end",
  OA: "up",
  OB: "down",
  OC: "right",
  OD: "left",
  OH: "home",
  OF: "end"
};

// Shift+Enter, when the terminal can deliver it. Kitty sends the CSI-u form,
// xterm with modifyOtherKeys the CSI~ form, and some emitters the alternate
// ordering; in all three, modifier 2 is Shift and the code is 13 (Enter).
// Default macOS Terminal and stock Windows Terminal send the same byte as
// plain Enter, so ⌃n stays the universal fallback — a terminal that cannot
// distinguish the two simply never produces these bytes.
const SHIFT_ENTER = new Set([
  "\u001b[13;2u", // Kitty keyboard protocol / CSI-u
  "\u001b[27;2;13~", // xterm modifyOtherKeys
  "\u001b[27;2;13u" // alternate ordering some emitters use
]);

function simple(code) {
  if (code === 3) return { name: "ctrl-c" };
  if (code === 13 || code === 10) return { name: "enter" };
  if (code === 9) return { name: "tab" };
  if (code === 127 || code === 8) return { name: "backspace" };
  return null;
}

// Decode ONE chunk into the keys it represents. A chunk is normally one key;
// a paste is many characters, which decode to a run of "char" keys so typing
// and pasting behave identically in an input line.
export function decodeKeys(chunk) {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  if (!text.length) return [];

  if (text === "\x1b") return [{ name: "escape" }];

  if (text.charCodeAt(0) === 0x1b && text.length > 1) {
    if (SHIFT_ENTER.has(text)) return [{ name: "enter", shift: true }];
    const extended = { "\x1bOP": "help", "\x1b[11~": "help", "\x1b[3~": "delete", "\x1b[5~": "page-up", "\x1b[6~": "page-down", "\x1b[1~": "home", "\x1b[4~": "end" };
    if (extended[text]) return [{ name: extended[text] }];
    const rest = text.slice(1);
    const named = SEQUENCES[rest.slice(0, 2)];
    if (named) return [{ name: named }];
    // Anything else after ESC in the same chunk is Alt+<key>: ⌥↵ (the
    // design's "expand this note into a brief"), ⌥<char>, and so on.
    const first = simple(rest.charCodeAt(0));
    if (first) return [{ ...first, alt: true }];
    if (rest.length === 1) return [{ name: "char", ch: rest, alt: true }];
    return [{ name: "unknown" }];
  }

  const keys = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const named = simple(code);
    if (named) {
      keys.push(named);
      continue;
    }
    // Ctrl+<letter> arrives as the control code; the design uses Ctrl+N
    // (newline in the composer — the fallback when the terminal cannot send
    // ⇧↵) and Ctrl+Z (revert the brief).
    if (code < 32) {
      keys.push({ name: "char", ch: String.fromCharCode(code + 96), ctrl: true });
      continue;
    }
    keys.push({ name: "char", ch });
  }
  return keys;
}

// Is this key a plain printable character (no modifier)? The single test
// every text-entry path makes before appending to a draft.
export function isPrintable(key) {
  return key.name === "char" && !key.ctrl && !key.alt && key.ch >= " " && key.ch !== "\x7f";
}
