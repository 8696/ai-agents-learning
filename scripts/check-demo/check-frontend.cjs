const fs = require("node:fs");
const path = require("node:path");
const { walk } = require("./paths.cjs");
const { braceQuoteInJsString } = require("./jsx.cjs");

function babelCheck(parser, fail, ok, label, code) {
  try {
    parser.parse(code, { sourceType: "script", plugins: ["jsx"] });
    ok(label);
  } catch (e) {
    fail(label + " : " + e.message.split("\n")[0]);
  }
  if (braceQuoteInJsString(code))
    fail(label + " : JS 字符串/模板里写了 {\"<…>\"}（只允许 JSX 文本节点；§5.3.4）");
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
    if (/^\s*import\s/m.test(src)) fail("utils/" + path.basename(f) + " 用了 ESM import（禁止）");
    if (!src.slice(0, 400).includes("职责")) fail("utils/" + path.basename(f) + " 文件头缺「职责」注释");
  }

  const htmlFiles = walk(publicDir).filter((f) => f.endsWith(".html"));
  htmlFiles.length > 0 ? ok(`public/ ${htmlFiles.length} 个页面`) : fail("public/ 无 HTML");
}

const REQUIRED_CDN = [
  ["@tailwindcss/browser@4.3.3", "Tailwind 4.3.3"],
  ["react@18.3.1/umd/react.production.min.js", "React 18.3.1 UMD"],
  ["react-dom@18.3.1/umd/react-dom.production.min.js", "ReactDOM 18.3.1 UMD"],
  ["@babel/standalone@7.26.4/babel.min.js", "Babel 7.26.4"],
];

function checkHtmlPages(ctx) {
  const { publicDir, parser, fail, ok } = ctx;
  const htmlFiles = walk(publicDir).filter((f) => f.endsWith(".html"));

  for (const f of htmlFiles) {
    const label = path.relative(publicDir, f);
    const html = fs.readFileSync(f, "utf8");
    for (const [needle, name] of REQUIRED_CDN) {
      if (!html.includes(needle)) fail(label + " : 缺/换了 " + name + "（§5.3.4 禁止）");
    }
    if (/type="module"/.test(html)) fail(label + " : 用了 type=module（禁止）");
    if (/data-presets|data-plugins/.test(html))
      fail(label + " : script 上加了 data-presets/plugins（禁止）");

    const blocks = [...html.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)];
    if (blocks.length === 0) fail(label + " : 没找到内联 babel 块");
    blocks.forEach((m, i) => babelCheck(parser, fail, ok, label + " inline#" + i, m[1]));

    const checks = [
      ["page-header", null],
      ["page-title", null],
      ["status-pill", "<StatusPill"],
      ["page-main", null],
      ["page-intro", "<PageIntro"],
      ["controls", null],
      ["output", null],
      ["page-footer", "<EnvFooter"],
      ["env-info", "<EnvFooter"],
    ];
    for (const [id, viaComponent] of checks) {
      const has = html.includes('id="' + id + '"') || (viaComponent && html.includes(viaComponent));
      if (!has) fail(label + " : 缺 #" + id + "（§5.3.4 / §5.3.9 / §5.3.11）");
    }
    if (/MiniMax-M\d|gpt-4|claude-3|qwen[\w.-]*max/i.test(html))
      fail(label + " : 页面写死了具体模型名（应来自 /health）");
  }
}

module.exports = { checkComponentsAndUtils, checkHtmlPages };
