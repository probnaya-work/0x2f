// The frame builders — the finalized TUI design, drawn from the view model.
//
// Every function here is PURE: model + TUI state in, lines of cells out. No
// I/O, no runtime, no clock of its own (the time is passed in). That is what
// makes the whole visual layer assertable in a test, and it is why the
// terminal's layout logic can live beside the Web's without either surface
// growing a second state model.
//
// Layout, keymap hints and visual hierarchy follow the handoff rather than
// terminal convention: the left pane is a grouped ledger with the states
// that want you at the top, the right pane is the selected task in full, and
// the last three rows are a fixed footer (a rule, a message line, a hint
// line) that never scrolls.

import {
  GROUPS,
  FILTERS
} from "./model.mjs";
import {
  visible,
  selected,
  primaryAction,
  secondaryAction,
  INPUT_LABELS
} from "./state.mjs";
import { fmtDuration, isCommandLine } from "../web/ledger.mjs";
import { resultEvidence, reportedSection } from "../web/result-evidence.mjs";
import { editorRows, composerTextWidth } from "./editor.mjs";
import { displayWidth, takeCells, tailCells, cellRows, firstGrapheme } from "./text.mjs";
import { MAX_BRIEF } from "../core/limits.mjs";
import { stripVTControlCharacters } from "node:util";

export const MIN_TUI_COLS = 60;
export const MIN_TUI_ROWS = 18;

// --- text helpers -------------------------------------------------------------

// A cell occupies exactly one row, so any text placed in one is flattened
// first. Provider-authored strings (an error, a tool argument, a decision
// question) routinely contain newlines, and a raw "\n" inside a cell would
// tear the grid apart — every column after it on that row shifts. `wrap` is
// the opposite path: it is the only helper that HONORS newlines, because it
// is producing rows rather than filling one.
// Newlines, tabs and control bytes are removed; runs of SPACES are not —
// the hint line and the action row use multi-space as a separator, and
// collapsing those would silently reflow the design's own spacing. ANSI
// sequences are stripped because provider output is arbitrary text: an
// escape code that reached a cell would repaint the rest of the row.
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

export function oneline(value) {
  return stripVTControlCharacters(String(value ?? ""))
    .replace(/[\r\n\t]+/g, " ")
    .replace(CONTROL_RE, "")
    .trim();
}

export function pad(value, n) {
  const s = oneline(value);
  const width = Math.max(0, n | 0);
  const clipped = takeCells(s, width);
  return clipped + " ".repeat(width - displayWidth(clipped));
}

export function padl(value, n) {
  const s = oneline(value);
  const width = Math.max(0, n | 0);
  const clipped = takeCells(s, width);
  return " ".repeat(width - displayWidth(clipped)) + clipped;
}

export function cut(value, n) {
  const s = oneline(value);
  const width = Math.max(1, n | 0);
  return displayWidth(s) <= width ? s : takeCells(s, Math.max(0, width - 1)) + "…";
}

// A fixed-width cell for provider-authored WORDS — a tool verb, an action
// title, a provider name. These routinely exceed their column ("EDIT
// SUBMIT PATH" in an 8-column verb slot), and `pad` would truncate them
// SILENTLY: the cut word then collides with the next column ("EDIT
// SUBsrc/app.ts"). cellWord ellipsis-truncates to width-1 and reserves one
// trailing gap, so a long word is marked as truncated and the next column
// always starts on a clean boundary. Short values render exactly as pad
// did, so the grid keeps its fixed columns.
export function cellWord(value, n) {
  const width = Math.max(2, n | 0);
  return pad(cut(value, width - 1), width - 1) + " ";
}

// A path shortened from the FRONT: the filename is what identifies it, the
// leading directories are context you drop first.
export function shortPath(value, n) {
  const width = Math.max(6, n | 0);
  const p = oneline(value);
  if (displayWidth(p) <= width) return p;
  const parts = p.split("/");
  let out = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i--) {
    const next = parts[i] + "/" + out;
    if (displayWidth(next) + 2 > width) break;
    out = next;
  }
  return "…/" + tailCells(out, width - 2);
}

export function wrap(value, n) {
  const width = Math.max(8, n | 0);
  const out = [];
  for (const paragraph of stripVTControlCharacters(String(value ?? "")).replace(CONTROL_RE, "").split("\n")) {
    if (!paragraph.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      if (displayWidth(word) > width) {
        if (line) { out.push(line); line = ""; }
        const pieces = cellRows(word, width);
        word = pieces.pop(); out.push(...pieces);
      }
      if (!line.length) line = word;
      else if (displayWidth(line + " " + word) <= width) line += " " + word;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line.length) out.push(line);
  }
  return out;
}

const len = cells => cells.reduce((total, cell) => total + displayWidth(cell.t), 0);

// Keep the next action distinct from the keyboard reference. Whole bindings
// stay together when space runs out; help retains every omitted shortcut.
function bindings(entries, width, p, T, prefix = " ", overflowHelp = true) {
  const groups = [];
  let used = displayWidth(prefix);
  for (const [key, label, primary = false] of entries) {
    const cells = key
      ? primary
        ? [{ ...T(" " + key + " " + cut(label, Math.max(4, width - displayWidth(prefix) - displayWidth(key) - 3)) + " ", p.bg, 600), bg: p.accent }]
        : [T(key, p.key, 600), T(" " + label, p.dim)]
      : [T(label, p.ghost)];
    const size = len(cells) + (groups.length ? 3 : 0);
    if (used + size > width) {
      if (!overflowHelp) break;
      const more = groups.some(cells => cells[0]?.t === "?")
        ? [T("…", p.ghost)] : [T("… ", p.ghost), T("?", p.key, 600), T(" help", p.dim)];
      while (groups.length > 1 && used + len(more) + 3 > width) {
        const removed = groups.pop();
        used -= len(removed) + (groups.length ? 3 : 0);
      }
      if (used + len(more) + (groups.length ? 3 : 0) <= width) groups.push(more);
      break;
    }
    groups.push(cells);
    used += size;
  }
  return [T(prefix, p.dim)].concat(groups.flatMap((cells, i) => i ? [T("   ", p.rule), ...cells] : cells));
}

