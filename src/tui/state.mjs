// TUI state and the keymap — pure.
//
// Everything in here is presentation state: which row is selected, which
// filter is on, what the user has half-typed. No Work state lives here, and
// no business rule: `apply` returns the next TUI state plus an optional
// INTENT — a description of the shared action the controller should invoke.
// That split is what keeps the keymap testable without a runtime and keeps
// src/core/actions.mjs the only place that can change a task.
//
// The keymap follows the finalized design, not terminal convention: ↵ is
// "the one action this task is waiting for" rather than "open", x is the
// alternative, and the letters (c/d/p/t/n) are the design's.

import { FILTER_KEYS } from "./model.mjs";
import { isPrintable } from "./keys.mjs";
import { editText, composerTextWidth } from "./editor.mjs";

export function initialState(opts = {}) {
  return {
    sel: 0,
    filter: 0,
    search: "",
    searching: false,
    mode: "work",
    input: null,
    inputTaskId: null,
    draft: "",
    draftCursor: null,
    rscroll: 0,
    dscroll: 0,
    expand: false,
    rerunProvider: null,
    flash: null,
    lastError: null,
    // The loaded change set for the diff view (actions.getTaskDiff output) —
    // null until the view is opened, so entering `d` never blocks the frame
    // on a git walk.
    diff: null,
    review: null,
    continuation: null,
    continuationInvalid: false,
    composer: { text: "", original: null, provider: opts.provider ?? null },
    busy: false
  };
}

export function visible(tasks, state) {
  const key = FILTER_KEYS[state.filter];
  let out = key === "all" ? tasks : tasks.filter(t => t.state === key);
  const q = state.search.trim().toLowerCase();
  if (q) {
    out = out.filter(t =>
      (t.idLabel + " " + t.title + " " + t.brief).toLowerCase().includes(q)
    );
  }
  return out;
}

export function selected(tasks, state) {
  const list = visible(tasks, state);
  if (!list.length) return null;
  return list[Math.min(state.sel, list.length - 1)];
}

// The provider the NEXT run of this task would use. A failed run defaults to
// the same provider (a RETRY is a retry — the intent has not changed); `p`
// points it somewhere else.
export function rerunTarget(task, state) {
  return state.rerunProvider ?? task?.provider ?? null;
}

function nextProvider(order, current) {
  if (!order.length) return current;
  const i = order.indexOf(current);
  return order[(i + 1) % order.length];
}

// --- the two actions a row offers -------------------------------------------
//
// One primary (↵) and one alternative (x), derived from Work state alone.
// `input` means the gesture needs text first; `intent` means it fires now.

export function primaryAction(task, state, ctx = {}) {
  if (!task) return null;
  const target = rerunTarget(task, state);
  const name = ctx.lookup ? ctx.lookup(target).name : String(target ?? "").toUpperCase();
  if (task.state === "needs") {
    return task.halt?.kind === "permission"
      ? { label: "ALLOW", intent: { type: "allow", id: task.id,
          ...(task.halt.decisionId ? { decisionId: task.halt.decisionId } : {}) } }
      : { label: "ANSWER & CONTINUE", input: "answer" };
  }
  if (task.state === "ready") return { label: "ACCEPT", intent: { type: "accept", id: task.id } };
  if (task.state === "failed") {
    return {
      label: target === task.provider ? "RETRY" : "RETRY ON " + name,
      intent: { type: "preview", id: task.id, options: { provider: target } }
    };
  }
  if (task.state === "done") {
    return {
      label: "REOPEN ON " + name,
      intent: { type: "preview", id: task.id, options: { provider: target } }
    };
  }
  return null;
}

export function secondaryAction(task) {
  if (!task) return null;
  if (task.state === "needs") {
    return task.halt?.kind === "permission"
      ? { label: "REJECT", intent: { type: "reject", id: task.id,
          ...(task.halt.decisionId ? { decisionId: task.halt.decisionId } : {}) } }
      : { label: "SAVE ONLY", input: "answer-save" };
  }
  if (task.state === "ready") return { label: "SEND BACK", input: "sendback" };
  if (task.state === "failed") return { label: "DROP", intent: { type: "drop", id: task.id } };
  return null;
}

export const INPUT_LABELS = {
  answer: "ANSWER & CONTINUE",
  "answer-save": "SAVE ONLY",
  note: "NOTE ON TASK",
  sendback: "SEND BACK"
};

export const INPUT_NOTES = {
  answer: "preview first · saved only when you start the next run",
  "answer-save": "recorded on the task · the task stays NEEDS YOU",
  note: "saved for the next run · the current run does not receive it",
  sendback: "preview first · saved only when you start the next run"
};

