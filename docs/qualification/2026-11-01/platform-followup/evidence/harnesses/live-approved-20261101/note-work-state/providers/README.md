# Configured providers

Drop one JSON file per execution provider here. Each manifest declares a
harness that 0x2F did not ship — an ACP-compatible agent or a headless
command — so adding a new harness needs no source changes:

  {
    "id": "cursor",
    "displayName": "Cursor",
    "transport": "acp",
    "command": ["cursor", "--acp"]
  }

  {
    "id": "my-agent",
    "displayName": "My Agent",
    "transport": "command",
    "command": ["my-agent", "--headless", "{prompt}"]
  }

Rules: id must be unique and lowercase; transport is "acp" or "command";
command is an argv array (never a shell string); the only placeholders are
{prompt} and {workspace}; built-in providers (claude-code, codex,
deepseek-harness, gemini) cannot be redefined. For ACP agents, "permissions" ("interactive" default,
"deny" / "approve" for headless auto-resolution) controls how tool permission
requests are handled.
Adding a provider grants 0x2F permission to execute that local command in
this workspace. Treat manifests the way you would treat a script you run:
a manifest whose command is a shell (e.g. ["bash", "-c", "{prompt}"]) or a
repository-relative path executes whatever it is told — 0x2F warns about
those when it loads them, and a REPOSITORY that ships its own
.work/providers/ manifests should be treated as untrusted until you have
read them.
