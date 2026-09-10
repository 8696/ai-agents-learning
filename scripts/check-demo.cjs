#!/usr/bin/env node
/**
 * 对照 agents/05-demo.md §5.3 的静态校验。只读，不改文件。
 *
 * 用法：
 *   node scripts/check-demo.cjs                         # 扫 apps/ 下全部 HTTP Demo
 *   node scripts/check-demo.cjs apps/01-…/02-Token      # 只查一条
 *
 * JSX 语法检查用 apps/ 的 @babel/parser（yarn install 即有，不另下 2.8MB vendor）。
 * 2026-09-10 起拦业务 route / HTML / lib / components 行数上限，以及一个业务 URL 一个 route 文件（§5.3.8）。
 */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const REPO = path.resolve(__dirname, "..");
const APPS = path.join(REPO, "apps");

function loadParser() {
  const req = createRequire(path.join(APPS, "package.json"));
  try {
    return req("@babel/parser");
  } catch {
    console.error("缺 @babel/parser。在 apps/ 执行：yarn install");
    process.exit(2);
  }
}

const parser = loadParser();

/** §5.3.8 文件行数上限（2026-09-10）。新落 / 新 step 强制；下方名单只豁免当时已超限的具体文件。 */
const LINE_LIMIT = {
  route: 280,
  html: 400,
  lib: 280,
  component: 250,
};

const LINE_LIMIT_GRANDFATHER = new Set([
  "02-LLM-API开发/02-协议-A-vs-B-step-1/public/components/compare-cards.js",
  "02-LLM-API开发/04-Rate-Limit-step-1/lib/flow/run-with-retry.ts",
  "02-LLM-API开发/04-Rate-Limit-step-1/lib/retry/retry.ts",
  "02-LLM-API开发/05-思考-step-1/lib/dialect/thinking-dialect.ts",
  "02-LLM-API开发/05-思考-step-1/lib/protocol-a/send-stream.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-2/public/index.html",
  "05-Tool-Calling/01-Function-Calling-协议-step-2/routes/chat.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-5/lib/tools/registry.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-6/routes/chat.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-7/lib/tools/registry.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-7/routes/hybrid.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-8/routes/chat.ts",
  "05-Tool-Calling/02-Tool-Description-step-1/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-2/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-3/public/index.html",
  "05-Tool-Calling/02-Tool-Description-step-3/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-4/public/index.html",
  "05-Tool-Calling/02-Tool-Description-step-4/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-5/public/index.html",
  "05-Tool-Calling/02-Tool-Description-step-5/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-6/public/index.html",
  "05-Tool-Calling/02-Tool-Description-step-6/routes/compare.ts",
  "05-Tool-Calling/03-Tool-Choice-step-1/public/index.html",
  "05-Tool-Calling/04-Tool-Gateway-幂等-step-1/routes/chat.ts",
  "05-Tool-Calling/04-Tool-Gateway-幂等-step-2/routes/chat.ts",
  "05-Tool-Calling/04-Tool-Gateway-幂等-step-3/routes/chat.ts",
  "05-Tool-Calling/04-Tool-Gateway-幂等-step-4/routes/chat.ts",
  "06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口-step-2/routes/summarize.ts",
  "06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口-step-3/routes/three-way.ts",
  "06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口-step-4/public/index.html",
  "06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口-step-4/routes/three-way-with-fallback.ts",
  "06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口-step-5/routes/token-budget.ts",
  "06-多轮对话与Context/03-Token-Budget-step-2/routes/compare.ts",
  "06-多轮对话与Context/03-Token-Budget-step-3/public/index.html",
  "06-多轮对话与Context/03-Token-Budget-step-3/routes/emergency.ts",
]);

/** 2026-09-10 前已在一个文件里挂多条业务路径的旧文件。新文件 / 新 step 不准再这样。 */
const ONE_URL_GRANDFATHER = new Set([
  "01-AI与LLM基础认知/02-Token-step-1/routes/encode.ts",
  "02-LLM-API开发/04-Rate-Limit-step-1/routes/mock.ts",
  "02-LLM-API开发/04-Rate-Limit-step-1/routes/real.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-1/routes/chat.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-2/routes/chat.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-3/routes/plan.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-4/routes/chain-bad.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-4/routes/chain.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-5/routes/self-correct.ts",
  "05-Tool-Calling/01-Function-Calling-协议-step-7/routes/hybrid.ts",
  "05-Tool-Calling/02-Tool-Description-step-1/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-2/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-3/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-4/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-5/routes/compare.ts",
  "05-Tool-Calling/02-Tool-Description-step-6/routes/compare.ts",
]);

