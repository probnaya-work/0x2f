// Presentation of saved evidence only. Never infer check success from prose.
export function reportedSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text ?? "").match(new RegExp(`^##[ \\t]+${escaped}[ \\t]*\\r?$([\\s\\S]*?)(?=^##[ \\t]+|$(?![\\s\\S]))`, "im"));
  return match?.[1]?.trim() ?? "";
}

export function resultEvidence(result, events = []) {
  const starts = new Map();
  const key = e => JSON.stringify([e.run ?? 1, e.executionId ?? 'legacy', e.toolCallId]);
  const receipts = [];
  for (const e of events) {
    if (["tool.started", "tool.updated"].includes(e.type) && e.toolCallId != null) starts.set(key(e), e);
    if (e.type !== 'tool.completed') continue;
    receipts.push({
    toolCallId: e.toolCallId,
    executionId: e.executionId,
    command: e.command ?? starts.get(key(e))?.input?.command,
    output: e.output, outputTruncated: e.outputTruncated === true,
    exitCode: Number.isInteger(e.exitCode) ? e.exitCode : null,
    status: e.status ?? (e.isError ? "failed" : "completed; exit code unknown")
    });
  }
  const visibleReceipts = receipts.filter(e => e.command || e.output || e.exitCode !== null);
  return {
    verification: reportedSection(result, "Verification") || "Not recorded.",
    commands: events.filter(e => ["tool.started", "tool.updated"].includes(e.type) && typeof e.input?.command === "string").map(e => e.input.command),
    receipts: visibleReceipts,
    receipt: visibleReceipts.length ? `${visibleReceipts.length} recorded tool receipt(s); provider output and exit codes are evidence, not independent proof of task acceptance.`
      : "Separate successful check receipt: not recorded."
  };
}
