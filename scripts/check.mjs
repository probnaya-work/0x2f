// Syntax checks must fail the command when any child checker fails. In
// particular, find -exec does not propagate node --check exit statuses.
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function filesUnder(dir, extensions) {
  const files = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules") continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(file, extensions));
    else if (entry.isFile() && extensions.includes(path.extname(file))) files.push(file);
  }
  return files;
}

let failed = false;
function check(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) failed = true;
}

try {
  for (const dir of ["src", "test", "relay", "scripts", "deploy"]) {
    for (const file of await filesUnder(dir, [".mjs", ".js"])) {
      check(process.execPath, ["--check", file]);
    }
  }
  const pythonFiles = await filesUnder(path.join("test", "tui-pty"), [".py"])
    .catch(error => { if (error.code === "ENOENT") return []; throw error; });
  if (pythonFiles.length) {
    check("python3", ["-c",
      "import ast, pathlib, sys; [ast.parse(pathlib.Path(f).read_text(encoding='utf-8'), f) for f in sys.argv[1:]]",
      ...pythonFiles
    ]);
  }
} catch (error) {
  console.error(error.message);
  failed = true;
}

if (failed) process.exitCode = 1;
