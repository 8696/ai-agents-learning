/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-4 短任务对照 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 四组轨迹并行（短 A / 短 B / 长 A / 长 B）。
 *
 * 教学锚点（step-4 「短任务对照」增量）：
 *   - 基于锁定的 step-3 完整复制（§5.3.14 增量构建）
 *   - 新增第二个 mock 工具 complete_todo（短任务用）+ TOOLS_OPENAI 加 complete_todo 字段
 *   - 四组轨迹并行跑：
 *     - 短任务 A（一步步走）：「把 todo-001 标完成」= 1 圈调 complete_todo → 最终答案
 *     - 短任务 B（先规划）：同上任务 → 规划 1 步 + 执行 1 步 → 最终答案
 *     - 长任务 A（一步步走）：「春季上新：拉库存、写有货 SKU 文案、通知运营」= N 圈
 *     - 长任务 B（先规划）：同上 → 真规划器 + 重规划 → 多个 plan 版本
 *   - UI：4 栏对照（2x2 网格）；数字对照卡显式「短任务值得吗」「长任务值得吗」判断
 *   - 关键教学点：变体 D「什么时候不值得先规划」—— 任务 1-2 步 / 强依赖未知观察 / 用户急着看第一个动作 → 一步步走更值
 *
 * 浏览器：
 *   GET  /              → public/index.html（4 栏对照 + 短任务 vs 长任务判断）
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   GET  /api/compare   → { shortTask: { a, b }, longTask: { a, b }, comparison }
 *
 * 日志（§5.3.16）：server.start + 每组轨迹 5 条日志（完整 messages + response + __code + 耗时）。
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-4
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
  logger.info("server.start", "listening", "服务起好了；step-4 短任务对照：四组轨迹（短 A / 短 B / 长 A / 长 B）并行跑，对照「什么时候不值得先规划」", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