function commitInput(state, task) {
  const text = state.draft.trim();
  const kind = state.input;
  const cleared = { ...state, input: null, draft: "" };
  if (!task || !text) return { state: cleared, intent: null };
  if (["answer", "sendback"].includes(kind)) {
    return { state, intent: { type: "preview", id: task.id, options: {
      provider: rerunTarget(task, state),
      input: { kind: kind === "answer" ? "answer" : "correction", text }
    } } };
  }
  if (kind === "answer-save") {
    return { state: cleared, intent: { type: "answer", id: task.id, text, continue: false } };
  }
  if (kind === "note") return { state: cleared, intent: { type: "note", id: task.id, text } };
  return { state: cleared, intent: null };
}

// --- the composer -------------------------------------------------------------
//
// ⇧↵ inserts a newline when the terminal can deliver it (Kitty's CSI-u or
// xterm's modifyOtherKeys — see keys.mjs); a terminal that cannot tell ⇧↵
// from ↵ sends no distinct bytes, so ⌃n remains the universal fallback.
// ⌥↵ (brief) survives as-is: terminals deliver Alt as an ESC prefix in the
// same read.
function composerKey(state, key, ctx) {
  const c = state.composer;
  const set = patch => ({ ...state, composer: { ...c, scroll: 0, ...patch } });

  if (key.name === "escape") return { state: { ...state, mode: "work" }, intent: null };
  if (key.name === "enter" && key.alt) {
    if (!c.text.trim() || c.original !== null) return { state, intent: null };
    return { state, intent: { type: "refine", text: c.text } };
  }
  if (key.name === "enter" && key.shift) {
    return { state: set(editText(c.text, c.cursor, { name: "paste", text: "\n" })), intent: null };
  }
  if (key.name === "char" && key.ctrl && key.ch === "n") {
    return { state: set(editText(c.text, c.cursor, { name: "paste", text: "\n" })), intent: null };
  }
  if (key.name === "char" && key.ctrl && key.ch === "z") {
    return c.original !== null
      ? { state: set({ text: c.original, original: null, cursor: c.original.length }), intent: null }
      : { state, intent: null };
  }
  if (key.name === "enter") {
    if (!c.text.trim()) return { state, intent: null };
    return { state, intent: { type: "create", brief: c.text.trim(), provider: c.provider } };
  }
  if (key.name === "tab") {
    return { state: set({ provider: nextProvider(ctx.providerOrder ?? [], c.provider) }), intent: null };
  }
  if (key.name === "shift-tab") {
    const order = ctx.providerOrder ?? [];
    return { state: set({ provider: nextProvider([...order].reverse(), c.provider) }), intent: null };
  }
  if (key.name === "page-up") return { state: set({ scroll: (c.scroll ?? 0) + 8 }), intent: null };
  if (key.name === "page-down") return { state: set({ scroll: Math.max(0, (c.scroll ?? 0) - 8) }), intent: null };
  const edited = editText(c.text, c.cursor, key, composerTextWidth((ctx.cols ?? 132) - 2));
  if (edited) return { state: set(edited), intent: null };
  return { state, intent: null };
}

