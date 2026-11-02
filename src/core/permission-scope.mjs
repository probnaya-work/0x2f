// Whether the bounded remote representation retains the recorded operation
// scope. This is not a safety judgment about the operation itself. Never
// transmit raw inputs to compensate for missing context.
import { canonicalPath } from "./paths.mjs";

export const PERMISSION_LIMITS = { text: 500, path: 300, plannedChange: 200 };

export function remotePermissionScope(blocked = {}, base = "") {
  const reasons = [];
  const normalize = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const description = typeof blocked.description === "string" ? blocked.description : "";
  const plan = typeof blocked.plannedChange === "string" ? blocked.plannedChange : "";
  const shown = normalize(description + " " + plan);
  const file = typeof blocked.file === "string" ? blocked.file : "";
  const root = canonicalPath(base).replace(/\/$/, "");
  const absolute = value => canonicalPath(value.startsWith("/") ? value : (root ? root + "/" : "") + value);
  if (description.length > PERMISSION_LIMITS.text || plan.length > PERMISSION_LIMITS.plannedChange) reasons.push("The operation description is shortened on this device.");
  const inside = value => {
    if (!value) return true;
    if (/^[A-Za-z]:|^\\/.test(value)) return false;
    if (!root) return !value.startsWith("/") && !canonicalPath(value).startsWith("..");
    const resolved = absolute(value);
    return resolved === root || resolved.startsWith(root + "/");
  };
  if (!inside(file)) reasons.push("The target is outside the workspace; its full location is available only on the computer.");
  const relative = root && file && inside(file) ? absolute(file).slice(root.length + 1) : file;
  if (relative.length > PERMISSION_LIMITS.path) reasons.push("The target path is shortened on this device.");
  const raw = blocked.raw ?? {};
  const locations = Array.isArray(raw.locations) ? raw.locations : [];
  if (locations.some(l => l.path && absolute(l.path) !== absolute(file))) reasons.push("Additional target locations are recorded only on the computer.");
  const input = raw.tool_input ?? raw.rawInput;
  const tool = String(raw.tool_name ?? raw.kind ?? blocked.tool ?? "").toLowerCase();
  if (input && typeof input === "object") {
    for (const key of ["file_path", "path", "notebook_path"]) {
      if (typeof input[key] === "string" && (!inside(input[key]) || !file || absolute(input[key]) !== absolute(file))) reasons.push("A target parameter is not fully represented in this view.");
    }
    if (typeof input.command === "string") {
      if (!shown.includes(normalize(input.command))) reasons.push("The full command is available only on the computer.");
      if (Object.keys(input).some(k => k !== "command")) reasons.push("Additional command parameters require review on the computer.");
    } else if (typeof input.old_string === "string" && typeof input.new_string === "string") {
      if (![input.old_string, input.new_string].every(s => shown.includes(normalize(s)))) reasons.push("The full edit is available only on the computer.");
      if (Object.keys(input).some(k => !["file_path", "path", "old_string", "new_string"].includes(k))) reasons.push("Additional edit parameters require review on the computer.");
    } else {
      const hidden = Object.keys(input).filter(k => !["file_path", "path", "notebook_path"].includes(k));
      if (hidden.length) reasons.push("Additional operation parameters are recorded only on the computer.");
    }
  }
  if (Array.isArray(raw.content) && raw.content.length) reasons.push("Additional tool content is recorded only on the computer.");
  if (!shown && !(file && ["read", "read_file", "readfile"].includes(tool))) reasons.push("Operation details were not recorded for this view.");
  if (!file && !input?.command && !plan.startsWith("command: ")) reasons.push("A target or full command was not recorded for this view.");
  // A write described only by its path omits what is being authorized.
  if (["write", "write_file", "multiedit", "notebookedit"].includes(tool)) reasons.push("The write contents require review on the computer.");
  return { complete: reasons.length === 0, reasons: [...new Set(reasons)] };
}
