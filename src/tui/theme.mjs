// TUI palettes and provider identity — presentation only.
//
// Both palettes separate bright titles, body copy, muted metadata and section
// headings. Label inks retain contrast on normal and selected backgrounds. They
// are deliberately NOT src/web/ledger.mjs's COLORS: that palette is tuned
// for a white browser page, and the terminal's dark ground needs its own.
// What both surfaces DO share is the meaning behind a colour (accent =
// wants you, bad = failed, ok = ready), which lives in the state model, not
// here.

export const PALETTES = {
  dark: {
    bg: "#121923",
    title: "#f1f5fb",
    fg: "#c9d3e1",
    dim: "#a0adc0",
    ghost: "#8c9ab0",
    heading: "#bcaee0",
    rule: "#344158",
    accent: "#9bbcff",
    key: "#e8d19d",
    ok: "#7dd9b6",
    bad: "#f2a38e",
    sel: "#202e43"
  },
  light: {
    bg: "#f2f4f6",
    title: "#10161c",
    fg: "#2b3646",
    dim: "#4d5760",
    heading: "#665080",
    rule: "#c4ccd3",
    accent: "#1f4f9e",
    key: "#765220",
    ok: "#1c6b4e",
    bad: "#a33a1e",
    sel: "#dfe6ed",
    ghost: "#5e6872"
  }
};

export function palette(theme) {
  return PALETTES[theme] ?? PALETTES.dark;
}

// --- provider identity -------------------------------------------------------
//
// The ledger row has room for two characters of provider, not twelve. The
// design fixes signatures for the built-in providers; a configured
// (ACP/command manifest) provider gets a derived one, because the TUI must
// be provider-agnostic — it may not have a table of every provider that can
// ever exist.
const NATIVE_SIGNATURES = {
  "claude-code": "CC",
  "deepseek-harness": "DS",
  codex: "CX",
  gemini: "GM",
  opencode: "OC"
};

// Initials of a two-word name ("Acme Agent" -> "AA"), else the first two
// letters of the id. Always exactly two characters, always upper case.
export function providerSignature(id, displayName = "") {
  if (!id) return "??";
  if (NATIVE_SIGNATURES[id]) return NATIVE_SIGNATURES[id];
  const words = String(displayName || id)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const sig =
    words.length >= 2
      ? words[0][0] + words[1][0]
      : String(words[0] ?? id).slice(0, 2);
  return sig.toUpperCase().padEnd(2, "·").slice(0, 2);
}

// The name the ledger prints beside the signature. Upper case is the TUI's
// register for identity, the same way the Web ledger uppercases run rows.
export function providerName(id, displayName = "") {
  return String(displayName || id || "unknown").toUpperCase();
}
