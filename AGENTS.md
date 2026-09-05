# AGENTS.md

Instructions for AI coding agents working in this repository. Read this before making changes.

## Read the relevant document first

This repository is documented in depth and none of it loads automatically:

- `docs/architecture.md` — the object model, the layers and their contracts, the event vocabulary, and how a task moves through the system. Read it before changing `src/core/` or `src/providers/`.
- `docs/development.md` — repository layout, how to run, the test suite, and how to add a provider.
- `docs/codex-capability-map.md`, `docs/gemini-capability-map.md` — what each harness was observed to do.
- `docs/remote-control.md` — pairing and the encrypted envelope protocol.

They exist because the code alone does not carry the reasoning.

## The on-disk state has a reader outside this repository

057 reads this project's workspace state through an adapter of its own. Nothing here mentions 057, and that is correct — integration is the observer's job, from state 0x2F already persists for itself. It does mean the format is a published interface rather than an implementation detail.

What that reader depends on:

- a workspace is any directory containing `.work/tasks`;
- a task is `.work/tasks/<slug>/task.json` alongside `.work/tasks/<slug>/events.jsonl`;
- `task.json` is written atomically — temp file, then rename — so a concurrent reader never observes it half-applied.

Changing that layout, those filenames, or the atomic write breaks a consumer outside this repository, silently, without any test here failing.

## Capability maps record what was observed, not what is documented

The capability maps state findings reproduced against a real, version-pinned harness binary. Never update a claim in one from vendor documentation, a changelog, or inference. Re-run the harness, record what happened, and name the version you ran.

## Verification

```bash
npm run check   # syntax across src, test, relay, scripts, deploy, plus the Python TUI helpers
npm test        # the full node --test suite, including the TUI pty end-to-end test
```

Run both before calling a change done.
