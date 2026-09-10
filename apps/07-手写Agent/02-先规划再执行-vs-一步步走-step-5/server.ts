/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-5 变体 E 演示 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → runStepByStep (真模型循环) + runPlanAndExecute (真规划器 + 变体 C 重规划 + 变体 E 演示)。
 *
 * 教学锚点（step-5 「变体 E 过期仍执行」增量）：
 *   - 基于锁定的 step-3 完整复制（§5.3.14 增量构建）
 *   - mock 工具强制失败：write_copy 第 1 次调用返回 `{ok: false, error: 'mock 系统挂了'}`（演示工具失败的现实场景）
 *   - shouldReplan **不**触发（只检测 query_stock 0 库存 = 变体 C）—— 这正好暴露变体 E 缺口
 *   - executeTrace 每步带 `result.ok` 字段，失败步变黄「工具失败但未重规划」
 *   - UI 上能看见「工具失败 → 按旧清单继续 → 业务上错了」（写文案失败但仍通知「文案完成」）
 *   - 关键对照：变体 C 修了「数据变化」缺口；变体 E 暴露「工具失败」缺口 → 真实生产需要更全面的重规划策略
 *
 * 浏览器：
 *   GET  /              → public/index.html（双栏对照 + 变体 E 标黄工具失败）
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   GET  /api/compare   → { task, stepByStep, planAndExecute: { ..., variantETriggered, ... } }
 *
 * 日志（§5.3.16）：server.start + 变体 E 触发日志（FAIL_ON_CALL 命中）
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-5
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
  logger.info("server.start", "listening", "服务起好了；step-5 变体 E：mock write_copy 第 1 次强制失败 → 演示「工具失败 → 不重规划 → 按旧清单做错」", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
