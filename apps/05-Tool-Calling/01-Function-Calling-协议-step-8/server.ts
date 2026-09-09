/**
 * 模块 05 · 01 · Function Calling 协议 · step-8 协议 B（Anthropic Messages API） · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/chat.ts → 真调 LLM 协议 B（Anthropic Messages API）。
 *
 * step-8 vs step-6（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)）：
 *   step-6 跑协议 A（OpenAI Chat Completions）；step-8 跑协议 B（Anthropic Messages API）。
 *   同骨架（两轮 Round 1/2 + tool_use → execute → tool_result → final_reply）；不同字段形态。
 *   **本 demo 单协议 B · 不做协议 A vs B 并排对照**（§5.3.13 硬约束：本条不是"对照"教学点）。
 *   学习者可对照 step-6 协议 A 4 张卡 + step-8 协议 B 4 张卡自行看差异。
 *
 * 浏览器：
 *   GET  /                    → public/index.html
 *   GET  /health              → { ok, port, provider, modelB, hasKey, callsModel:true, maxTokensB }
 *   POST /api/chat            → { input } → 两轮真调 LLM 协议 B → 返 { user_input, round_1, model_tool_uses, tool_results, round_2, final_reply }
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-01-fc-protocol-step-8
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutes } from "./routes/chat.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountChatRoutes(router);  // public/index.html → POST /api/chat（协议 B）

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-8 真调 LLM 协议 B（Anthropic Messages API）；同骨架 vs step-6 协议 A · 字段层差异在页面对照可见", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "anthropic-messages",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});