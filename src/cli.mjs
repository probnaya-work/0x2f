#!/usr/bin/env node
// 0x2F CLI — one client of the Work Runtime.
//
// The CLI renders state and invokes the SAME shared actions the Web API
// calls (core/actions.mjs). It contains no lifecycle, provider, or session
// logic of its own; `2f allow` and `2f reject` are thin wrappers over
// actions.allowWork / actions.rejectWork.
import { print, printError } from "./core/terminal.mjs";
import { backupWorkspace, restoreBackup } from "./backup.mjs";
import { loadHosts, runOnHost, hostIdentity } from "./hosts.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createRuntime } from "./runtime.mjs";
import { initProject, requireProject, appendProjectKnowledge } from "./project.mjs";
import {
  renderTasks,
  providerName,
  providerLabel,
  fmtRunDuration,
  renderRuns,
  renderProviders
} from "./render.mjs";
import { launchUi } from "./ui.mjs";
import { runTui } from "./tui/index.mjs";
import { pairDevice, pairOff } from "./relay/pair.mjs";
import { formatCode } from "./web/e2e.mjs";
import { eventsForRun, toSteps } from "./web/ledger.mjs";
import { unavailableMessage } from "./providers/index.mjs";

// The installed package version — `2f version` / `2f --version` / `2f -v`.
// Read from the package manifest next to the CLI source so it works identically
// from a repo checkout and a global npm install.
function packageVersion() {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  return pkg.version;
}

function help() {
  print(`2f — task-native coding-agent wrapper

Commands:
  2f                list today's tasks
  2f backup <new-directory>   private quiescent workspace backup (includes secrets)
  2f restore-backup <backup> <new-directory>   restore with remote access disabled
  2f hosts          list explicit host/workspace profiles
  2f on <host> ...   run the actual CLI on a pinned SSH host (local stays local)
  2f host-identity   print this host identity for explicit pinning
  2f version        print the installed 0x2F version
  2f init
  2f new <task> [--provider <id>]   provider: auto | <id> (default from routing)
  2f status
  2f open <id> [--run <n>]
  2f rerun <id> [--provider <id>]   run the same task again as a new run
  2f note <id> <text>    record a constraint/correction on the task; the next
                          run's context includes it (no execution is started)
  2f allow <id>     grant the permission a task is blocked on
  2f reject <id>    decline the requested change
  2f answer <id> <answer>   answer a NEEDS YOU decision (not allow/reject)
  2f changes <id> [--run <n>]   show immutable observed run patch
  2f apply <id>      transfer isolated task changes (conflicts refuse)
  2f restore <id>    restore an archived checkout before continuing
  2f cleanup <id>    archive Git-visible checkout, then remove it
  2f cancel <id>     stop the active run; preserves partial work, no rollback
  2f accept <id>     explicitly accept a READY result
  2f drop <id>       close without accepting the result
  2f close <id>      move to DONE; does not cancel the provider
  2f pair [--relay <url>] [--client <url>] [--lan]   pair this execution host for phone control over
                          the same Wi-Fi: prints a phone-openable URL + one-time code
                          (default; --relay/--client or 0X2F_RELAY_URL/0X2F_CLIENT_ORIGIN
                          pair through a hosted relay; configure both origins;
                          --lan forces LAN;
                          --off revokes remote access and disables the connection)
  2f providers      list execution providers (built-in + configured)
  2f ui [port]      open the Web UI (start the runtime if needed; --no-browser
                    starts it without opening a browser)
  2f serve [port]   run the runtime in the FOREGROUND (for launchd/systemd
                    supervision — recovers interrupted runs at startup and
                    shuts down cleanly on SIGTERM; workers keep running)
  2f tui [--light]  open the terminal client: the whole ledger, one task in
                    full, and the action it is waiting for — the same runtime
                    the Web UI and the phone speak to

Providers: auto (routing), claude-code (default), codex, deepseek-harness, gemini, opencode
Configured: ACP/command providers from .work/providers/*.json
Routing:    .work/routing.json (default: auto | <id>, prefer: [<ids>])
`);
}

