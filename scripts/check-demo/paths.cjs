const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..");
const APPS = path.join(REPO, "apps");

function posixRel(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// 只把 step 根目录的 server.ts 认成 demo；lib/.../server.ts 是被父进程 spawn 的子进程代码库，
// 不是独立 demo（如 12-MCP step-1 的 lib/mcp-server/server.ts 是 stdio 子进程，被父进程 spawn）。
// 同理 lib/ 下任意深度的 server.ts 都不算。
function isDemoRoot(serverTsAbsPath) {
  const rel = posixRel(APPS, serverTsAbsPath);
  return !rel.includes("/lib/");
}

function listDemos() {
  return walk(APPS)
    .filter((f) => (f.endsWith(`${path.sep}server.ts`) || f.endsWith("/server.ts")) && isDemoRoot(f))
    .map((f) => path.dirname(f))
    .sort();
}

/**
 * 父目录参数：扁平结构下没有 step-N/ 子夹（§5.3.14）。
 * 传 apps/{模块}/ 或 apps/{模块}/{小节}-step-1/ 时都按"扫所有 server.ts"处理。
 */
function expandTargets(args) {
  const out = [];
  for (const a of args) {
    if (!fs.existsSync(a)) {
      console.error("不存在：" + a);
      process.exit(2);
    }
    if (fs.existsSync(path.join(a, "server.ts"))) {
      out.push(a);
      continue;
    }
    const subs = walk(a)
      .filter((f) => (f.endsWith(`${path.sep}server.ts`) || f.endsWith("/server.ts")) && isDemoRoot(f))
      .map((f) => path.dirname(f))
      .sort();
    if (subs.length > 0) out.push(...subs);
    else {
      console.error("不存在：" + a);
      process.exit(2);
    }
  }
  return out;
}

module.exports = { REPO, APPS, posixRel, walk, listDemos, expandTargets };
