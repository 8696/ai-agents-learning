/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-6 变体 F「计划给人看」· Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 两阶段：GET /api/compare（只 plan 不执行）→ POST /api/confirm-plan（点确认才执行）。
 *
 * 教学锚点（step-6 「变体 F 给人看」增量）：
 *   - 基于锁定的 step-5 完整复制（§5.3.14 增量构建）
 *   - 服务端两阶段：GET /api/compare → 只调真规划器 + 返回 plans + status='pending'（执行器不调）
 *   - 状态机：plan 状态 = 'pending'（待确认） → 用户点「确认执行」 → POST /api/confirm-plan → 跑 executeFromPlan → status='executed'
 *   - sessions Map（in-memory）按 sessionId 存 plans + status
 *   - UI：右栏计划卡默认显示「待确认 · 等你点头」+ 「确认执行」按钮（橙底 + ⚠）
 *   - 点确认后才显示 executeTrace + notify_ops 的 message
 *   - 关键教学点：**确认前无副作用** —— 没点按钮 = planner 吐的 plan 不会跑；点了才执行
 *
 * 浏览器：
 *   GET  /              → public/index.html（plan 卡显示「待确认」+ 「确认执行」按钮）
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   GET  /api/compare   → { sessionId, task, plans, status: 'pending' }
 *   POST /api/confirm-plan { sessionId } → { ...plans, executeTrace, status: 'executed' }
 *
 * 日志（§5.3.16）：server.start + 每个端点 5 条日志
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-6
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
  logger.info("server.start", "listening", "服务起好了；step-6 变体 F 计划给人看：两阶段（GET /api/compare 只 plan；POST /api/confirm-plan 才执行）—— 确认前无副作用", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
