#!/usr/bin/env node
/**
 * 一次性脚本：给所有 demo 加标准 PageNav。
 *
 * 标准样式 = step-3 的卡片样式（border + rounded + 白底蓝字高亮），但**没有"← 回总览"**（按 step-1 的做法，总览放在 PAGES 第一项）。
 *
 * 每个 demo 的处理：
 *   1. 检测结构：单页（只有 index.html）/ 多页（index.html + pages/*.html）
 *   2. 从每个 HTML 的 <title> 或 <h1> 抽 label
 *   3. 写 public/components/page-nav.js（含标准组件 + 该 demo 的 items）
 *   4. 在每个 HTML 里：注入 <script src="...page-nav.js"> + 注入 <PageNav current="..." base="..." /> JSX
 *   5. 用 @babel/parser 校验修改后的 HTML 里的 inline JSX 块语法
 *
 * 跑法：node apps/scripts/add-page-nav.mjs               # 全部 102 个 demo
 *       node apps/scripts/add-page-nav.mjs --only=<keyword>  # 只跑路径含 keyword 的
 *
 * 不做的事：不启动服务、不 curl、不截图。学习者自己起服务看。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_ROOT = path.resolve(__dirname, "..");

const PAGE_NAV_TEMPLATE = `/**
 * 职责：标准 PageNav 组件。挂在 window.DemoUI.PageNav。
 * 当前页面用 <PageNav current="..." base="" /> 即可拿到所有 sub-page 入口 + 高亮当前。
 * 标准样式：卡片容器（bg-white border border-gray-200 rounded p-3）；
 *          当前页 = 白底蓝边 + 浅蓝底（border-blue-500 bg-blue-50 text-blue-700 font-semibold）；
 *          其他页 = 灰边白底（border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100）。
 * 注意：本组件没有"← 回总览"链接 —— 总览放在 PAGES 第一项即可。
 */
