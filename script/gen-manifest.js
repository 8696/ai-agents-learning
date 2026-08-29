#!/usr/bin/env node
/**
 * 根据仓库当前目录结构生成 manifest.json，给 index.html 渲染左侧导航用。
 *
 * 用法：
 *     node script/gen-manifest.js           # 默认生成仓库根目录 manifest.json
 *     node script/gen-manifest.js -o xxx    # 指定输出文件
 *
 * 约定：
 *     - 只扫描：README.md、AGENTS.md、docs/、apps/
 *     - 目录内递归收录全部文件，label 用真实名称，不改名、不按后缀过滤
 *     - 目录内仍跳过 node_modules，以及密钥文件 .env
 *
 * 仓库加了新文件时，重跑一次本脚本。
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const SKIP_DIRS = new Set([".git", "node_modules"]);

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function rel(absPath) {
  return toPosix(path.relative(ROOT, absPath));
}

function isSecretEnvFile(name) {
  if (name === ".env") return true;
  if (name.startsWith(".env.") && !name.endsWith(".example")) return true;
  return false;
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );

  const children = [];
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const abs = path.join(dirPath, ent.name);
      children.push({
        label: ent.name,
        children: walk(abs),
      });
      continue;
    }
    if (ent.isFile()) {
      if (isSecretEnvFile(ent.name)) continue;
      const abs = path.join(dirPath, ent.name);
      children.push({
        label: ent.name,
        path: rel(abs),
      });
    }
  }
  return children;
}

function fileLeaf(name) {
  const abs = path.join(ROOT, name);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return { label: name, path: name };
}

function dirGroup(name) {
  const abs = path.join(ROOT, name);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return null;
  return { label: name, children: walk(abs) };
}

function countLeaves(nodes) {
  let n = 0;
  for (const node of nodes) {
    if (Array.isArray(node.children)) n += countLeaves(node.children);
    else n += 1;
  }
  return n;
}

function main() {
  const argv = process.argv.slice(2);
  const outArg = argv[0] ?? "-o";
  const outPath =
    outArg === "-o" && argv[1] ? path.resolve(argv[1]) : path.join(ROOT, "manifest.json");

  const nav = [fileLeaf("README.md"), fileLeaf("AGENTS.md"), dirGroup("docs"), dirGroup("apps")].filter(
    Boolean,
  );

  fs.writeFileSync(outPath, `${JSON.stringify(nav, null, 2)}\n`, "utf8");
  console.log(`✓ 生成 ${outPath}  顶层 ${nav.length} 项，文件 ${countLeaves(nav)} 个`);
}

main();
