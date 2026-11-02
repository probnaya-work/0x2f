import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { buildClient, CLIENT_ASSETS, routeToFile } from "../deploy/client/build.mjs";

const source = await fs.readFile(new URL("../src/web/theme.js", import.meta.url), "utf8");
function browser({ saved = null, dark = false, blocked = false } = {}) {
  const listeners = {};
  const controls = ["light", "dark", "system"].map(value => ({
    dataset: { themeOption: value }, pressed: null,
    setAttribute(name, value) { if (name === "aria-pressed") this.pressed = value; }
  }));
  const writes = [];
  const media = { matches: dark, addEventListener: (name, fn) => { listeners.media = fn; } };
  const document = {
    documentElement: { dataset: {} },
    querySelectorAll: () => controls,
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  const window = { matchMedia: () => media, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const localStorage = {
    getItem: () => { if (blocked) throw new Error("denied"); return saved; },
    setItem: (key, value) => { if (blocked) throw new Error("denied"); writes.push([key, value]); }
  };
  vm.runInNewContext(source, { document, window, localStorage });
  return { theme: window.workTheme, document, media, listeners, controls, writes };
}

test("first synchronous execution resolves System before DOMContentLoaded, for either OS scheme", () => {
  for (const dark of [true, false]) {
    const b = browser({ dark });
    assert.equal(b.theme.preference, "system");
    assert.equal(b.document.documentElement.dataset.theme, dark ? "dark" : "light");
    assert.equal(b.writes.length, 0);
  }
});

test("explicit saved theme takes precedence over OS and follows a reload", () => {
  for (const saved of ["dark", "light"]) {
    const b = browser({ saved, dark: saved !== "dark" });
    assert.equal(b.document.documentElement.dataset.theme, saved);
    b.media.matches = !b.media.matches;
    b.listeners.media();
    assert.equal(b.document.documentElement.dataset.theme, saved);
    b.theme.setPreference(saved === "dark" ? "light" : "dark");
    const [key, value] = b.writes.at(-1);
    assert.equal(key, "0x2f.theme");
    assert.equal(browser({ saved: value }).document.documentElement.dataset.theme, value);
  }
});

test("returning to System follows live OS changes without rewriting preference", () => {
  const b = browser({ saved: "light", dark: true });
  b.theme.setPreference("system");
  assert.equal(b.document.documentElement.dataset.theme, "dark");
  b.media.matches = false;
  b.listeners.media();
  assert.equal(b.document.documentElement.dataset.theme, "light");
  assert.deepEqual(b.writes, [["0x2f.theme", "system"]]);
});

test("invalid storage and unavailable storage degrade to System, with working session selection", () => {
  for (const options of [{ saved: "unknown" }, { blocked: true }]) {
    const b = browser({ ...options, dark: true });
    assert.equal(b.theme.preference, "system");
    b.theme.setPreference("light");
    assert.equal(b.document.documentElement.dataset.theme, "light");
    b.theme.setPreference("unknown");
    assert.equal(b.theme.preference, "light");
  }
});

test("segmented choices and cross-tab changes keep controls and preference in sync", () => {
  const b = browser();
  b.listeners.click({ target: { closest: () => ({ dataset: { themeOption: "dark" } }) } });
  assert.equal(b.theme.preference, "dark");
  b.listeners.storage({ key: "0x2f.theme", newValue: "light" });
  assert.equal(b.controls[0].pressed, "true");
  assert.equal(b.document.documentElement.dataset.theme, "light");
  b.listeners.storage({ key: "0x2f.sound", newValue: "dark" });
  assert.equal(b.theme.preference, "light");
  b.listeners.storage({ key: null, newValue: null });
  assert.equal(b.theme.preference, "system");
  b.listeners.DOMContentLoaded();
  assert.equal(b.controls[2].pressed, "true");
});

test("ledger presentation colours stay reactive without rebuilding task DOM", () => {
  const b = browser();
  assert.equal(b.theme.cssValue("1px solid #2f5fa8"), "1px solid var(--accent, #2f5fa8)");
  assert.equal(b.theme.cssValue("#f6f8fa"), "var(--paper, #f6f8fa)");
  assert.equal(b.theme.cssValue("rgba(47,95,168,.32)"), "var(--attention-rule, rgba(47,95,168,.32))");
  assert.equal(b.theme.cssValue("120px"), "120px");
});

test("both Web entrypoints load the blocking theme script before CSS and the app", async () => {
  for (const page of ["index.html", "pair.html"]) {
    const html = await fs.readFile(new URL("../src/web/" + page, import.meta.url), "utf8");
    assert.ok(html.indexOf('<script src="/app/theme.js"></script>') < html.indexOf('<link rel="stylesheet"'));
    assert.ok(html.indexOf('/app/theme.css') < html.indexOf('</head>'));
    assert.doesNotMatch(html, /<script[^>]*(?:async|defer)[^>]*theme\.js/);
  }
});

test("static client bundle includes the same bootstrap and palette as the local surface", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "0x2f-theme-build-"));
  try {
    await buildClient(out);
    for (const route of ["/", "/pair", "/app/theme.js", "/app/theme.css"]) {
      const asset = CLIENT_ASSETS.find(([, url]) => url === route);
      assert.ok(asset, route);
      assert.deepEqual(await fs.readFile(path.join(out, routeToFile(route))), await fs.readFile(new URL("../" + asset[0], import.meta.url)));
    }
  } finally { await fs.rm(out, { recursive: true, force: true }); }
});

function luminance(hex) {
  const full = hex.length === 4 ? '#' + hex.slice(1).split('').map(c => c + c).join('') : hex;
  const rgb = full.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test("both Web palettes provide contrast for prose, attention, selection and primary actions", async () => {
  const css = await fs.readFile(new URL("../src/web/theme.css", import.meta.url), "utf8");
  const palettes = [...css.matchAll(/:root(?:\[data-theme="dark"\])? \{([^}]+)\}/g)].slice(0, 2)
    .map(match => Object.fromEntries([...match[1].matchAll(/--([\w-]+): (#[\da-f]+);/g)].map(m => [m[1], m[2]])));
  assert.equal(palettes.length, 2);
  for (const p of palettes) {
    for (const fg of ["ink", "soft", "muted", "accent"]) {
      for (const bg of ["paper", "attention", "halt", "input", "pre", "selected"]) {
        assert.ok(contrast(p[fg], p[bg]) >= 4.5, `${fg} on ${bg}`);
      }
    }
    for (const [fg, bg] of [["ink", "selection"], ["on-solid", "ink"], ["on-accent", "accent"], ["fail", "paper"]]) {
      assert.ok(contrast(p[fg], p[bg]) >= 4.5, `${fg} on ${bg}`);
    }
    for (const bg of ["paper", "input", "attention"]) assert.ok(contrast(p.focus, p[bg]) >= 3);
  }
  // The original light surfaces, typography and primary ink remain available.
  assert.equal(palettes[0].paper, "#f6f8fa");
  assert.equal(palettes[0].canvas, "#e4e8ec");
  assert.equal(palettes[0].ink, "#2f2f2f");
});

test("unchanged terminal palettes retain legible diff additions/removals and selected text", async () => {
  const { PALETTES } = await import("../src/tui/theme.mjs");
  for (const p of Object.values(PALETTES)) {
    for (const fg of ["fg", "dim", "accent", "ok", "bad"]) {
      for (const bg of ["bg", "sel"]) assert.ok(contrast(p[fg], p[bg]) >= 4.5, `TUI ${fg} on ${bg}`);
    }
  }
});
