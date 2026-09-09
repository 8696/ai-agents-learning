/**
 * 职责：模块 06 · 03 · Token Budget · step-2 · 双策略对照（trim vs summarize）· Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A）。
 *
 * 教学锚点（step-2 「丢字面 vs 留语义」最小可观察对照实验）：
 *   - 同 query / 同模型 / 同一 history / 同一 totalBudget，唯一变量是裁剪策略
 *   - trim 路径：丢最旧非 system 消息（step-1 同款）→ key fact 在远期 → 必被丢 → 模型"忘"
 *   - summarize 路径：远期 N 条 → 调 LLM 浓缩成 1 条 summary + 近期 K 条留原文
 *     → summary 里仍含 key fact → 模型"记起"
 *   - 调真模型 3 次（1 次摘要 + 2 次问答）→ 双卡对照 + KEY_FACT 子串检测
 *
 * 浏览器：
 *   GET  /                  → public/index.html
 *   GET  /health            → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/compare       → 跑双策略对照：调真模型 3 次 + 返回双卡数据
 *   POST /api/compare-force-error → 教学演示 5xx 通道
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:06-03-token-budget-step-2
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCompareRoutes } from "./routes/compare.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountCompareRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-2 Token Budget 双策略对照：trim vs summarize，看「丢字面 vs 留语义」", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
