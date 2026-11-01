// Local fixture-only qualification; run with an isolated official Node binary.
// Usage: node run-isolated-matrix.mjs <checkout> <output-dir> <public-cache>
// Uses that Node's bundled npm. Copies repository files into a disposable checkout,
// creates a cache of only lockfile dependencies, and omits inherited credentials.
// A failed reproduction is preserved; successful scratch trees are removed.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const [checkoutArg, outputArg, cacheArg] = process.argv.slice(2);
if (!checkoutArg || !outputArg || !cacheArg) throw new Error("checkout, output directory and public npm cache required");
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const publicCache = path.resolve(cacheArg);
await fs.mkdir(output, { recursive: true });
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), `0x2f-matrix-${process.version}-`));
const root = path.join(scratch, "checkout");
const bin = path.join(scratch, "bin");
const cache = path.join(scratch, "cache");
const home = path.join(scratch, "home");
const npm = path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
const cacache = createRequire(npm)("cacache");
for (const dir of [root, bin, cache, home]) await fs.mkdir(dir);
await fs.symlink(process.execPath, path.join(bin, "node"));
await fs.symlink(npm, path.join(bin, "npm"));
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: checkout, encoding: "utf8" }).split("\0").filter(Boolean);
for (const file of files) {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(path.join(checkout, file), target);
}
const lock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
let copiedCacheEntries = 0;
for (const [pkgPath, pkg] of Object.entries(lock.packages)) {
  if (!pkgPath) continue;
  const name = pkgPath.replace(/^node_modules\//, "");
  const urls = [pkg.resolved, `https://registry.npmjs.org/${name.replace("/", "%2f")}`,
    `https://registry.npmjs.org/${name.replace("/", "%2F")}`, `https://registry.npmjs.org/${name}`];
  let manifestEntry;
  for (const url of new Set(urls.slice(1))) {
    try {
      const entry = await cacache.get(path.join(publicCache, "_cacache"), `make-fetch-happen:request-cache:${url}`);
      if (JSON.parse(entry.data).versions?.[pkg.version]) { manifestEntry = entry; break; }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const url of new Set(urls)) {
    const key = `make-fetch-happen:request-cache:${url}`;
    try {
      // npm9 requests lowercase %2f; npm11 uses uppercase %2F. Seed equivalent
      // public manifest keys so cache spelling cannot masquerade as a product
      // installation failure. Tarball bytes and locked version stay unchanged.
      const entry = url === pkg.resolved
        ? await cacache.get(path.join(publicCache, "_cacache"), key)
        : manifestEntry;
      if (!entry) continue;
      let data = entry.data;
      if (url !== pkg.resolved) {
        const manifest = JSON.parse(data);
        if (!manifest.versions?.[pkg.version]) continue;
        data = Buffer.from(JSON.stringify({ ...manifest,
          versions: { [pkg.version]: manifest.versions[pkg.version] },
          "dist-tags": { latest: pkg.version }
        }));
      }
      const accepts = url === pkg.resolved ? [entry.metadata.reqHeaders?.accept] : [
        "application/json",
        "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*"
      ];
      for (const accept of accepts) {
        // npm9 also matches the cached Accept media types. The full public
        // JSON is a superset of install-v1's fields. Cache both request
        // variants of this same locked manifest, retaining the Vary header.
        const metadata = url === pkg.resolved ? entry.metadata : {
          ...entry.metadata, url,
          reqHeaders: { ...entry.metadata.reqHeaders, accept }
        };
        await cacache.put(path.join(cache, "_cacache"), key, data, { metadata });
        copiedCacheEntries++;
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
await fs.writeFile(path.join(scratch, "user.npmrc"), "");
await fs.writeFile(path.join(scratch, "global.npmrc"), "");
const env = {
  PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home,
  LANG: "en_US.UTF-8", TERM: "xterm-256color", TZ: "Europe/Lisbon",
  TMPDIR: os.tmpdir(), npm_config_cache: cache, npm_config_offline: "true",
  npm_config_ignore_scripts: "true", npm_config_audit: "false", npm_config_fund: "false",
  NPM_CONFIG_USERCONFIG: path.join(scratch, "user.npmrc"),
  NPM_CONFIG_GLOBALCONFIG: path.join(scratch, "global.npmrc"), WORK_TEST_NPM_CACHE: cache
};
const summary = {
  started_utc: new Date().toISOString(), node: process.version,
  npm: execFileSync(process.execPath, [npm, "--version"], { env, encoding: "utf8" }).trim(),
  platform: process.platform, arch: process.arch, os_release: os.release(),
  python: execFileSync("python3", ["--version"], { env, encoding: "utf8" }).trim(),
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim(),
  source_status: execFileSync("git", ["status", "--short"], { cwd: checkout, encoding: "utf8" }),
  scratch, copiedCacheEntries, credentials: "omitted; empty HOME and npm config; vendor CLIs absent from PATH",
  npm_manifest_mode: "offline exact locked versions; full JSON+install-v1 Accept variants; equivalent URL cache aliases",
  source_sha256: {},
  steps: []
};
for (const file of ["package.json", "package-lock.json", "scripts/test.mjs", "src/cli.mjs", "src/web/app.js",
  "src/relay/agent.mjs", "src/providers/codex.mjs", "test/relay-config-race.test.mjs", "test/worktree.test.mjs"]) {
  try { summary.source_sha256[file] = createHash("sha256").update(await fs.readFile(path.join(root, file))).digest("hex"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function run(label, args) {
  const log = path.join(output, `${label}.txt`);
  const handle = await fs.open(log, "w");
  const started = Date.now();
  await handle.write(`Node ${summary.node}; npm ${summary.npm}; ${summary.platform}/${summary.arch}; ${summary.python}\n`);
  await handle.write(`Command: ${JSON.stringify([process.execPath, ...args])}\nCWD: ${root}\n`);
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", handle.fd, handle.fd] });
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  await handle.close();
  const text = await fs.readFile(log, "utf8");
  const tap = {};
  for (const field of ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const match = text.match(new RegExp(`^(?:#|ℹ) ${field} (\\d+)$`, "m"));
    if (match) tap[field] = Number(match[1]);
  }
  const step = { label, args, ...status, duration_ms: Date.now() - started, tap,
    skips: text.split("\n").filter(line => line.includes("# SKIP") || line.startsWith("﹣")) };
  summary.steps.push(step);
  await fs.writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(step));
  return step;
}
try {
  const install = await run("clean-npm-ci", [npm, "ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"]);
  if (install.code !== 0) throw new Error("clean locked dependency install failed");
  await run("npm-check", [npm, "run", "check"]);
  // This runner already has the original safe runner's sanitized PATH/config,
  // private cache and exact dependency manifest selection. Invoke the actual
  // npm test directly so both Accept variants survive into the install
  // fixture on npm9 as well as the newer bundled npm versions.
  const actual = await run("actual-npm-test", [npm, "test"]);
  if (actual.code !== 0) {
    const selection = (await fs.readdir(path.join(root, "test"))).filter(file => file.endsWith(".test.mjs")).sort().map(file => `test/${file}`);
    await run("explicit-full-fixture-suite", ["--test", ...selection]);
  }
  await run("installed-distribution-journey", ["--test", "test/distribution.test.mjs"]);
} catch (error) {
  summary.runner_error = { message: error.message, stack: error.stack };
  console.error(error);
} finally {
  summary.completed_utc = new Date().toISOString();
  summary.scratch_preserved = Boolean(summary.runner_error || summary.steps.some(step => step.code !== 0));
  if (!summary.scratch_preserved) await fs.rm(scratch, { recursive: true, force: true });
  await fs.writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  if (summary.scratch_preserved) process.exitCode = 1;
}
