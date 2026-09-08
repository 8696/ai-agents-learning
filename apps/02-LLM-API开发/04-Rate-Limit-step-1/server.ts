/**
 * 模块 02 · 04 Rate-Limit · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen，不写业务、不跑 CLI。
 * 数据流：浏览器 → koa 中间件链 → routes/*（薄）→ lib/flow（套 retry）→ lib/mock 或真 LLM。
 *
 * 浏览器：
 *   GET /                  → public/index.html（总览：分类重试 ASCII）
 *   GET /pages/mock.html   → 五个 mock 场景
 *   GET /pages/real.html   → 真 API 单次 + burst
 *
 * 入口：yarn app:02-04-rate-limit-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountMockRoutes } from "./routes/mock.js";
import { mountRealRoutes } from "./routes/real.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，不能调换） ──
// bodyParser 必须在 router 前：否则 route 里 ctx.request.body 是 undefined
app.use(bodyParser());

mountHealthRoutes(router);
mountMockRoutes(router);
mountRealRoutes(router);

// router 必须在 serve 前：否则静态中间件会先把 /api/* 当文件找并返回 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 是在 apps/ 下启动的，会指向不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.startup",
    "模块 02 · 04 Rate-Limit Demo 已启动（§5.3.8 分层拆分 · 仅协议 A）",
    "启动横幅（不属于「调用」按 §5.3.16 不套五件套；记录端口、Provider、Model、Key 状态、可用端点）：本条对照 mock 五场景 + 真 API 单次 / 并发撞 429。",
    {
      port: PORT,
      bind: "127.0.0.1",
      protocol: "A (chat.completions · stream=false)",
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm?.apiKey),
      endpoints: {
        "GET  /": "总览（分类重试 ASCII）",
        "GET  /pages/mock.html": "五个 mock 场景",
        "GET  /pages/real.html": "真 API 单次 + burst",
        "GET  /health": "{ ok, port, protocol, provider, model, hasKey }",
        "GET  /api/proxy?target=…": "本机 mock + retry 套外层",
        "GET  /api/real": "真 API 单次 + retry",
        "GET  /api/real-burst?concurrency=…": "真 API 并发撞 429",
        "GET  /api/{easy,chaos,auth,forever,ok}": "mock 直接路径（不走 retry）",
        "GET  /api/drop": "mock 掐连接（给 retry 看见 status=network）",
      },
    },
  );
  console.log(
    "──── 模块 02 · 04 Rate-Limit Demo（§5.3.8 分层拆分 · 仅协议 A）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log("  总览         /");
  console.log("  mock 五场景  /pages/mock.html");
  console.log("  真 API       /pages/real.html");
  console.log("  GET  /health · /api/proxy?target=… · /api/real · /api/real-burst");
  logLlmConfig(llm);
  console.log("  Ctrl+C 退出");
});
