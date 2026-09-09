#!/usr/bin/env node
/**
 * 一键启动 apps/ 下所有 demo，并在浏览器里打开 N 个 tab。
 *
 * 用法（在仓库根目录）：
 *     node scripts/start-all.js              # 启动全部 + 就绪后询问是否开浏览器
 *     node scripts/start-all.js --no-open    # 只启动，不开浏览器（也不询问）
 *     node scripts/start-all.js --no-start   # 只打印端口表，不启动（用于核对）
 *     node scripts/start-all.js --help       # 帮助
 *
 * 行为：
 *     - 端口表从 apps/package.json 的 app:* scripts 动态解析（改 package.json 后自动同步）
 *       格式约定：PORT=<N> tsx <path>；path 相对 apps/；不符合的 app:* 自动跳过
 *     - 用本地 apps/node_modules/.bin/tsx（找不到再退回 npx tsx），子进程 cwd = apps/
 *     - 每个 demo 单独注入 PORT；并发启动，错峰轮询 http://127.0.0.1:PORT/，200 才算就绪
 *     - 所有 demo 就绪后交互式询问「是否在浏览器打开 N 个 tab？」，回车默认 yes；
 *       非 TTY 环境（管道/CI）默认 yes、不阻塞
 *     - 确认后逐个 `open http://127.0.0.1:PORT/`，每开一个 tab sleep 80ms（避免一次性闪屏）
 *     - Ctrl+C 一键 SIGTERM 关掉所有子进程
 */

const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const readline = require("node:readline");

const ROOT = path.resolve(__dirname, "..");
const APPS = path.join(ROOT, "apps");
const APPS_PKG = path.join(APPS, "package.json");

// ════════════════════════════════════════════════════════════
// 端口表：动态从 apps/package.json 的 app:* scripts 解析
// 格式约定：PORT=<N> tsx <path>；path 相对 apps/
// {key, port, path}：key = 去前缀的脚本名（如 00-01-mini-app-step-1）
// ════════════════════════════════════════════════════════════
const CMD_RE = /^PORT=(\d+)\s+tsx\s+(.+)$/;

function loadPortTable() {
  if (!fs.existsSync(APPS_PKG)) {
    throw new Error(`找不到 ${APPS_PKG}`);
  }
  const pkg = JSON.parse(fs.readFileSync(APPS_PKG, "utf8"));
  const scripts = (pkg && pkg.scripts) || {};

  const list = [];
  for (const [scriptName, cmd] of Object.entries(scripts)) {
    if (!scriptName.startsWith("app:")) continue;
    const m = CMD_RE.exec(String(cmd).trim());
    if (!m) continue;
    list.push({
      key: scriptName.slice(4),
      port: Number(m[1]),
      path: m[2].trim(),
    });
  }

  if (list.length === 0) {
    throw new Error(`apps/package.json 里没有匹配 PORT=N tsx <path> 格式的 app:* 脚本`);
  }

  // 端口冲突
  const seen = new Map();
  for (const d of list) {
    if (seen.has(d.port)) {
      throw new Error(`端口 ${d.port} 重复：${seen.get(d.port)} 与 ${d.key}`);
    }
    seen.set(d.port, d.key);
  }

  // 路径存在性（软提示，不强制退出——某些 demo 可能后续追加）
  for (const d of list) {
    if (!fs.existsSync(path.join(APPS, d.path))) {
      console.error(`⚠ [${d.port}] ${d.key}：文件不存在 ${d.path}`);
    }
  }

  list.sort((a, b) => a.port - b.port);
  return list;
}

// 模块顶层，main() 里赋值；printTable/spawnDemo/openBrowserTab 等共享访问
let PORT_TABLE = [];

// ════════════════════════════════════════════════════════════
// 启动参数解析
// ════════════════════════════════════════════════════════════
function parseArgs(argv) {
  const opts = { noOpen: false, noStart: false, help: false };
  for (const a of argv) {
    if (a === "--no-open") opts.noOpen = true;
    else if (a === "--no-start") opts.noStart = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else throw new Error(`未知参数: ${a}`);
  }
  return opts;
}

function printHelp() {
  console.log(`用法: node scripts/start-all.js [选项]

选项:
  --no-open    只启动服务，不开浏览器（也不询问）
  --no-start   只打印端口表，不启动任何服务（dry-run）
  -h, --help   显示本帮助

无参数启动时，会在所有 demo 就绪后交互式询问是否在浏览器开 tab；
回车默认 yes；非交互环境（管道/CI）默认开、不阻塞。`);
}

// ════════════════════════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════════════════════════
function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printTable() {
  console.log("");
  console.log(`  ${pad("KEY", 50)} ${pad("PORT", 6)} URL`);
  console.log(`  ${pad("-".repeat(50), 50)} ${pad("-".repeat(6), 6)} ${"-".repeat(36)}`);
  for (const d of PORT_TABLE) {
    console.log(`  ${pad(d.key, 50)} ${pad(String(d.port), 6)} http://127.0.0.1:${d.port}/`);
  }
  console.log("");
  console.log(`  共 ${PORT_TABLE.length} 个 demo，端口 ${PORT_TABLE[0].port}..${PORT_TABLE[PORT_TABLE.length - 1].port}`);
  console.log("");
}

