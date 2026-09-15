/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * step-8 第 5 关「冲突与更新」完整版：把变体 5 四个动作（NEW / UPDATE / MERGE / DELETE / NOOP）+ 三种旧值去向（进历史 / 真删接口 / 软删除）+ 历史版本查询做在同一 demo。
 * 四个 sub-page 共享同一个 lib/db.ts（继承 step-7 的 kv 表 + 加 deleted_at + 新增 fact_history）+ 同一个端口（§5.3.14 例外 · 当前 step 加页面）。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountFactsRoutes } from "./routes/facts.js";
import { mountConflictRoutes } from "./routes/conflict.js";
import { mountRecallRoutes } from "./routes/recall.js";
import { mountTrashRoutes } from "./routes/trash.js";
import { mountFactDetailRoutes } from "./routes/fact-detail.js";

const app = new Koa();
const router = new Router();

// 全局错误处理：route 内 throw（业务函数 / 拼 JSON 失败）→ 返回 JSON 而不是 koa 默认 HTML 错误页
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status ?? 500;
    logger.error(
      "server.error",
      "unhandled",
      `为什么写这条日志：route 内业务函数抛错，全局错误处理接住后转 JSON 返回。当前：捕获到未处理异常，status = ${status}。`,
      { 异常类型: err instanceof Error ? err.constructor.name : typeof err, 异常信息: message },
    );
    ctx.status = status;
    ctx.body = { error: status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST", explain: message };
  }
});

app.use(bodyParser());
mountHealthRoutes(router);
mountFactsRoutes(router);
mountConflictRoutes(router);
mountRecallRoutes(router);
mountTrashRoutes(router);
mountFactDetailRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "写入策略第八步（第 5 关「冲突与更新」完整版）：变体 5 四个动作（NEW / UPDATE / MERGE / DELETE / NOOP）+ 三种旧值去向（进历史 / 真删接口 / 软删除）+ 历史版本查询。四个 sub-page 共享同一个事实库（SQLite via better-sqlite3，data/facts.db，已扩展 deleted_at 字段 + 新增 fact_history 表），通过 PageNav 跳转。本步不调大模型。",
    { url: `http://127.0.0.1:${PORT}/`, protocol: "A", callsModel: "false" },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
