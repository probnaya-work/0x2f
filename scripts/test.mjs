// Node20 treats a quoted glob as a literal path. Enumerate the same top-level
// test files explicitly so npm test works across supported Node versions.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const files = fs.readdirSync("test").filter(file => file.endsWith(".test.mjs"))
  .sort().map(file => path.join("test", file));
if (!files.length) throw new Error("No test/*.test.mjs files found");
const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
