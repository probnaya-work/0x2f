// Presentation of saved evidence only. Never infer check success from prose.
export function reportedSection(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text ?? "").match(new RegExp(`^##[ \\t]+${escaped}[ \\t]*\\r?$([\\s\\S]*?)(?=^##[ \\t]+|$(?![\\s\\S]))`, "im"));
  return match?.[1]?.trim() ?? "";
}

export function resultEvidence(result, events = []) {
  return {
    verification: reportedSection(result, "Verification") || "Not recorded.",
    commands: events.filter(e => e.type === "tool.started" && typeof e.input?.command === "string")
      .map(e => e.input.command),
    // Existing normalized events record invocation, not a check receipt with
    // attributable command, output and success. Never promote isError:false
    // or a provider's 'passed' sentence into independent verification.
    receipt: "Separate successful check receipt: not recorded."
  };
}
