import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));

async function checkFixture(files) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-check-"));
  try {
    for (const dir of ["src", "test/tui-pty", "relay", "scripts", "deploy"]) {
      await fs.mkdir(path.join(base, dir), { recursive: true });
    }
    await fs.writeFile(path.join(base, "package.json"), JSON.stringify({
      type: "module", scripts: { check: manifest.scripts.check }
    }));
    // The old package script is exercised too when running this regression
    // against a baseline without the check helper.
    await fs.copyFile(new URL("../scripts/check.mjs", import.meta.url), path.join(base, "scripts", "check.mjs"))
      .catch(error => { if (error.code !== "ENOENT") throw error; });
    for (const [file, contents] of Object.entries(files)) {
      const target = path.join(base, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, contents);
    }
    const result = spawnSync("npm", ["run", "check"], { cwd: base, encoding: "utf8" });
    assert.ifError(result.error);
    assert.notEqual(result.status, null, result.stdout + result.stderr);
    return result;
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
}

test("npm run check rejects invalid JavaScript instead of reporting success", async () => {
  const result = await checkFixture({ "src/broken.mjs": "export const broken = ;\n" });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /SyntaxError/);
});

test("npm run check checks nested source directories and rejects invalid Python helpers", async () => {
  const js = await checkFixture({ "relay/nested/broken.js": "const broken = ;\n" });
  assert.notEqual(js.status, 0, js.stdout + js.stderr);
  const python = await checkFixture({ "test/tui-pty/broken.py": "def broken(:\n" });
  assert.notEqual(python.status, 0, python.stdout + python.stderr);
  assert.match(python.stderr, /SyntaxError/);
});

test("npm run check accepts valid sources and skips dependency directories", async () => {
  const result = await checkFixture({
    "src/valid.mjs": "export const valid = true;\n",
    "test/tui-pty/valid.py": "valid = True\n",
    "relay/nested/valid.js": "export const value = 1;\n",
    "relay/node_modules/broken.js": "this is deliberately not JavaScript\n"
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
