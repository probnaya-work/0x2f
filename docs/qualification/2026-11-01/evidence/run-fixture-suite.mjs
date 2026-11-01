// Audited local-only full-suite runner. No vendor CLIs or credentials are
// inherited. Only the three public dependencies named in package-lock.json
// are copied from the existing npm cache into a disposable offline cache.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "0x2f-offline-suite-"));
let child;
try {
  const bin = path.join(scratch, "bin");
  const cache = path.join(scratch, "cache");
  await fs.mkdir(bin);
  await fs.symlink(process.execPath, path.join(bin, "node"));
  // Locate npm before restricting PATH, without discovering any provider.
  let npm;
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    try { npm = await fs.realpath(path.join(dir, "npm")); break; } catch {}
  }
  if (!npm) throw new Error("npm is required");
  await fs.symlink(npm, path.join(bin, "npm"));
  const cacache = createRequire(npm)("cacache");
  const originalCache = path.join(process.env.npm_config_cache ?? path.join(os.homedir(), ".npm"), "_cacache");
  const destCache = path.join(cache, "_cacache");
  const lock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
  let copied = 0;
  for (const [pkgPath, pkg] of Object.entries(lock.packages)) {
    if (!pkgPath) continue;
    const name = pkgPath.replace(/^node_modules\//, "");
    const urls = [pkg.resolved,
      `https://registry.npmjs.org/${name.replace("/", "%2f")}`,
      `https://registry.npmjs.org/${name.replace("/", "%2F")}`,
      `https://registry.npmjs.org/${name}`];
    for (const url of new Set(urls)) {
      const key = `make-fetch-happen:request-cache:${url}`;
      try {
        const entry = await cacache.get(originalCache, key);
        let data = entry.data;
        if (url !== pkg.resolved) {
          // Resolve this install against the lockfile's measured versions,
          // without a cached newer caret-compatible version selecting a
          // tarball that was never present in this qualification environment.
          const manifest = JSON.parse(data);
          if (!manifest.versions?.[pkg.version]) continue;
          data = Buffer.from(JSON.stringify({ ...manifest,
            versions: { [pkg.version]: manifest.versions[pkg.version] },
            "dist-tags": { latest: pkg.version }
          }));
        }
        await cacache.put(destCache, key, data, { metadata: entry.metadata });
        copied++;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  await fs.writeFile(path.join(scratch, "user.npmrc"), "");
  await fs.writeFile(path.join(scratch, "global.npmrc"), "");
  const env = {
    PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    LANG: "en_US.UTF-8", TERM: "xterm-256color", TZ: "Europe/Lisbon",
    TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
    npm_config_cache: cache, npm_config_offline: "true",
    npm_config_ignore_scripts: "true", npm_config_audit: "false", npm_config_fund: "false",
    NPM_CONFIG_USERCONFIG: path.join(scratch, "user.npmrc"),
    NPM_CONFIG_GLOBALCONFIG: path.join(scratch, "global.npmrc"),
    WORK_TEST_NPM_CACHE: cache
  };
  console.log(`Local-only suite: Node ${process.version}; ${copied} exact dependency cache entries; vendor CLIs absent from PATH; inherited credentials omitted.`);
  const selection = process.argv.slice(2);
  child = spawn(process.execPath, selection.length ? ["--test", ...selection] : [npm, "test"],
    { cwd: root, env, stdio: "inherit" });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  process.exitCode = code ?? 1;
} finally {
  await fs.rm(scratch, { recursive: true, force: true });
}