// Parse `--provider <id>` / `--run <n>` / `--no-browser` (and `=value`
// forms) out of command args; the rest is positional. Provider selection is
// secondary — tasks are first.
function parseFlags(args) {
  const rest = [];
  const flags = {};
  const valueFlags = new Set(["workspace-mode", "provider", "relay", "client", "run", "port"]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      rest.push(...args.slice(i + 1));
      break;
    }
    const equal = arg.indexOf("=");
    const name = arg.startsWith("--") ? arg.slice(2, equal < 0 ? undefined : equal) : "";
    if (valueFlags.has(name)) {
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
        throw new Error(name === "run" ? "Usage: 2f open <id> --run <n>" : `Option --${name} requires a value.`);
      }
      flags[name] = value;
    } else if (arg === "--off") {
      flags.off = true;
    } else if (arg === "--lan") {
      flags.lan = true;
    } else if (arg === "--no-browser") {
      flags.noBrowser = true;
    } else if (arg === "--light") {
      flags.light = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}. Use -- before literal task text beginning with --.`);
    } else {
      rest.push(arg);
    }
  }
  return { rest, flags };
}

function parseNewArgs(args) {
  const { rest, flags } = parseFlags(args);
  return { brief: rest.join(" ").trim(), provider: flags.provider, workspaceMode: flags["workspace-mode"] };
}

async function status(base) {
  await requireProject(base);
  print(renderTasks(await createRuntime(base).actions.listWork()));
}

function relativeFile(base, file) {
  if (!file) return null;
  const rel = path.relative(base, file);
  return rel && !rel.startsWith("..") ? rel : file;
}

async function openTask(id, base) {
  const runtime = createRuntime(base);
  const detail = await runtime.actions.getWork(id);

  print(`#${String(detail.id).padStart(3, "0")} ${detail.title}\n`);

  const blocked = detail.blockedOn;
  if (blocked?.type === "permission") {
    print("NEEDS YOU — Permission\n");
    if (blocked.live) {
      // An interactive ACP permission request: the run's session is still
      // alive, holding the request. Show only what the agent actually
      // supplied — tool/action, path, description, options.
      print("Agent requested permission:\n");
      if (blocked.tool) print(`  action: ${blocked.tool}`);
      if (blocked.file) print(`  path:   ${relativeFile(base, blocked.file)}`);
      if (blocked.description && blocked.description !== blocked.tool) {
        print(`  detail: ${blocked.description}`);
      }
      if (blocked.options?.length) {
        print(`  options: ${blocked.options.map(o => `${o.name} (${o.kind})`).join(" · ")}`);
      }
      if (blocked.canAllow === false || blocked.canReject === false) {
        print("  (some options cannot be mapped to ALLOW/REJECT — inspect above)");
      }
    } else {
      print(`Requested operation: ${blocked.tool ?? "not recorded"}\nTarget: ${relativeFile(base, blocked.file) ?? "not recorded"}\n`);
      if (blocked.plannedChange) {
        print(`Planned change:\n  ${blocked.plannedChange}\n`);
      }
    }
    print(`\n[2f allow ${detail.id}]  [2f reject ${detail.id}]  [2f close ${detail.id}]`);
    return;
  }
  if (blocked?.type === "decision") {
    print(`NEEDS YOU — Decision\n`);
    if (blocked.text) print(`${blocked.text}\n`);
    // A decision is answered, not allowed/rejected — and CLOSE is always the
    // way to remove a Work from active attention.
    print(`[2f answer ${detail.id} "<your answer>"]  [2f close ${detail.id}]`);
    return;
  }

  print(`Status: ${detail.status}${detail.status === "working" ? ` · ${providerName(detail, runtime.providers.getProvider)}` : ""}\n`);

  const execution = detail.execution ?? {};
  const model = execution.model ? ` · model ${execution.model}` : "";
  print(`Execution: provider ${execution.provider ?? "?"} · node ${execution.node ?? "?"}${model}`);

  // The AUTO routing decision for the current run — why 0x2F ran it here.
  // Read from the persisted run record, never reconstructed from config.
  const currentRun = detail.runs?.at(-1);
  if (currentRun?.routing?.mode === "auto") {
    print(
      `Routing:   auto → ${currentRun.provider} (${currentRun.routing.reason})`
    );
  }
  print("");

  // Run history: the same task through different providers, side by side.
  // Every task has at least one run (a legacy task reads as one historical
  // run); this is inspection, never evaluation.
  print(renderRuns(detail.runs ?? []));

  // The task-level result survives reruns. Read the saved current run's
  // result instead, just as explicit run inspection does (including legacy).
  const result = await runtime.store.readRunResult(detail, currentRun);
  if (result.trim()) {
    print(result.trim());
  } else {
    print("No written result for this run.");
    if (currentRun.error) {
      print(currentRun.error);
    } else {
      const events = eventsForRun(await runtime.store.readEvents(detail.slug), currentRun.run);
      const trace = toSteps(detail, events, { base });
      const step = trace.steps.at(-1);
      const activity = trace.activity || (step && `${step.verb} ${step.arg}`.trim());
      print(activity ? `\nProgress: ${activity}` : "\nNo activity reported for this run yet.");
    }
  }
}