// Provider prose keeps its saved source intact; only the presentation turns
// Markdown headings, emphasis and code spans into terminal type hierarchy.
function proseRows(value, width, p, T, indent = "   ") {
  const lines = [];
  let fenced = false;
  const codeRows = raw => {
    const text = raw.replace(/\t/g, "    ");
    const room = Math.max(8, width - 2);
    for (const row of cellRows(text, room)) lines.push({ cells: [T(indent + "│ ", p.rule), T(row, p.code)] });
  };
  for (const raw of stripVTControlCharacters(String(value ?? "")).replace(CONTROL_RE, "").split(/\r?\n/)) {
    const fence = /^\s*(```|~~~)/.test(raw);
    if (fence) { fenced = !fenced; continue; }
    if (fenced || isCommandLine(raw.trim())) { codeRows(raw); continue; }
    if (!raw.trim()) { lines.push({ cells: [T("")] }); continue; }
    const heading = raw.match(/^#{1,6}\s+(.+)$/);
    const text = heading ? heading[1] : raw;
    const spans = [];
    let at = 0;
    if (!fenced && !fence && !heading) {
      for (const match of text.matchAll(/\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g)) {
        if (match.index > at) spans.push([text.slice(at, match.index), p.fg, 400]);
        const link = match[3] && (match[3] === match[4] ? match[3] : match[3] + " (" + match[4] + ")");
        spans.push([match[1] ?? match[2] ?? link, match[1] ? p.title : match[2] ? p.code : p.heading, match[1] ? 600 : 400, match[2] !== undefined]);
        at = match.index + match[0].length;
      }
    }
    spans.push([text.slice(at), heading ? p.heading : fence ? p.ghost : p.fg, heading ? 600 : 400]);
    let cells = [], used = 0, space = false;
    const flush = () => { lines.push({ cells: [T(indent, p.fg), ...cells] }); cells = []; used = 0; space = false; };
    for (const [text, color, weight, literal] of spans) {
      for (const word of text.match(/\s+|\S+/g) ?? []) {
        if (/^\s+$/.test(word)) {
          if (literal) {
            for (const c of (space ? " " : "") + word.replace(/\t/g, "    ")) {
              if (used === width) flush();
              cells.push(T(c, color, weight)); used++;
            }
            space = false;
          } else space = used > 0;
          continue;
        }
        if (used && used + Number(space) + displayWidth(word) > width) flush();
        if (space) { cells.push(T(" ", p.fg)); used++; space = false; }
        for (let at = 0; at < word.length;) {
          let part = takeCells(word.slice(at), width - used);
          if (!part.length) { flush(); part = takeCells(word.slice(at), width); }
          if (!part.length) {
            at += firstGrapheme(word.slice(at)).length;
            cells.push(T("�", color, weight)); used++;
            continue;
          }
          cells.push(T(part, color, weight)); used += displayWidth(part); at += part.length;
          if (used === width && at < word.length) flush();
        }
      }
    }
    if (cells.length) flush();
  }
  return lines;
}

// --- the run rule --------------------------------------------------------------
//
// The design's progress rule. A finished run fills — it is finished, and
// that is a fact. A run still moving draws a percentage when the shared
// layer can measure one (this task's prior runs are a real baseline — see
// ledger.progressPercent): the bar fills to the percentage and the readout
// names the basis. Run 1 has no baseline, so the rule draws what IS known —
// one mark per reported signal, then the live head, then unreported ground.
// Nothing here is time-proportional geometry from nothing; a percentage
// without a baseline is never fabricated.
export function ruleCells(task, width, p) {
  const w = Math.max(4, width | 0);
  const finished = task.state === "ready" || task.state === "done";
  const failed = task.state === "failed";
  const halted = task.state === "needs";
  const marks = [];

  if (finished || failed) {
    marks.push({ ch: "━".repeat(w), c: failed ? p.bad : p.ok, b: 400 });
  } else if (task.progress?.percent != null && !halted) {
    const pct = Math.max(0, Math.min(100, task.progress.percent));
    const filled = Math.max(1, Math.min(w - 1, Math.round((w * pct) / 100)));
    marks.push({ ch: "━".repeat(filled), c: p.accent, b: 600 });
    marks.push({ ch: "◆", c: p.fg, b: 600 });
    const rest = w - filled - 1;
    if (rest > 0) marks.push({ ch: "┄".repeat(rest), c: p.ghost, b: 400 });
  } else {
    const reported = Math.min(task.steps.length, w - 1);
    if (reported > 0) marks.push({ ch: "━".repeat(reported), c: p.fg, b: 400 });
    marks.push(
      halted ? { ch: "!", c: p.accent, b: 600 } : { ch: "◆", c: p.fg, b: 600 }
    );
    const rest = w - reported - 1;
    if (rest > 0) marks.push({ ch: "┄".repeat(rest), c: p.ghost, b: 400 });
  }
  return marks.map(m => ({ t: m.ch, c: m.c, b: m.b, bg: "transparent" }));
}

export function glyph(task, p) {
  if (task.state === "needs") return { t: "!", c: p.accent, b: 600 };
  if (task.state === "failed") return { t: "✕", c: p.bad, b: 600 };
  if (task.state === "ready") return { t: "✓", c: p.ok, b: 500 };
  if (task.state === "working") return { t: "▶", c: p.fg, b: 400 };
  return { t: "·", c: p.ghost, b: 400 };
}

export function stateWord(task) {
  if (task.state === "needs") {
    return task.halt?.kind === "decision" ? "DECISION" : "PERMISSION";
  }
  return task.state === "done" ? "CLOSED" : task.state.toUpperCase();
}

function stateColor(task, p) {
  if (task.state === "needs") return p.accent;
  if (task.state === "failed") return p.bad;
  if (task.state === "ready") return p.ok;
  if (task.state === "done") return p.ghost;
  return p.dim;
}

// The ledger's one-line answer to "what is this task waiting for?" A
// permission's op is provider prose — often a tool title that itself names
// a file ("Edit submit-capture.ts") — so it is ellipsis-truncated and the
// target path is separated with the design's separator token: the two must
// never read as one ambiguous path. The whole line is bounded with an
// explicit ellipsis so a narrow pane clips honestly instead of silently.
function permissionSubLine(task, w, p, T) {
  const path = shortPath(task.halt.path, Math.max(8, w - 26));
  const opMax = Math.max(4, w - 16 - displayWidth(path));
  // cut() trims, so the indent lives outside the bounded body.
  const body = cut("wants " + cut(task.halt.op.toLowerCase(), opMax) + " · " + path, w - 7);
  return [T("     " + body, p.accent)];
}

// --- left pane: the ledger -----------------------------------------------------

export function buildLeft(model, state, w, p, T) {
  const lines = [];
  const counts = model.counts;
  const searching = state.searching || state.search;
  const label = searching ? "/" + state.search : "~/" + model.workspace.label;

  lines.push({
    cells: [
      T(" 0x2F ", p.title, 600),
      T(cut(label, w - 7),
        searching ? p.accent : p.dim,
        state.searching ? 600 : 400)
    ]
  });
  lines.push({
    cells: [
      T(" ! " + counts.needs, counts.needs ? p.accent : p.ghost, counts.needs ? 600 : 400),
      T("  ✕ " + counts.failed, counts.failed ? p.bad : p.ghost, counts.failed ? 600 : 400),
      T("  ✓ " + counts.ready, counts.ready ? p.ok : p.ghost),
      T("  ▶ " + counts.working, p.dim),
      T("  · " + counts.done, p.ghost)
    ]
  });
  lines.push({ cells: [T(" " + "─".repeat(Math.max(1, w - 2)), p.rule)] });

  const tasks = visible(model.tasks, state);
  const current = selected(model.tasks, state);

  for (const [key, heading] of GROUPS) {
    const items = tasks.filter(t => t.state === key);
    if (!items.length) continue;
    lines.push({ cells: [T("")] });
    lines.push({
      cells: [
        T(" " + heading, key === "needs" ? p.accent : key === "failed" ? p.bad : key === "ready" ? p.ok : p.heading, 600),
        T("  " + items.length, p.ghost)
      ]
    });

    for (const task of items) {
      const isSelected = current && task.id === current.id;
      const bg = isSelected ? p.sel : "transparent";
      const titleW = Math.max(10, w - (isSelected ? 8 : 11));
      const titleRows = isSelected ? wrap(oneline(task.title), titleW) : [];
      const cells = [
        T(isSelected ? " ❯ " : "   ", p.accent, 600),
        T(task.idLabel + " ", p.ghost),
        T(isSelected ? titleRows[0] : pad(cut(task.title, titleW), titleW), task.state === "done" ? p.ghost : isSelected ? p.title : p.fg, isSelected ? 600 : 400),
        ...(!isSelected ? [T(" " + task.providerSig, p.dim)] : [])
      ];
      for (const cell of cells) cell.bg = bg;
      lines.push({ cells, bg, selected: isSelected });
      if (titleRows.length > 1) {
        lines.push({ cells: [T("       " + cut(titleRows.slice(1).join(" "), titleW), p.title, 600)], bg });
      }

      // A second line for the rows that carry an obligation, and for
      // whatever is selected. Everything else stays one row — the ledger's
      // job is to let you scan, not to explain every task at once.
      let sub = null;
      if (task.state === "needs") {
        sub = task.halt?.kind === "decision"
          ? [T("     awaiting your answer", p.accent)]
          : permissionSubLine(task, w, p, T);
      } else if (task.state === "failed") {
        sub = [T("     " + cut(task.fail?.at ?? "stopped", w - 6), p.bad)];
      } else if (task.state === "ready") {
        const n = task.files.length;
        sub = [T("     " + (n ? n + (n === 1 ? " file" : " files") + " changed" : "no file changes reported"), p.dim)];
      } else if (task.state === "working") {
        const last = [...task.steps].reverse().find(s => s.kind === "tool" || s.kind === "command");
        sub = [T("     ", p.dim)]
          .concat(ruleCells(task, 14, p))
          .concat([T("  " + cut(last ? last.verb.toLowerCase() + " · " + last.arg : task.activity || "starting", Math.max(6, w - 22)), p.dim)]);
      }
      if (sub && (isSelected || task.state === "needs" || task.state === "failed")) {
        if (isSelected) {
          const summary = task.state === "ready" ? task.files.length + (task.files.length === 1 ? " file changed" : " files changed")
            : task.state === "needs" ? task.halt?.kind === "decision" ? "answer needed" : "permission needed"
              : task.state === "failed" ? task.fail?.at ?? "stopped" : "executing";
          sub = [T("       " + cut(task.providerName + " · " + (w < 32 ? "run " + task.run : summary), w - 8), p.dim)];
        }
        for (const cell of sub) cell.bg = bg;
        lines.push({ cells: sub, bg });
      }
    }
  }

  if (!tasks.length) {
    lines.push({ cells: [T("")] });
    lines.push({
      cells: [T("  nothing in " + FILTERS[state.filter].toLowerCase(), p.ghost)]
    });
  }
  return lines;
}

// --- right pane: the selected task ---------------------------------------------

export function buildRight(model, state, w, p, T) {
  const task = selected(model.tasks, state);
  const lines = [];
  if (!task) {
    return [
      { cells: [T(" no task selected", p.ghost)] },
      { cells: [T("")] },
      { cells: bindings([["n", "new task"]], w, p, T) }
    ];
  }

  const head = [
    T(" #" + task.idLabel + "  ", p.ghost),
    T(cut(task.title, Math.max(8, w - 9)), p.title, 600)
  ];
  lines.push({ cells: head });

  const field = (label, cells, color = p.ghost) =>
    lines.push({ cells: [T(" " + pad(label, 9), color, 500)].concat(cells) });

  const runCount = task.runs.length || 1;
  const noteCount = task.notes.length;
  const runStatus = task.state === "needs" ? "halted on you"
    : task.state === "working" ? "executing"
      : task.state === "failed" ? "stopped"
        : task.state === "ready" ? "result available · review" : "closed";
  const runMeta = " · run " + task.run + " · " + fmtDuration(task.elapsed);
  const nameWidth = Math.max(6, w - 2 - displayWidth(runMeta) - (w >= 60 ? 3 + displayWidth(runStatus) : 0));
  lines.push({ cells: [T(" " + cut(task.providerName, nameWidth) + runMeta, p.dim),
    ...(w >= 60 ? [T("   " + runStatus, p.ghost)] : [])] });

  // The current question, failure or result is the reading priority. The
  // activity record follows it, so old events cannot bury the next action.
  lines.push({ cells: [T("")] });
  const current = stateBlock(task, w, p, T);
  lines.push(...current);

  lines.push({ cells: [T("")] });
  field("TASK", [T(cut(runCount + (runCount === 1 ? " run" : " runs") + " · " +
    noteCount + (noteCount === 1 ? " note" : " notes") + " · open " + Math.round(task.opened) + "m", w - 11), p.ghost)]);
  field("ON", [T(cut(model.node + " · " + model.workspace.label, Math.max(8, w - 11)), p.ghost)]);

  if (task.history.length) {
    lines.push({ cells: [T("")] });
    field("RUNS", [
      T("this task has been attempted " + runCount + (runCount === 1 ? " time" : " times"), p.ghost)
    ], p.heading);
    for (const run of task.runs) {
      const live = run.run === task.run;
      const color = run.outcome === "failed" ? p.bad : live ? p.fg : p.dim;
      lines.push({
        cells: [
          T("   " + padl(run.num, 2) + "  ", p.ghost),
          T(cellWord(run.provider, 15), live ? p.fg : p.dim, live ? 600 : 400),
          T(padl(run.duration ?? "—", 7) + "  ", p.ghost),
          T(pad(run.state, 10), color, live ? 600 : 500),
          T(run.model ? cut(run.model, Math.max(4, w - 42)) : "", p.ghost)
        ]
      });
    }
  }

  // TRACE — one row per reported signal. A provider that reports nothing has
  // an empty trace and says so; it is never padded with invented steps.
  lines.push({ cells: [T("")] });
  const log = task.steps;
  const traceLimit = ["ready", "done"].includes(task.state) ? 2 : 6;
  const shown = state.expand ? log : ["ready", "done"].includes(task.state) ? [] : log.slice(-traceLimit);
  const hidden = log.length - shown.length;
  field("TRACE", [
    T(
      "run " + task.run + " · " + log.length + (log.length === 1 ? " event" : " events"),
      p.ghost
    ),
    ...(hidden > 0 ? [T(shown.length ? " · " + hidden + " earlier hidden · " : " · ", p.ghost), T("t", p.key, 600), T(" expand", p.dim)]
      : state.expand && log.length > traceLimit ? [T(" · ", p.ghost), T("t", p.key, 600), T(" collapse", p.dim)] : [])
  ], p.heading);
  if (!log.length) {
    lines.push({
      cells: [T("   " + (task.coarse
        ? "this provider does not report step detail"
        : "run has not reported yet"), p.ghost)]
    });
  }
  let lastKind = null;
  for (const step of shown) {
    const kind = step.kind === lastKind ? "" : step.kind.toUpperCase();
    lastKind = step.kind;
    const time = fmtDuration(step.t);
    const argW = Math.max(6, w - 3 - 9 - 8 - time.length - 3);
    const verb = step.human ? "YOU" : step.verb.toUpperCase();
    const bad = step.kind === "fail";
    const halt = step.kind === "halt";
    lines.push({
      cells: [
        T("   " + pad(kind, 9), p.heading, 500),
        T(cellWord(verb, 8), step.human || halt ? p.accent : bad ? p.bad : p.dim, step.human || halt ? 600 : 500),
        T(pad(cut(step.arg, argW), argW), step.human ? p.accent : bad ? p.bad : p.dim),
        T("  " + time, p.ghost)
      ]
    });
  }

  // ON TASK — the human record. It is kept on the TASK, so it survives every
  // run, and the next run's input is rebuilt from it.
  if (task.notes.length) {
    lines.push({ cells: [T("")] });
    field("ON TASK", [T("kept across every run", p.ghost)], p.heading);
    for (const note of task.notes) {
      const noteW = Math.max(10, w - 26);
      wrap(note.text, noteW).forEach((row, i) => {
        lines.push({
          cells: [
            T("   " + pad(i ? "" : note.kind.toUpperCase(), 11), p.heading, 500),
            T(pad(row, noteW), p.fg),
            T(i ? "" : "  run " + note.run, p.ghost)
          ]
        });
      });
    }
  }

  const primary = primaryAction(task, state, model);
  const secondary = secondaryAction(task);
  lines.push({ cells: [T("")] });
  const actions = [];
  if (primary) actions.push(["↵", primary.label, true]);
  if (secondary) actions.push(["x", secondary.label]);
  if (task.state === "working") actions.push(["s", "STOP"]);
  actions.push(["c", "NOTE"]);
  const acts = bindings(actions, w, p, T, "   ", false);
  lines.push({ cells: acts, pin: true, bg: p.sidebar });
  return lines;
}

// The band that says what this task wants from you right now.
function stateBlock(task, w, p, T) {
  const lines = [];
  const row = (label, value, color, weight) => {
    wrap(value, Math.max(8, w - 14)).forEach((text, i) => lines.push({
      cells: [T("   " + cellWord(i ? "" : label, 8), p.dim), T(text, color, weight)]
    }));
  };

  if (task.state === "needs" && task.halt.kind === "permission") {
    lines.push({ cells: [T(" NEEDS YOU · PERMISSION", p.accent, 600)] });
    lines.push({ cells: [T("")] });
    for (const text of wrap(task.halt.op, Math.max(10, w - 6))) {
      lines.push({ cells: [T("   " + text, p.title, 600)] });
    }
    row("path", shortPath(task.halt.path, Math.max(8, w - 14)), p.fg);
    lines.push({ cells: [T("")] });
    if (task.halt.plan) row("plan", task.halt.plan, p.fg);
    if (task.halt.why) row("why", task.halt.why, p.dim);
    if (task.halt.options.length) row("options", task.halt.options.join(" · "), p.dim);
    if (task.halt.partial) {
      row("", "some options do not map to ALLOW/REJECT — inspect above", p.ghost);
    }
    row("", task.halt.note, p.ghost);
  } else if (task.state === "needs") {
    lines.push({ cells: [T(" NEEDS YOU · DECISION", p.accent, 600)] });
    lines.push({ cells: [T("")] });
    // The question in full — it is prose a human has to actually answer, not
    // a label. core/lifecycle.mjs preserves it verbatim; nothing truncates
    // it on the way here.
    for (const rowText of wrap(task.halt.question, Math.max(10, w - 6))) {
      lines.push({ cells: [T("   " + rowText, p.title, 600)] });
    }
    for (const paragraph of String(task.halt.detail || "").split(/\r?\n/).filter(text => text.trim())) {
      lines.push({ cells: [T("")] });
      for (const rowText of wrap(paragraph, Math.max(10, w - 6))) {
        lines.push({ cells: [T("   " + rowText, p.fg)] });
      }
    }
    lines.push({ cells: [T("")] });
    for (const rowText of wrap(task.halt.note, Math.max(10, w - 6))) {
      lines.push({ cells: [T("   " + rowText, p.ghost)] });
    }
  } else if (task.state === "failed") {
    lines.push({
      cells: [
        T(" FAILED", p.bad, 600),
        T("   " + cut("run " + task.run + " on " + task.providerName + " stopped at " + fmtDuration(task.elapsed), Math.max(8, w - 11)), p.dim)
      ]
    });
    row("at", task.fail.at, p.fg);
    // The design's `reason` is one line, and a provider's `error` frequently
    // is not — a stack trace arrives verbatim. So the band keeps its shape
    // (the failure in one line a human can read at a glance) and the rest is
    // DEMOTED rather than discarded, the same treatment the Web gives it.
    row("reason", task.fail.headline, p.bad);
    row("state", task.fail.kept, p.dim);
    if (task.fail.auth) {
      // A provider that is no longer authenticated is not a task failure —
      // 0x2F says so plainly and names the machine, because it cannot sign
      // in for you.
      for (const rowText of wrap(task.fail.auth.sentence, Math.max(10, w - 14))) {
        lines.push({ cells: [T("   " + pad("", 8), p.dim), T(rowText, p.fg)] });
      }
      if (task.fail.remedy) row("run", task.fail.remedy, p.accent, 600);
    }
    row("", "a retry keeps the title, your notes and every answer", p.ghost);
    if (task.fail.detail) {
      lines.push({ cells: [T("")] });
      lines.push({
        cells: [T(" " + task.providerName + " SAID", p.ghost, 600)]
      });
      for (const rowText of wrap(task.fail.detail, Math.max(10, w - 6))) {
        lines.push({ cells: [T("   " + rowText, p.ghost)] });
      }
    }
  } else if (task.state === "ready") {
    lines.push({
      cells: [
        T(" RESULT", p.ok, 600),
        T("   ", p.dim), T("r", p.key, 600), T(" full report", p.dim)
      ]
    });
    if (typeof task.result === "string" && task.result.trim()) {
      lines.push({ cells: [T("")] });
      // The ledger is a decision surface, not a second log viewer. Show
      // the reported conclusion and checks together; r retains the complete
      // report, source evidence and every command receipt.
      const summary = reportedSection(task.result, "Result") || task.result.trim();
      const preview = proseRows(summary, Math.max(10, w - 6), p, T);
      lines.push(...preview.slice(0, 8));
      if (preview.length > 8) lines.push({ cells: bindings([["r", "full report · more below"]], w, p, T, "   ") });
      const checks = reportedSection(task.result, "Verification");
      if (checks && summary !== task.result.trim()) {
        lines.push({ cells: [T("")] });
        lines.push({ cells: [T(" REPORTED CHECKS", p.heading, 600)] });
        const rows = proseRows(checks, Math.max(10, w - 6), p, T);
        lines.push(...rows.slice(0, 6));
        if (rows.length > 6) lines.push({ cells: bindings([["r", "all check details"]], w, p, T, "   ") });
      }
    }
    lines.push({ cells: [T("")] });
    lines.push({ cells: [T(" CHANGES", p.heading, 600), T("   ", p.dim), T("d", p.key, 600), T(" inspect", p.dim)] });
    if (task.files.length) {
      for (const file of task.files) {
        lines.push({ cells: [T("   " + shortPath(file, Math.max(8, w - 6)), p.dim)] });
      }
    } else {
      lines.push({ cells: [T("   " + (task.coarse
        ? "this provider does not report which files it changed"
        : "no file changes reported"), p.ghost)] });
    }
  } else if (task.state === "working") {
    const last = [...task.steps].reverse().find(s => s.kind === "tool" || s.kind === "command");
    const ruleW = Math.min(28, Math.max(6, w - 22));
    const cells = [T(" WORKING", p.fg, 600), T("   ", p.dim)].concat(ruleCells(task, ruleW, p));
    if (task.progress?.percent != null) {
      // The percentage readout names its basis — "62% of previous runs" —
      // so nobody mistakes a measured ratio for a provider guarantee.
      cells.push(
        T("  " + cut(task.progress.percent + "% of " + task.progress.basis, Math.max(6, w - ruleW - 16)), p.dim)
      );
    }
    lines.push({ cells });
    row(last ? last.verb.toLowerCase() : "", last ? last.arg : task.activity || "starting", p.fg);
  } else {
    lines.push({
      cells: [
        T(" CLOSED", p.ghost, 600),
        T("   " + cut("closed after " + task.run + (task.run === 1 ? " run" : " runs"), Math.max(8, w - 11)), p.ghost)
      ]
    });
  }
  return lines;
}

// --- the changes view (d) ------------------------------------------------------
//
// The design's diff mode. A halted run shows the change it PLANS to make
// (nothing is written yet, so there is nothing to diff). A run that has
// actually touched files shows a REAL diff: the shared layer computes
// unified hunks from the working tree vs HEAD (src/core/diff.mjs), so the
// view draws the actual difference, never a provider summary. A file with
// no git baseline (untracked, or the workspace is not a repository) is
// listed by path alone, and the view says no diff could be computed.
export function buildResult(model, state, cols, p, T) {
  const review = state.review;
  const task = model.tasks.find(t => t.id === review?.taskId) ?? selected(model.tasks, state);
  if (!review) return [{ cells: [T(" Loading saved run…", p.dim)] }];
  const lines = [];
  const measure = Math.min(96, Math.max(12, cols - 4));
  const text = value => {
    for (const line of wrap(value, measure)) lines.push({ cells: [T(" " + line, p.fg)] });
  };
  const heading = value => { lines.push({ cells: [T("")] }); lines.push({ cells: [T(" " + value, p.heading, 600)] }); };
  text(`0x2F / ${model.workspace.label} / #${task?.idLabel ?? ""} · RUN ${review.run} · ${review.provider ?? "unknown"} · ${review.outcome ?? "unknown"}`);
  lines.push({ cells: bindings([["[ ]", "other runs"], ["i", "exact input"], ["esc", "back to task"]], cols, p, T) });
  if (review.input) {
    heading("EXACT SAVED RUN INPUT"); text(review.inputTransport || "Historical saved prompt"); text(review.prompt || "Not recorded.");
  } else {
    const evidence = resultEvidence(review.result, review.events);
    heading("WRITTEN RESULT · PROVIDER REPORT");
    lines.push(...proseRows(review.result || review.error || "Not recorded.", measure, p, T, " "));
    for (const r of review.checks ?? []) {
      heading(`PROJECT CHECK ${r.id} · ${r.status} · exit ${r.exitCode ?? "unknown"}`);
    }
    heading("PROVIDER-REPORTED CHECKS");
    lines.push(...proseRows(evidence.verification, measure, p, T, " "));
    text(evidence.receipt);
    heading("ORIGINAL REQUEST"); text(review.brief);
    // Detailed command output is an appendix. A real audit can produce
    // thousands of receipt lines; they must never bury its written result.
    for (const r of review.checks ?? []) {
      heading(`PROJECT CHECK OUTPUT ${r.id}`); text(r.stdout ?? "Output not recorded."); text(r.stderr ?? "");
    }
    for (const [index, r] of evidence.receipts.entries()) {
      heading(`TOOL RECEIPT ${index + 1} · exit ${r.exitCode ?? "unknown"}`);
      text(r.command ?? "Tool"); text(r.output ?? "Output not recorded.");
    }
    heading("OBSERVED COMMAND INVOCATIONS · success is not inferred");
    text(evidence.commands.join("\n") || "Not recorded.");
    heading("SOURCE MATERIAL"); text("i reads the exact input saved for this run. The written result above includes the provider's Evidence and Verification sections unchanged.");
  }
  return lines;
}

export function buildContinuation(state, cols, p, T) {
  const preview = state.continuation;
  if (!preview) return [{ cells: [T(" Loading continuation preview…", p.dim)] }];
  const lines = [];
  const text = value => { for (const line of wrap(value, Math.min(100, cols - 4))) lines.push({ cells: [T(" " + line, p.fg)] }); };
  const source = value => {
    const clean = stripVTControlCharacters(String(value ?? "")).replace(CONTROL_RE, "").replace(/\t/g, "    ");
    for (const line of clean.split("\n")) {
      for (const row of cellRows(line, Math.min(100, cols - 4))) lines.push({ cells: [T(" " + row, p.fg)] });
    }
  };
  text(`CONTINUATION PREVIEW · #${String(preview.taskId).padStart(3, "0")} · RUN ${preview.run} · ${preview.provider}`);
  text("No run started. New answers and corrections stay drafts until you start.");
  text(`Original request: full · ${preview.context.userInputs} user inputs in full`);
  text(`${preview.context.characters} / ${preview.context.maxChars} characters (not model tokens)`);
  const delivery = { full: "included in full", excerpt: "excerpt; middle omitted", "reference-only": "reference only; result text omitted" };
  for (const artifact of preview.context.artifacts) text(`Run ${artifact.run}: ${delivery[artifact.delivery]}`);
  text("Fresh session with recorded context; hidden agent state and full transcripts are not transferred.");
  if (preview.userInputs.length) {
    lines.push({ cells: [T("")] }, { cells: [T(" YOUR INSTRUCTIONS · INCLUDED IN FULL", p.heading, 600)] });
    for (const note of preview.userInputs) { text(note.kind ?? "Instruction"); source(note.text); }
  }
  lines.push({ cells: [T("")] }, { cells: [T(" EXACT NEXT RUN INPUT", p.heading, 600)] });
  source(preview.prompt);
  return lines;
}

export function buildChanges(model, state, cols, p, T) {
  const task = selected(model.tasks, state);
  if (!task) return [{ cells: [T(" no task selected", p.ghost)] }];
  const lines = [];
  const planned = task.state === "needs" && task.halt?.kind === "permission";
  const kindWord = planned
    ? "PLANNED · NOT YET WRITTEN"
    : state.diff?.some(f => f.scope) ? "SAVED RUN CHANGE EVIDENCE" : "CURRENT WORKING TREE VS HEAD";

  lines.push({
    cells: [
      T(" CHANGES  #" + task.idLabel + "  ", p.fg, 600),
      T(cut(task.title, Math.max(8, cols - 40)), p.fg, 600)
    ]
  });
  lines.push({
    cells: [
      T("          " + kindWord + "   run " + task.run + " · " + task.providerName,
        planned ? p.accent : p.dim, planned ? 600 : 400)
    ]
  });
  lines.push({ cells: [T(" " + "─".repeat(Math.max(1, cols - 2)), p.rule)] });

  if (!planned) {
    for (const line of wrap(state.diff?.some(f => f.scope) ? "Saved Git-visible interval. Shared-workspace observations may include external edits; exact authorship is not established." : "Current diff at viewing time, not an immutable patch of this run. Later edits may be included.", Math.max(12, cols - 4))) lines.push({ cells: [T(" " + line, p.dim)] });
  }
  if (planned) {
    lines.push({ cells: [T("")] });
    lines.push({
      cells: [
        T(" " + cellWord(task.halt.op.toLowerCase(), 8), p.dim),
        T(task.halt.path, p.fg, 600)
      ]
    });
    if (task.halt.plan) {
      lines.push({ cells: [T("")] });
      for (const row of wrap(task.halt.plan, Math.max(10, cols - 4))) {
        lines.push({ cells: [T("  " + row, p.fg)] });
      }
    }
    lines.push({ cells: [T("")] });
    lines.push({
      cells: [T("  requested operation · ALLOW continues this run with the permission", p.ghost)]
    });
  } else if (state.diff && state.diff.length) {
    // The real change set, already loaded by the app (actions.getTaskDiff).
    let withHunks = 0;
    lines.push({ cells: [T("")] });
    for (const file of state.diff) {
      if (file.kind === "hunks" && file.hunks) {
        withHunks++;
        lines.push({ cells: [T("  " + file.path, p.fg, 600)] });
        for (const raw of file.hunks.split("\n")) {
          if (!raw.trim()) continue;
          const style = diffLineStyle(raw, p);
          for (const row of wrap(raw, Math.max(10, cols - 4))) {
            lines.push({ cells: [T("  " + row, style.c, style.b)] });
          }
        }
        lines.push({ cells: [T("")] });
      } else {
        lines.push({ cells: [T("  " + cut(file.path, cols - 4), p.fg)] });
      }
    }
    lines.push({
      cells: [
        T(
          "  " + (withHunks
            ? state.diff?.some(f => f.scope) ? "saved run patch · later workspace edits are excluded" : "the real diff of the working tree vs HEAD"
            : "no diff could be computed — git has no baseline for these files") +
            " · 0x2F does not stage or commit anything",
          p.ghost
        )
      ]
    });
  } else if (task.files.length) {
    // Diff not loaded yet — the reported file list, exactly what the run
    // said it touched.
    lines.push({ cells: [T("")] });
    for (const file of task.files) {
      lines.push({ cells: [T("  " + cut(file, cols - 4), p.fg)] });
    }
    lines.push({ cells: [T("")] });
    lines.push({
      cells: [T("  " + task.files.length + (task.files.length === 1 ? " file" : " files") +
        " reported changed by this run · 0x2F does not stage or commit anything", p.ghost)]
    });
  } else {
    lines.push({ cells: [T("")] });
    lines.push({ cells: [T("  this run has not reported writing anything", p.ghost)] });
  }
  return lines;
}

// One line of a real unified diff, styled by what its own first character
// says it is — an addition, a deletion, a hunk header, or context. The
// whole wrapped line keeps the prefix's colour so a wrapped fragment never
// reads as a context line.
function diffLineStyle(line, p) {
  if (line.startsWith("+") && !line.startsWith("+++")) return { c: p.ok, b: 500 };
  if (line.startsWith("-") && !line.startsWith("---")) return { c: p.bad, b: 500 };
  if (line.startsWith("@@")) return { c: p.accent, b: 600 };
  if (/^(diff --git|index |new file|deleted file|---|\+\+\+)/.test(line)) {
    return { c: p.ghost, b: 400 };
  }
  return { c: p.dim, b: 400 };
}

// --- the composer (n) ----------------------------------------------------------

export function buildComposer(model, state, cols, p, T, height = 1000) {
  const c = state.composer;
  const lines = [];
  const fieldWidth = Math.min(cols - 2, 102);
  const w = composerTextWidth(cols);
  const briefed = c.original !== null;
  const info = model.lookup(c.provider);
  const available = model.providers?.[c.provider]?.available;

  lines.push({ cells: [T(" NEW TASK", p.title, 600)] });
  lines.push({ cells: [T(" Nothing runs until you choose Start.", p.dim)] });
  lines.push({ cells: [T("")] });
  lines.push({ cells: [T(" Provider   ", p.dim), {
    t: " " + info.sig + " " + cut(info.name, Math.max(8, cols - 46)) + " ",
    c: p.title, b: 600, bg: p.sel
  }, T("   ", p.dim), T("tab", p.key, 600), T(" change", p.dim),
  ...(available === false ? [T(" · executable missing", p.bad)] : [])] });
  lines.push({ cells: [T("")] });
  lines.push({ cells: [T(briefed ? " EXPANDED BRIEF" : " WHAT NEEDS DOING?", p.heading, 600),
    ...(briefed ? [T("   ", p.dim), T("⌃z", p.key, 600), T(" revert", p.dim)] : [])] });

  const border = (left, right) => ({ cells: [T(" " + left + "─".repeat(fieldWidth - 2) + right, p.rule)] });
  lines.push(border("┌", "┐"));
  const { rows: body, caret } = editorRows(c.text, c.cursor, w);
  const bottom = [
    { cells: [T("")] },
    { cells: bindings([["↵", "START", true], ["ctrl-n", "newline"], ["F1", "help"], ["esc", "keep draft"]], cols, p, T) },
    { cells: [T(" 0x2F names the task from what you write.", p.ghost)] }
  ];
  // Reserve the field's bottom edge and its position cue before choosing a
  // window. Even 60×18 keeps the caret, Start and draft recovery visible.
  const capacity = Math.max(1, height - lines.length - bottom.length - 2);
  const anchor = Math.max(0, Math.min(body.length - capacity, caret.row - capacity + 1));
  const offset = Math.max(0, Math.min(Math.max(0, body.length - capacity), anchor - (c.scroll ?? 0)));
  const visibleRows = body.slice(offset, offset + capacity);
  const count = Math.min(capacity, Math.max(6, visibleRows.length));
  for (let i = 0; i < count; i++) {
    const row = visibleRows[i] ?? "";
    const cells = [T(" │", p.rule), { ...T("  ", p.fg), bg: p.field }];
    if (offset + i === caret.row) {
      const tail = row.slice(caret.col);
      const grapheme = firstGrapheme(tail) || " ";
      cells.push(T(row.slice(0, caret.col), p.fg),
        { t: grapheme, c: p.accent, cur: true, bg: p.field }, T(tail.slice(grapheme.length), p.fg));
    } else cells.push(T(row, p.fg));
    if (!c.text.length && i === 0) cells.push(T(" Describe the outcome you want…", p.ghost));
    const contentWidth = len(cells) - 2;
    cells.push(T(" ".repeat(Math.max(0, w + 4 - contentWidth)), p.fg), T("│", p.rule));
    // Only the editable interior gets the input surface. Its border and
    // outside margin remain on the canvas in both truecolor and no-color.
    for (let j = 1; j < cells.length - 1; j++) cells[j].bg = p.field;
    lines.push({ cells });
  }
  lines.push(border("└", "┘"));
  const cue = body.length > capacity
    ? "Lines " + (offset + 1) + "–" + Math.min(body.length, offset + capacity) + "/" + body.length + " · PgUp/PgDn review · "
    : "";
  lines.push({ cells: [T(" " + cue + c.text.length + "/" + MAX_BRIEF + " characters", c.text.length > MAX_BRIEF ? p.bad : p.ghost)] });
  lines.push(...bottom);
  return lines;
}

// --- help (?) ------------------------------------------------------------------

const KEYS = [
  ["j  k", "move between tasks · g / G jump to first / last"],
  ["J  K", "scroll the task detail"],
  ["tab", "filter the ledger — all · needs you · failed · ready · working"],
  ["/", "search by title, brief or number"],
  ["↵", "the next action shown in the task action bar"],
  ["x", "the alternative — reject · save only · send back · drop"],
  ["d", "changes — saved run patch where available; legacy current-tree diff otherwise"],
  ["s", "cancel active execution · partial work stays; external effects are not rolled back"],
  ["r", "read full request/result/checks; [ ] selects run, i shows saved run input, j/k scrolls, g/G ends"],
  ["c", "note or correct — kept on the task, carried into every later run"],
  ["p", "point the next run at another provider"],
  ["v", "preview the next run without starting; ↵ starts, u refreshes, Esc returns"],
  ["⌥↵ in send back / answer", "preview with the unsaved correction or answer"],
  ["t", "expand the trace of the current run"],
  ["n", "new task — ⇧↵ inserts a newline (⌃n where your terminal cannot send ⇧↵), ⌥↵ expands your note into a brief, ↵ starts it"],
  ["F1 / ⌃g", "help from any text field; return without losing your draft"],
  ["← →", "edit the task draft · Home/End moves within its line · Delete removes the next character"],
  ["PgUp/Dn", "review a long draft; scroll help, results and changes"],
  ["esc", "clear filter and search · cancel an input"],
  ["?", "this list"],
  ["q", "detach — runs keep executing without you"]
];

const MODEL_NOTES = [
  "a TASK is permanent — its title, your notes, your answers, its whole run history",
  "a RUN is one provider attempt at that task; runs fail, get sent back, get replaced",
  "a permission resumes the same run · a decision or a correction starts the next one",
  "the runtime is shared — the same tasks are in the CLI, the web client and the phone"
];

export function buildHelp(cols, p, T, error = null, draft = null) {
  const lines = [
    { cells: [T(" KEYS", p.fg, 600)] },
    { cells: [T(" " + "─".repeat(Math.max(1, cols - 2)), p.rule)] },
    { cells: [T("")] }
  ];
  if (error) {
    lines.push({ cells: [T(" LAST ERROR", p.bad, 600)] });
    for (const row of wrap(error, cols - 6)) lines.push({ cells: [T("   " + row, p.fg)] });
    lines.push({ cells: [T("")] });
  }
  if (draft !== null) {
    lines.push({ cells: [T(" DRAFT", p.heading, 600), T(" · review only · ", p.ghost), T("Esc", p.key, 600), T(" returns to editing", p.dim)] });
    for (const row of wrap(draft, cols - 6)) lines.push({ cells: [T("   " + row, p.fg)] });
    lines.push({ cells: [T("")] });
  }
  for (const [key, description] of KEYS) {
    // Descriptions wrap onto continuation lines (the key cell stays on the
    // first) — a long entry must never be clipped silently at the edge.
    const rows = wrap(description, Math.max(20, cols - 16));
    rows.forEach((row, i) => {
      lines.push({
        cells: [T("   " + pad(i ? "" : key, 8), p.key, 600), T(row, p.fg)]
      });
    });
  }
  lines.push({ cells: [T("")] });
  lines.push({ cells: [T("   MODEL", p.fg, 600)] });
  for (const note of MODEL_NOTES) {
    for (const row of wrap(note, Math.max(1, cols - 6))) lines.push({ cells: [T("   " + row, p.dim)] });
  }
  return lines;
}

// --- the whole frame -----------------------------------------------------------

// The outer breathing room around the whole frame — a column of ground on
// each side and a blank row top and bottom, so the design's content never
// sits flush against the terminal's own edge (or a host app's panel border,
// which paints no inset of its own). Every width/height computation below
// this point works in the SHRUNK budget; the gutter is stitched back on once
// the frame is built, rather than threading it through every column sum.
const GUTTER_X = 1;
const GUTTER_Y = 1;
const FOOTER = 3;

export function continuationScrollMax(state, opts = {}) {
  const cols = (opts.cols ?? 132) - GUTTER_X * 2;
  const available = (opts.rows ?? 38) - GUTTER_Y * 2 - FOOTER;
  return Math.max(0, buildContinuation(state, cols, {}, t => ({ t })).length - available);
}

export function frame(model, state, opts = {}) {
  const trueCols = Math.max(1, opts.cols ?? 132);
  const trueRows = Math.max(1, opts.rows ?? 38);
  if (trueCols < MIN_TUI_COLS || trueRows < MIN_TUI_ROWS) {
    const messages = ["0x2F · terminal too small", `Resize to at least ${MIN_TUI_COLS}×${MIN_TUI_ROWS}`, "q / Ctrl+C exit · runs keep working"];
    return { cols: trueCols, rows: trueRows, bg: opts.palette.bg,
      lines: Array.from({ length: trueRows }, (_, i) => ({ cells: [{ t: cut(messages[i] ?? "", trueCols), c: opts.palette.fg, b: 400, bg: opts.palette.bg }] })) };
  }
  const cols = trueCols - GUTTER_X * 2;
  const rows = trueRows - GUTTER_Y * 2;
  const p = opts.palette;
  const T = (t, c, b) => ({ t: String(t), c, b: b || 400, bg: "transparent" });

  const avail = rows - FOOTER;
  let lines = [];
  let hint = [];

  const padTo = (cells, w, bg) => {
    const out = (cells ?? []).map(cell => ({
      ...cell,
      bg: cell.bg && cell.bg !== "transparent" ? cell.bg : bg || "transparent"
    }));
    let used = 0;
    for (let i = 0; i < out.length; i++) {
      const original = out[i].t, text = takeCells(original, w - used);
      out[i] = { ...out[i], t: text }; used += displayWidth(text);
      if (text.length < original.length) { out.splice(i + 1); break; }
    }
    const room = w - used;
    if (room > 0) out.push({ t: " ".repeat(room), c: p.dim, b: 400, bg: bg || "transparent" });
    return out;
  };

  if (state.mode === "quit") {
    lines = [
      { cells: [T("")] },
      { cells: [T(" detached.", p.fg, 600)] },
      { cells: [T(" runs keep executing — reattach with ", p.dim), T("2f tui", p.accent)] }
    ];
  } else if (state.mode === "help") {
    const all = buildHelp(cols, p, T, state.lastError, state.input ? state.draft : null);
    const max = Math.max(0, all.length - avail);
    const off = Math.min(state.dscroll, max);
    lines = all.slice(off, off + avail);
    hint = [["↑/↓", "scroll"], ["PgUp/PgDn", "page"], ["any key", "back"]];
    if (max) hint.push([null, (off + 1) + "/" + all.length]);
  } else if (state.mode === "composer") {
    lines = buildComposer(model, state, cols, p, T, avail);
    hint = [["←/→", "edit"], ["Home/End", "line ends"], ["PgUp/PgDn", "review"], ["F1", "help"]];
  } else if (state.mode === "continuation") {
    const all = buildContinuation(state, cols, p, T);
    const max = Math.max(0, all.length - avail);
    const off = Math.min(state.dscroll, max);
    lines = all.slice(off, off + avail);
    hint = [["↵", "start next run", true], ["u", "refresh"], ["j/k", "scroll"], ["esc", "back"]];
    if (max) hint.push([null, Math.min(all.length, off + avail) + "/" + all.length]);
  } else if (state.mode === "result") {
    const all = buildResult(model, state, cols, p, T);
    const max = Math.max(0, all.length - avail);
    const off = Math.min(state.dscroll, max);
    lines = all.slice(off, off + avail);
    hint = [["j/k", "scroll"], ["g/G", "ends"], ["[ ]", "run"], ["i", "input/result"], ["esc", "back"]];
    if (max) hint.push([null, Math.min(all.length, off + avail) + "/" + all.length]);
  } else if (state.mode === "diff") {
    const all = buildChanges(model, state, cols, p, T);
    const max = Math.max(0, all.length - avail);
    const off = Math.min(state.dscroll, max);
    lines = all.slice(off, off + avail);
    hint = [["j/k", "scroll"], ["any other key", "back"]];
    if (max) hint.push([null, Math.min(all.length, off + avail) + "/" + all.length]);
  } else {
    // Two panes. The left width is a fixed reading measure at normal sizes
    // and a fraction only when the terminal is too narrow to afford it.
    const narrow = cols < 110;
    const Lw = narrow ? Math.max(25, Math.round(cols * 0.37)) : cols <= 140 ? 36 : 42;
    const Rw = cols - Lw - 1;
    const left = buildLeft(model, state, Lw, p, T);
    const right = buildRight(model, state, Rw, p, T);

    // Window the ledger around the selection, keeping its three-row header
    // pinned — workspace identity and counts must never scroll away.
    let leftWindow = left;
    if (left.length > avail) {
      // One row of the window is the orientation cue, exactly where the
      // ledger cuts off — mirroring the detail pane's N/M · J K readout, so
      // groups hidden above or below the viewport are never silent.
      const selIndex = left.findIndex(l => l.selected);
      const cap = avail - 4;
      const start = Math.max(3, Math.min(left.length - cap - 3, selIndex - Math.floor(cap / 2)));
      const hiddenAbove = start - 3;
      const hiddenBelow = left.length - (start + cap);
      leftWindow = left.slice(0, 3).concat(left.slice(start, start + cap));
      const cue = [
        hiddenAbove > 0 ? "▲ " + hiddenAbove : null,
        hiddenBelow > 0 ? "▼ " + hiddenBelow : null
      ].filter(Boolean).join(" · ");
      leftWindow.push({ cells: [T("     " + cue, p.ghost)] });
    }

    // The action row is pinned to the bottom of the right pane: the one
    // thing this task wants from you never scrolls out of view.
    const pinIndex = right.findIndex(l => l.pin);
    const pinned = pinIndex >= 0 ? right[pinIndex] : null;
    let body = pinIndex >= 0 ? right.slice(0, pinIndex) : right.slice();
    const cap = pinned ? avail - 2 : avail;
    if (body.length > cap) {
      const headRows = body.slice(0, 2);
      const rest = body.slice(2);
      const maxOff = Math.max(0, rest.length - (cap - 3));
      const off = Math.min(state.rscroll, maxOff);
      body = headRows.concat(rest.slice(off, off + cap - 3)).concat([
        {
          cells: [
            T("   ", p.ghost),
            { t: "─".repeat(Math.max(4, Rw - 24)), c: p.rule, b: 400, bg: "transparent" },
            T("  " + Math.min(rest.length, off + cap - 3) + "/" + rest.length + " · ", p.ghost), T("J K", p.key, 600)
          ]
        }
      ]);
    }
    let rightWindow = body;
    if (pinned) {
      while (rightWindow.length < avail - 2) rightWindow.push({ cells: [T("")] });
      rightWindow = rightWindow.concat([
        { cells: [T(" " + "─".repeat(Math.max(1, Rw - 2)), p.rule)] },
        pinned
      ]);
    }

    for (let i = 0; i < avail; i++) {
      const l = leftWindow[i];
      const r = rightWindow[i];
      const bg = l?.bg ?? p.sidebar;
      lines.push({
        cells: padTo(l ? l.cells : [T("")], Lw, bg)
          .concat([{ t: "│", c: p.rule, b: 400, bg: "transparent" }])
          .concat(padTo(r ? r.cells : [T("")], Rw, r?.bg ?? p.surface))
      });
    }

    const task = selected(model.tasks, state);
    const primary = primaryAction(task, state, model);
    const secondary = secondaryAction(task);
    // Task actions already have their own pinned band. The global footer
    // stays for navigation, reading and recovery, without a second copy.
    hint.push(["n", "new task"], ["j/k", "select"], ["tab", FILTERS[state.filter].toLowerCase()], ["?", "help"], ["q", "detach"]);
    if (cols >= 100) hint.push(["v", "preview next run"], ["/", "search"]);
  }

  while (lines.length < avail) lines.push({ cells: [T("")] });
  lines = lines.slice(0, avail);

  lines.push({ cells: [T(" " + "─".repeat(Math.max(1, cols - 2)), p.rule)] });

  if (state.input && state.mode === "work") {
    const task = model.tasks.find(t => t.id === state.inputTaskId) ?? selected(model.tasks, state);
    const label = INPUT_LABELS[state.input] + (task ? " #" + task.idLabel : "");
    const flat = state.draft.replace(/\n/g, "↵").replace(/\t/g, " ");
    const cursor = Math.min(state.draftCursor ?? flat.length, flat.length);
    const width = Math.max(1, cols - displayWidth(label) - 5);
    const tail = flat.slice(cursor);
    const grapheme = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(tail)][0]?.segment ?? " ";
    const before = tailCells(flat.slice(0, cursor), width - displayWidth(grapheme));
    const after = takeCells(tail.slice(grapheme.length), width - displayWidth(before) - displayWidth(grapheme));
    lines.push({
      cells: [
        T(" " + label + " ", p.accent, 600),
        T("› ", p.ghost),
        T(before, p.fg),
        { t: grapheme, c: p.accent, cur: true, bg: "transparent" },
        T(after, p.fg)
      ]
    });
    lines.push({
      cells: bindings([["↵", "commit", true], ...(["sendback", "answer"].includes(state.input) ? [["⌥↵", "preview"]] : []), ["ctrl-n", "newline"], ["F1", "review/help"], ["esc", "cancel"]], cols, p, T)
    });
  } else if (state.searching && state.mode === "work") {
    lines.push({
      cells: [
        T(" SEARCH ", p.accent, 600),
        T("/ ", p.ghost),
        T(tailCells(state.search, Math.max(1, cols - 11)), p.fg),
        { t: " ", c: p.accent, cur: true, bg: "transparent" }
      ]
    });
    lines.push({
      cells: bindings([["↵", "keep"], ["esc", "clear"], [null, visible(model.tasks, state).length + " of " + model.tasks.length + " tasks match"]], cols, p, T)
    });
  } else {
    const flash = state.flash;
    const task = selected(model.tasks, state);
    const context = state.mode === "composer" ? "Draft · nothing has started"
      : state.mode === "continuation" ? "Next run input · Enter starts, u refreshes, Esc returns"
      : state.mode === "result" ? "Saved run report · review the outcome and checks"
        : state.mode === "diff" ? "Change review · inspect the saved evidence"
          : state.mode === "help" ? "Keyboard reference"
            : !task ? "Create a task to start work"
              : task.state === "ready" ? "Review the result, then accept or send back"
                : task.state === "working" ? "Agent is working · you can detach and return"
                  : task.state === "needs" ? "This task is waiting for your decision"
                    : task.state === "failed" ? "Read the failure, then retry or drop the task"
                      : "Task closed · its result and history are kept";
    lines.push({
      cells: flash
        ? [
            T(" " + (flash.tone === "warn" ? "·" : "✓") + " ", flash.tone === "warn" ? p.bad : p.ok, 600),
            T(cut(flash.text, cols - 5), p.fg)
          ]
        : [
            T(" › ", p.ghost, 600),
            T(state.busy ? "working…" : context, p.ghost)
          ]
    });
    lines.push({ cells: bindings(hint, cols, p, T) });
  }

  for (const line of lines) {
    for (const cell of line.cells) {
      if (!cell.b) cell.b = 400;
      if (!cell.bg) cell.bg = "transparent";
    }
  }

  // Stitch the gutter back on: a blank row of ground top and bottom, and a
  // column of ground before every line. The trailing column on the right
  // needs no cell of its own — renderLine already pads any row shorter than
  // `trueCols` with the frame's ground, and every line here was built to a
  // budget `GUTTER_X` narrower than that.
  const blankRow = { cells: [] };
  const gutteredLines = [
    blankRow,
    ...lines.map(line => ({
      ...line,
      cells: [{ t: " ".repeat(GUTTER_X), c: p.dim, b: 400, bg: "transparent" }, ...line.cells]
    })),
    blankRow
  ];

  // `bg` travels with the frame because the caret cell is drawn inverted —
  // its ink is the terminal's own ground, which only the palette knows.
  return { lines: gutteredLines, cols: trueCols, rows: trueRows, bg: p.bg };
}
