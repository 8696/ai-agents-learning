const fs = require("node:fs");
const path = require("node:path");
const { APPS, posixRel, walk } = require("./paths.cjs");

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
  "01-AI与LLM基础认知/07-Temperature-Top-P-step-1/routes/sweep.ts",
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

/**
 * 同一路径族：只剥动态段。
 *   /api/foo 与 /api/foo/:id                         → 同族（同一资源的发起 / 查询）
 *   /api/a 与 /api/b                                 → 两族
 *   /api/agent/with-gate 与 /api/agent/timeout-gate  → 两族（第三段是静态名字，不是 :id）
 * 禁止再收成 /api/{第二段}：那样会把对照两侧、闸门变体全漏过去。
 */
function routePathFamily(urlPath) {
  const stripped = String(urlPath)
    .replace(/\/:[^/]+/g, "")
    .replace(/\/+$/g, "");
  return stripped || urlPath;
}

function selfCheckRoutePathFamily() {
  const same = (a, b) => routePathFamily(a) === routePathFamily(b);
  const cases = [
    { a: "/api/foo", b: "/api/foo/:id", expectSame: true },
    { a: "/api/agent-run", b: "/api/agent-run/:runId", expectSame: true },
    { a: "/api/a", b: "/api/b", expectSame: false },
    { a: "/api/agent/with-gate", b: "/api/agent/timeout-gate", expectSame: false },
    { a: "/api/sweep/temperature", b: "/api/sweep/top-p", expectSame: false },
    { a: "/api/plan", b: "/api/confirm-plan", expectSame: false },
  ];
  for (const c of cases) {
    if (same(c.a, c.b) !== c.expectSame) {
      throw new Error(
        `routePathFamily 自检失败：${c.a} vs ${c.b} 期望${c.expectSame ? "同族" : "不同族"}，实际 ${routePathFamily(c.a)} / ${routePathFamily(c.b)}`,
      );
    }
  }
}

function checkOneUrlPerRouteFile(root, abs, fail, ok) {
  const src = fs.readFileSync(abs, "utf8");
  const re = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)/g;
  const fams = new Set();
  let m;
  while ((m = re.exec(src))) {
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

function checkLineLimitsAndOneUrl(ctx) {
  selfCheckRoutePathFamily();
  const { root, fail, ok, publicDir, libDir, routesDir } = ctx;
  const routeFiles = walk(routesDir).filter((f) => f.endsWith(".ts"));
  const htmlFiles = walk(publicDir).filter((f) => f.endsWith(".html"));
  const componentsDir = path.join(publicDir, "components");

  // §5.3.8：routes/ 下每个 .ts 都查「一个 URL 一个文件」（含子目录、含 health / error-demo）。行数上限仍不卡 health / error-demo。
  for (const f of routeFiles) {
    const base = path.basename(f);
    if (base !== "health.ts" && base !== "error-demo.ts") {
      checkLineLimit(root, f, LINE_LIMIT.route, "业务 route", fail, ok);
    }
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
}

module.exports = {
  LINE_LIMIT,
  checkLineLimitsAndOneUrl,
};