(function () {
  const DemoUI = window.DemoUI || (window.DemoUI = {});

  const PAGES = /*PAGES_PLACEHOLDER*/;

  DemoUI.PageNav = function PageNav(props) {
    const current = props.current;
    const base = props.base || "";
    return (
      <nav className="bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-2 text-sm">
        {PAGES.map(function (item) {
          const active = item.key === current;
          return (
            <a
              key={item.key}
              href={base + item.href}
              className={
                "px-3 py-1 rounded border " +
                (active
                  ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                  : "border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100")
              }
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    );
  };
})();
`;

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

async function detectStructure(demoPath) {
  const publicPath = path.join(demoPath, "public");
  const indexPath = path.join(publicPath, "index.html");
  const pagesDir = path.join(publicPath, "pages");

  let indexExists = false;
  try { await fs.access(indexPath); indexExists = true; } catch {}

  let subPages = [];
  try {
    const files = await fs.readdir(pagesDir);
    subPages = files.filter((f) => f.endsWith(".html")).sort();
  } catch {}

  return {
    isMultiPage: subPages.length > 0,
    subPages,
    indexPath: indexExists ? indexPath : null,
    pagesDir,
  };
}

/** 从 HTML 抽 label：先 <title>，再 <h1>，再文件名。返回清理后的纯文本。 */
async function extractLabel(htmlPath) {
  const content = await fs.readFile(htmlPath, "utf-8");
  const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const t = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    if (t) return t;
  }
  const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const clean = h1Match[1].replace(/<[^>]+>/g, "").trim();
    if (clean) return clean;
  }
  return path.basename(htmlPath, ".html");
}

function generatePageNavJs(items) {
  const pagesJson = JSON.stringify(items, null, 2);
  return PAGE_NAV_TEMPLATE.replace("/*PAGES_PLACEHOLDER*/", pagesJson);
}

/** 总览 label：从 index 的 title 里去掉 " · 第N步（step-N）· xxx" 这类后缀，只留主题。 */
function buildOverviewLabel(indexTitle) {
  const cleaned = indexTitle.split("·")[0].trim();
  return cleaned.startsWith("总览") ? cleaned : "总览 · " + cleaned;
}

async function buildItems(structure) {
  if (!structure.isMultiPage) {
    const label = await extractLabel(structure.indexPath);
    return [{ key: "main", label, href: "index.html" }];
  }
  const indexTitle = await extractLabel(structure.indexPath);
  const items = [
    { key: "overview", label: buildOverviewLabel(indexTitle), href: "index.html" },
  ];
  for (const page of structure.subPages) {
    const label = await extractLabel(path.join(structure.pagesDir, page));
    items.push({ key: page.replace(".html", ""), label, href: "pages/" + page });
  }
  return items;
}

/** 抽取 HTML 里的所有 <script type="text/babel"> 内联块，单独校验 JSX 语法。 */
function validateJsx(htmlContent, demoRel) {
  const blocks = [];
  const re = /<script type="text\/babel">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(htmlContent)) !== null) blocks.push(m[1]);
  if (blocks.length === 0) return { ok: true, count: 0 };

  const errors = [];
  for (let i = 0; i < blocks.length; i++) {
    try {
      parse(blocks[i], {
        sourceType: "module",
        plugins: ["jsx"],
        errorRecovery: false,
      });
    } catch (e) {
      errors.push({ blockIndex: i, message: e.message });
    }
  }
  return { ok: errors.length === 0, count: blocks.length, errors };
}

/** 注入一段 <script> 和 <PageNav ... /> JSX 到 HTML 里。返回本次修改的描述。 */
async function injectIntoHtml(htmlPath, currentKey, base) {
  let content = await fs.readFile(htmlPath, "utf-8");
  const actions = [];
  const scriptSrc = base === "../" ? "../components/page-nav.js" : "/components/page-nav.js";

  // 1. 注入 <script type="text/babel" src="...page-nav.js"></script>
  if (!content.includes("components/page-nav.js")) {
    const layoutMatch = content.match(
      /(<script type="text\/babel" src="[^"]*components\/layout\.js"[^>]*><\/script>)/,
    );
    if (layoutMatch) {
      content = content.replace(
        layoutMatch[0],
        layoutMatch[0] + `\n  <script type="text/babel" src="${scriptSrc}"></script>`,
      );
      actions.push("script+");
    } else {
      // 没有 layout.js 脚本就插在第一个内联 JSX 块之前
      const inlineMatch = content.match(/(  <script type="text\/babel">)/);
      if (inlineMatch) {
        content = content.replace(
          inlineMatch[0],
          `  <script type="text/babel" src="${scriptSrc}"></script>\n` + inlineMatch[0],
        );
        actions.push("script+(no-layout-fallback)");
      } else {
        actions.push("!! NO_SCRIPT_INSERT_POINT");
      }
    }
  } else {
    actions.push("script=(exists)");
  }

  // 2. 注入/替换 <PageNav ... />
  const newPageNav = `<PageNav current="${currentKey}" base="${base}" />`;

  const existingWithProps = content.match(/<PageNav\s+[^>]*\/>/);
  if (existingWithProps) {
    content = content.replace(existingWithProps[0], newPageNav);
    actions.push("PageNav-replaced");
  } else {
    const existingNoProps = content.match(/<PageNav\s*\/>/);
    if (existingNoProps) {
      content = content.replace(existingNoProps[0], newPageNav);
      actions.push("PageNav-upgraded");
    } else {
      const headerMatch = content.match(/<\/header>/);
      if (headerMatch) {
        content = content.replace(headerMatch[0], headerMatch[0] + `\n          ${newPageNav}`);
        actions.push("PageNav-injected(after-header)");
      } else {
        // 没有 header：插在 <main ...> 之前
        const mainMatch = content.match(/(<main\s)/);
        if (mainMatch) {
          content = content.replace(mainMatch[0], `          ${newPageNav}\n          ${mainMatch[0]}`);
          actions.push("PageNav-injected(before-main)");
        } else {
          actions.push("!! NO_PAGENAV_INSERT_POINT");
        }
      }
    }
  }

  await fs.writeFile(htmlPath, content);
  return { actions, content };
}

async function processDemo(demoPath) {
  const rel = path.relative(APPS_ROOT, demoPath);
  const structure = await detectStructure(demoPath);
  if (!structure.indexPath) {
    return { rel, status: "skipped", reason: "no index.html" };
  }

  const items = await buildItems(structure);

  // 1. 写 page-nav.js
  const componentsDir = path.join(demoPath, "public/components");
  await fs.mkdir(componentsDir, { recursive: true });
  const pageNavPath = path.join(componentsDir, "page-nav.js");
  await fs.writeFile(pageNavPath, generatePageNavJs(items));

  // 2. 改 index.html
  const idx = await injectIntoHtml(
    structure.indexPath,
    structure.isMultiPage ? "overview" : "main",
    "",
  );

  // 3. 改每个 sub-page
  const subResults = [];
  if (structure.isMultiPage) {
    for (const page of structure.subPages) {
      const r = await injectIntoHtml(
        path.join(structure.pagesDir, page),
        page.replace(".html", ""),
        "../",
      );
      subResults.push({ page, actions: r.actions });
    }
  }

  // 4. 校验 JSX 语法
  const idxJsx = validateJsx(idx.content, rel);
  const subJsxChecks = [];
  if (structure.isMultiPage) {
    for (const page of structure.subPages) {
      const c = await fs.readFile(path.join(structure.pagesDir, page), "utf-8");
      subJsxChecks.push({ page, ...validateJsx(c, rel + "/" + page) });
    }
  }

  return {
    rel,
    items: items.map((i) => i.key),
    indexActions: idx.actions,
    subResults,
    jsxCheck: idxJsx,
    subJsxChecks,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

  const demos = await findDemos();
  console.log(`找到 ${demos.length} 个 demo${only ? ` (filter: ${only})` : ""}\n`);

  let ok = 0;
  let bad = 0;
  for (const demo of demos) {
    if (only && !demo.includes(only)) continue;
    const rel = path.relative(APPS_ROOT, demo);
    try {
      const r = await processDemo(demo);
      const jsxOk = r.jsxCheck?.ok && r.subJsxChecks.every((s) => s.ok);
      if (r.status === "skipped") {
        console.log(`- ${rel}  SKIP (${r.reason})`);
        continue;
      }
      const mark = jsxOk ? "✓" : "✗";
      console.log(
        `${mark} ${rel}  items=[${r.items.join(",")}]  idx=[${r.indexActions.join(",")}]`,
      );
      for (const sp of r.subResults) {
        console.log(`    ${sp.page}: [${sp.actions.join(",")}]`);
      }
      if (!jsxOk) {
        console.log(`    JSX 语法错误（index）: ${JSON.stringify(r.jsxCheck.errors)}`);
        for (const s of r.subJsxChecks) {
          if (!s.ok) console.log(`    JSX 语法错误（${s.page}）: ${JSON.stringify(s.errors)}`);
        }
        bad++;
      } else {
        ok++;
      }
    } catch (err) {
      console.log(`✗ ${rel}  FAILED: ${err.message}`);
      console.log(`  ${err.stack}`);
      bad++;
    }
  }

  console.log(`\n完成：OK=${ok}  BAD=${bad}`);
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