// `2f open <id> --run <n>`: one run's factual detail — provider, node, model,
// timing, outcome, session, attempts, and its own written result. Missing
// observability (a DeepSeek Harness run has no session id) shows as "—".
async function openRun(id, runNumber, base) {
  const runtime = createRuntime(base);
  const run = await runtime.actions.getRun(id, runNumber);
  const provider = providerLabel(run.provider, runtime.providers.getProvider);

  print(`#${String(id).padStart(3, "0")} · RUN ${String(run.run).padStart(2, "0")} — ${provider}\n`);

  const outcome =
    { working: "WORKING", needs_you: "NEEDS YOU", ready: "READY", failed: "FAILED" }[run.outcome] ??
    String(run.outcome ?? "?").toUpperCase();
  print(`Provider     ${provider}`);
  print(`Node         ${run.node ?? "—"}`);
  print(`Model        ${run.model ?? "—"}`);
  print(`Started      ${run.startedAt ?? "—"}`);
  print(`Completed    ${run.completedAt ?? "—"}`);
  print(`Duration     ${fmtRunDuration(run.durationMs)}`);
  print(`Outcome      ${outcome}`);
  print(`Session      ${run.externalSessionId ?? "—"}`);
  print(`Attempts     ${run.attempts ?? 1}`);
  if (run.requestedProvider === "auto" && run.routing) {
    print(`Routed       auto → ${run.provider} (${run.routing.reason})`);
  }
  print("");

  if (run.result?.trim()) {
    print(run.result.trim());
  } else if (run.error) {
    print(run.error);
  } else {
    print("No written result for this run.");
  }
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const base = process.cwd();
  const helpIndex = args.indexOf("--help");
  if (helpIndex >= 0 && !args.slice(0, helpIndex).includes("--")) {
    help();
    return;
  }

  if (command === "backup") {
    if (args.length !== 1) throw new Error("Usage: 2f backup <new-directory>");
    print(JSON.stringify(await backupWorkspace(base,args[0]))); return;
  }
  if (command === "restore-backup") {
    if (args.length !== 2) throw new Error("Usage: 2f restore-backup <backup-directory> <new-directory>");
    print(JSON.stringify(await restoreBackup(args[0],args[1]))); return;
  }
  if (command === "hosts") {
    print(`local · ${(await hostIdentity()).label}`);
    for (const h of await loadHosts(base)) print(`${h.id} · pinned ${h.machineId.slice(0,12)} · ${h.workspace} · 2f on ${h.id} status`);
    return;
  }
  if (command === "host-identity") { print(JSON.stringify(await hostIdentity())); return; }
  if (command === "on") {
    if (!args[0]) throw new Error("Usage: 2f on <host-id|local> <command> [args]");
    if (args[0] === "local") return main(args.slice(1));
    const result = await runOnHost(base, args[0], args.slice(1));
    process.exitCode = result.code;
    return;
  }

  if (!command || command === "status") {
    await status(base);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    print(packageVersion());
    return;
  }

  if (command === "init") {
    const wd = await initProject();
    print(`Initialized ${wd}`);
    print("  project.md     describe the project once — every task prompt starts from it");
    print("  rules.md       working rules for every run");
    print("  knowledge.md   results you promote from finished tasks");
    print("  decisions.md   past decisions, carried into future runs");
    print("  providers/     manifests for extra ACP/command providers");
    print("");
    print('Next: 2f new "<your first task>"  ·  2f ui to open the Web UI');

    // First use: say which provider will actually run, or what to install.
    // The availability fact is the same cheap executable resolution the
    // router and the action boundary use — never a spawn.
    const runtime = createRuntime(base);
    const available = runtime.providers
      .listProviders()
      .filter(p => runtime.providers.available(p.id))
      .map(p => p.id);
    if (available.length) {
      print(`Provider: ${available.join(", ")} executables detected; authorization is not checked.`);
    } else {
      print("No coding harness detected on PATH — install Claude Code (`claude`), Codex (`codex`),");
      print("DeepSeek Harness (`dsh`), or Gemini CLI (`gemini`), or add a manifest to .work/providers/.");
      print("(2f providers lists what 0x2F sees and whether each is available.)");
    }
    return;
  }

  if (command === "new") {
    await requireProject(base);
    const { brief, provider, workspaceMode } = parseNewArgs(args);
    if (!brief) throw new Error('Usage: 2f new "Investigate ..." [--provider <id>]');

    const runtime = createRuntime(base);
    // First-use preflight: when the user did not pick a provider, the
    // configured/runtime default must be runnable on this machine, or the
    // refusal is printed HERE instead of creating a task that is doomed to
    // fail in the background with an opaque spawn error. Explicit selections
    // are refused by the shared action with the same message.
    if (!provider) {
      const effective = runtime.router.defaultRequestedProvider();
      if (effective !== "auto" && !runtime.providers.available(effective)) {
        throw new Error(unavailableMessage(effective, runtime.providers));
      }
    }

    const task = await runtime.actions.createWork({ brief, provider, workspaceMode });

    print(`Created #${String(task.id).padStart(3, "0")}: ${task.title}`);
    print(`Open: 2f open ${task.id}`);
    print(`${providerName(task, runtime.providers.getProvider)} is running in the background.`);
    return;
  }

  if (command === "open") {
    await requireProject(base);
    const { rest, flags } = parseFlags(args);
    const id = Number(rest[0]);
    if (!Number.isFinite(id)) throw new Error("Usage: 2f open <id> [--run <n>]");
    if ("run" in flags) {
      const runNumber = Number(flags.run);
      if (!Number.isFinite(runNumber)) throw new Error("Usage: 2f open <id> --run <n>");
      await openRun(id, runNumber, base);
    } else {
      await openTask(id, base);
    }
    return;
  }

  if (command === "rerun") {
    await requireProject(base);
    const { rest, flags } = parseFlags(args);
    const id = Number(rest[0]);
    if (!Number.isFinite(id)) {
      throw new Error('Usage: 2f rerun <id> [--provider <id>]');
    }

    const runtime = createRuntime(base);
    const task = await runtime.actions.rerunWork(id, {
      provider: flags.provider
    });
    const runNumber = task.runs?.at(-1)?.run ?? 1;

    print(`#${String(task.id).padStart(3, "0")} ${task.title}`);
    print(
      `Run ${String(runNumber).padStart(2, "0")} started with ${providerName(task, runtime.providers.getProvider)} in the background.`
    );
    return;
  }

  if (command === "allow" || command === "reject") {
    await requireProject(base);
    const id = Number(args[0]);
    if (!Number.isFinite(id)) throw new Error(`Usage: 2f ${command} <id>`);

    const task = await createRuntime(base).actions.resumeWork(id, command);
    print(`#${String(task.id).padStart(3, "0")} ${task.title}`);
    if (task.live) {
      // An interactive permission request: the run's process is still alive,
      // holding the outstanding request; the grant is delivered in place and
      // the SAME execution continues.
      print(
        command === "allow"
          ? "Permission granted — continuing the run in the background."
          : "Change declined — the agent continues with the request withdrawn."
      );
    } else {
      print(
        command === "allow"
          ? "Permission granted — resuming the same session in the background."
          : "Change declined — resuming the session with the request withdrawn."
      );
    }
    return;
  }

  // `2f answer <id> "<text>"` — respond to a NEEDS YOU decision. A decision
  // is answered, never allowed/rejected; the answer is persisted with the
  // task. It does not continue the run in place (no provider supports
  // free-text decision continuation yet); the task stays NEEDS YOU until the
  // user closes it or reruns it.
  if (command === "answer") {
    await requireProject(base);
    const id = Number(args[0]);
    const answer = args.slice(1).join(" ").trim();
    if (!Number.isFinite(id) || !answer) {
      throw new Error('Usage: 2f answer <id> "<your answer>"');
    }

    const task = await createRuntime(base).actions.answerWork(id, { answer });
    print(`#${String(task.id).padStart(3, "0")} ${task.title}`);
    print("Answer recorded — it is now part of this task's context.");
    print("The task stays NEEDS YOU — rerun it to continue with the answer in context, or close it.");
    return;
  }

  // `2f note <id> "<constraint>"` — record a user constraint/correction as
  // Task context. It never starts or resumes an execution: the note becomes
  // part of the task's next run's input (2f rerun rebuilds the prompt from
  // Task state). Unlike answer, it is not gated on a needs_you/decision block
  // — add it to a READY or FAILED task before rerunning.
  if (command === "note") {
    await requireProject(base);
    const id = Number(args[0]);
    const note = args.slice(1).join(" ").trim();
    if (!Number.isFinite(id) || !note) {
      throw new Error('Usage: 2f note <id> "<constraint or correction>"');
    }

    const task = await createRuntime(base).actions.noteWork(id, { note });
    print(`#${String(task.id).padStart(3, "0")} ${task.title}`);
    print("Note recorded on the task — it will be included in the next run's context.");
    return;
  }

  if (["changes", "apply", "cleanup", "restore"].includes(command)) {
    await requireProject(base);
    const { rest, flags } = parseFlags(args);
    const id = Number(rest[0]);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Usage: 2f ${command} <id>`);
    const actions = createRuntime(base).actions;
    if (command === "changes") {
      const receipt = await actions.getRunChanges(id, flags.run);
      print(receipt.available ? `${receipt.attribution}\n${receipt.patch || "No changes."}` : receipt.reason);
    } else {
      await actions[command === "apply" ? "applyWork" : command === "restore" ? "restoreWork" : "cleanupWork"](id);
      print(command === "apply" ? "Saved task changes applied to the original workspace." : "Checkout archived privately before cleanup. Restore from the task's workspace.tar.");
    }
    return;
  }

  if (["cancel", "stop", "accept", "drop"].includes(command)) {
    await requireProject(base);
    const id = Number(args[0]);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Usage: 2f ${command} <id>`);
    const actions = createRuntime(base).actions;
    const task = ["cancel", "stop"].includes(command)
      ? await actions.cancelWork(id)
      : await actions.closeWork(id, { disposition: command });
    print(`#${task.id}: ${task.cancelRequested ? "Cancellation requested; wait for the worker receipt. Partial work stays; external actions are not rolled back." : task.disposition}`);
    return;
  }

  if (command === "close") {
    await requireProject(base);
    const id = Number(args[0]);
    if (!Number.isFinite(id)) throw new Error("Usage: 2f close <id>");

    const runtime = createRuntime(base);
    const detail = await runtime.actions.getWork(id);

    print(`#${detail.id} ${detail.title}\n`);
    print(detail.result.trim() || detail.error || "No final result.");

    // Interactive-only: ask about knowledge/decision promotion. With piped
    // stdin (scripting, CI) readline questions can hang on EOF, so we skip.
    if (input.isTTY) {
      const rl = readline.createInterface({ input, output });
      try {
        const keepKnowledge = (
          await rl.question("\nSave this result to project knowledge? [y/N] ")
        ).trim().toLowerCase();

        if (["y", "yes"].includes(keepKnowledge)) {
          await appendProjectKnowledge(
            "knowledge",
            `Task #${detail.id}: ${detail.title}\n\n${detail.result || detail.error || "No result."}`
          );
        }

        const keepDecision = (
          await rl.question("Save this result to project decisions? [y/N] ")
        ).trim().toLowerCase();

        if (["y", "yes"].includes(keepDecision)) {
          await appendProjectKnowledge(
            "decisions",
            `Task #${detail.id}: ${detail.title}\n\n${detail.result || detail.error || "No result."}`
          );
        }
      } finally {
        rl.close();
      }
    }

    await runtime.actions.closeWork(id);
    print(`Closed #${id}.`);
    print("Closing does not cancel the provider. An active run may keep running or wait for permission.");
    return;
  }

  if (command === "providers") {
    await requireProject(base);
    const runtime = createRuntime(base);
    print(renderProviders(runtime.providers.listProviders(), runtime.providers));
    return;
  }

  if (command === "ui") {
    await requireProject(base);
    const { rest, flags } = parseFlags(args);
    // Port comes from --port <n> or the positional form `2f ui <port>` —
    // both are accepted; the default is the canonical 4242.
    const port =
      flags.port !== undefined
        ? Number(flags.port)
        : rest[0]
          ? Number(rest[0])
          : 4242;
    if (!Number.isFinite(port)) {
      throw new Error('Usage: 2f ui [port] [--no-browser]');
    }
    // App launcher: reuse a running 0x2F runtime, otherwise start it in the
    // background, wait until healthy, and open the UI in the default browser.
    // --no-browser keeps the server-only path for development/automation.
    const result = await launchUi({
      base,
      port,
      open: !flags.noBrowser
    });
    print(
      `0x2F UI: ${result.url}${result.status === "reused" ? " (already running)" : ""}`
    );
    if (!result.opened) {
      print(`Open ${result.url} in your browser.`);
    }
    return;
  }

  // `2f tui` — the terminal client. Another CLIENT of the same runtime, not
  // another runtime: it builds `createRuntime(base)` exactly as every other
  // command here does, calls the SAME shared actions, and tails the same
  // event logs the Web server tails. Nothing about task semantics is decided
  // in src/tui. The default `2f` behavior is unchanged — this is opt-in.
  if (command === "tui") {
    await requireProject(base);
    const { flags } = parseFlags(args);
    await runTui({ base, theme: flags.light ? "light" : "dark" });
    return;
  }

  // `2f serve [port] [--port <n>]` — run the 0x2F runtime in the foreground.
  // This is the supervised entry for a dedicated always-on host: point a
  // launchd/systemd unit at it (or at `node src/server-entry.mjs <base>
  // <port>` — the same code, see src/serve.mjs) and the runtime stays up
  // across reboots, recovers interrupted runs at startup (src/recover.mjs),
  // and shuts down cleanly on SIGTERM without terminating detached workers.
  // `2f ui` (detached runtime + browser) is unchanged; `2f serve` is the same
  // runtime without the launcher. It runs until signalled — the HTTP server
  // keeps the event loop alive.
  if (command === "serve") {
    await requireProject(base);
    const { rest, flags } = parseFlags(args);
    const port =
      flags.port !== undefined
        ? Number(flags.port)
        : rest[0]
          ? Number(rest[0])
          : 4242;
    if (!Number.isFinite(port)) {
      throw new Error("Usage: 2f serve [port] [--port <n>]");
    }
    const { serveRuntime } = await import("./serve.mjs");
    await serveRuntime({ base, port, log: console });
    return;
  }

  // `2f pair [--relay <url>] [--client <url>] [--lan] [--port <n>]` — one-time
  // pairing for remote control from a phone. 0x2F pairs over the local
  // network by default (same Wi-Fi); `--relay` / `--client` (or the
  // 0X2F_RELAY_URL / 0X2F_CLIENT_ORIGIN env vars) pair through a hosted
  // relay. Prints a phone-openable URL and the E2E pairing code; the phone
  // opens the URL once and types the code into the trusted client page.
  // `--off` revokes remote access.
  if (command === "pair") {
    await requireProject(base);
    const { flags } = parseFlags(args);
    if (flags.off) {
      await pairOff({ base });
      print("Remote control revoked at the relay and disabled locally.");
      print('Re-enable with: 2f pair');
      return;
    }
    const port = flags.port ? Number(flags.port) : 4242;
    if (!Number.isFinite(port)) {
      throw new Error('Usage: 2f pair [--relay <url>] [--client <url>] [--lan] [--port <n>]');
    }
    const result = await pairDevice({
      base,
      url: flags.relay,
      client: flags.client,
      port,
      lan: flags.lan
    });
    if (result.transport === "lan") {
      print("0x2F PAIR");
      print("");
      print("same Wi-Fi required");
      print("");
      print(`  ${result.url}`);
      print("");
      print(`code  ${formatCode(result.code)}`);
    } else {
      print("Open this URL on your phone (the pairing page is served by the");
      print("client origin — never by the relay):");
      print(`  ${result.url}`);
      print("");
      print(`Pairing code:  ${formatCode(result.code)}`);
    }
    print(`It expires ${result.expiresAt} and is one-time — a second phone re-pairs with 2f pair again.`);
    if (!result.registered) {
      print("The relay has not confirmed the token yet — it will register as soon as the agent connects.");
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  printError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
