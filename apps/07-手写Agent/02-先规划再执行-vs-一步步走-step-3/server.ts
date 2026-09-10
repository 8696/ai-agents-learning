/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-3 加重规划 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → runStepByStep (真模型循环) + runPlanAndExecute (真规划器 + 重规划)。
 *
 * 教学锚点（step-3 「重规划」增量）：
 *   - 基于 step-2 完整复制（§5.3.14 增量构建）
 *   - B 路径执行阶段新增「重规划检测」：每步执行后看 tool_result，如果发现关键变化（如所有 SKU 0 库存）→ 重新调 planWithLlm 出新清单 → 切换 plan → plannerIterations++
 *   - executeTrace 加 planVersion 字段（每步标 v1 / v2）
 *   - UI 上能看见「计划 v1（已废，折叠灰卡）」→ 「计划 v2（执行中，绿卡）」切换
 *   - 关键教学点：变体 C「修了变体 E 暴露的过期问题」 —— 旧 plan 还照旧做就是错
 *   - 触发条件默认：所有 SKU query_stock 返回 available=0
 *
 * 浏览器：
 *   GET  /              → public/index.html（双栏对照 + 重规划展示）
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   GET  /api/compare   → { task, stepByStep, planAndExecute: { plans, plannerIterations, ... } }
 *
 * 日志（§5.3.16）：server.start + 每次调模型 / 调用函数 / 重规划触发 5 条日志。
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-3
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
  logger.info("server.start", "listening", "服务起好了；step-3 加重规划：B 路径执行阶段检测关键变化 → 重新调 planWithLlm → 计划 v1→v2 切换", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