// One key press -> { state, intent }. `ctx` is read-only context the keymap
// needs to resolve a gesture: the visible task list, the provider order and
// the provider lookup for labels.
export function apply(state, key, ctx = {}) {
  const tasks = ctx.tasks ?? [];
  const list = visible(tasks, state);
  const task = selected(tasks, state);
  const none = { state, intent: null };

  // Paste is one text insertion. It cannot submit, navigate, grant a
  // permission or answer another task, even when it contains shortcut keys.
  if (key.name === "paste") {
    if (state.mode === "composer") return {
      state: { ...state, composer: { ...state.composer,
        ...editText(state.composer.text, state.composer.cursor, key), scroll: 0 } }, intent: null
    };
    if (state.mode === "work" && state.input) {
      const edited = editText(state.draft, state.draftCursor, key);
      return { state: { ...state, draft: edited.text, draftCursor: edited.cursor }, intent: null };
    }
    if (state.mode === "work" && state.searching) return {
      state: { ...state, search: state.search + key.text.replace(/\s+/g, " "), sel: 0 }, intent: null
    };
    return none;
  }

  if (key.name === "ctrl-c") return { state: { ...state, mode: "quit" }, intent: { type: "quit" } };
  if (key.name === "help" || (key.ctrl && key.ch === "g")) return { state: { ...state,
    mode: state.mode === "help" ? (state.helpReturn ?? "work") : "help",
    helpReturn: state.mode === "help" ? null : state.mode,
    helpScroll: state.mode === "help" ? 0 : state.dscroll,
    dscroll: state.mode === "help" ? (state.helpScroll ?? 0) : 0 }, intent: null };

  if (state.mode === "composer") return composerKey(state, key, ctx);

  if (state.mode === "quit") return { state, intent: { type: "quit" } };

  if (["help", "result", "diff", "continuation"].includes(state.mode)) {
    const max = state.mode === "continuation" ? (ctx.continuationMaxScroll ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    const delta = key.name === "page-down" ? 10 : key.name === "page-up" ? -10
      : key.name === "down" ? 1 : key.name === "up" ? -1
      : key.name === "char" && key.ch === "j" ? 1 : key.name === "char" && key.ch === "k" ? -1 : 0;
    if (delta) return { state: { ...state, dscroll: Math.max(0, Math.min(max, Math.min(max, state.dscroll) + delta)) }, intent: null };
    if (key.name === "home" || (key.name === "char" && key.ch === "g")) return { state: { ...state, dscroll: 0 }, intent: null };
    if (key.name === "end" || (key.name === "char" && key.ch === "G")) return { state: { ...state, dscroll: max }, intent: null };
    if (state.mode === "help") return { state: { ...state, mode: state.helpReturn ?? "work", helpReturn: null, dscroll: state.helpScroll ?? 0 }, intent: null };
  }

  if (state.mode === "continuation") {
    const preview = state.continuation;
    if (key.name === "escape") return { state: { ...state, mode: "work", continuation: null, continuationInvalid: false, dscroll: 0 }, intent: null };
    if (key.name === "char" && key.ch === "u" && preview) return { state, intent: {
      type: "preview", id: preview.taskId, options: preview.options
    } };
    if (key.name === "enter" && preview && !state.continuationInvalid) return { state, intent: { type: "preview-start" } };
    return none;
  }

  if (state.mode === "result") {
    const review = state.review;
    const reviewTask = ctx.tasks.find(t => t.id === review?.taskId) ?? task;
    if (key.name === "escape" || (key.name === "char" && key.ch === "r")) {
      const index = list.findIndex(t => t.id === reviewTask?.id);
      return { state: { ...state, mode: "work", dscroll: 0,
        ...(index >= 0 ? {sel:index} : {filter:0,search:"",sel:Math.max(0,ctx.tasks.findIndex(t=>t.id===reviewTask?.id))}) }, intent: null };
    }
    if (key.name === "down" || (key.name === "char" && key.ch === "j")) return { state: { ...state, dscroll: state.dscroll + 1 }, intent: null };
    if (key.name === "up" || (key.name === "char" && key.ch === "k")) return { state: { ...state, dscroll: Math.max(0, state.dscroll - 1) }, intent: null };
    if (key.name === "char" && key.ch === "g") return { state: { ...state, dscroll: 0 }, intent: null };
    if (key.name === "char" && key.ch === "G") return { state: { ...state, dscroll: Number.MAX_SAFE_INTEGER }, intent: null };
    if (key.name === "char" && key.ch === "i" && review) return { state: { ...state, dscroll: 0, review: { ...review, input: !review.input } }, intent: null };
    if (key.name === "char" && ["[", "]"].includes(key.ch) && reviewTask && review) {
      const runs = reviewTask.runs.map(r => r.run);
      const index = runs.indexOf(review.run);
      const run = runs[Math.max(0, Math.min(runs.length - 1, index + (key.ch === "[" ? -1 : 1)))];
      return { state: { ...state, dscroll: 0 }, intent: { type: "review", id: reviewTask.id, run } };
    }
    // Enter deliberately does not accept from a historical result/input view.
    return none;
  }

  if (state.mode === "diff") {
    if (key.name === "char" && key.ch === "j") return { state: { ...state, dscroll: state.dscroll + 1 }, intent: null };
    if (key.name === "down") return { state: { ...state, dscroll: state.dscroll + 1 }, intent: null };
    if (key.name === "char" && key.ch === "k") return { state: { ...state, dscroll: Math.max(0, state.dscroll - 1) }, intent: null };
    if (key.name === "up") return { state: { ...state, dscroll: Math.max(0, state.dscroll - 1) }, intent: null };
    return { state: { ...state, mode: "work", dscroll: 0 }, intent: null };
  }

  if (state.mode !== "work") return { state: { ...state, mode: "work" }, intent: null };

  if (state.searching) {
    if (key.name === "enter") return { state: { ...state, searching: false, sel: 0 }, intent: null };
    if (key.name === "escape") return { state: { ...state, searching: false, search: "", sel: 0 }, intent: null };
    if (key.name === "backspace") return { state: { ...state, search: state.search.slice(0, -1), sel: 0 }, intent: null };
    if (isPrintable(key)) return { state: { ...state, search: state.search + key.ch, sel: 0 }, intent: null };
    return none;
  }

  if (state.input) {
    const target = state.inputTaskId == null ? task : tasks.find(t => t.id === state.inputTaskId);
    if (target && key.name === "enter" && key.alt && ["sendback", "answer"].includes(state.input) && state.draft.trim()) {
      return { state, intent: { type: "preview", id: target.id, options: {
        provider: rerunTarget(target, state),
        input: { kind: state.input === "answer" ? "answer" : "correction", text: state.draft.trim() }
      } } };
    }
    const edited = editText(state.draft, state.draftCursor,
      (key.name === "enter" && key.shift) || (key.ctrl && key.ch === "n") ? { name: "paste", text: "\n" } : key);
    if (edited) return { state: { ...state, draft: edited.text, draftCursor: edited.cursor }, intent: null };
    if (key.name === "enter" && (key.alt || key.ctrl)) return none;
    if (key.name === "enter") return commitInput(state, target);
    if (key.name === "escape") return { state: { ...state, input: null, inputTaskId: null, draft: "", draftCursor: null }, intent: null };
    return none;
  }

  const move = d => ({
    state: {
      ...state,
      sel: Math.max(0, Math.min(list.length - 1, state.sel + d)),
      rscroll: 0,
      rerunProvider: null
    },
    intent: null
  });

  if (key.name === "down") return move(1);
  if (key.name === "up") return move(-1);
  if (key.name === "tab") {
    return { state: { ...state, filter: (state.filter + 1) % FILTER_KEYS.length, sel: 0 }, intent: null };
  }
  if (key.name === "shift-tab") {
    return {
      state: { ...state, filter: (state.filter + FILTER_KEYS.length - 1) % FILTER_KEYS.length, sel: 0 },
      intent: null
    };
  }
  if (key.name === "escape") {
    return {
      state: { ...state, expand: false, filter: 0, search: "", rscroll: 0, rerunProvider: null },
      intent: null
    };
  }
  if (key.name === "enter") {
    const primary = primaryAction(task, state, ctx);
    if (!primary) return { state: { ...state, expand: !state.expand }, intent: null };
    if (primary.input) return { state: { ...state, input: primary.input, inputTaskId: task.id, draft: "", draftCursor: null }, intent: null };
    return { state, intent: primary.intent };
  }
  if (key.name !== "char" || key.ctrl || key.alt) return none;

  switch (key.ch) {
    case "v":
      return task ? { state, intent: { type: "preview", id: task.id, options: { provider: rerunTarget(task, state) } } } : none;
    case "j": return move(1);
    case "k": return move(-1);
    case "J": return { state: { ...state, rscroll: state.rscroll + 4 }, intent: null };
    case "K": return { state: { ...state, rscroll: Math.max(0, state.rscroll - 4) }, intent: null };
    case "g": return { state: { ...state, sel: 0, rscroll: 0 }, intent: null };
    case "G": return { state: { ...state, sel: Math.max(0, list.length - 1), rscroll: 0 }, intent: null };
    case "/": return { state: { ...state, searching: true, search: "" }, intent: null };
    case "d":
      if (task?.hasChanges) return { state: { ...state, mode: "diff", dscroll: 0 }, intent: null };
      return {
        state: {
          ...state,
          flash: { text: "nothing changed on " + (task ? "#" + task.idLabel : "this task") + " yet", tone: "warn" }
        },
        intent: null
      };
    case "p": {
      if (!task) return none;
      const next = nextProvider(ctx.providerOrder ?? [], rerunTarget(task, state));
      const name = ctx.lookup ? ctx.lookup(next).name : String(next ?? "").toUpperCase();
      return {
        state: { ...state, rerunProvider: next, flash: { text: "the next run would go to " + name, tone: "ok" } },
        intent: null
      };
    }
    case "c":
      return task ? { state: { ...state, input: "note", inputTaskId: task.id, draft: "", draftCursor: null }, intent: null } : none;
    case "r":
      return task ? { state: { ...state, mode: "result", dscroll: 0, review: null }, intent: { type: "review", id: task.id, run: task.run } } : none;
    case "x": {
      const secondary = secondaryAction(task);
      if (!secondary) return none;
      if (secondary.input) return { state: { ...state, input: secondary.input, inputTaskId: task.id, draft: "", draftCursor: null }, intent: null };
      return { state, intent: secondary.intent };
    }
    case "s":
      return { state, intent: task && ["running", "working", "needs"].includes(task.state) ? { type: "cancel", id: task.id, executionId: task.executionId ?? null } : null };
    case "n":
      return { state: { ...state, mode: "composer" }, intent: null };
    case "t":
      return { state: { ...state, expand: !state.expand, rscroll: 0 }, intent: null };
    case "?":
      return { state: { ...state, mode: "help", helpReturn: "work", helpScroll: state.dscroll, dscroll: 0 }, intent: null };
    case "q":
      return { state: { ...state, mode: "quit" }, intent: { type: "quit" } };
    default:
      return none;
  }
}
