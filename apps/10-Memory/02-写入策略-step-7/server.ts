/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * step-7 第 4 关「去重」完整版：把变体 4-A / 4-C / 4-D 三种去重方式做在同一 demo。
 * 4-B（同 key 不同值）笔记 §4 表格里就说明是冲突，交给第 5 关另开 step。
 * 三个 sub-page 共享同一个 lib/db.ts + 同一个端口（§5.3.14 例外 · 当前 step 加页面）。
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
import { mountDedupRoutes } from "./routes/dedup.js";
import { mountDedupByEmbeddingRoutes } from "./routes/dedup-by-embedding.js";
import { mountDedupByInclusionRoutes } from "./routes/dedup-by-inclusion.js";

const app = new Koa();
const router = new Router();

// 全局错误处理：route 内 throw（业务函数 / LLM 调用 / 嵌入 API 失败）→ 返回 JSON 而不是 koa 默认 HTML 错误页
// 让前端 res.json() 能正常解析，避免「SyntaxError: Unexpected token 'I', "Internal S"... is not valid JSON」
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status ?? 500;
    logger.error(
      "server.error",
      "unhandled",
      `为什么写这条日志：route 内业务函数 / LLM / 嵌入 API 抛错，全局错误处理接住后转 JSON 返回。当前：捕获到未处理异常，status = ${status}。`,
      { 异常类型: err instanceof Error ? err.constructor.name : typeof err, 异常信息: message },
    );
    ctx.status = status;
    ctx.body = { error: status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST", explain: message };
  }
});

app.use(bodyParser());
mountHealthRoutes(router);
mountDedupRoutes(router);
mountDedupByEmbeddingRoutes(router);
mountDedupByInclusionRoutes(router);
mountFactsRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
    logger.info(
      "server.start",
      "listening",
      "写入策略第七步（第 4 关「去重」完整版）：变体 4-A 字面去重（POST /api/dedup）+ 变体 4-C 跨 key 嵌入相似度（POST /api/dedup-by-embedding，调嵌入模型真发网络请求）+ 变体 4-D 包含关系粒度比对（POST /api/dedup-by-inclusion，纯本地代码）。变体 4-B（同 key 不同值）按笔记 §4 交给第 5 关冲突更新，不在本步。三个 sub-page 共享同一个事实库（SQLite via better-sqlite3，data/facts.db），通过 PageNav 跳转。",
      { url: `http://127.0.0.1:${PORT}/`, protocol: "A", callsModel: "true" },
    );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});