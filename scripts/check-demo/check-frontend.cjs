const fs = require("node:fs");
const path = require("node:path");
const { walk } = require("./paths.cjs");
const { braceQuoteInJsString } = require("./jsx.cjs");

/**
 * Babel 自带 sourceType 二选一（script / module）。
 * 文件首 200 行里出现 import / export 就走 module，让 ESM 写法能过；否则按老规则走 script。
 */
function babelCheck(parser, fail, ok, label, code) {
  const head = code.slice(0, 8000);
  const isEsm = /^\s*(?:import|export)\s/m.test(head);
  try {
    parser.parse(code, {
      sourceType: isEsm ? "module" : "script",
      plugins: ["jsx"],
    });
    ok(label);
  } catch (e) {
    fail(label + " : " + e.message.split("\n")[0]);
  }
  if (braceQuoteInJsString(code))
    fail(label + " : JS 字符串/模板里写了 {\"<…>\"}（只允许 JSX 文本节点；§5.3.4）");
}

/**
 * 一页 HTML 是「UMD 老模式」还是「ESM 新模式」：
 * 看有没有 <script type="importmap">，并且映射里出现 react。
 * 只有 ESM 模式才允许 type="module" / data-type="module" / 不挂 UMD React。
 */
function detectEsmPattern(html) {
  const m = html.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/);
  if (!m) return false;
  return /react/.test(m[1]);
}

function checkComponentsAndUtils(ctx) {
  const { publicDir, parser, fail, ok } = ctx;
  const componentsDir = path.join(publicDir, "components");
  const utilsDir = path.join(publicDir, "utils");

  for (const f of walk(componentsDir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(f, "utf8");
    babelCheck(parser, fail, ok, "components/" + path.basename(f), src);
    if (!src.slice(0, 400).includes("职责"))
      fail("components/" + path.basename(f) + " 文件头缺「职责」注释");
  }
  for (const f of walk(utilsDir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(f, "utf8");
    if (!src.slice(0, 400).includes("职责")) fail("utils/" + path.basename(f) + " 文件头缺「职责」注释");
  }

  const htmlFiles = walk(publicDir).filter((f) => f.endsWith(".html"));
  htmlFiles.length > 0 ? ok(`public/ ${htmlFiles.length} 个页面`) : fail("public/ 无 HTML");
}

/**
 * UMD 老模式必有的 CDN 资源：UMD React + UMD ReactDOM + Babel。
 * §5.3.4 写死了 unmjs.com 的 18.3.1 + 7.26.4。
 */
const REQUIRED_CDN = [
  ["@tailwindcss/browser@4.3.3", "Tailwind 4.3.3"],
  ["react@18.3.1/umd/react.production.min.js", "React 18.3.1 UMD"],
  ["react-dom@18.3.1/umd/react-dom.production.min.js", "ReactDOM 18.3.1 UMD"],
  ["@babel/standalone@7.26.4/babel.min.js", "Babel 7.26.4"],
];

function checkUmdPageChecks(html, label, parser, fail, ok) {
  for (const [needle, name] of REQUIRED_CDN) {
    if (!html.includes(needle)) fail(label + " : 缺/换了 " + name + "（§5.3.4 禁止）");
  }
  if (/<script\b[^>]*\stype="module"/.test(html)) fail(label + " : 用了 type=module（禁止）");
  if (/data-presets|data-plugins/.test(html))
    fail(label + " : script 上加了 data-presets/plugins（禁止）");

  const blocks = [...html.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)];
  if (blocks.length === 0) fail(label + " : 没找到内联 babel 块");
  blocks.forEach((m, i) => babelCheck(parser, fail, ok, label + " inline#" + i, m[1]));
}

/**
 * ESM 新模式的检查项：
 *   - 不应再有 UMD React（走 import map 那一份就够了）
 *   - 还要 Babel Standalone（内联 JSX 还要它转译）
 *   - 必含 import map（且包含 react 映射）
 *   - 共享组件可写 <script type="module">
 *   - 内联 babel 块可写 <script type="text/babel" data-type="module">
 */
function checkEsmPageChecks(html, label, parser, fail, ok) {
  if (
    html.includes("/umd/react.production.min.js") ||
    html.includes("/umd/react-dom.production.min.js")
  ) {
    fail(label + " : ESM 模式不应再挂 UMD React/ReactDOM（应走 import map）");
  }
  if (!html.includes("@babel/standalone")) {
    fail(label + " : ESM 模式缺 Babel Standalone（内联 JSX 还要它转译）");
  }
  if (!/<script\s+type="importmap">[\s\S]*?react/.test(html)) {
    fail(label + " : ESM 模式缺 import map 含 react 映射");
  }
  if (/data-presets|data-plugins/.test(html))
    fail(label + " : script 上加了 data-presets/plugins（禁止）");

  const blocks = [
    ...html.matchAll(/<script type="text\/babel"(?:\s+data-type="module")?\s*>([\s\S]*?)<\/script>/g),
  ];
  if (blocks.length === 0) fail(label + " : 没找到内联 babel 块");
  blocks.forEach((m, i) => babelCheck(parser, fail, ok, label + " inline#" + i, m[1]));
}

/**
 * 跨两种模式共用的页面 id 检查。#output 在 chat 类页面（trajectory 直接画在 controls 内）
 * 没有对应 id，不再强制要求。
 */
const COMMON_PAGE_IDS = [
  ["page-header", null],
  ["page-title", null],
  ["status-pill", "<StatusPill"],
  ["page-main", null],
  ["page-intro", "<PageIntro"],
  ["controls", null],
  ["page-footer", "<EnvFooter"],
  ["env-info", "<EnvFooter"],
];

function checkHtmlPages(ctx) {
  const { publicDir, parser, fail, ok } = ctx;
  const htmlFiles = walk(publicDir).filter((f) => f.endsWith(".html"));

  for (const f of htmlFiles) {
    const label = path.relative(publicDir, f);
    const html = fs.readFileSync(f, "utf8");
    const isEsm = detectEsmPattern(html);
    if (isEsm) checkEsmPageChecks(html, label, parser, fail, ok);
    else checkUmdPageChecks(html, label, parser, fail, ok);

    for (const [id, viaComponent] of COMMON_PAGE_IDS) {
      const has = html.includes('id="' + id + '"') || (viaComponent && html.includes(viaComponent));
      if (!has) fail(label + " : 缺 #" + id + "（§5.3.4 / §5.3.9 / §5.3.11）");
    }
    if (/MiniMax-M\d|gpt-4|claude-3|qwen[\w.-]*max/i.test(html))
      fail(label + " : 页面写死了具体模型名（应来自 /health）");
  }
}

module.exports = { checkComponentsAndUtils, checkHtmlPages };