function posixRel(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function checkLineLimit(root, abs, limit, kind, fail, ok) {
  if (!fs.existsSync(abs)) return;
  const lines = fs.readFileSync(abs, "utf8").split("\n").length;
  const relApps = posixRel(APPS, abs);
  const relDemo = posixRel(root, abs);
  if (lines <= limit) {
    ok(`${kind} ${relDemo} ${lines} 行（≤${limit}）`);
    return;
  }
  if (LINE_LIMIT_GRANDFATHER.has(relApps)) {
    ok(`${kind} ${relDemo} ${lines} 行（2026-09-10 前已超限，豁免；新文件 / 新 step 不准再超）`);
    return;
  }
  fail(
    `${kind} ${relDemo} ${lines} 行，超出 ${limit}（§5.3.8：先拆文件；对照两侧分请求；复制旧 step 做下一步时豁免不跟过去）`,
  );
}

/** 同一路径族：/api/foo 与 /api/foo/:id 算一条；/api/a 与 /api/b 算两条。 */
function routePathFamily(urlPath) {
  const noParam = String(urlPath).replace(/\/:[^/]+/g, "");
  const parts = noParam.split("/").filter(Boolean);
  if (parts[0] === "api" && parts[1]) return "/api/" + parts[1];
  return noParam || urlPath;
}

function checkOneUrlPerRouteFile(root, abs, fail, ok) {
  const src = fs.readFileSync(abs, "utf8");
  const re = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)/g;
  const fams = new Set();
  let m;
  while ((m = re.exec(src))) {
    if (m[2].includes("${")) continue;
    fams.add(routePathFamily(m[2]));
  }
  if (fams.size <= 1) {
    if (fams.size === 1) ok(`一路由 ${posixRel(root, abs)} → ${[...fams][0]}`);
    return;
  }
  const relApps = posixRel(APPS, abs);
  const relDemo = posixRel(root, abs);
  const list = [...fams].join(" · ");
  if (ONE_URL_GRANDFATHER.has(relApps)) {
    ok(`一路由 ${relDemo} 多路径（${list}；2026-09-10 前已如此，豁免；新文件 / 新 step 不准再挂多条）`);
    return;
  }
  fail(
    `一路由 ${relDemo} 挂了多条业务路径：${list}（§5.3.8：一个业务 URL 一个文件；对照两侧拆两个文件）`,
  );
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

function listDemos() {
  return walk(APPS)
    .filter((f) => f.endsWith(`${path.sep}server.ts`) || f.endsWith("/server.ts"))
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
      .filter((f) => f.endsWith(`${path.sep}server.ts`) || f.endsWith("/server.ts"))
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

function stripJsComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * 双引号 / 模板字符串里塞了 {"<tag>"} —— Babel 会截断或原样显示。
 * JSX 子节点 `{"<think>"}` 合法：`{` 在字符串外面，`"<think>"` 本身不含 `{`。
 * 禁止用 /"[^"]*\{\s*"</ 这种跨行正则：会把 className="x"> 的收尾引号
 * 和后面的 JSX 表达式拼成误报。
 */
function braceQuoteInJsString(code) {
  const src = stripJsComments(code);
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      let content = "";
      while (i < src.length) {
        if (src[i] === "\\") {
          content += src[i] + (src[i + 1] || "");
          i += 2;
          continue;
        }
        if (src[i] === q) break;
        content += src[i];
        i++;
      }
      const after = src[i + 1] || "";
      // 双引号在 `{` 后被截断：内容以 `{` 结尾，下一个字符是 `<`
      if (/\{\s*$/.test(content) && after === "<") return true;
      if (/\{\s*"<[\w/-]+>/.test(content)) return true;
      i++;
      continue;
    }
    if (c === "`") {
      i++;
      let content = "";
      while (i < src.length) {
        if (src[i] === "\\") {
          content += src[i] + (src[i + 1] || "");
          i += 2;
          continue;
        }
        if (src[i] === "`") break;
        if (src[i] === "$" && src[i + 1] === "{") {
          content += "${";
          i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            if (depth > 0) content += src[i];
            i++;
          }
          continue;
        }
        content += src[i];
        i++;
      }
      if (/\{\s*"<[\w/-]+>/.test(content)) return true;
      i++;
      continue;
    }
    i++;
  }
  return false;
}

function selfCheckBraceQuote() {
  const cases = [
    ["jsx-text", '<span>无 {"<think>"} 块</span>', false],
    ["attr-then-jsx", 'className="text-xs">还没有 {"<think>"}</p>', false],
    ["dbl-trunc", '"独立字段还是嵌 {"<think>"}"', true],
    ["tmpl", '`网关剥 {"<think>"} 后再 parse`', true],
    ["plain-lt", '"a < b"', false],
  ];
  for (const [name, sample, want] of cases) {
    const got = braceQuoteInJsString(sample);
    if (got !== want) {
      console.error("self-check fail " + name + " got=" + got + " want=" + want);
      process.exit(2);
    }
  }
}

function parseReadmePorts(readme) {
  const map = {};
  for (const m of readme.matchAll(/`yarn (app:[^`]+)`\s*\|\s*`(\d{5}|—)`/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

function checkOne(root) {
  let failed = 0;
  const fail = (msg) => {
    failed++;
    console.log("FAIL " + msg);
  };
  const ok = (msg) => console.log("OK   " + msg);

  const publicDir = path.join(root, "public");
  const relRoot = path.relative(APPS, root);

  fs.existsSync(path.join(root, "README.md")) ? ok("README.md") : fail("缺 README.md");

  if (!fs.existsSync(publicDir)) {
    fail("缺 public/（禁止纯 CLI 小节 Demo）");
    return failed;
  }

  if (fs.existsSync(path.join(root, "index.ts")))
    fail("残留小节 CLI 入口 index.ts（禁止）");
  if (fs.existsSync(path.join(root, "src/index.ts")))
    fail("残留 CLI src/index.ts（禁止）");
  if (fs.existsSync(path.join(root, "src/index-anthropic.ts")))
    fail("残留 CLI src/index-anthropic.ts（禁止）");

  const serverPath = path.join(root, "server.ts");
  if (!fs.existsSync(serverPath)) {
    fail("缺 server.ts");
  } else {
    const src = fs.readFileSync(serverPath, "utf8");
    const lines = src.split("\n").length;
    if (lines > 120) fail(`server.ts ${lines} 行，超出装配层（应 <=120）`);
    else ok(`server.ts ${lines} 行（装配层）`);
    if (/router\.(get|post)\s*\(/.test(src))
      fail("server.ts 里直接写了 router.get/post —— 业务应在 routes/");
    if (!src.includes("fileURLToPath")) fail("server.ts 未用绝对路径 serve(publicDir)");
    if (!src.includes("职责")) fail("server.ts 文件头缺「职责」注释");
  }

  const routesDir = path.join(root, "routes");
  const libDir = path.join(root, "lib");
  const routeFiles = walk(routesDir).filter((f) => f.endsWith(".ts"));
  routeFiles.length > 0 ? ok(`routes/ ${routeFiles.length} 个文件`) : fail("缺 routes/*.ts");
  const hasHealthFile = routeFiles.some((f) => path.basename(f) === "health.ts");
  hasHealthFile ? ok("routes/health.ts") : fail("缺 routes/health.ts（§5.3.5）");

  if (fs.existsSync(libDir)) {
    const subdirs = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    subdirs.length > 0
      ? ok("lib/ 子目录：" + subdirs.join(" · "))
      : fail("lib/ 是平铺文件，未按职责分子目录（§5.3.8）");
    for (const bad of ["helpers.ts", "utils.ts", "common.ts", "misc.ts", "temp.ts"]) {
      if (fs.existsSync(path.join(libDir, bad))) fail("含糊文件名 lib/" + bad);
    }
  } else {
    fail("缺 lib/");
  }

  const runtimePath = path.join(root, "lib/http/runtime-ctx.ts");
  fs.existsSync(runtimePath)
    ? ok("lib/http/runtime-ctx.ts")
    : fail("缺 lib/http/runtime-ctx.ts");

  for (const f of walk(root).filter((f) => f.endsWith(".ts"))) {
    const head = fs.readFileSync(f, "utf8").slice(0, 500);
    if (!head.includes("职责")) fail(path.relative(root, f) + " 文件头缺「职责」注释");
  }

  const allTs = walk(root)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
  /["'`]\/health["'`]/.test(allTs) ? ok("GET /health") : fail("缺 GET /health（§5.3.9）");
  if (!/hasKey/.test(allTs)) fail("/health 未返回 hasKey（§5.3.9）");
  if (!/provider/.test(allTs)) fail("/health 未返回 provider（§5.3.9）");

  const componentsDir = path.join(publicDir, "components");
  const utilsDir = path.join(publicDir, "utils");

  function babelCheck(label, code) {
    try {
      parser.parse(code, { sourceType: "script", plugins: ["jsx"] });
      ok(label);
    } catch (e) {
      fail(label + " : " + e.message.split("\n")[0]);
    }
    if (braceQuoteInJsString(code))
      fail(label + " : JS 字符串/模板里写了 {\"<…>\"}（只允许 JSX 文本节点；§5.3.4）");
  }

  for (const f of walk(componentsDir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(f, "utf8");
    babelCheck("components/" + path.basename(f), src);
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

  // §5.3.8 文件行数（2026-09-10）：新文件强制；豁免名单不跟到新 step 文件夹
  for (const f of routeFiles) {
    const base = path.basename(f);
    if (base === "health.ts" || base === "error-demo.ts") continue;
    checkLineLimit(root, f, LINE_LIMIT.route, "业务 route", fail, ok);
    checkOneUrlPerRouteFile(root, f, fail, ok);
  }
  if (fs.existsSync(libDir)) {
    for (const f of walk(libDir).filter((p) => p.endsWith(".ts"))) {
      const base = path.basename(f);
      if (base === "logger.ts" || base === "runtime-ctx.ts") continue;
      checkLineLimit(root, f, LINE_LIMIT.lib, "lib 业务", fail, ok);
    }
  }
  for (const f of htmlFiles) {
    checkLineLimit(root, f, LINE_LIMIT.html, "HTML 页", fail, ok);
  }
  for (const f of walk(componentsDir).filter((p) => p.endsWith(".js"))) {
    checkLineLimit(root, f, LINE_LIMIT.component, "components", fail, ok);
  }

  const REQUIRED_CDN = [
    ["@tailwindcss/browser@4.3.3", "Tailwind 4.3.3"],
    ["react@18.3.1/umd/react.production.min.js", "React 18.3.1 UMD"],
    ["react-dom@18.3.1/umd/react-dom.production.min.js", "ReactDOM 18.3.1 UMD"],
    ["@babel/standalone@7.26.4/babel.min.js", "Babel 7.26.4"],
  ];

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
    blocks.forEach((m, i) => babelCheck(label + " inline#" + i, m[1]));

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

  for (const f of walk(root).filter((f) => /\.(ts|js)$/.test(f))) {
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(root, f);
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue;
      const abs = path.resolve(path.dirname(f), spec);
      const absPosix = abs.replace(/\\/g, "/");
      const inSelf = abs.startsWith(root);
      // §5.3.12：只允许 llm / load-root-env。§5.3.16：禁止运行时 import apps/logger
      if (/\/apps\/logger(\.ts|\.js)?$/.test(absPosix)) {
        fail(rel + " : 禁止 import 顶层 apps/logger（§5.3.16；须完整拷到本夹 lib/logger.ts）");
        continue;
      }
      const isSharedInfra = /\/apps\/(llm|load-root-env)(\.ts|\.js)?$/.test(absPosix);
      if (!inSelf && !isSharedInfra) fail(rel + " : 跨小节 import " + spec + "（§5.3.12 禁止）");
    }
  }

  // §5.3.16：本地完整 logger（锁定/未锁定一视同仁；禁止薄包装委托顶层）
  const localLoggerPath = path.join(root, "lib/logger.ts");
  if (!fs.existsSync(localLoggerPath)) {
    fail("缺 lib/logger.ts（§5.3.16：须完整拷贝顶层模板，禁止委托 apps/logger）");
  } else {
    const loggerSrc = fs.readFileSync(localLoggerPath, "utf8");
    const loggerNoComments = stripJsComments(loggerSrc);
    if (/from\s+["'](\.\.\/)+logger(\.js)?["']/.test(loggerNoComments)) {
      fail("lib/logger.ts 仍 import 外层 logger（禁止委托顶层；须本文件含 createLogger 本体）");
    } else if (!/export\s+function\s+createLogger/.test(loggerNoComments)) {
      fail("lib/logger.ts 缺 export function createLogger（须完整副本，禁止只 re-export）");
    } else if (!/export\s+const\s+logger\s*=/.test(loggerNoComments)) {
      fail("lib/logger.ts 缺 export const logger（业务只认本夹实例）");
    } else if (!/function\s+formatDataJson/.test(loggerNoComments)) {
      fail("lib/logger.ts 缺 formatDataJson（data 须 indent-2 多行；有 __code 禁止 compact）");
    } else if (!/每条前空一行/.test(loggerSrc)) {
      fail("lib/logger.ts 的 emit 未按 §5.3.16 加空行（每条前 + msg/explain/data 之间）");
    } else {
      ok("lib/logger.ts 本地完整副本（含多行 data + 空行）");
    }
  }

  const runtimeSrc = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, "utf8") : "";
  const portMatch = runtimeSrc.match(/\.default\((\d{5})\)/);
  const port = portMatch ? portMatch[1] : null;
  const demoReadme = fs.existsSync(path.join(root, "README.md"))
    ? fs.readFileSync(path.join(root, "README.md"), "utf8")
    : "";
  if (port && !demoReadme.includes(port)) fail(`本条 README 未写默认端口 ${port}`);

  const pkg = JSON.parse(fs.readFileSync(path.join(APPS, "package.json"), "utf8"));
  const posixRoot = relRoot.split(path.sep).join("/");
  const script = Object.entries(pkg.scripts || {}).find(([, cmd]) =>
    String(cmd).includes(posixRoot + "/server.ts"),
  );
  if (!script) fail("apps/package.json 没有指向本条 server.ts 的 yarn 脚本");
  else {
    const appsReadme = fs.readFileSync(path.join(APPS, "README.md"), "utf8");
    const table = parseReadmePorts(appsReadme);
    const scriptName = script[0];
    if (!table[scriptName]) fail(`apps/README 占用表没有 ${scriptName}`);
    else if (port && table[scriptName] !== port)
      fail(`端口三处不一致：runtime=${port} apps/README=${table[scriptName]}`);
    else if (port) ok(`端口 ${port} 三处一致（${scriptName}）`);
  }

  const front = [
    ...walk(path.join(publicDir, "components")).filter((f) => f.endsWith(".js")),
    ...htmlFiles,
  ];
  for (const f of front) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/env\.port \|\| (\d{5})/g)) {
      if (port && m[1] !== port)
        fail(`${path.relative(root, f)} 页脚 fallback 端口 ${m[1]} ≠ 本条 ${port}`);
    }
  }

  void relRoot;
  return failed;
}

function checkPortUniqueness() {
  let failed = 0;
  const seen = new Map();
  for (const demo of listDemos()) {
    const runtime = path.join(demo, "lib/http/runtime-ctx.ts");
    if (!fs.existsSync(runtime)) continue;
    const m = fs.readFileSync(runtime, "utf8").match(/\.default\((\d{5})\)/);
    if (!m) continue;
    if (seen.has(m[1])) {
      failed++;
      console.log(
        "FAIL 端口重复 " + m[1] + "：" + path.relative(APPS, seen.get(m[1])) + " 与 " + path.relative(APPS, demo),
      );
    } else seen.set(m[1], demo);
  }
  if (failed === 0) console.log("OK   默认端口全仓库不重复（" + seen.size + " 个）");
  return failed;
}

function checkNoCliScripts() {
  let failed = 0;
  const pkg = JSON.parse(fs.readFileSync(path.join(APPS, "package.json"), "utf8"));
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    if (!String(name).startsWith("app:")) continue;
    if (/(?:^|[\s/])index(?:-anthropic)?\.ts\b/.test(String(cmd))) {
      failed++;
      console.log("FAIL " + name + " 是 CLI 入口（禁止；一律 tsx …/server.ts）");
    }
  }
  if (failed === 0) console.log("OK   yarn app:* 没有 CLI 入口");
  return failed;
}

selfCheckBraceQuote();

const arg = process.argv[2];
const targets = arg
  ? expandTargets([path.resolve(arg)])
  : listDemos();

if (targets.length === 0) {
  console.error("没有找到 server.ts");
  process.exit(2);
}

let total = 0;
for (const demo of targets) {
  if (!fs.existsSync(demo)) {
    console.error("不存在：" + demo);
    process.exit(2);
  }
  console.log("\n── " + path.relative(REPO, demo) + " ──");
  total += checkOne(demo);
}
if (!arg) {
  console.log("\n── yarn 入口 ──");
  total += checkNoCliScripts();
  console.log("\n── 端口占用 ──");
  total += checkPortUniqueness();
}

console.log(total === 0 ? "\n全部通过" : "\n失败 " + total + " 项");
process.exit(total === 0 ? 0 : 1);
