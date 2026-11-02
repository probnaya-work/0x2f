// Classic, parser-blocking script: runs under script-src self, before CSS/body.
// No dependency on the app, network state, pairing or task data.
(() => {
  const key = "0x2f.theme";
  const valid = value => ["light", "dark", "system"].includes(value);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch { /* session-only when storage is unavailable */ }
  function apply() {
    document.documentElement.dataset.theme = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    document.querySelectorAll("[data-theme-option]").forEach(control => {
      control.setAttribute("aria-pressed", String(control.dataset.themeOption === preference));
    });
  }
  function setPreference(value) {
    if (!valid(value)) return;
    preference = value;
    try { localStorage.setItem(key, value); } catch { /* keep the session choice */ }
    apply();
  }
  const colors = {"#f6f8fa": "paper", "#2f2f2f": "ink", "#37424c": "soft", "#5c6771": "muted", "#dbe2e7": "rule", "#c6cfd6": "unobserved", "#2f5fa8": "accent", "#b8532a": "fail", "#e9eefb": "attention", "#eef2f6": "selected", "#b3bcc4": "frozen-fill", "#3d454c": "live-track"};
  function cssValue(value) {
    return String(value).replace(/#[0-9a-f]{3,8}\b/gi, color => {
      const token = colors[color.toLowerCase()];
      return token ? `var(--${token}, ${color})` : color;
    }).replaceAll("rgba(47,95,168,.32)", "var(--attention-rule, rgba(47,95,168,.32))");
  }
  window.workTheme = Object.freeze({ get preference() { return preference; }, setPreference, cssValue });
  apply();
  media.addEventListener("change", () => { if (preference === "system") apply(); });
  window.addEventListener("storage", event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : "system";
    apply();
  });
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("click", event => {
    const option = event.target.closest("[data-theme-option]");
    if (option) setPreference(option.dataset.themeOption);
  });
})();
