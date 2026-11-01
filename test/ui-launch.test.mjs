// `2f ui` — the app launcher.
//
//   - a healthy 0x2F runtime on the port is REUSED (no second runtime),
//   - a missing runtime is started in the background, waited on, opened,
//   - "another process owns the port" is a useful error, not an opaque
//     EADDRINUSE,
//   - startup/health has a timeout with a pointer at the runtime log,
//   - browser opening is invocable without launching browsers (injected),
//   - startServer itself rejects clearly when the port is taken.
//
// Everything runs against real HTTP servers on ephemeral ports; the only
// things injected are the browser opener, the spawn, and the health probe.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { startServer } from "../src/server.mjs";
import { createRuntime } from "../src/runtime.mjs";
import { launchUi, probeUi, openBrowser, UiError } from "../src/ui.mjs";

async function tempBase() {
  return fs.mkdtemp(path.join(os.tmpdir(), "work-ui-"));
}

function fakeSpawn(record) {
  // A spawn that never really launches: records argv and returns a child
  // shaped like the detached child the launcher unrefs.
  return (command, args, options) => {
    record.push({ command, args, options });
    const child = Object.assign(new EventEmitter(), { unref() {} });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
}

function openedSpy() {
  const calls = [];
  return { calls, fn: async url => (calls.push(url), true) };
}

test("an asynchronous runtime EAGAIN rejects before health polling and closes its log descriptor", async () => {
  const base = await tempBase();
  let fd;
  let probes = 0;
  let unref = false;
  try {
    await assert.rejects(() => launchUi({
      base, open: false,
      probe: async () => ++probes === 1 ? { ok: false, kind: "down" } : { ok: true, kind: "0x2f", base },
      spawnImpl(_command, _args, options) {
        fd = options.stdio[1];
        const child = Object.assign(new EventEmitter(), { unref() { unref = true; } });
        setImmediate(() => child.emit("error", Object.assign(new Error("spawn EAGAIN"), { code: "EAGAIN" })));
        return child;
      }
    }), /Could not start the 0x2F runtime: spawn EAGAIN/);
    assert.equal(probes, 1, "failed launch must not reach health polling");
    assert.equal(unref, false);
    assert.throws(() => fsSync.fstatSync(fd), { code: "EBADF" });
  } finally {
    try { fsSync.closeSync(fd); } catch {}
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("probeUi: a healthy 0x2F runtime answers ok; a plain HTTP server is 'other'; silence is 'down'", async () => {
  const base = await tempBase();
  let handle;
  try {
    const runtime = createRuntime(base);
    handle = await startServer(base, 0, { runtime, interval: 20 });
    const ok = await probeUi(handle.url);
    assert.equal(ok.ok, true);
    assert.equal(ok.kind, "0x2f");
    assert.equal(ok.base, base);
  } finally {
    await handle?.close();
    await fs.rm(base, { recursive: true, force: true });
  }

  // A non-0x2F process owns a port: answers HTTP but is not a 0x2F runtime.
  const other = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ hello: "world" }));
  });
  await new Promise(resolve => other.listen(0, "127.0.0.1", resolve));
  const otherUrl = `http://127.0.0.1:${other.address().port}`;
  try {
    const miss = await probeUi(otherUrl);
    assert.equal(miss.ok, false);
    assert.equal(miss.kind, "other");
  } finally {
    other.close();
  }

  // Nothing listening.
  const free = await new Promise(resolve => {
    const srv = http.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
  const down = await probeUi(`http://127.0.0.1:${free}`);
  assert.equal(down.ok, false);
  assert.equal(down.kind, "down");
});

test("launchUi reuses a running 0x2F runtime: no spawn, browser opened with the URL", async () => {
  const base = await tempBase();
  const spawns = [];
  const open = openedSpy();
  const runtime = createRuntime(base);
  const handle = await startServer(base, 0, { runtime, interval: 20 });
  const port = handle.server.address().port;
  try {
    const result = await launchUi({
      base,
      port,
      spawnImpl: fakeSpawn(spawns),
      openBrowserImpl: open.fn
    });
    assert.equal(result.status, "reused");
    assert.equal(result.url, `http://127.0.0.1:${port}`);
    assert.equal(result.opened, true);
    assert.deepEqual(spawns, []); // no second runtime
    assert.deepEqual(open.calls, [result.url]);
  } finally {
    await handle.close();
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("launchUi refuses a healthy runtime for another workspace without opening it", async () => {
  const base = await tempBase();
  const otherBase = await tempBase();
  const spawns = [];
  const open = openedSpy();
  const handle = await startServer(otherBase, 0, { interval: 20 });
  try {
    await assert.rejects(() => launchUi({
      base, port: handle.port, spawnImpl: fakeSpawn(spawns), openBrowserImpl: open.fn
    }), /another workspace/);
    assert.deepEqual(spawns, []);
    assert.deepEqual(open.calls, []);
  } finally {
    await handle.close();
    await fs.rm(base, { recursive: true, force: true });
    await fs.rm(otherBase, { recursive: true, force: true });
  }
});

test("launchUi recognizes the same workspace through a symlink", async () => {
  const base = await tempBase();
  const alias = base + "-alias";
  const handle = await startServer(base, 0, { interval: 20 });
  try {
    await fs.symlink(base, alias, "dir");
    const result = await launchUi({ base: alias, port: handle.port, open: false });
    assert.equal(result.status, "reused");
  } finally {
    await handle.close();
    await fs.rm(alias, { force: true });
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("launchUi cannot reuse an unidentified runtime or accept another workspace during startup", async () => {
  const base = await tempBase();
  const spawns = [];
  try {
    await assert.rejects(() => launchUi({
      base, open: false, probe: async () => ({ ok: true, kind: "0x2f" }), spawnImpl: fakeSpawn(spawns)
    }), /workspace identity/);
    assert.deepEqual(spawns, []);
    let probes = 0;
    await assert.rejects(() => launchUi({
      base, open: false,
      probe: async () => ++probes === 1
        ? { ok: false, kind: "down" }
        : { ok: true, kind: "0x2f", base: path.dirname(base) },
      spawnImpl: fakeSpawn(spawns)
    }), /another workspace/);
  } finally {
    for (const call of spawns) {
      try { fsSync.closeSync(call.options.stdio[1]); } catch {}
    }
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("runtime startup closes the parent's log descriptor on success and spawn failure", async () => {
  const base = await tempBase();
  const spawns = [];
  let failedFd;
  try {
    let probes = 0;
    await launchUi({
      base, open: false,
      probe: async () => ++probes === 1 ? { ok: false, kind: "down" } : { ok: true, kind: "0x2f", base },
      spawnImpl: fakeSpawn(spawns)
    });
    assert.throws(() => fsSync.fstatSync(spawns[0].options.stdio[1]), { code: "EBADF" });
    await assert.rejects(() => launchUi({
      base, open: false, probe: async () => ({ ok: false, kind: "down" }),
      spawnImpl(_command, _args, options) {
        failedFd = options.stdio[1];
        throw new Error("fixture runtime spawn failure");
      }
    }), /fixture runtime spawn failure/);
    assert.throws(() => fsSync.fstatSync(failedFd), { code: "EBADF" });
  } finally {
    for (const fd of [...spawns.map(call => call.options.stdio[1]), failedFd]) {
      try { fsSync.closeSync(fd); } catch {}
    }
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("a package path with spaces and URL characters supplies an existing runtime entry path", async () => {
  const base = await tempBase();
  const copiedSrc = path.join(base, "package with spaces # percent%", "src");
  const spawns = [];
  try {
    await fs.mkdir(copiedSrc, { recursive: true });
    await fs.copyFile(new URL("../src/ui.mjs", import.meta.url), path.join(copiedSrc, "ui.mjs"));
    const entry = path.join(copiedSrc, "server-entry.mjs");
    await fs.writeFile(entry, "// fixture runtime\n");
    const { launchUi: copiedLaunch } = await import(pathToFileURL(path.join(copiedSrc, "ui.mjs")));
    let probes = 0;
    await copiedLaunch({
      base, open: false,
      probe: async () => ++probes === 1 ? { ok: false, kind: "down" } : { ok: true, kind: "0x2f", base },
      spawnImpl: fakeSpawn(spawns)
    });
    assert.equal(spawns[0].args[0], await fs.realpath(entry));
    await fs.access(spawns[0].args[0]);
  } finally {
    for (const call of spawns) {
      try { fsSync.closeSync(call.options.stdio[1]); } catch {}
    }
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("launchUi starts a missing runtime, waits for health, and opens the browser", async () => {
  const base = await tempBase();
  const spawns = [];
  const open = openedSpy();
  // The port starts silent and becomes healthy once the launcher spawns —
  // the probe transitions down -> ok on the second call.
  let probes = 0;
  const probe = async () => {
    probes++;
    return probes >= 2 ? { ok: true, kind: "0x2f", base } : { ok: false, kind: "down" };
  };
  try {
    const result = await launchUi({
      base,
      port: 4242,
      probe,
      spawnImpl: fakeSpawn(spawns),
      openBrowserImpl: open.fn
    });
    assert.equal(result.status, "started");
    assert.equal(result.url, "http://127.0.0.1:4242");
    assert.equal(result.opened, true);
    assert.equal(spawns.length, 1);
    // node <server-entry.mjs> <base> <port> — the detached UI runtime.
    assert.match(spawns[0].args[0], /server-entry\.mjs$/);
    assert.equal(spawns[0].args[1], base);
    assert.equal(spawns[0].args[2], "4242");
    assert.deepEqual(open.calls, ["http://127.0.0.1:4242"]);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("launchUi --no-browser starts the runtime but opens nothing", async () => {
  const base = await tempBase();
  const spawns = [];
  const open = openedSpy();
  const probe = async () => ({ ok: true, kind: "0x2f", base });
  try {
    const result = await launchUi({
      base,
      port: 4242,
      open: false,
      probe,
      spawnImpl: fakeSpawn(spawns),
      openBrowserImpl: open.fn
    });
    assert.equal(result.status, "reused");
    assert.equal(result.opened, false);
    assert.deepEqual(open.calls, []);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("launchUi reports 'another process owns the port' instead of an opaque EADDRINUSE", async () => {
  const base = await tempBase();
  const other = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ not: "0x2f" }));
  });
  await new Promise(resolve => other.listen(0, "127.0.0.1", resolve));
  const port = other.address().port;
  try {
    await assert.rejects(
      () => launchUi({ base, port }),
      error => {
        assert.ok(error instanceof UiError);
        assert.match(error.message, new RegExp(`Port ${port} is in use by another process`));
        assert.match(error.message, /not answering as a 0x2F runtime/);
        return true;
      }
    );
  } finally {
    other.close();
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("launchUi times out with a pointer at the runtime log when health never arrives", async () => {
  const base = await tempBase();
  const spawns = [];
  const probe = async () => ({ ok: false, kind: "down" });
  try {
    await assert.rejects(
      () =>
        launchUi({
          base,
          port: 4242,
          waitMs: 120,
          intervalMs: 20,
          probe,
          spawnImpl: fakeSpawn(spawns),
          openBrowserImpl: openedSpy().fn
        }),
      error => {
        assert.ok(error instanceof UiError);
        assert.match(error.message, /Timed out waiting for the 0x2F runtime/);
        assert.match(error.message, /ui\.log/);
        return true;
      }
    );
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("launchUi surfaces 'another process' discovered during the wait", async () => {
  const base = await tempBase();
  const spawns = [];
  let first = true;
  const probe = async () => {
    if (first) {
      first = false;
      return { ok: false, kind: "down" };
    }
    return { ok: false, kind: "other" };
  };
  try {
    await assert.rejects(
      () =>
        launchUi({
          base,
          port: 4242,
          probe,
          spawnImpl: fakeSpawn(spawns),
          openBrowserImpl: openedSpy().fn
        }),
      /in use by another process/
    );
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("openBrowser spawns the platform opener and resolves; a missing opener resolves false", async () => {
  // Successful spawn: the child fires 'spawn', openBrowser resolves true and
  // unrefs the detached child. The platform opener is the native mechanism.
  let child;
  const spawnImpl = (command, args) => {
    child = {
      command,
      args,
      unref() {},
      on(name, cb) {
        this[name] = cb;
        return this;
      }
    };
    return child;
  };
  const opened = openBrowser("http://127.0.0.1:4242", { spawnImpl });
  child.spawn(); // fire the 'spawn' listener like a real ChildProcess
  assert.equal(await opened, true);
  const expected =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  assert.equal(child.command, expected);
  assert.equal(child.args[0], "http://127.0.0.1:4242");

  // A missing opener (headless Linux without xdg-utils): 'error' fires and
  // openBrowser resolves false instead of throwing.
  const errored = openBrowser("http://127.0.0.1:4242", {
    spawnImpl: (command, args) => ({
      unref() {},
      on(name, cb) {
        if (name === "error") queueMicrotask(cb);
        return this;
      }
    })
  });
  assert.equal(await errored, false);
});

test("startServer rejects with a clear error when another process owns the port", async () => {
  const base = await tempBase();
  const other = http.createServer();
  await new Promise(resolve => other.listen(0, "127.0.0.1", resolve));
  const port = other.address().port;
  try {
    await assert.rejects(
      () => startServer(base, port),
      error => {
        assert.match(error.message, /Port \d+ is already in use/);
        assert.equal(error.code, "EADDRINUSE");
        return true;
      }
    );
  } finally {
    other.close();
    await fs.rm(base, { recursive: true, force: true });
  }
});
