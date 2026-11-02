// Presentation of saved evidence only. Never infer check success from prose.
export function reportedSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text ?? "").match(new RegExp(`^##[ \\t]+${escaped}[ \\t]*\\r?$([\\s\\S]*?)(?=^##[ \\t]+|$(?![\\s\\S]))`, "im"));
  return match?.[1]?.trim() ?? "";
}

export function resultEvidence(result, events = []) {
  const starts = new Map();
  for (const e of events) if (["tool.started", "tool.updated"].includes(e.type) && e.toolCallId != null) starts.set(e.toolCallId, e);
  const receipts = events.filter(e => e.type === "tool.completed").map(e => ({
    toolCallId: e.toolCallId,
    command: e.command ?? starts.get(e.toolCallId)?.input?.command,
    output: e.output, outputTruncated: e.outputTruncated === true,
    exitCode: Number.isInteger(e.exitCode) ? e.exitCode : null,
    status: e.status ?? (e.isError ? "failed" : "completed; exit code unknown")
  })).filter(e => e.command || e.output || e.exitCode !== null);
  return {
    verification: reportedSection(result, "Verification") || "Not recorded.",
    commands: events.filter(e => ["tool.started", "tool.updated"].includes(e.type) && typeof e.input?.command === "string").map(e => e.input.command),
    receipts,
    receipt: receipts.length ? `${receipts.length} recorded tool receipt(s); provider output and exit codes are evidence, not independent proof of task acceptance.`
      : "Separate successful check receipt: not recorded."
  };
}