/** GET 一次根路径；只要拿到任何 HTTP 响应就算端口已开（不挑 200） */
function check(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: "/", method: "GET", timeout: 1500 },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/** 轮询直到端口就绪；超时返回 -1 */
async function waitReady(port, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await check(port)) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, 250));
  }
  return -1;
}

/** 找本地 tsx；优先 apps/node_modules/.bin/tsx，找不到再退到 npx */
function resolveTsxBin() {
  const isWin = process.platform === "win32";
  const local = path.join(APPS, "node_modules", ".bin", isWin ? "tsx.cmd" : "tsx");
  if (fs.existsSync(local)) return { bin: local, useShell: isWin };
  return { bin: "npx", argsPrefix: ["tsx"], useShell: false };
}

/** 交互式询问是否在浏览器开 tab；非 TTY 默认 yes；回车默认 yes */
function askOpenBrowser(okCount) {
  if (!process.stdin.isTTY) {
    console.log(`→ 非交互环境（管道/CI），默认开 ${okCount} 个 tab。`);
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      `\n→ ${okCount} 个 demo 就绪。是否在浏览器打开 ${okCount} 个 tab？(Y/n) `,
      (answer) => {
        rl.close();
        const a = String(answer || "").trim().toLowerCase();
        resolve(a === "" || a === "y" || a === "yes");
      },
    );
  });
}

// ════════════════════════════════════════════════════════════
// 子进程管理
// ════════════════════════════════════════════════════════════
function spawnDemo(d) {
  const tsx = resolveTsxBin();
  const args = tsx.argsPrefix ? [...tsx.argsPrefix, d.path] : [d.path];
  const child = spawn(tsx.bin, args, {
    cwd: APPS,
    env: { ...process.env, PORT: String(d.port) },
    stdio: ["ignore", "pipe", "pipe"],
    shell: tsx.useShell,
  });
  const tag = `[${d.port}]`;
  child.stdout.on("data", (b) => process.stdout.write(`${tag} ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`${tag} ${b}`));
  return child;
}

function openBrowserTab(port) {
  // macOS `open`；Linux/Windows 调用者负责扩展（darwin 是这个项目目标平台）
  if (process.platform === "darwin") {
    spawn("open", [`http://127.0.0.1:${port}/`], {
      stdio: "ignore",
      detached: true,
    }).unref();
  } else if (process.platform === "linux") {
    spawn("xdg-open", [`http://127.0.0.1:${port}/`], {
      stdio: "ignore",
      detached: true,
    }).unref();
  } else if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", `http://127.0.0.1:${port}/`], {
      stdio: "ignore",
      detached: true,
    }).unref();
  }
}

// ════════════════════════════════════════════════════════════
// 主流程
// ════════════════════════════════════════════════════════════
let shuttingDown = false;

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    printHelp();
    process.exit(1);
  }
  if (opts.help) {
    printHelp();
    return;
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log(" AI Agents Learning · 一键启动所有 demo");
  console.log(` 仓库根: ${ROOT}`);
  console.log(` apps 根: ${APPS}`);
  console.log(` 端口源: ${APPS_PKG}`);
  console.log("═══════════════════════════════════════════════════════");

  try {
    PORT_TABLE = loadPortTable();
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
  printTable();

  if (opts.noStart) {
    console.log("--no-start 已指定，仅打印端口表。");
    return;
  }

  // 1. 并发启动所有 demo
  const procs = PORT_TABLE.map((d) => ({ ...d, child: spawnDemo(d) }));

  // 2. 错峰健康检查（不打开 tab，等全部就绪再统一询问）
  console.log(`→ 等待 demo 就绪…`);
  let okN = 0;
  for (const p of procs) {
    const ms = await waitReady(p.port);
    if (ms < 0) {
      console.error(`✗ [${p.port}] ${p.key} 启动超时（15s）`);
      continue;
    }
    console.log(`✓ [${p.port}] ${p.key.padEnd(50)} ${ms}ms`);
    okN += 1;
  }

  // 3. 询问是否开 tab（--no-open 直接跳过；非交互环境默认 yes）
  let openedN = 0;
  if (okN > 0 && !opts.noOpen) {
    const shouldOpen = await askOpenBrowser(okN);
    if (shouldOpen) {
      for (const p of procs) {
        openBrowserTab(p.port);
        openedN += 1;
        await new Promise((r) => setTimeout(r, 80));
      }
    }
  }

  console.log("");
  console.log(`→ ${okN}/${PORT_TABLE.length} 个 demo 就绪${openedN > 0 ? `，已开 ${openedN} 个浏览器 tab` : ""}。`);
  console.log("→ Ctrl+C 关闭所有服务。");

  // 3. 优雅退出：SIGINT/SIGTERM 一键关掉所有子进程
  const shutdown = (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n→ 收到 ${sig}，关闭所有 demo…`);
    for (const p of procs) {
      try {
        p.child.kill("SIGTERM");
      } catch (_) {}
    }
    setTimeout(() => process.exit(0), 800).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 兜底：任何一个子进程自己挂了 → 都退出时主进程也跟着退出
  let exitedCount = 0;
  for (const p of procs) {
    p.child.on("exit", (code, signal) => {
      exitedCount += 1;
      if (!shuttingDown && exitedCount >= procs.length) {
        console.log(`\n→ 所有 demo 已退出。`);
        process.exit(0);
      }
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});