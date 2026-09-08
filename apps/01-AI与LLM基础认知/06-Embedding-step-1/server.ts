/**
 * 模块 01 · 06 · Embedding · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写业务逻辑。
 * 数据流：浏览器 → koa → routes/* → lib/vec。
 *
 * 入口：cd apps && yarn app:01-06-embedding-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { logger } from "./lib/logger.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountRankRoutes } from "./routes/rank.js";
import { mountTokenIdRoutes } from "./routes/token-id.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountTokenIdRoutes(router);
mountRankRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.startup",
    "模块 01 · 06 Embedding Demo 已启动（玩具向量 · 不调 LLM）",
    "启动横幅（不属于「调用」按 §5.3.16 不套五件套；记录端口、Provider、Model、Key 状态、可用端点）：本条是纯本地玩具向量表——callsModel=false，Key 缺失也不影响主流程。",
    {
      port: PORT,
      bind: "127.0.0.1",
      callsModel: false,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      endpoints: {
        "GET  /": "总览",
        "GET  /pages/token-id.html": "Token ID 反例 · 整数差值没有语义",
        "GET  /pages/cosine.html": "余弦正例 · 排序 + 零向量撞闸门",
        "GET  /health": "{ ok, port, provider, model, hasKey, callsModel:false, words, embedding }",
        "POST /api/token-id": "Body: { query } → { rows, takeaway }",
        "POST /api/rank": "Body: { query, vsZero? } → { ranked, takeaway } 或 400",
      },
    },
  );
  console.log("──── 模块 01 · 06 Embedding Demo（玩具向量 · 不调 LLM）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  Token ID     /pages/token-id.html`);
  console.log(`  余弦排序     /pages/cosine.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/token-id · /api/rank`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
