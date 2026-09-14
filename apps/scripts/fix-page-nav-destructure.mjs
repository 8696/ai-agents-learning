#!/usr/bin/env node
/**
 * 修复 PageNav destructure 缺失：
 * 凡是 HTML 里用了 <PageNav ... /> 但 destructure 里没 PageNav 的，都给补上。
 *
 * 三种情况：
 * 1) 完全没有 `const { ... } = window.DemoUI;` → 在 React 解构后插入新行
 * 2) 有 `const { ... } = window.DemoUI;` 但没 PageNav → 把 PageNav 加进同一行
 * 3) 已经有 PageNav → 跳过
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_ROOT = path.resolve(__dirname, "..");

async function findDemos() {
  const all = await fs.readdir(APPS_ROOT);
  const demos = [];
  for (const mod of all) {
    if (mod === "node_modules" || mod === "scripts" || mod.startsWith(".")) continue;
    const fullMod = path.join(APPS_ROOT, mod);
    const st = await fs.stat(fullMod);
    if (!st.isDirectory()) continue;
    const subs = await fs.readdir(fullMod);
    for (const sub of subs) {
      if (sub.includes("step-")) demos.push(path.join(fullMod, sub));
    }
  }
  return demos.sort();
}

async function findHtmlFiles(demoPath) {
  const files = [];
  const indexPath = path.join(demoPath, "public/index.html");
  try { await fs.access(indexPath); files.push(indexPath); } catch {}
  const pagesDir = path.join(demoPath, "public/pages");
  try {
    const subFiles = await fs.readdir(pagesDir);
    for (const f of subFiles) {
      if (f.endsWith(".html")) files.push(path.join(pagesDir, f));
    }
  } catch {}
  return files;
}

/** 检查 HTML 里是否用了 <PageNav ... /> JSX（不含字符串 / 注释） */
function usesPageNavJsx(content) {
  // 简单判断：存在 <PageNav 开头（不是 </PageNav）
  return /<PageNav[\s/>]/.test(content);
}

/** 看现有 destructure 里有没有 PageNav */
function destructureHasPageNav(content) {
  // 找 const { ... } = window.DemoUI; 这种行
  const re = /const\s*\{([^}]*)\}\s*=\s*window\.DemoUI/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const keys = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (keys.includes("PageNav")) return true;
  }
  return false;
}

/** 在 React 解构后插入 PageNav destructure 行 */
function injectStandaloneDestructure(content) {
  // 找 const { ... } = React; 这种行
  const re = /(const\s*\{[^}]*\}\s*=\s*React;)/;
  return content.replace(re, "$1\n    const { PageNav } = window.DemoUI || {};");
}

/** 把 PageNav 加进现有的 window.DemoUI destructure 行 */
function addPageNavToDestructure(content) {
  const re = /(const\s*\{)([^}]*)(\}\s*=\s*window\.DemoUI)/g;
  return content.replace(re, (match, p1, p2, p3) => {
    const keys = p2.split(",").map((s) => s.trim()).filter(Boolean);
    if (keys.includes("PageNav")) return match;
    // 把 PageNav 加到开头
    return p1 + "PageNav, " + p2.replace(/^\s*,\s*/, "") + p3;
  });
}

async function processHtml(htmlPath) {
  const content = await fs.readFile(htmlPath, "utf-8");
  if (!usesPageNavJsx(content)) return { rel: path.relative(APPS_ROOT, htmlPath), action: "skip-no-jsx" };
  if (destructureHasPageNav(content)) return { rel: path.relative(APPS_ROOT, htmlPath), action: "skip-already-has" };

  let newContent;
  // 检查有没有 window.DemoUI 解构（不含 PageNav）
  if (/const\s*\{[^}]*\}\s*=\s*window\.DemoUI/.test(content)) {
    newContent = addPageNavToDestructure(content);
    await fs.writeFile(htmlPath, newContent);
    return { rel: path.relative(APPS_ROOT, htmlPath), action: "add-to-existing-destructure" };
  } else {
    newContent = injectStandaloneDestructure(content);
    await fs.writeFile(htmlPath, newContent);
    return { rel: path.relative(APPS_ROOT, htmlPath), action: "inject-standalone-destructure" };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

  const demos = await findDemos();
  console.log(`找到 ${demos.length} 个 demo${only ? ` (filter: ${only})` : ""}`);

  let stats = { "skip-no-jsx": 0, "skip-already-has": 0, "add-to-existing-destructure": 0, "inject-standalone-destructure": 0 };

  for (const demo of demos) {
    if (only && !demo.includes(only)) continue;
    const files = await findHtmlFiles(demo);
    for (const f of files) {
      const r = await processHtml(f);
      stats[r.action] = (stats[r.action] || 0) + 1;
      if (r.action !== "skip-no-jsx") {
        console.log(`${r.action}: ${r.rel}`);
      }
    }
  }

  console.log(`\n统计：`);
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
