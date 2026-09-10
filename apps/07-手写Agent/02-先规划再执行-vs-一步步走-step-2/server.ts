/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-2 加真规划器 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → runStepByStep (mock) + runPlanAndExecute (B 真规划器调 LLM)。
 *
 * 教学锚点（step-2 「真规划器」增量）：
 *   - 基于锁定的 step-1 完整复制（§5.3.14 增量构建）
 *   - B 路径的「规划器」由 mock 换成真模型（openai.chat.completions.create，协议 A）：模型吐自然语言步骤清单 → 代码解析成结构化 plan
 *   - A 路径继续 mock（理由：跑 7 圈真 Reason 调 7 次模型太贵；step-1 已讲清结构差，step-2 重点看 B 的真规划价值）
 *   - 解析失败时回退 mock plan + plannerFallback=true（让前端可见「模型吐的东西不稳」）
 *   - 关键对照数字：A 仍 modelCalls=7（mock）/ B 现在 planCalls=1（真模型）
 *   - step-2 仍 sketch（不要求 §5.3.2 6 项齐；锁定那一刻才校验）
 *
 * 浏览器：
 *   GET  /              → public/index.html（双栏对照 + 真规划器调用透明可见）
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   GET  /api/compare   → { task, stepByStep, planAndExecute, comparison }
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；B 路径的「调用模型：对话补全」每次五条日志完整。
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-2
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCompareRoutes } from "./routes/compare.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountCompareRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-2 加真规划器：B 路径的 planner 换成真模型（协议 A · openai.chat.completions.create），A 路径继续 mock", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
