import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createStore } from "../src/core/store.mjs";

const exec = promisify(execFile);
const storeUrl = new URL("../src/core/store.mjs", import.meta.url).href;

test("independent processes cannot collide task IDs or overwrite identical briefs", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-concurrent-create-"));
  try {
    const create = `import {createStore} from ${JSON.stringify(storeUrl)};
      const task = await createStore(process.argv[1]).createTask({
        title:'Same brief', brief:'Same brief', prompt:process.argv[2]
      }); console.log(JSON.stringify(task));`;
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) =>
      exec(process.execPath, ["--input-type=module", "-e", create, base, `input-${i}`])
    ));
    const created = results.map(r => JSON.parse(r.stdout));
    assert.equal(new Set(created.map(t => t.id)).size, 16);
    assert.equal(new Set(created.map(t => t.slug)).size, 16);
    const store = createStore(base);
    assert.equal((await store.listTasks()).length, 16);
    for (let i = 0; i < created.length; i++) {
      assert.equal(await store.readText(path.join(store.taskDir(created[i].slug), "prompt.md")), `input-${i}`);
    }
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("incomplete task directories reserve their ID and existing prompt bytes", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-incomplete-create-"));
  try {
    const store = createStore(base);
    const abandoned = store.taskDir("001-same-brief");
    await fs.mkdir(abandoned, { recursive: true });
    await fs.writeFile(path.join(abandoned, "task.json"), "{torn historical file");
    await fs.writeFile(path.join(abandoned, "prompt.md"), "historical evidence");
    const task = await store.createTask({ title: "Same brief", prompt: "new prompt" });
    assert.equal(task.id, 2);
    assert.equal(await fs.readFile(path.join(abandoned, "prompt.md"), "utf8"), "historical evidence");
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("independent processes retain every task context mutation", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-concurrent-notes-"));
  try {
    const store = createStore(base);
    const task = await store.createTask({ title: "Notes", prompt: "prompt" });
    const mutate = `import {createStore} from ${JSON.stringify(storeUrl)};
      await createStore(process.argv[1]).mutateTask(process.argv[2], fresh => ({
        ...fresh, context:{notes:[...(fresh.context?.notes??[]),{text:process.argv[3]}]}
      }));`;
    await Promise.all(Array.from({ length: 16 }, (_, i) =>
      exec(process.execPath, ["--input-type=module", "-e", mutate, base, task.slug, `note-${i}`])
    ));
    const fresh = await store.findTask(task.id);
    assert.equal(new Set(fresh.context.notes.map(n => n.text)).size, 16);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("valid JSON with invalid task shape cannot poison the ledger or redirect task writes", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-malformed-state-"));
  try {
    const store = createStore(base);
    const values = [null, 42, [], {}, { id: 5, slug: "../../outside", title: "Invalid" }];
    for (let i = 0; i < values.length; i++) {
      const dir = store.taskDir(`${String(i + 1).padStart(3, "0")}-invalid`);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "task.json"), JSON.stringify(values[i]));
    }
    assert.deepEqual(await store.listTasks(), []);
    const task = await store.createTask({ title: "Valid", brief: "Valid", prompt: "safe" });
    assert.equal(task.id, 6);
    assert.deepEqual((await store.listTasks()).map(t => t.id), [6]);
    await assert.rejects(store.findTask(5), /not found/);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});
